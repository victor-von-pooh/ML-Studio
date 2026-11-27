import importlib.util
import shutil
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest
import torch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from ml_eda import export_dataset, load_data
from ml_modelcontrol import build_model
from ml_modelcontrol.custom import LOADED_MODULES, remove_module_units
from starlette.routing import Mount

from ml_studio.app import cookie_name, create_app, get_token
from ml_studio.cli import allowed_hosts, main

# テストのトークン
TOKEN = "test-token"

# ML-Dashboard の見本の学習のプロジェクト (submodule の中)
DASHBOARD_DEMO = Path(__file__).parents[2] / "ML-Dashboard" / "demo"

# テストの画面の index.html の中身
INDEX = "<!doctype html><title>ML-Studio</title>"

# モデルの作成・選定の段階の外部のライブラリの部品の出どころ (部品の一覧の
# source. 読み込むモジュールの名前と同じ)
LIBRARY_SOURCES = [
    "torchvision", "timm", "torchaudio", "einops", "kornia", "monai",
    "segmentation_models_pytorch", "transformers", "torch_geometric"
]


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    """
    テストの画面のディレクトリを作る関数

    Parameters
    ----------
    tmp_path: Path
        一時ディレクトリ

    Returns
    ----------
    static_dir: Path
        index.html, assets/app.js, favicon.svg を持つディレクトリ
    """
    # ビルド済みの画面の代わり
    static_dir = tmp_path / "static"
    (static_dir / "assets").mkdir(parents=True)
    (static_dir / "index.html").write_text(INDEX, encoding="utf-8")
    (static_dir / "assets" / "app.js").write_text("1", encoding="utf-8")
    (static_dir / "favicon.svg").write_text("<svg/>", encoding="utf-8")

    return static_dir


