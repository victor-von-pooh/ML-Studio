import hashlib
import os
import secrets
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import NoReturn, Optional
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from ml_createarchitecture.app import create_api as create_model_api
from ml_dashboard.app import create_api as create_train_api
from ml_fathom.app import create_api as create_data_api
from ml_pathfinder.app import create_api as create_problem_api
from ml_provide.app import create_api as create_infer_api

# ビルド済みの画面を置く場所 (パッケージの中)
STATIC_DIR = (Path(__file__).parent / "static").resolve()

# 既定で受け付けるホスト名 (手元からだけ使う前提)
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

# 状態を変えないメソッド (他は Origin を確かめる)
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

# 起動ごとのトークンの環境変数, Cookie の名前の頭, ヘッダーの名前
TOKEN_ENV = "ML_STUDIO_TOKEN"
TOKEN_COOKIE = "ml_studio_token"
TOKEN_HEADER = "x-studio-token"

# API の頭と, トークンを受け取って Cookie に置くパス
API_PREFIX = "/api"
AUTH_PATH = "/api/auth"

# 問題の設定, データの分析, モデルの作成・選定, 学習・評価, 推論の段階の
# API の頭
PROBLEM_PREFIX = "/api/problem"
DATA_PREFIX = "/api/data"
MODEL_PREFIX = "/api/model"
TRAIN_PREFIX = "/api/train"
INFER_PREFIX = "/api/infer"

# 合わない API の経路で 404 を返すメソッド
API_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

# 仕様の名前と版
TITLE = "ML-Studio"
VERSION = "0.1.0"


def is_api_path(path: str) -> bool:
    """
    パスが API の下 (/api か /api/...) かを調べる関数

    Parameters
    ----------
    path: str
        要求のパス (先頭の / を含む)

    Returns
    ----------
    inside: bool
        API の下かどうか (/apis のような別の語は含まない)
    """
    inside = path == API_PREFIX or path.startswith(API_PREFIX + "/")

    return inside


def cookie_name(token: str) -> str:
    """
    トークンを置く Cookie の名前を作る関数

    Cookie はポートを区別しないので, 同じ端末の別の起動と重ならない
    ように, トークンから作る印を名前に付ける

    Parameters
    ----------
    token: str
        起動ごとのトークン

    Returns
    ----------
    name: str
        Cookie の名前 (ml_studio_token_<印>)
    """
    digest = hashlib.sha256(token.encode()).hexdigest()[:12]
    name = f"{TOKEN_COOKIE}_{digest}"

    return name


def same_token(given: str, token: str) -> bool:
    """
    トークンが一致するかを, 時間で推測されないように比べる関数

    Parameters
    ----------
    given: str
        送られたトークン
    token: str
        起動ごとのトークン

    Returns
    ----------
    same: bool
        一致するかどうか (送られた値が ASCII 以外の文字を含んでも比較可能)
    """
    same = secrets.compare_digest(given.encode(), token.encode())

    return same


def get_token(token: Optional[str]) -> str:
    """
    起動ごとのトークンを決める関数

    Parameters
    ----------
    token: Optional[str]
        指定されたトークン, None の場合は環境変数かランダムに作成

    Returns
    ----------
    value: str
        トークン

    Raises
    ----------
    ValueError
        トークンが ASCII の表示できる文字 (空白を除く) だけでない場合
        (Cookie に置けないため)
    """
    value = token or os.environ.get(TOKEN_ENV) or secrets.token_urlsafe(24)
    if not all("!" <= char <= "~" for char in value):
        raise ValueError(
            "トークンには ASCII の表示できる文字 (空白を除く) だけを使って"
            "ください"
        )

    return value


