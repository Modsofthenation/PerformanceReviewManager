#!/usr/bin/env bash
# Starts API + UI for Tauri desktop:dev with a shared launch token.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATA="${PRM_DATA_DIR:-$ROOT/data}"
mkdir -p "$DATA"
TOKEN_FILE="$DATA/.launch_token"
if [[ -z "${PRM_LAUNCH_TOKEN:-}" ]]; then
  if [[ -f "$TOKEN_FILE" ]] && [[ -s "$TOKEN_FILE" ]]; then
    PRM_LAUNCH_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  else
    PRM_LAUNCH_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  fi
fi
printf '%s' "$PRM_LAUNCH_TOKEN" > "$TOKEN_FILE"
export PRM_LAUNCH_TOKEN
export PRM_DATA_DIR="$DATA"
cd "$ROOT"
exec pnpm --parallel --filter @prm/api --filter @prm/ui dev
