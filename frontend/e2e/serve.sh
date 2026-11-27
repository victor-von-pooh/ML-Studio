#!/usr/bin/env bash
# 殻の通しのテスト (Playwright) 用に, 作業用の置き場で殻を起動する.
# 画面は pnpm build で作っておく
set -euo pipefail

cd "$(dirname "$0")"
WORK="$PWD/.work"
PORT="${E2E_PORT:-8796}"

# 前回の結果を消し, 5 つの段階の置き場を作業用のディレクトリにし, 手元の起動の
# 設定の自作の部品と手順を読まずに, 決まったトークンで起動
rm -rf "$WORK"
mkdir -p "$WORK"
cd ../../backend
ML_PATHFINDER_HOME="$WORK/pathfinder" ML_FATHOM_HOME="$WORK/fathom" \
  ML_CREATEARCHITECTURE_HOME="$WORK/createarchitecture" ML_CREATEARCHITECTURE_MODULES= \
  ML_DASHBOARD_HOME="$WORK/dashboard" \
  ML_PROVIDE_HOME="$WORK/provide" ML_PROVIDE_UNITS= ML_PROVIDE_PROCEDURES= \
  ML_STUDIO_TOKEN=e2e-token exec uv run ml-studio --port "$PORT"
