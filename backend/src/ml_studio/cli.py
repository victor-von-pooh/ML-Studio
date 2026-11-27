import argparse

import uvicorn

from ml_studio.app import ALLOWED_HOSTS, create_app, get_token

# 全てのアドレスで待ち受けるホスト
ANY_HOSTS = ("0.0.0.0", "::")


def parse_args() -> argparse.Namespace:
    """
    コマンドライン引数を読み込む関数

    Parameters
    ----------
    None

    Returns
    ----------
    args: argparse.Namespace
        コマンドライン引数
    """
    parser = argparse.ArgumentParser(prog="ml-studio")
    parser.add_argument("--host", default="127.0.0.1", help="待ち受けるホスト")
    parser.add_argument("--port", type=int, default=8760, help="ポート番号")
    parser.add_argument(
        "--allowed-host", action="append", default=[],
        help="受け付けるホスト名を足す (何度も渡せる)"
    )
    args = parser.parse_args()

    return args


def allowed_hosts(host: str, extra: list[str]) -> list[str]:
    """
    受け付けるホスト名を決める関数

    Parameters
    ----------
    host: str
        待ち受けるホスト
    extra: list[str]
        --allowed-host で足したホスト名

    Returns
    ----------
    hosts: list[str]
        127.0.0.1 と localhost, 足したホスト名, 名前で待ち受ける場合は
        そのホスト (表示する URL で開けるように)
    """
    # 重なりを除いた並び
    hosts = [*ALLOWED_HOSTS]
    named = [] if host in ANY_HOSTS else [host]
    for name in [*named, *extra]:
        if name not in hosts:
            hosts.append(name)

    return hosts


def main() -> None:
    """
    殻を起動する関数

    Parameters
    ----------
    None

    Returns
    ----------
    None
    """
    args = parse_args()

    # 127.0.0.1 の他のホストでは, 他の端末から使える可能性を警告
    if args.host != "127.0.0.1":
        print(
            f"警告: {args.host} で待ち受けます. トークンを知る人は, "
            "手元のファイルを読み, 書き込めます",
            flush=True
        )

    # 起動ごとのトークン付きの URL の表示
    # (全てのアドレスで待ち受ける場合も手元のブラウザで開ける URL)
    hosts = allowed_hosts(args.host, args.allowed_host)
    app = create_app(token=get_token(None), allowed_hosts=hosts)
    shown = "127.0.0.1" if args.host in ANY_HOSTS else args.host
    if ":" in shown:
        # URL の中の IPv6 のアドレスの角括弧での囲み
        shown = f"[{shown}]"
    print(
        "ML-Studio を開く: "
        f"http://{shown}:{args.port}/api/auth?token={app.state.token}",
        flush=True
    )
    uvicorn.run(app, host=args.host, port=args.port, workers=1)


if __name__ == "__main__":
    main()