async def check_origin(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """
    他のサイトからの書き込みを断る関数

    Parameters
    ----------
    request: Request
        リクエスト
    call_next: Callable[[Request], Awaitable[Response]]
        次の処理

    Returns
    ----------
    response: Response
        応答, 接続先と違う Origin からの書き込みは 403
    """
    # ブラウザが付ける Origin と接続先 (Host) のホストとポートの比較
    origin = request.headers.get("origin")
    if request.method not in SAFE_METHODS and origin is not None:
        if urlsplit(origin).netloc != request.headers.get("host"):
            response: Response = JSONResponse(
                {"detail": "別のサイトからの操作は受け付けません"},
                status_code=403
            )
            return response

    response = await call_next(request)

    return response


async def check_token(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """
    API の呼び出しに起動ごとのトークンを求める関数

    Parameters
    ----------
    request: Request
        リクエスト (request.app は殻のアプリ. token を持つ)
    call_next: Callable[[Request], Awaitable[Response]]
        次の処理

    Returns
    ----------
    response: Response
        応答, Cookie かヘッダーのトークンが合わない API の呼び出しは 401
    """
    # トークンを受け取る GET /api/auth だけの除外 (他のメソッドは確かめの対象)
    token: str = request.app.state.token
    path = request.url.path
    opening = path == AUTH_PATH and request.method == "GET"
    if is_api_path(path) and not opening:
        given = [
            request.cookies.get(cookie_name(token), ""),
            request.headers.get(TOKEN_HEADER, "")
        ]
        if not any(same_token(value, token) for value in given):
            response: Response = JSONResponse(
                {
                    "detail": "起動したときに表示された URL "
                    f"({AUTH_PATH}?token=...) を開いてください"
                },
                status_code=401
            )
            return response

    response = await call_next(request)

    return response


def authenticate(request: Request, token: str = "") -> Response:
    """
    起動時の URL のトークンを Cookie に置いて画面に移る関数

    Parameters
    ----------
    request: Request
        リクエスト (request.app は殻のアプリ. token を持つ)
    token: str = ""
        URL で渡されたトークン

    Returns
    ----------
    response: Response
        画面への 303 の移動, トークンが違う場合は 401
    """
    if not same_token(token, request.app.state.token):
        response: Response = JSONResponse(
            {"detail": "トークンが違います"}, status_code=401
        )
        return response

    response = RedirectResponse("/", status_code=303)
    response.set_cookie(
        cookie_name(token), token, httponly=True, samesite="strict"
    )

    return response


def api_not_found(path: str = "") -> NoReturn:
    """
    どの段階の API にも合わない /api の下の経路を 404 にする関数

    画面の HTML で呼び間違いを隠さないように, 常に 404 の例外を出す

    Parameters
    ----------
    path: str = ""
        /api の後ろのパス

    Returns
    ----------
    None
    """
    raise HTTPException(404, f"API が見つかりません: /api/{path}")


def serve_index(request: Request, path: str) -> FileResponse:
    """
    画面のファイルか, 画面の中の経路として index.html を返す関数

    Parameters
    ----------
    request: Request
        リクエスト (request.app は画面のディレクトリを持つ)
    path: str
        要求されたパス (先頭の / を除く)

    Returns
    ----------
    response: FileResponse
        ファイルか index.html
    """
    # 画面のディレクトリの中のファイルだけを返し, 他は index.html
    # (扱えないパス (NUL の文字, 長すぎる名前) も index.html)
    static_dir: Path = request.app.state.static_dir
    try:
        target = (static_dir / path).resolve()
        found = target.is_relative_to(static_dir) and target.is_file()
    except (OSError, ValueError):
        found = False
    if path and found:
        response = FileResponse(target)
        return response

    response = FileResponse(static_dir / "index.html")

    return response


def create_stage_apis() -> tuple[dict[str, FastAPI], Path]:
    """
    段階のアプリの API を作る関数

    ML-Pathfinder の create_api を先に呼び, その問題の設定の置き場を
    後の段階のアプリの create_api に problems_dir として渡す

    Parameters
    ----------
    None

    Returns
    ----------
    apis: dict[str, FastAPI]
        経路の頭ごとの API のアプリ (段階の並びの順)
    problems_dir: Path
        ML-Pathfinder が決めた問題の設定の置き場

    Raises
    ----------
    ValueError
        段階のアプリが起動を止める場合 (読めない自作の部品のモジュールなど)
    """
    # 問題の設定の段階 (置き場は ML-Pathfinder の既定)
    problem_api = create_problem_api()
    problems_dir: Path = problem_api.state.problems_dir

    # データの分析の段階 (アプリの置き場は ML-Fathom の既定)
    data_api = create_data_api(problems_dir=problems_dir)

    # モデルの作成・選定の段階 (アプリの置き場と自作の部品は
    # ML-CreateArchitecture の既定)
    model_api = create_model_api(problems_dir=problems_dir)

    # 学習・評価の段階 (アプリの置き場は ML-Dashboard の既定. ジョブの
    # プロセスとロックをアプリごとに持つので, 1 つのプロセスで 1 度だけ作る)
    train_api = create_train_api(problems_dir=problems_dir)

    # 推論の段階 (アプリの置き場と自作の部品と手順は ML-Provide の既定.
    # 自作の部品の登録簿は ML-CreateArchitecture と共有)
    infer_api = create_infer_api(problems_dir=problems_dir)
    apis = {
        PROBLEM_PREFIX: problem_api, DATA_PREFIX: data_api,
        MODEL_PREFIX: model_api, TRAIN_PREFIX: train_api,
        INFER_PREFIX: infer_api
    }

    return apis, problems_dir


def mount_frontend(app: FastAPI, static_dir: Path) -> None:
    """
    ビルド済みの画面を配信する設定を加える関数

    Parameters
    ----------
    app: FastAPI
        殻のアプリ
    static_dir: Path
        ビルド済みの画面のディレクトリ

    Returns
    ----------
    None
    """
    static_dir = static_dir.resolve()
    if not (static_dir / "index.html").is_file():
        return

    # JavaScript や CSS などのファイルと, 他のパスの index.html の配信
    app.state.static_dir = static_dir
    if (static_dir / "assets").is_dir():
        app.mount(
            "/assets", StaticFiles(directory=static_dir / "assets"),
            name="assets"
        )
    app.add_api_route(
        "/{path:path}", serve_index, methods=["GET", "HEAD"],
        include_in_schema=False
    )


def create_app(
    token: Optional[str] = None, allowed_hosts: Optional[list[str]] = None,
    static_dir: Optional[Path] = None
) -> FastAPI:
    """
    殻のアプリを組み立てる関数

    トークン, Origin, ホスト名の確かめ, /api/auth, 画面の配信を持つ殻の
    アプリに, 段階のアプリの API を経路の頭ごとに mount する

    Parameters
    ----------
    token: Optional[str] = None
        API の呼び出しに求めるトークン, None の場合は環境変数かランダムに作成
    allowed_hosts: Optional[list[str]] = None
        受け付けるホスト名, None の場合は 127.0.0.1 と localhost
    static_dir: Optional[Path] = None
        ビルド済みの画面のディレクトリ, None の場合はパッケージの中

    Returns
    ----------
    app: FastAPI
        アプリ

    Raises
    ----------
    ValueError
        トークンが Cookie に置けない場合と, 段階のアプリが起動を止める場合
    """
    # 殻のアプリ (仕様の画面は閉じる)
    app = FastAPI(
        title=TITLE, version=VERSION, docs_url=None, redoc_url=None,
        openapi_url=None
    )

    # トークンの無い呼び出し, 他のサイトからの書き込み,
    # 他のホスト名での接続 (DNS の付け替え) の拒否
    app.state.token = get_token(token)
    if not token and not os.environ.get(TOKEN_ENV):
        # 開発用のサーバーなど, トークンを渡さずに作った場合は開き方を表示
        print(
            f"ML-Studio のトークン: {AUTH_PATH}?token={app.state.token}",
            flush=True
        )
    app.middleware("http")(check_token)
    app.middleware("http")(check_origin)
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=allowed_hosts or ALLOWED_HOSTS
    )

    # トークンの受け取り (段階の API より先に照合)
    app.add_api_route(
        AUTH_PATH, authenticate, methods=["GET"], include_in_schema=False
    )

    # 段階のアプリの API と, 他の段階のアプリに渡す問題の設定の置き場
    apis, problems_dir = create_stage_apis()
    app.state.problems_dir = problems_dir
    for prefix, api in apis.items():
        app.mount(prefix, api)

    # どの段階にも合わない /api の下の経路
    app.add_api_route(
        API_PREFIX, api_not_found, methods=API_METHODS,
        response_model=None, include_in_schema=False
    )
    app.add_api_route(
        API_PREFIX + "/{path:path}", api_not_found, methods=API_METHODS,
        response_model=None, include_in_schema=False
    )

    # 画面の配信
    mount_frontend(app, static_dir or STATIC_DIR)

    return app
