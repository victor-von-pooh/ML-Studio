#!/usr/bin/env bash
# 殻の共通の部品の正 (parts/) を, 1 つのアプリの画面の道具と設定で確かめる
# (docs/DESIGN.md の R12). 正を写したときと同じ形で, アプリの src の下に一時の
# ディレクトリを作って置き, 型の検査 (tsc), oxlint (警告も誤り), Prettier に
# かけて, 終わったら消す. 殻の画面で pnpm install を済ませてから動かす.
#
# 使い方: scripts/lint_parts.sh [アプリ] (既定は ML-Pathfinder)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app="${1:-ML-Pathfinder}"
frontend="$root/$app/frontend"
if [ ! -d "$frontend/node_modules" ]; then
  echo "$app/frontend/node_modules がありません (殻の frontend で pnpm install)" >&2
  exit 1
fi

# アプリの src の下の一時の置き場 (アプリの tsconfig の include に入る)
work="$frontend/src/__studio_parts__"
rm -rf "$work"
mkdir -p "$work"
trap 'rm -rf "$work"' EXIT
cp "$root"/parts/* "$work/"

cd "$frontend"
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
./node_modules/.bin/oxlint --deny-warnings src/__studio_parts__
./node_modules/.bin/prettier --check src/__studio_parts__
echo "parts: $app の道具で通りました"
