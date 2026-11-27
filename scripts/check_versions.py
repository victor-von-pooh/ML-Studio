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
    versions, errors = decided_versions(root / "docs" / "DESIGN.md")
    if not versions:
        errors.append(f"docs/DESIGN.md: 「{TABLE_TITLE}」の表が読めません")
        return errors

    # 全ての submodule の印と, 段階のアプリの中のライブラリの版の確かめ
    # (殻の直下の段階のアプリの版は殻が選ぶので, 表と比べない)
    seen: set[str] = set()
    for flag, path, commit in submodule_versions(root):
        if flag in FLAG_ERRORS:
            errors.append(f"{path}: {FLAG_ERRORS[flag]}")
            continue
        name = Path(path).name
        if "/" not in path or name not in versions:
            continue
        seen.add(name)
        if not commit.startswith(versions[name]):
            errors.append(
                f"{path}: {commit[:7]} (表の版は {versions[name]})"
            )

    # 表に載せたのに木の中に無いライブラリ
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
    # 崩れを全て出して終わる
    root = Path(__file__).resolve().parent.parent
    errors = version_errors(root)
    for error in errors:
        print(error)
    code = 1 if errors else 0

    return code


if __name__ == "__main__":
    sys.exit(main())
