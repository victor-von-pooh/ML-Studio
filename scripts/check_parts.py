"""
5 つのアプリの画面の共通の部品が, 殻の正のファイルの写しかを確かめる
スクリプト

殻の parts/common.tsx (docs/DESIGN.md の R12) と, 載せた各アプリの
frontend/src/components/common.tsx を SHA-256 で比べ, 合う, 違う, 無いを
アプリごとに出す. 違うときは差の行の数も出す. 今は差を出すだけで 0 で
終わり, --strict を付けると差があるときに 1 で終わる. submodule を取って
から (git submodule update --init) 動かす
"""
import difflib
import hashlib
import sys
from pathlib import Path

# 殻の正のファイルと, 各アプリの写しの場所 (アプリのルートから)
CANON = Path("parts") / "common.tsx"
COPY = Path("frontend") / "src" / "components" / "common.tsx"

# 載せた 5 つのアプリ (段階の並び)
APPS = (
    "ML-Pathfinder",
    "ML-Fathom",
    "ML-CreateArchitecture",
    "ML-Dashboard",
    "ML-Provide",
)


def digest(path: Path) -> str:
    """
    ファイルの SHA-256 を返す関数

    Parameters
    ----------
    path: Path
        ファイル

    Returns
    ----------
    value: str
        16 進の SHA-256
    """
    # 中身のバイト列のハッシュ
    value = hashlib.sha256(path.read_bytes()).hexdigest()

    return value


def changed_lines(canon: Path, copy: Path) -> int:
    """
    正と写しの差の行の数を返す関数

    Parameters
    ----------
    canon: Path
        殻の正のファイル
    copy: Path
        アプリの写し

    Returns
    ----------
    count: int
        unified diff の足した行と消した行の数
    """
    # 見出しの行 (--- と +++) を除いた差の行
    diff = difflib.unified_diff(
        canon.read_text(encoding="utf-8").splitlines(),
        copy.read_text(encoding="utf-8").splitlines(),
        lineterm="",
    )
    count = sum(
        1 for line in diff
        if line[:1] in "+-" and not line.startswith(("---", "+++"))
    )

    return count


def report(root: Path) -> list[str]:
    """
    アプリごとの比べの結果を作る関数

    Parameters
    ----------
    root: Path
        殻のリポジトリのルート

    Returns
    ----------
    differences: list[str]
        正と違うか写しの無いアプリの説明 (合うアプリは含まない)
    """
    # 正のハッシュとアプリごとの比べ
    canon = root / CANON
    expected = digest(canon)
    print(f"{CANON}: {expected[:12]}")
    differences = []
    for app in APPS:
        copy = root / app / COPY
        if not (root / app / "frontend").is_dir():
            line = f"{app}: submodule を取っていません"
        elif not copy.is_file():
            line = f"{app}: {COPY} がありません"
        elif digest(copy) != expected:
            line = (
                f"{app}: {COPY} が正と違います "
                f"({changed_lines(canon, copy)} 行)"
            )
        else:
            print(f"{app}: 合っています")
            continue
        print(line)
        differences.append(line)

    return differences


def main() -> int:
    """
    5 つのアプリの写しを比べる関数

    Parameters
    ----------
    None

    Returns
    ----------
    code: int
        --strict のときに差があれば 1, 他は 0
    """
    # 差の報告と, 落とすかどうか
    root = Path(__file__).resolve().parent.parent
    differences = report(root)
    strict = "--strict" in sys.argv[1:]
    code = 1 if strict and differences else 0

    return code


if __name__ == "__main__":
    sys.exit(main())
