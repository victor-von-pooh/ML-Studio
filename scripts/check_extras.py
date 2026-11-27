"""
殻の環境に足す extra の名前を確かめるスクリプト

make extras (make setup EXTRAS=...) が, 渡した extra が
ML-CreateArchitecture の extra (外部のライブラリの部品の extra. project
を除く) にあるかを確かめるのに使う. 殻の環境の Python で動かし
(uv run --no-sync python), 入っている ML-CreateArchitecture の
Provides-Extra を読む (名前の一覧を 2 か所に書かないため). 名前が無いか
知らない名前があれば, 選べる名前を出して 1 で終わる
"""
import sys
from importlib.metadata import metadata

# 段階のアプリの名前と, 殻が既定で入れる extra (選ぶ対象から外す)
APP = "ml-createarchitecture"
DEFAULT_EXTRA = "project"


def known_extras() -> list[str]:
    """
    殻の環境に足せる extra の名前を返す関数

    Parameters
    ----------
    None

    Returns
    ----------
    extras: list[str]
        ML-CreateArchitecture の extra の名前の並び (project を除く)
    """
    # 入っているパッケージの情報の Provides-Extra
    provided = metadata(APP).get_all("Provides-Extra") or []
    extras = [extra for extra in provided if extra != DEFAULT_EXTRA]

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
        全て選べる名前なら 0, 名前が無いか知らない名前があれば 1
    """
    # 名前が無い場合と, 知らない名前がある場合
    chosen = sys.argv[1:]
    known = known_extras()
    unknown = [extra for extra in chosen if extra not in known]
    choices = f"選べる extra: {' '.join(known)}"
    if not chosen:
        print(f"EXTRAS に extra を書いてください. {choices}")
        return 1
    if unknown:
        print(f"知らない extra です: {' '.join(unknown)}. {choices}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
