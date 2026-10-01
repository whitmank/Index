#!/usr/bin/env bash
# Authored by Karter Whitman using Claude Opus 4.8
#
# Launch the 0.6 instance fully isolated from the 0.7 instance.
# Nothing here touches ~/.index/ or 0.7's SurrealDB process.
#
#   Data root ........ ~/.index-0.6         (vs 0.7's ~/.index)
#   Electron state ... ~/Library/Application Support/Index-0.6
#   SurrealDB port ... 8000                 (vs 0.7's 8422)
#   Vite dev port .... 5173                 (vs 0.7's 5273)
#
# 0.6's SDK (surrealdb 1.3.2) only speaks to SurrealDB < 3.x, so this
# instance runs a pinned local 2.x server (SURREAL_BIN) instead of the
# system `surreal` 3.x that 0.7 uses. That 2.x server can also open the
# May-20 v2 backup, which seeds the isolated store on first run.

set -euo pipefail

# --- isolation env ---------------------------------------------------------
export INDEX_HOME_DIR="${INDEX_HOME_DIR:-$HOME/.index-0.6}"
export INDEX_USER_DATA="${INDEX_USER_DATA:-$HOME/Library/Application Support/Index-0.6}"
export INDEX_DB_PORT="${INDEX_DB_PORT:-8000}"
export INDEX_VITE_PORT="${INDEX_VITE_PORT:-5173}"
export SURREAL_BIN="${SURREAL_BIN:-$INDEX_HOME_DIR/bin/surreal}"

SEED_BACKUP="$HOME/.index/surreal.v2.bak.20260520-160743"
SURREAL_DIR="$INDEX_HOME_DIR/surreal"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- safety: never collide with 0.7's live port ----------------------------
if [ "$INDEX_DB_PORT" = "8422" ] || [ "$INDEX_VITE_PORT" = "5273" ]; then
  echo "[launch] refusing to use a port owned by the 0.7 instance (8422 / 5273)." >&2
  exit 1
fi

# --- require the pinned 2.x server -----------------------------------------
if [ ! -x "$SURREAL_BIN" ]; then
  echo "[launch] pinned SurrealDB binary not found at $SURREAL_BIN" >&2
  echo "[launch] (expected a local 2.x build; see setup notes)" >&2
  exit 1
fi

# --- first-run seed from the v2 backup -------------------------------------
mkdir -p "$INDEX_HOME_DIR"
if [ -d "$SURREAL_DIR" ]; then
  echo "[launch] using existing isolated database at $SURREAL_DIR"
elif [ -d "$SEED_BACKUP" ]; then
  echo "[launch] seeding isolated database from $SEED_BACKUP"
  cp -R "$SEED_BACKUP" "$SURREAL_DIR"
else
  echo "[launch] backup not found; a fresh empty database will be created at $SURREAL_DIR"
fi

echo "[launch] SURREAL_BIN=$SURREAL_BIN"
echo "[launch] INDEX_HOME_DIR=$INDEX_HOME_DIR"
echo "[launch] INDEX_USER_DATA=$INDEX_USER_DATA"
echo "[launch] SurrealDB :$INDEX_DB_PORT   Vite :$INDEX_VITE_PORT"

# --- go --------------------------------------------------------------------
cd "$PROJECT_ROOT"
exec node scripts/electron-dev.js