def isolate_homes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """
    段階のアプリの既定の置き場を一時ディレクトリに替え, 自作の部品と手順
    の起動の設定を外す関数

    Parameters
    ----------
    tmp_path: Path
        一時ディレクトリ
    monkeypatch: pytest.MonkeyPatch
        環境変数の差し替え

    Returns
    ----------
    None
    """
    # ML-Pathfinder, ML-Fathom, ML-CreateArchitecture, ML-Dashboard,
    # ML-Provide の置き場の環境変数
    monkeypatch.setenv("ML_PATHFINDER_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("ML_FATHOM_HOME", str(tmp_path / "fathom"))
    monkeypatch.setenv(
        "ML_CREATEARCHITECTURE_HOME", str(tmp_path / "createarchitecture")
    )
    monkeypatch.setenv("ML_DASHBOARD_HOME", str(tmp_path / "dashboard"))
    monkeypatch.setenv("ML_PROVIDE_HOME", str(tmp_path / "provide"))

    # 手元の起動の設定の自作の部品と手順の読み込みの停止
    for name in (
        "ML_CREATEARCHITECTURE_MODULES", "ML_PROVIDE_UNITS",
        "ML_PROVIDE_PROCEDURES"
    ):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def app_client(
    tmp_path: Path, static_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> TestClient:
    """
    一時ディレクトリを問題の設定の置き場にした, トークン無しの利用者を
    作る関数

    Parameters
    ----------
    tmp_path: Path
        一時ディレクトリ
    static_dir: Path
        テストの画面のディレクトリ
    monkeypatch: pytest.MonkeyPatch
        環境変数の差し替え

    Returns
    ----------
    client: TestClient
        トークンを持たない利用者
    """
    # 段階のアプリの既定の置き場の一時ディレクトリへの差し替え
    isolate_homes(tmp_path, monkeypatch)
    app = create_app(
        token=TOKEN, allowed_hosts=["testserver"], static_dir=static_dir
    )
    client = TestClient(app)

    return client


@pytest.fixture
def client(app_client: TestClient) -> TestClient:
    """
    トークンをヘッダーで渡す利用者を作る関数

    Parameters
    ----------
    app_client: TestClient
        トークンを持たない利用者

    Returns
    ----------
    client: TestClient
        トークン付きの利用者
    """
    app_client.headers["x-studio-token"] = TOKEN

    return app_client


def test_token_required(app_client: TestClient) -> None:
    """
    トークンの無い API の呼び出しと違うトークンを断ることを確かめる関数

    Parameters
    ----------
    app_client: TestClient
        トークンを持たない利用者

    Returns
    ----------
    None
    """
    # ヘッダーも Cookie も無い, 違うトークン, 段階の API と合わない経路
    assert app_client.get("/api/problem/problems").status_code == 401
    wrong = {"x-studio-token": "wrong"}
    response = app_client.get("/api/problem/problems", headers=wrong)
    assert response.status_code == 401
    assert app_client.get("/api/x").status_code == 401
    assert app_client.get("/api/data/sources").status_code == 401
    assert app_client.get("/api/model/units").status_code == 401
    assert app_client.get("/api/train/projects").status_code == 401
    assert app_client.get("/api/infer/info").status_code == 401

    # 別の起動のトークンの Cookie
    app_client.cookies.set(cookie_name("other"), "other")
    assert app_client.get("/api/problem/problems").status_code == 401


def test_auth_sets_cookie(app_client: TestClient) -> None:
    """
    /api/auth がトークンを Cookie に置き, Cookie で API を呼べることを
    確かめる関数

    Parameters
    ----------
    app_client: TestClient
        トークンを持たない利用者

    Returns
    ----------
    None
    """
    # 違うトークンは 401
    response = app_client.get("/api/auth", params={"token": "wrong"})
    assert response.status_code == 401

    # 合うトークンは / への 303 と httponly の Cookie
    response = app_client.get(
        "/api/auth", params={"token": TOKEN}, follow_redirects=False
    )
    assert response.status_code == 303
    assert response.headers["location"] == "/"
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{cookie_name(TOKEN)}={TOKEN}")
    assert cookie_name(TOKEN).startswith("ml_studio_token_")
    assert "httponly" in cookie.lower()

    # Cookie での API の呼び出し
    assert app_client.get("/api/problem/problems").status_code == 200


def test_auth_other_methods(app_client: TestClient) -> None:
    """
    GET 以外の /api/auth はトークンを確かめることを確かめる関数

    Parameters
    ----------
    app_client: TestClient
        トークンを持たない利用者

    Returns
    ----------
    None
    """
    # トークンの無い POST と DELETE は 401
    params = {"token": TOKEN}
    assert app_client.post("/api/auth", params=params).status_code == 401
    assert app_client.delete("/api/auth", params=params).status_code == 401
    assert app_client.head("/api/auth", params=params).status_code == 401
    assert app_client.options("/api/auth").status_code == 401

    # トークンがあれば確かめを通り, GET の他は合う経路が無いので 404 の応答
    headers = {"x-studio-token": TOKEN}
    response = app_client.post("/api/auth", params=params, headers=headers)
    assert response.status_code == 404


def test_origin_checked(client: TestClient) -> None:
    """
    別の Origin からの書き込みを断ることを確かめる関数

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者

    Returns
    ----------
    None
    """
    # 別のサイトからの書き込みは 403
    body = {"name": "別のサイト"}
    other = {"origin": "http://evil.example"}
    response = client.post("/api/problem/problems", json=body, headers=other)
    assert response.status_code == 403
    for origin in ("null", "http://testserver:9999"):
        response = client.post(
            "/api/problem/problems", json=body, headers={"origin": origin}
        )
        assert response.status_code == 403
    response = client.delete("/api/problem/problems/x", headers=other)
    assert response.status_code == 403

    # 同じ Origin の書き込みと, 別の Origin からの読み込みの受け付け
    same = {"origin": "http://testserver"}
    response = client.post("/api/problem/problems", json=body, headers=same)
    assert response.status_code == 201
    response = client.get("/api/problem/problems", headers=other)
    assert response.status_code == 200

    # データの分析の段階の書き込みも別のサイトからは 403
    response = client.post("/api/data/samples", json={}, headers=other)
    assert response.status_code == 403

    # モデルの作成・選定の段階の書き込みも別のサイトからは 403
    response = client.post("/api/model/check", json={}, headers=other)
    assert response.status_code == 403

    # 学習・評価の段階の書き込みも別のサイトからは 403
    response = client.post("/api/train/projects", json={}, headers=other)
    assert response.status_code == 403

    # 推論の段階の書き込みも別のサイトからは 403
    response = client.post("/api/infer/bundles", json={}, headers=other)
    assert response.status_code == 403


def test_host_checked(client: TestClient) -> None:
    """
    受け付けないホスト名での接続を断ることを確かめる関数

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者

    Returns
    ----------
    None
    """
    # 他のホスト名は 400
    response = client.get(
        "/api/problem/problems", headers={"host": "evil.example"}
    )
    assert response.status_code == 400
    response = client.get(
        "/api/data/problems", headers={"host": "evil.example"}
    )
    assert response.status_code == 400
    response = client.get(
        "/api/model/units", headers={"host": "evil.example"}
    )
    assert response.status_code == 400
    response = client.get(
        "/api/train/projects", headers={"host": "evil.example"}
    )
    assert response.status_code == 400
    response = client.get(
        "/api/infer/info", headers={"host": "evil.example"}
    )
    assert response.status_code == 400


def test_problem_api_mounted(
    client: TestClient, tmp_path: Path
) -> None:
    """
    ML-Pathfinder の API が /api/problem の下で動くことを確かめる関数

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者
    tmp_path: Path
        一時ディレクトリ

    Returns
    ----------
    None
    """
    # 作った問題の設定の一覧での表示
    assert client.get("/api/problem/problems").json() == []
    response = client.post("/api/problem/problems", json={"name": "需要"})
    assert response.status_code == 201
    created = response.json()
    items = client.get("/api/problem/problems").json()
    assert [(item["id"], item["name"]) for item in items] == [
        (created["id"], "需要")
    ]

    # ML-Pathfinder の既定 (環境変数の下) の置き場と, 殻での保持
    problems_dir = tmp_path / "home" / "problems"
    app: FastAPI = client.app  # type: ignore[assignment]
    assert app.state.problems_dir.resolve() == problems_dir.resolve()
    assert (problems_dir / created["id"] / "problem.yaml").is_file()


def mounted_api(client: TestClient, prefix: str) -> FastAPI:
    """
    殻が経路の頭に mount した段階のアプリを取り出す関数

    Parameters
    ----------
    client: TestClient
        利用者 (client.app は殻のアプリ)
    prefix: str
        経路の頭 (例 /api/model)

    Returns
    ----------
    api: FastAPI
        その頭に 1 つだけ mount した段階のアプリ
    """
    app: FastAPI = client.app  # type: ignore[assignment]
    mounts = [
        route.app for route in app.routes
        if isinstance(route, Mount) and route.path == prefix
    ]
    assert len(mounts) == 1 and isinstance(mounts[0], FastAPI)
    api = mounts[0]

    return api


def test_data_api_mounted(client: TestClient, tmp_path: Path) -> None:
    """
    ML-Fathom の API が /api/data の下で動き, ML-Pathfinder と同じ問題の
    設定の置き場を読むことを確かめる関数

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者
    tmp_path: Path
        一時ディレクトリ

    Returns
    ----------
    None
    """
    # 問題の設定の段階で作った問題の設定の, データの分析の段階の一覧での表示
    response = client.get("/api/data/problems")
    assert response.status_code == 200
    assert response.json()["problems"] == []
    response = client.post("/api/problem/problems", json={"name": "需要"})
    assert response.status_code == 201
    created = response.json()
    listed = client.get("/api/data/problems").json()
    problems_dir = tmp_path / "home" / "problems"
    assert Path(listed["root"]) == problems_dir.resolve()
    assert listed["error"] is None
    assert [Path(item["path"]).parent.name for item in listed["problems"]] \
        == [created["id"]]

    # 2 つの段階で同じ置き場と, ML-Fathom の既定 (環境変数の下) の
    # アプリの置き場
    app: FastAPI = client.app  # type: ignore[assignment]
    data_api = mounted_api(client, "/api/data")
    assert data_api.state.problems_dir == app.state.problems_dir
    fathom_home = (tmp_path / "fathom").resolve()
    assert data_api.state.store.home == fathom_home
    assert client.get("/api/data/sources").status_code == 200
    assert client.get("/api/data/info").status_code == 200


def test_model_api_mounted(client: TestClient, tmp_path: Path) -> None:
    """
    ML-CreateArchitecture の API が /api/model の下で動き, ML-Pathfinder と
    同じ問題の設定の置き場を読むことを確かめる関数

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者
    tmp_path: Path
        一時ディレクトリ

    Returns
    ----------
    None
    """
    # 問題の設定の段階で作った問題の設定の, モデルの作成・選定の段階の
    # 一覧での表示
    response = client.get("/api/model/problems")
    assert response.status_code == 200
    assert response.json()["problems"] == []
    response = client.post("/api/problem/problems", json={"name": "需要"})
    assert response.status_code == 201
    created = response.json()
    listed = client.get("/api/model/problems").json()
    problems_dir = tmp_path / "home" / "problems"
    assert Path(listed["root"]) == problems_dir.resolve()
    assert listed["error"] is None
    assert [Path(item["path"]).parent.name for item in listed["problems"]] \
        == [created["id"]]

    # 段階の間で同じ置き場と, ML-CreateArchitecture の既定 (環境変数の
    # 下) のアプリの置き場
    app: FastAPI = client.app  # type: ignore[assignment]
    model_api = mounted_api(client, "/api/model")
    assert model_api.state.problems_dir == app.state.problems_dir
    home = (tmp_path / "createarchitecture").resolve()
    assert model_api.state.store.root == home / "models"

    # 部品の一覧と保存したモデルの一覧
    assert client.get("/api/model/units").status_code == 200
    assert client.get("/api/model/models").status_code == 200


def importable(name: str) -> bool:
    """
    ライブラリが入っていて読み込めるかを返す関数

    Parameters
    ----------
    name: str
        ライブラリの名前

    Returns
    ----------
    loadable: bool
        入っていて読み込めれば True
    """
    # 入っていない場合と, 読み込みで失敗する場合 (版のずれなど)
    if importlib.util.find_spec(name) is None:
        return False
    try:
        importlib.import_module(name)
    except Exception:
        return False

    return True


def test_library_units_follow_env(client: TestClient) -> None:
    """
    モデルの作成・選定の段階の部品の一覧で, 外部のライブラリの部品が殻の
    環境に入ったライブラリの分だけ使えると出ることを確かめる関数

    既定の環境 (CI) では torchvision の部品だけが使え, make extras で
    extra を足した環境では, その extra のライブラリのうち読み込めるものの
    部品も使える

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者

    Returns
    ----------
    None
    """
    # ライブラリごとの, 使える部品の有無 (入っていても定義から作れない
    # 部品があるので, 1 つでも使えるかで見る. 入っていても版のずれで
    # 読み込めないライブラリ (Linux の torchaudio など) の部品は使えない)
    units = client.get("/api/model/units").json()
    for source in LIBRARY_SOURCES:
        listed = [unit for unit in units if unit["source"] == source]
        assert listed, source
        loadable = importable(source)
        assert any(unit["available"] for unit in listed) == loadable, \
            source
        if not loadable:
            assert all(unit["reason"] for unit in listed), source


def test_train_api_mounted(client: TestClient, tmp_path: Path) -> None:
    """
    ML-Dashboard の API が /api/train の下で動き, ML-Pathfinder と同じ
    問題の設定の置き場を読むことを確かめる関数

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者
    tmp_path: Path
        一時ディレクトリ

    Returns
    ----------
    None
    """
    # 問題の設定の段階で作った問題の設定の, 学習・評価の段階での読み込み
    # (監視する指標と向きは extra の problem の ML-Quest を通して読む)
    response = client.get("/api/train/problems/training")
    assert response.status_code == 200
    assert response.json()["problems"] == []
    response = client.post("/api/problem/problems", json={"name": "需要"})
    assert response.status_code == 201
    created = response.json()
    listed = client.get("/api/train/problems/training").json()
    problems_dir = tmp_path / "home" / "problems"
    assert Path(listed["root"]) == problems_dir.resolve()
    assert listed["error"] is None
    assert [Path(item["problem_path"]).parent.name
            for item in listed["problems"]] == [created["id"]]
    response = client.get(f"/api/train/problems/{created['id']}/project")
    assert response.status_code == 200
    assert response.json()["problem"] == "需要"
    response = client.get("/api/train/problems/none/project")
    assert response.status_code == 404

    # 段階の間で同じ置き場と, ML-Dashboard の既定 (環境変数の下) の
    # アプリの置き場
    app: FastAPI = client.app  # type: ignore[assignment]
    train_api = mounted_api(client, "/api/train")
    assert train_api.state.problems_dir == app.state.problems_dir
    home = (tmp_path / "dashboard").resolve()
    assert train_api.state.store.data_dir == home
    assert train_api.state.jobs.jobs_dir == home / "jobs"

    # 登録したプロジェクトの一覧とジョブの一覧
    assert client.get("/api/train/projects").json() == []
    assert client.get("/api/train/jobs").json() == []


def wait_job(client: TestClient, job_id: str) -> dict[str, Any]:
    """
    学習のジョブが終わるまで待つ関数

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者
    job_id: str
        ジョブの ID

    Returns
    ----------
    job: dict[str, Any]
        終わったジョブの情報

    Raises
    ----------
    AssertionError
        120 秒の間に終わらない場合
    """
    # 最大 120 秒まで, 0.2 秒ごとに確認
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        job: dict[str, Any] = client.get(f"/api/train/jobs/{job_id}").json()
        if job["status"] == "finished":
            return job
        time.sleep(0.2)
    output = client.get(f"/api/train/jobs/{job_id}/output").json()["text"]

    raise AssertionError(f"学習が終わりませんでした: {job}\n{output}")


def test_train_job_runs(client: TestClient, tmp_path: Path) -> None:
    """
    殻の下で ML-Dashboard の学習のジョブが別のプロセスで起動して終わる
    ことを確かめる関数

    ML-Dashboard の見本 (渦巻きの 2 クラスの分類) を写し, エポックを
    減らして ML-Found で学習する

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者
    tmp_path: Path
        一時ディレクトリ

    Returns
    ----------
    None
    """
    # 見本のプロジェクトの写しの登録
    project_dir = tmp_path / "workspace" / "demo"
    # (単独で動かした見本の実験と仮想環境は写さない)
    shutil.copytree(
        DASHBOARD_DEMO, project_dir,
        ignore=shutil.ignore_patterns("outputs", ".venv", "venv")
    )
    response = client.post(
        "/api/train/projects", json={"path": str(project_dir)}
    )
    assert response.status_code == 201
    project_id = response.json()["id"]

    # 小さくした config での起動と終わり
    config = (
        "trainer:\n  epochs: 2\ndata:\n  train_size: 64\n"
        "  valid_size: 32\n"
    )
    response = client.post(
        f"/api/train/projects/{project_id}/jobs",
        json={"script": "train.py", "config_text": config}
    )
    assert response.status_code == 201, response.text
    job_id = response.json()["id"]
    try:
        job = wait_job(client, job_id)
    finally:
        # 待ち切りや途中の失敗でも, 別のセッションの学習を残さない
        client.post(f"/api/train/jobs/{job_id}/stop")
    assert job["return_code"] == 0
    assert job["run"]["status"] == "completed"

    # 学習した実験の一覧での表示
    runs = client.get(f"/api/train/projects/{project_id}/runs").json()
    assert len(runs) == 1


def test_infer_api_mounted(client: TestClient, tmp_path: Path) -> None:
    """
    ML-Provide の API が /api/infer の下で動き, ML-Pathfinder と同じ問題の
    設定の置き場を読むことを確かめる関数

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者
    tmp_path: Path
        一時ディレクトリ

    Returns
    ----------
    None
    """
    # 問題の設定の段階で作った問題の設定の, 推論の段階の実験の一覧での
    # 読み込み (学習のプロジェクトをまだ記録していないので実験は無い)
    response = client.post("/api/problem/problems", json={"name": "需要"})
    assert response.status_code == 201
    created = response.json()
    response = client.get(
        "/api/infer/experiments", params={"project": created["id"]}
    )
    assert response.status_code == 200
    listing = response.json()
    problems_dir = tmp_path / "home" / "problems"
    assert Path(listing["problems"]).resolve() == problems_dir.resolve()
    assert listing["experiments"] == []

    # 段階の間で同じ置き場と, ML-Provide の既定 (環境変数の下) の
    # アプリの置き場
    app: FastAPI = client.app  # type: ignore[assignment]
    infer_api = mounted_api(client, "/api/infer")
    assert infer_api.state.problems_dir == app.state.problems_dir
    assert infer_api.state.store.home == (tmp_path / "provide").resolve()

    # 起動の設定の無い自作の部品と手順, 登録した一式の一覧
    info = client.get("/api/infer/info").json()
    assert info["unit_modules"] == [] and info["procedure_modules"] == []
    assert client.get("/api/infer/bundles").json() == []


# 自作の部品を宣言するモジュールの中身 ({unit} は部品の名前)
UNIT_CODE = '''
import torch
from torch import nn


class Twice(nn.Module):
    """全結合の層の出力を 2 倍にする部品"""

    def __init__(self, features: int = 3):
        super().__init__()
        self.fc = nn.Linear(features, features)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = self.fc(x) * 2.0
        return y


UNITS = [{{"cls": Twice, "name": "{unit}"}}]
'''


@pytest.fixture
def lab_module(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[str]:
    """
    自作の部品を宣言するモジュールを作って読み込める場所に加え, 後で
    登録簿と読み込んだ記録から外す関数

    Parameters
    ----------
    tmp_path: Path
        一時ディレクトリ
    monkeypatch: pytest.MonkeyPatch
        import の探す場所の差し替え

    Returns
    ----------
    module: Iterator[str]
        モジュールの名前 (テストごとに別)
    """
    # 一時ディレクトリの名前を付けたモジュール
    folder = tmp_path / "modules"
    folder.mkdir()
    monkeypatch.syspath_prepend(str(folder))
    module = f"studio_lab_{tmp_path.name.replace('-', '_')}"
    (folder / f"{module}.py").write_text(
        UNIT_CODE.format(unit=f"{module}.Twice"), encoding="utf-8"
    )
    yield module

    # 登録簿と読み込んだ記録はプロセスに 1 つなので, 他のテストへの残りの除去
    remove_module_units(module)
    LOADED_MODULES.pop(module, None)
    sys.modules.pop(module, None)


def test_shared_units_registry(
    tmp_path: Path, static_dir: Path, monkeypatch: pytest.MonkeyPatch,
    lab_module: str
) -> None:
    """
    同じ自作の部品のモジュールを ML-CreateArchitecture と ML-Provide の
    両方の起動の設定に書いても殻が起動し, 両方の段階で部品を使えることを
    確かめる関数

    自作の部品の登録簿 (ML-ModelControl) はプロセスに 1 つで, 2 つの
    アプリが共有する

    Parameters
    ----------
    tmp_path: Path
        一時ディレクトリ
    static_dir: Path
        テストの画面のディレクトリ
    monkeypatch: pytest.MonkeyPatch
        環境変数の差し替え
    lab_module: str
        自作の部品のモジュールの名前

    Returns
    ----------
    None
    """
    # 2 つのアプリの起動の設定に同じモジュール
    isolate_homes(tmp_path, monkeypatch)
    monkeypatch.setenv("ML_CREATEARCHITECTURE_MODULES", lab_module)
    monkeypatch.setenv("ML_PROVIDE_UNITS", lab_module)
    app = create_app(
        token=TOKEN, allowed_hosts=["testserver"], static_dir=static_dir
    )
    client = TestClient(app, headers={"x-studio-token": TOKEN})
    unit = f"{lab_module}.Twice"

    # 両方の段階での同じモジュールの部品の読み込み
    modules = client.get("/api/model/modules").json()["modules"]
    assert modules == [{"name": lab_module, "units": [unit]}]
    info = client.get("/api/infer/info").json()
    assert info["unit_modules"] == [{"name": lab_module, "units": [unit]}]
    names = [item["name"] for item in client.get("/api/model/units").json()]
    assert names.count(unit) == 1

    # モデルの作成・選定の段階での, 部品を使った定義の確かめと保存
    spec: dict[str, Any] = {
        "format_version": 1,
        "inputs": {"x": {"shape": [2, 3]}},
        "nodes": {
            "lab": {"unit": unit, "params": {"features": 3}, "inputs": "x"},
            "head": {
                "unit": "nn.Linear",
                "params": {"in_features": 3, "out_features": 2},
                "inputs": "lab",
            },
        },
        "outputs": {"out": "head"},
    }
    response = client.post("/api/model/check", json={"spec": spec})
    assert response.status_code == 200
    assert response.json()["ok"] is True, response.json()["issues"]
    response = client.put("/api/model/models/lab", json={"spec": spec})
    assert response.status_code == 200
    spec_file = tmp_path / "createarchitecture" / "models" / "lab.yaml"
    assert spec_file.is_file()

    # 推論の段階での, 保存した定義と重みとデータセットからの一式の作成と推論
    rng = np.random.default_rng(0)
    frame = pd.DataFrame({
        column: rng.normal(size=20) for column in ("a", "b", "c")
    })
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    train = data_dir / "train.csv"
    frame.to_csv(train, index=False)
    new = data_dir / "new.csv"
    frame.head(4).to_csv(new, index=False)
    recipe = {
        "format_version": 1, "target": None, "task": "none",
        "steps": [{"op": "standardize", "columns": "auto"}],
        "split": {"method": "random", "valid": 0.2, "seed": 0},
    }
    export_dataset(load_data(train), recipe, data_dir / "dataset")
    weights = tmp_path / "lab.pt"
    torch.save(build_model(spec, seed=0).state_dict(), weights)
    response = client.post("/api/infer/bundles/create", json={
        "name": "lab", "spec": str(spec_file),
        "dataset": str(data_dir / "dataset"), "weights": str(weights),
        "form": "vector", "role": "group",
    })
    assert response.status_code == 201, response.text
    bundle = response.json()
    assert bundle["ok"] is True, bundle
    response = client.post(
        f"/api/infer/bundles/{bundle['id']}/predict",
        json={"source": str(new)}
    )
    assert response.status_code == 201, response.text


def test_cli_stops_on_unreadable_module(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str]
) -> None:
    """
    ML-Provide の起動の設定に読めないモジュールがあると, 殻の起動が理由の
    1 行を出して終わることを確かめる関数

    Parameters
    ----------
    tmp_path: Path
        一時ディレクトリ
    monkeypatch: pytest.MonkeyPatch
        環境変数と起動の引数の差し替え
    capsys: pytest.CaptureFixture[str]
        出力の受け取り

    Returns
    ----------
    None
    """
    # 読めない部品のモジュールと, 読めない手順のモジュール
    isolate_homes(tmp_path, monkeypatch)
    monkeypatch.delenv("ML_STUDIO_TOKEN", raising=False)
    monkeypatch.setattr(sys, "argv", ["ml-studio"])
    for name, module in (
        ("ML_PROVIDE_UNITS", "no_such_studio_units"),
        ("ML_PROVIDE_PROCEDURES", "no_such_studio_procedures"),
    ):
        monkeypatch.setenv(name, module)
        with pytest.raises(SystemExit) as stopped:
            main()
        assert stopped.value.code == 1
        lines = capsys.readouterr().out.splitlines()
        assert len(lines) == 1
        assert lines[0].startswith("起動できません: ")
        assert module in lines[0]
        assert "ML-Studio を開く" not in lines[0]
        monkeypatch.delenv(name)


def test_unknown_api_not_found(client: TestClient) -> None:
    """
    どの段階にも合わない /api の下の経路が 404 になることを確かめる関数

    Parameters
    ----------
    client: TestClient
        トークン付きの利用者

    Returns
    ----------
    None
    """
    # 画面の HTML ではなく 404 の JSON
    for path in (
        "/api", "/api/x", "/api/problem", "/api/data/items",
        "/api/model/items", "/api/train/items", "/api/infer/items"
    ):
        response = client.get(path)
        assert response.status_code == 404
        assert response.headers["content-type"] == "application/json"
    assert client.post("/api/x").status_code == 404


def test_frontend_served(app_client: TestClient) -> None:
    """
    画面のファイルと, 他の経路の index.html を返すことを確かめる関数

    Parameters
    ----------
    app_client: TestClient
        トークンを持たない利用者

    Returns
    ----------
    None
    """
    # トークン無しでの画面の配信
    assert app_client.get("/assets/app.js").text == "1"
    assert app_client.get("/favicon.svg").text == "<svg/>"
    for path in ("/", "/problem", "/problem/problems/x", "/apix"):
        response = app_client.get(path)
        assert response.status_code == 200
        assert response.text == INDEX

    # HEAD の要求も受け付け
    assert app_client.head("/problem").status_code == 200


def test_frontend_outside(
    app_client: TestClient, static_dir: Path, tmp_path: Path
) -> None:
    """
    画面のディレクトリの外のファイルと扱えないパスに index.html を返す
    ことを確かめる関数

    Parameters
    ----------
    app_client: TestClient
        トークンを持たない利用者
    static_dir: Path
        テストの画面のディレクトリ
    tmp_path: Path
        一時ディレクトリ

    Returns
    ----------
    None
    """
    # 画面のディレクトリの外のファイルと, 外を指すリンク
    (tmp_path / "secret.txt").write_text("secret", encoding="utf-8")
    (static_dir / "link.txt").symlink_to(tmp_path / "secret.txt")
    for path in ("/..%2Fsecret.txt", "/%2E%2E/secret.txt", "/link.txt"):
        response = app_client.get(path)
        assert response.status_code == 200
        assert response.text == INDEX

    # NUL の文字と長すぎる名前
    for path in ("/a%00b", "/" + "a" * 300):
        response = app_client.get(path)
        assert response.status_code == 200
        assert response.text == INDEX


def test_without_frontend(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """
    画面をビルドしていない場合も API が動き, 合わない API が 404 になる
    ことを確かめる関数

    Parameters
    ----------
    tmp_path: Path
        一時ディレクトリ
    monkeypatch: pytest.MonkeyPatch
        環境変数の差し替え

    Returns
    ----------
    None
    """
    # index.html の無い画面のディレクトリ
    isolate_homes(tmp_path, monkeypatch)
    app = create_app(
        token=TOKEN, allowed_hosts=["testserver"],
        static_dir=tmp_path / "empty"
    )
    client = TestClient(app, headers={"x-studio-token": TOKEN})
    assert client.get("/api/problem/problems").status_code == 200
    assert client.get("/api/").status_code == 404
    assert client.get("/problem").status_code == 404


def test_token_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    トークンを環境変数から読み, ASCII の表示できる文字の他を断ることを
    確かめる関数

    Parameters
    ----------
    monkeypatch: pytest.MonkeyPatch
        環境変数の差し替え

    Returns
    ----------
    None
    """
    # 渡した値, 環境変数, ランダムの順
    monkeypatch.setenv("ML_STUDIO_TOKEN", "from-env")
    assert get_token(None) == "from-env"
    assert get_token("given") == "given"
    monkeypatch.delenv("ML_STUDIO_TOKEN")
    assert len(get_token(None)) >= 24

    # Cookie に置けない文字
    for value in ("トークン", "a b"):
        with pytest.raises(ValueError):
            get_token(value)


def test_allowed_hosts() -> None:
    """
    受け付けるホスト名の決め方を確かめる関数

    Parameters
    ----------
    None

    Returns
    ----------
    None
    """
    # 既定, 名前で待ち受けるホスト, 全てのアドレス, 重なり
    assert allowed_hosts("127.0.0.1", []) == ["127.0.0.1", "localhost"]
    assert allowed_hosts("studio.lan", ["10.0.0.2"]) == [
        "127.0.0.1", "localhost", "studio.lan", "10.0.0.2"
    ]
    assert allowed_hosts("0.0.0.0", ["localhost"]) == [
        "127.0.0.1", "localhost"
    ]
