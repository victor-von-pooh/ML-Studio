#!/usr/bin/env bash
# 殻の通しのテスト (Playwright) 用に, 作業用の置き場で殻を起動する.
# 画面は pnpm build で作っておく
set -euo pipefail

cd "$(dirname "$0")"
WORK="$PWD/.work"
PORT="${E2E_PORT:-8796}"

# 前回の結果を消し, 問題の設定, データの分析, モデルの作成・選定の段階の
# 置き場を作業用のディレクトリにして決まったトークンで起動
rm -rf "$WORK"
mkdir -p "$WORK"
cd ../../backend
ML_PATHFINDER_HOME="$WORK/pathfinder" ML_FATHOM_HOME="$WORK/fathom" \
  ML_CREATEARCHITECTURE_HOME="$WORK/createarchitecture" ML_CREATEARCHITECTURE_MODULES= \
  ML_STUDIO_TOKEN=e2e-token exec uv run ml-studio --port "$PORT"
