# ML-Studio

機械学習全般を GUI で完結させるための統合アプリ. 5 つの段階のアプリ (問題の設定, データの分析, モデルの作成・選定, 学習・評価, 推論) を 1 つのコマンドと 1 つのポートで開き, 上の帯の段階の並びで行き来する. 問題の設定の段階は [ML-Pathfinder](https://github.com/victor-von-pooh/ML-Pathfinder), データの分析の段階は [ML-Fathom](https://github.com/victor-von-pooh/ML-Fathom), モデルの作成・選定の段階は [ML-CreateArchitecture](https://github.com/victor-von-pooh/ML-CreateArchitecture), 学習・評価の段階は [ML-Dashboard](https://github.com/victor-von-pooh/ML-Dashboard), 推論の段階は [ML-Provide](https://github.com/victor-von-pooh/ML-Provide) が受け持つ.

## 使い方

### 必要なもの

- [uv](https://docs.astral.sh/uv/) (Python は uv が用意する. 3.10 以上)
- Node.js 24 以上と [pnpm](https://pnpm.io/) 11 以上 (`corepack enable` で `package.json` の版が入る)

### 導入と起動

```bash
git clone --recursive https://github.com/victor-von-pooh/ML-Studio.git
cd ML-Studio
make setup   # submodule, Python と Node.js の依存
make serve   # 画面をビルドして http://127.0.0.1:8760 で起動 (Ctrl+C で止める)
```

起動すると `ML-Studio を開く: http://127.0.0.1:8760/api/auth?token=...` の行が出るので, その URL をブラウザで開く (トークンは起動ごとに変わる. 環境変数 `ML_STUDIO_TOKEN` で決められる). ポートは `make serve PORT=8800` のように変えられる. 他のホストで待ち受ける場合は `ml-studio --host <ホスト> --allowed-host <接続に使う名前>` で起動する.

上の帯のプロジェクトの欄で問題の設定を選ぶと, 全ての段階がその問題の設定を開く. 問題の設定の置き場は ML-Pathfinder の既定 (`~/.ml-pathfinder/`. 環境変数 `ML_PATHFINDER_HOME` で変えられる) で, 他の 4 つの段階も同じ置き場の問題の設定を読む. データの分析の段階の置き場 (登録したデータ, 前処理の手順, 書き出したデータセット) は ML-Fathom の既定 (`~/.ml-fathom/`. 環境変数 `ML_FATHOM_HOME` で変えられる), モデルの作成・選定の段階の置き場 (保存したモデルの定義) は ML-CreateArchitecture の既定 (`~/.ml-createarchitecture/`. 環境変数 `ML_CREATEARCHITECTURE_HOME` で変えられる), 学習・評価の段階の置き場 (登録した学習のプロジェクト, 学習のジョブの記録) は ML-Dashboard の既定 (`~/.ml-dashboard/`. 環境変数 `ML_DASHBOARD_HOME` で変えられる), 推論の段階の置き場 (登録した推論の一式, 推論の結果) は ML-Provide の既定 (`~/.ml-provide/`. 環境変数 `ML_PROVIDE_HOME` で変えられる). どれも各アプリを単独で起動したときと同じものを開く. ただしモデルの作成・選定の段階では, 外部のライブラリの部品は torchvision のものだけが使え, 他 (huggingface, timm など) は使えない. 学習・評価の段階の学習は, 登録した学習のプロジェクトの仮想環境 (プロジェクトか, それを含むリポジトリの `.venv` か `venv`. 登録するときに Python を選べ, 無ければ殻の Python) で別のプロセスとして動く.

自作の部品と手順は, 各アプリの起動の設定の環境変数で読み込む (モデルの作成・選定の段階は `ML_CREATEARCHITECTURE_MODULES`, 推論の段階は部品を `ML_PROVIDE_UNITS`, 繰り返しの手順を `ML_PROVIDE_PROCEDURES`. どれもモジュールの名前を `,` で区切る). 自作の部品は 2 つの段階で 1 つの登録簿を共有するので, 同じモジュールを両方に書いてよい. 読めないモジュールがあると, 殻は `起動できません: ...` の理由を出して終わる.

## 文書

- [設計](docs/DESIGN.md): 今の設計と決まり (各アプリとの約束, 画面, API, 置き場, 安全)
- [TODO](TODO.md): まだやっていないこと (優先度の順)

## 開発

```bash
make dev     # API と画面の開発用のサーバー (開く URL を出す)
make check   # lint, 型検査, テスト
cd frontend && pnpm e2e   # 殻の通しのテスト
```

| ディレクトリ | 内容 |
| --- | --- |
| `backend/` | 殻の API (Python, FastAPI). 確かめと画面の配信を持ち, 各段階の API を載せる |
| `frontend/` | 殻の画面 (TypeScript, React, Vite). 上の帯と, 各段階の画面の根の部品を載せる |
| `ML-Pathfinder/` | 問題の設定の段階のアプリ (submodule) |
| `ML-Fathom/` | データの分析の段階のアプリ (submodule) |
| `ML-CreateArchitecture/` | モデルの作成・選定の段階のアプリ (submodule) |
| `ML-Dashboard/` | 学習・評価の段階のアプリ (submodule) |
| `ML-Provide/` | 推論の段階のアプリ (submodule) |

## ライセンス

MIT
