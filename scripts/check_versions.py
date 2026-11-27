"""
殻の木の中の共通のライブラリが, 決めた版にそろっているかを確かめる
スクリプト

docs/DESIGN.md の「共通のライブラリの版」の表を読み, submodule の中の
submodule まで含めて, 同じ名前のライブラリの版が表と違えば場所を出して
1 で終わる. submodule を取ってから (git submodule update --init
--recursive) 動かす
"""
import re
import subprocess
import sys
from pathlib import Path

# 表の見出しと, 表の行 (| ライブラリ | `版` | 使うアプリ |)
TABLE_HEADING = "### 共通のライブラリの版"
TABLE_ROW = re.compile(r"^\| (ML-[A-Za-z]+) \| `([0-9a-f]{7,40})` \|")

# git submodule status の行 (印, コミット, パス, 名前の付いた版)
STATUS_ROW = re.compile(r"^[ +\-U]([0-9a-f]{40}) (\S+)")


def decided_versions(design: Path) -> dict[str, str]:
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
    """
    # 見出しの後から, 次の見出しまでの表の行
    versions: dict[str, str] = {}
    inside = False
    for line in design.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            inside = line.strip() == TABLE_HEADING
            continue
        found = TABLE_ROW.match(line) if inside else None
        if found:
            versions[found.group(1)] = found.group(2)

    return versions


def submodule_versions(root: Path) -> list[tuple[str, str]]:
    """
    submodule の中の submodule までの, パスと版の並びを返す関数

    Parameters
    ----------
    root: Path
        リポジトリの根

    Returns
    ----------
    found: list[tuple[str, str]]
        パスと版 (コミット) の組の並び
    """
    output = subprocess.run(
        ["git", "submodule", "status", "--recursive"], cwd=root,
        capture_output=True, text=True, check=True
    ).stdout
    found = []
    for line in output.splitlines():
        matched = STATUS_ROW.match(line)
        if matched:
            found.append((matched.group(2), matched.group(1)))

    return found


def version_errors(root: Path) -> list[str]:
    """
    表の版とずれた submodule を探す関数

    Parameters
    ----------
    root: Path
        リポジトリの根

    Returns
    ----------
    errors: list[str]
        崩れの説明の並び
    """
    # 表が読めないことも崩れ (確かめが黙って何も見なくなるため)
    versions = decided_versions(root / "docs" / "DESIGN.md")
    if not versions:
        errors = [f"docs/DESIGN.md: 「{TABLE_HEADING[4:]}」の表が読めません"]
        return errors

    # パスの最後の名前が表のライブラリの submodule を, 表の版と比べる
    errors = []
    seen: set[str] = set()
    for path, commit in submodule_versions(root):
        name = Path(path).name
        if name not in versions:
            continue
        seen.add(name)
        if not commit.startswith(versions[name]):
            errors.append(
                f"{path}: {commit[:7]} (表の版は {versions[name]})"
            )
    for name in sorted(set(versions) - seen):
        errors.append(f"{name}: 殻の木の中に submodule がありません")

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
    root = Path(__file__).resolve().parent.parent
    errors = version_errors(root)
    for error in errors:
        print(error)
    code = 1 if errors else 0

    return code


if __name__ == "__main__":
    sys.exit(main())
