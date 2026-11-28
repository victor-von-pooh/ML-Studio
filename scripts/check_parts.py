"""
5 つのアプリの画面の共通の部品が, 殻の正のファイルの写しかを確かめる
スクリプト

殻の parts/ の正のファイル (docs/DESIGN.md の R12) と, 載せた各アプリの
frontend/src/components/ の同じ名前の写しを SHA-256 で比べ, 合う, 違う,
無いをアプリとファイルごとに出す. 違うときは差の行の数も出す. 既定は差を
出すだけで 0 で終わり, --strict を付けると差があるときに 1 で終わる. 正の
ファイルが無いときは 2 で終わる. submodule を取ってから
(git submodule update --init) 動かす
"""
import argparse
import difflib
import hashlib
import sys
from pathlib import Path

# 殻の正のファイルの置き場と名前, 各アプリの写しの置き場 (アプリのルートから)
CANON_DIR = Path("parts")
NAMES = ("common.tsx", "common-utils.ts")
COPY_DIR = Path("frontend") / "src" / "components"

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
    アプリとファイルごとの比べの結果を作る関数

    Parameters
    ----------
    root: Path
        殻のリポジトリのルート

    Returns
    ----------
    differences: list[str]
        正と違うか写しの無い所の説明 (合う所は含まない)
    """
    # 正のハッシュと, アプリとファイルごとの比べ
    differences = []
    for name in NAMES:
        canon = root / CANON_DIR / name
        expected = digest(canon)
        print(f"{CANON_DIR / name}: {expected[:12]}")
        for app in APPS:
            copy = root / app / COPY_DIR / name
            place = COPY_DIR / name
            if not (root / app / "frontend").is_dir():
                line = f"{app}: submodule を取っていません"
            elif not copy.is_file():
                line = f"{app}: {place} がありません"
            elif digest(copy) != expected:
                line = (
                    f"{app}: {place} が正と違います "
                    f"({changed_lines(canon, copy)} 行)"
                )
            else:
                print(f"{app}: {place} は合っています")
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
        正のファイルが無ければ 2, --strict のときに差があれば 1, 他は 0
    """
    # 引数 (知らない引数は argparse が 2 で止める) と正のファイルの有無
    parser = argparse.ArgumentParser(
        description="各アプリの共通の部品の写しを殻の正と比べる"
    )
    parser.add_argument(
        "--strict", action="store_true", help="差があれば 1 で終わる"
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    missing = [name for name in NAMES
               if not (root / CANON_DIR / name).is_file()]
    if missing:
        for name in missing:
            print(f"正のファイル {CANON_DIR / name} がありません",
                  file=sys.stderr)
        return 2

    # 差の報告と, 落とすかどうか
    differences = report(root)
    code = 1 if args.strict and differences else 0

    return code


if __name__ == "__main__":
    sys.exit(main())
