"""
殻の木の中の共通のライブラリが, 決めた版にそろっているかを確かめる
スクリプト

docs/DESIGN.md の「共通のライブラリの版」の表を読み, submodule の中の
submodule と, 載せた各アプリが git の依存で直に持つライブラリの lock の
版が表と違えば, 場所を出して 1 で終わる. submodule を取ってから (git submodule update --init
--recursive), Python 3.11 以上 (tomllib) で動かす
"""
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import tomllib

# 表の見出しの名前と, 表の行 (| ライブラリ | `版` | 使うアプリ |)
TABLE_TITLE = "共通のライブラリの版"
TABLE_HEADING = f"### {TABLE_TITLE}"
TABLE_ROW = re.compile(r"^\| (ML-[A-Za-z]+) \| `([0-9a-f]{7,40})` \|")

# 表の見出しの行と区切りの行 (版の行として読まない)
TABLE_HEAD = re.compile(r"^\| ライブラリ \|")
TABLE_RULE = re.compile(r"^\|[\s\-|:]+\|$")

# git submodule status の行 (印, コミット, パス, 名前の付いた版).
# 印は空白 (記録と同じ), - (取っていない), + (記録と違う), U (衝突)
STATUS_ROW = re.compile(r"^([ +\-U])([0-9a-f]{40}) (.+?)(?: \(.*\))?$")

# 印ごとの崩れの説明 (空白の印は崩れでない)
FLAG_ERRORS = {
    "-": "取っていません (git submodule update --init --recursive)",
    "+": "記録した版と取り出した版が違います (git submodule update "
    "--recursive)",
    "U": "衝突しています",
}


def decided_versions(design: Path) -> tuple[dict[str, str], list[str]]:
    """
    設計の文書の表から, ライブラリごとの決めた版を読む関数

    Parameters
    ----------
    design: Path
        docs/DESIGN.md

    Returns
    ----------
    versions: dict[str, str]
        ライブラリの名前から版 (コミットの頭) への対応
    errors: list[str]
        読めない表の行の説明の並び (黙って確かめから外さないため)
    """
    # 見出しの後から, 次の見出しまでの表の行
    versions: dict[str, str] = {}
    errors: list[str] = []
    inside = False
    lines = design.read_text(encoding="utf-8").splitlines()
    for number, line in enumerate(lines, start=1):
        if line.startswith("#"):
            inside = line.strip() == TABLE_HEADING
            continue
        if not inside or not line.startswith("|"):
            continue
        if TABLE_HEAD.match(line) or TABLE_RULE.match(line):
            continue
        found = TABLE_ROW.match(line)
        if found:
            versions[found.group(1)] = found.group(2)
        else:
            errors.append(f"docs/DESIGN.md:{number}: 表の行を読めません")

    return versions, errors


def submodule_versions(root: Path) -> list[tuple[str, str, str]]:
    """
    submodule の中の submodule までの, パスと版の並びを返す関数

    Parameters
    ----------
    root: Path
        リポジトリの根

    Returns
    ----------
    found: list[tuple[str, str, str]]
        印, パス, 版 (コミット) の組の並び
    """
    # 取っていない submodule の中には入らないので, 印も返して崩れにする
    output = subprocess.run(
        ["git", "submodule", "status", "--recursive"], cwd=root,
        capture_output=True, text=True, check=True
    ).stdout
    found = []
    for line in output.splitlines():
        matched = STATUS_ROW.match(line)
        if matched:
            found.append(
                (matched.group(1), matched.group(3), matched.group(2))
            )

    return found


def package_key(name: str) -> str:
    """
    パッケージ名を, 小文字と - だけの形にそろえる関数

    Parameters
    ----------
    name: str
        パッケージ名 (pyproject.toml の書き方のまま)

    Returns
    ----------
    key: str
        uv.lock と同じ形の名前
    """
    key = re.sub(r"[-_.]+", "-", name).lower()

    return key


def library_name(url: str) -> str:
    """
    git の URL から, ライブラリの名前 (リポジトリの名前) を取る関数

    Parameters
    ----------
    url: str
        git の URL (末尾の .git と # の後ろの版は無くてよい)

    Returns
    ----------
    name: str
        リポジトリの名前 (大文字小文字は URL のまま)
    """
    name = url.split("#")[0].split("?")[0].rstrip("/").rsplit("/", 1)[-1]
    name = name.removesuffix(".git")

    return name


def read_toml(path: Path, root: Path) -> tuple[dict[str, Any], list[str]]:
    """
    TOML のファイルを読む関数

    Parameters
    ----------
    path: Path
        読むファイル
    root: Path
        崩れの場所を書くときの基準のディレクトリ

    Returns
    ----------
    data: dict[str, Any]
        読んだ中身 (読めなければ空)
    errors: list[str]
        読めない理由の説明の並び
    """
    # 壊れたファイルも場所付きの 1 行の崩れ (traceback で落とさないため)
    try:
        data: dict[str, Any] = tomllib.loads(
            path.read_text(encoding="utf-8")
        )
    except (OSError, tomllib.TOMLDecodeError) as error:
        return {}, [f"{path.relative_to(root)}: 読めません ({error})"]

    return data, []


