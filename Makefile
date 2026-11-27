# よく使うコマンドをまとめる. 詳しくは README を参照

# 待ち受けるポート (make serve PORT=8800 のように変更)
PORT ?= 8760

# 開発用のサーバーは変更のたびに作り直されるので, make を実行した間は同じトークンを使用
# (:= で 1 回だけ作る. ?= では参照のたびに作り直され, 表示と起動で値が変わる)
DEV_TOKEN := $(or $(DEV_TOKEN),$(shell python3 -c 'import secrets; print(secrets.token_urlsafe(16))'))

# 殻の環境に足す, モデルの作成・選定の段階の外部のライブラリの部品の extra
# (make setup EXTRAS="timm einops" のように空白で区切る. 既定は無し.
# 選べる名前は make extras-list. 同じ名前の環境変数は読まないよう ?= に
# しない)
EXTRAS :=
comma := ,
empty :=
space := $(empty) $(empty)

.PHONY: setup extras extras-list dev dev-backend dev-frontend build serve check

# 依存のインストール (submodule の中の submodule も取り出す. EXTRAS が
# あれば, その extra も足す)
setup:
	git submodule update --init --recursive
	cd backend && uv sync
	cd frontend && pnpm install
ifneq ($(strip $(EXTRAS)),)
	$(MAKE) extras EXTRAS="$(EXTRAS)"
endif

# 殻の環境に ML-CreateArchitecture の extra (ML-ModelControl の同じ名前の
# extra) を足す. 名前は ML-CreateArchitecture と ML-ModelControl の両方の
# extra (project を除く) と確かめ (scripts/check_extras.py. 殻の環境の
# Python で, 環境が無ければ作らずに止める), 入っているライブラリは
# backend/uv.lock の版のまま (制約) にする. 制約は 1 度ファイルに書き, 書けた
# 場合だけ入れる (パイプでは書けなくても制約なしで入れてしまうため).
# 殻の pyproject.toml の上書きは ml-modelcontrol を extra 無しに置き換える
# ので, その設定を読まずに (--no-config) 入れる. 前に足した extra は残し,
# uv sync (make setup) で既定に戻る
extras:
	@test -x backend/.venv/bin/python || { echo "殻の環境がありません. 先に make setup を実行してください"; exit 1; }
	cd backend && .venv/bin/python ../scripts/check_extras.py $(EXTRAS)
	cd backend && uv export -q --frozen --no-hashes --no-emit-local --no-header --no-annotate -o .venv/extras-constraints.txt && uv pip install --no-config --python .venv --constraints .venv/extras-constraints.txt -e "../ML-CreateArchitecture/ML-ModelControl[$(subst $(space),$(comma),$(strip $(EXTRAS)))]"

# 殻の環境に足せる extra の名前の一覧
extras-list:
	@test -x backend/.venv/bin/python || { echo "殻の環境がありません. 先に make setup を実行してください"; exit 1; }
	@cd backend && .venv/bin/python ../scripts/check_extras.py --list

# 開発用のサーバー (API と画面を並べて起動. 別々の端末なら dev-backend と dev-frontend)
dev:
	$(MAKE) -j2 dev-backend dev-frontend DEV_TOKEN=$(DEV_TOKEN)

dev-backend:
	@echo "画面を開く: http://localhost:5173/api/auth?token=$(DEV_TOKEN)"
	cd backend && ML_STUDIO_TOKEN=$(DEV_TOKEN) uv run uvicorn ml_studio.app:create_app --factory --reload --reload-dir src --reload-dir ../ML-Pathfinder/backend/src --reload-dir ../ML-Fathom/backend/src --reload-dir ../ML-CreateArchitecture/backend/src --reload-dir ../ML-Dashboard/backend/src --reload-dir ../ML-Provide/backend/src --port $(PORT)

dev-frontend:
	cd frontend && API_PORT=$(PORT) pnpm dev

# 画面をビルドしてバックエンドのパッケージに入れる
build:
	cd frontend && pnpm build

# ビルドした画面ごと起動
serve: build
	cd backend && uv run ml-studio --port $(PORT)

# lint, 型検査, テスト
check:
	cd backend && uv run ruff check . && uv run mypy src tests && uv run pytest -q
	cd frontend && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
