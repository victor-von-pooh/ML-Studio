"""
リポジトリの文書とファイルの決まりを確かめるスクリプト

CLAUDE.md の触れてよいリポジトリの一覧に無いリポジトリの名前, 手元の
環境の絶対パス, TODO.md の形の崩れを見つけたら, 場所を出して 1 で終わる
"""
import re
import subprocess
import sys
from pathlib import Path

# リポジトリの名前らしい語. 大文字の ML に - か _ が続く語と, パッケージ名
# の形の小文字の ml_ で始まる語 (小文字の ml- は画面のクラス名 ml-auto など
# と取り違えるので探さない. 後ろに _ が続く環境変数のような語も除く).
# 比べるときは名前の形をそろえる
REPO_NAME = re.compile(r"\bML[-_][A-Za-z]+\b(?!_)|\bml_[a-z]+\b(?!_)")

# 手元の環境の絶対パス (URL の中の /home/ などは対象外)
LOCAL_PATH = re.compile(
    r"(^|[^:/a-zA-Z.])(/Users/|/home/|/private/(tmp|var)/|/Volumes/)"
    r"|[A-Z]:\\Users"
)

# TODO.md の節の並びと, 項目が持つ行の頭 (条件待ちの項目は別の形)
TODO_SECTIONS = ("## 優先度 高", "## 優先度 中", "## 優先度 低", "## 条件待ち")
ITEM_FIELDS = ("- 何を:", "- なぜ:", "- 終わりの条件:", "- つながり:")
WAITING_FIELDS = ("- 何を:", "- 待っているもの:")


def name_key(name: str) -> str:
    """
    リポジトリの名前を, 大文字小文字と - と _ の違いを除いた形にする関数

    Parameters
    ----------
    name: str
        名前

    Returns
    ----------
    key: str
        小文字で, - と _ を除いた形
    """
    # 小文字にして区切りを除く
    key = name.lower().replace("-", "").replace("_", "")

    return key


def allowed_repos(root: Path) -> set[str]:
    """
    CLAUDE.md の触れてよいリポジトリの一覧を読む関数

    Parameters
    ----------
    root: Path
        リポジトリのルート

    Returns
    ----------
    names: set[str]
        一覧のリポジトリの名前 (name_key の形)

    Raises
    ----------
    ValueError
        CLAUDE.md に一覧 (「(今は ...)」) が無い場合
    """
    # 「(今は A, B, ...)」の括弧の中
    text = (root / "CLAUDE.md").read_text(encoding="utf-8")
    found = re.search(r"\(今は ([^)]*)\)", text)
    if found is None:
        raise ValueError("CLAUDE.md にリポジトリの一覧がありません")
    names = {name_key(name.strip()) for name in found.group(1).split(",")}

    return names


def tracked_files(root: Path) -> list[Path]:
    """
    git の管理下のファイルを返す関数

    Parameters
    ----------
    root: Path
        リポジトリのルート

    Returns
    ----------
    files: list[Path]
        管理下のファイル (submodule の中は含まない)
    """
    # git ls-files の並び
    listed = subprocess.run(
        ["git", "ls-files"], cwd=root, capture_output=True, text=True,
        check=True
    ).stdout.splitlines()
    files = [root / name for name in listed if (root / name).is_file()]

    return files


def text_errors(root: Path, names: set[str]) -> list[str]:
    """
    一覧に無いリポジトリの名前と手元のパスを探す関数

    Parameters
    ----------
    root: Path
        リポジトリのルート
    names: set[str]
        触れてよいリポジトリの名前 (name_key の形)

    Returns
    ----------
    errors: list[str]
        見つけた場所と中身 (このスクリプトの決まりの定義は除く)
    """
    # 文字として読めるファイルの行ごと
    errors = []
    for path in tracked_files(root):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        place = path.relative_to(root)
        for number, line in enumerate(lines, 1):
            for word in REPO_NAME.findall(line):
                if name_key(word) not in names:
                    errors.append(
                        f"{place}:{number}: 一覧に無いリポジトリ {word}"
                    )
            if place.parts[0] != "scripts" and LOCAL_PATH.search(line):
                errors.append(f"{place}:{number}: 手元の環境の絶対パス")

    return errors


def todo_errors(root: Path) -> list[str]:
    """
    TODO.md の節の並びと項目の形を確かめる関数

    Parameters
    ----------
    root: Path
        リポジトリのルート

    Returns
    ----------
    errors: list[str]
        形の崩れ (節が無い, 並びが違う, 項目に行が足りない, 項目がある
        のに高か中が空)
    """
    # 節の位置と並び
    errors = []
    lines = (root / "TODO.md").read_text(encoding="utf-8").splitlines()
    places = [lines.index(name) if name in lines else -1
              for name in TODO_SECTIONS]
    for name, place in zip(TODO_SECTIONS, places):
        if place < 0:
            errors.append(f"TODO.md: 節「{name[3:]}」がありません")
    if errors:
        return errors
    if places != sorted(places):
        errors.append("TODO.md: 節の並びが 高, 中, 低, 条件待ち ではありません")

    # 項目ごとの 4 つの行と, 節ごとの項目の数
    counts = dict.fromkeys(TODO_SECTIONS, 0)
    section = None
    item = None
    fields: set[str] = set()
    for line in [*lines, "### (終わり)"]:
        if line.startswith("### ") or line in TODO_SECTIONS:
            if item is not None:
                need = (WAITING_FIELDS if section == TODO_SECTIONS[3]
                        else ITEM_FIELDS)
                missing = [f for f in need if f not in fields]
                if missing:
                    errors.append(
                        f"TODO.md: 項目「{item}」に "
                        f"{', '.join(missing)} がありません"
                    )
            item, fields = None, set()
            if line in TODO_SECTIONS:
                section = line
            elif line != "### (終わり)" and section is not None:
                item = line[4:]
                counts[section] += 1
        elif item is not None:
            fields |= {f for f in (*ITEM_FIELDS, *WAITING_FIELDS)
                       if line.startswith(f)}
    if sum(counts.values()) > 0 and (
        counts[TODO_SECTIONS[0]] == 0 or counts[TODO_SECTIONS[1]] == 0
    ) and sum(counts[name] for name in TODO_SECTIONS[:3]) > 1:
        errors.append("TODO.md: 項目があるのに高か中が空です")

    return errors


def main() -> int:
    """
    決まりを全て確かめる関数

    Parameters
    ----------
    None

    Returns
    ----------
    code: int
        崩れが無ければ 0, あれば 1
    """
    # 一覧, 名前とパス, TODO.md の順
    root = Path(__file__).resolve().parent.parent
    errors = text_errors(root, allowed_repos(root)) + todo_errors(root)
    for error in errors:
        print(error)
    code = 1 if errors else 0

    return code


if __name__ == "__main__":
    sys.exit(main())
