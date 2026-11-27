"""
殻の環境に足す extra の名前を確かめるスクリプト

make extras (make setup EXTRAS=...) が, 渡した extra が
ML-CreateArchitecture の extra (外部のライブラリの部品の extra. project
を除く) にあり, 実際に入れる ML-ModelControl の同じ名前の extra にも
あるかを確かめるのに使う (片方だけにある名前は, uv が警告だけを出して
何も入れずに通るため). 殻の環境の Python で動かし, 入っている 2 つの
パッケージの Provides-Extra を読む (名前の一覧を 2 か所に書かないため).
名前が無いか知らない名前があれば, 選べる名前を出して 1 で終わる.
--list を渡すと選べる名前を出して 0 で終わる (make extras-list)
"""
import sys
from importlib.metadata import PackageNotFoundError, metadata

# 段階のアプリと, 実際に extra を入れるライブラリの名前
APP = "ml-createarchitecture"
LIBRARY = "ml-modelcontrol"

# 殻が既定で入れる extra (選ぶ対象から外す)
DEFAULT_EXTRA = "project"

# 選べる名前を出す印
LIST_FLAG = "--list"


def provided_extras(name: str) -> list[str]:
    """
    入っているパッケージの extra の名前を返す関数

    Parameters
    ----------
    name: str
        パッケージの名前

    Returns
    ----------
    extras: list[str]
        パッケージの情報の Provides-Extra の並び
    """
    # 入っているパッケージの情報
    extras = metadata(name).get_all("Provides-Extra") or []

    return extras


def known_extras() -> list[str]:
    """
    殻の環境に足せる extra の名前を返す関数

    Parameters
    ----------
    None

    Returns
    ----------
    extras: list[str]
        ML-CreateArchitecture と ML-ModelControl の両方にある extra の
        名前の並び (project を除く)
    """
    # 段階のアプリの extra のうち, ライブラリにもあるもの
    library = set(provided_extras(LIBRARY))
    extras = [
        extra for extra in provided_extras(APP)
        if extra != DEFAULT_EXTRA and extra in library
    ]

    return extras


def main() -> int:
    """
    渡した extra の名前を確かめる関数

    Parameters
    ----------
    None

    Returns
    ----------
    code: int
        全て選べる名前か, 名前の一覧を出した場合は 0, 殻の環境が無いか,
        名前が無いか知らない名前があれば 1
    """
    # 殻の環境が無い場合と, 一覧を出す場合と, 名前が無い場合と, 知らない
    # 名前がある場合
    chosen = sys.argv[1:]
    try:
        known = known_extras()
    except PackageNotFoundError:
        print("殻の環境がありません. 先に make setup を実行してください")
        return 1
    if chosen == [LIST_FLAG]:
        print(" ".join(known))
        return 0
    unknown = [extra for extra in chosen if extra not in known]
    choices = f"選べる extra: {' '.join(known)}"
    if not chosen:
        print(f"EXTRAS に extra を書いてください (make extras-list). {choices}")
        return 1
    if unknown:
        print(f"知らない extra です: {' '.join(unknown)}. {choices}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