def git_sources(project: dict[str, Any]) -> dict[str, str]:
    """
    pyproject.toml の tool.uv.sources から, git の依存を集める関数

    Parameters
    ----------
    project: dict[str, Any]
        pyproject.toml の中身

    Returns
    ----------
    direct: dict[str, str]
        そろえたパッケージ名からライブラリの名前への対応
    """
    # 1 つの書き方と, marker ごとの並びの書き方の両方
    sources = project.get("tool", {}).get("uv", {}).get("sources", {})
    direct: dict[str, str] = {}
    for package, source in sources.items():
        entries = source if isinstance(source, list) else [source]
        for entry in entries:
            if isinstance(entry, dict) and "git" in entry:
                direct[package_key(package)] = library_name(entry["git"])

    return direct


def lock_versions(
    app: Path, root: Path
) -> tuple[list[tuple[str, str]], list[str]]:
    """
    アプリが git の依存で直に持つライブラリの, lock の版を読む関数

    Parameters
    ----------
    app: Path
        段階のアプリのディレクトリ (backend/pyproject.toml と
        backend/uv.lock を持つ)
    root: Path
        殻のリポジトリの根 (崩れの場所の基準)

    Returns
    ----------
    found: list[tuple[str, str]]
        ライブラリの名前と lock の版 (コミット) の組の並び (同じ名前の
        パッケージが lock に複数あれば全て)
    errors: list[str]
        読めない pyproject.toml と lock の説明の並び
    """
    # pyproject.toml の git の依存 (無ければ見ない)
    project_file = app / "backend" / "pyproject.toml"
    if not project_file.is_file():
        return [], []
    project, errors = read_toml(project_file, root)
    direct = git_sources(project)
    if not direct:
        return [], errors

    # uv.lock の同じ名前のパッケージの git の版 (# の後ろ)
    lock = app / "backend" / "uv.lock"
    if not lock.is_file():
        return [], errors + [f"{lock.relative_to(root)}: ありません"]
    locked, lock_errors = read_toml(lock, root)
    errors += lock_errors
    found: list[tuple[str, str]] = []
    for package, name in sorted(direct.items()):
        urls = [
            entry.get("source", {}).get("git", "")
            for entry in locked.get("package", [])
            if package_key(entry.get("name", "")) == package
        ]
        if not urls or any("#" not in url for url in urls):
            errors.append(
                f"{lock.relative_to(root)}: {package} の git の版が"
                "ありません"
            )
            continue
        found += [(name, url.rsplit("#", 1)[1]) for url in urls]

    return found, errors


def version_errors(root: Path) -> list[str]:
    """
    表の版とずれた submodule と lock を探す関数

    Parameters
    ----------
    root: Path
        リポジトリの根

    Returns
    ----------
    errors: list[str]
        崩れの説明の並び
    """
    # 表が読めないことも崩れ (確かめが黙って何も見なくなるため).
    # 名前は大文字小文字を除いて比べる (GitHub の URL は区別しないため)
    versions, errors = decided_versions(root / "docs" / "DESIGN.md")
    if not versions:
        errors.append(f"docs/DESIGN.md: 「{TABLE_TITLE}」の表が読めません")
        return errors
    decided = {name.lower(): version for name, version in versions.items()}

    # 全ての submodule の印と, 段階のアプリの中のライブラリの版の確かめ
    # (殻の直下の段階のアプリの版は殻が選ぶので, 表と比べない)
    seen: set[str] = set()
    statuses = submodule_versions(root)
    for flag, path, commit in statuses:
        if flag in FLAG_ERRORS:
            errors.append(f"{path}: {FLAG_ERRORS[flag]}")
            continue
        name = Path(path).name.lower()
        if "/" not in path or name not in decided:
            continue
        seen.add(name)
        if not commit.startswith(decided[name]):
            errors.append(
                f"{path}: {commit[:7]} (表の版は {decided[name]})"
            )

    # 殻の直下の段階のアプリが git の依存で直に持つライブラリの lock の版
    apps = [
        path for flag, path, _ in statuses
        if "/" not in path and flag not in FLAG_ERRORS
    ]
    for app in apps:
        found, lock_errors = lock_versions(root / app, root)
        errors.extend(lock_errors)
        for library, commit in found:
            name = library.lower()
            if name not in decided:
                continue
            seen.add(name)
            if not commit.startswith(decided[name]):
                errors.append(
                    f"{app}/backend/uv.lock: {library} {commit[:7]} "
                    f"(表の版は {decided[name]})"
                )

    # 表に載せたのに木の中 (submodule と lock) に無いライブラリ
    for name in sorted(versions):
        if name.lower() not in seen:
            errors.append(f"{name}: 殻の木の中にありません")

    return errors


def main() -> int:
    """
    共通のライブラリの版を確かめる関数

    Parameters
    ----------
    None

    Returns
    ----------
    code: int
        ずれが無ければ 0, あれば 1
    """
    # 崩れを全て出して終わる
    root = Path(__file__).resolve().parent.parent
    errors = version_errors(root)
    for error in errors:
        print(error)
    code = 1 if errors else 0

    return code


if __name__ == "__main__":
    sys.exit(main())
