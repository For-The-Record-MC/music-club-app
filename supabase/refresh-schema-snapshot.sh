#!/usr/bin/env bash
# Regenerates supabase/schema.sql — the current-state DDL snapshot of the public
# schema, read directly from the linked database (no Docker required).
#
# Run this as the LAST step of every `supabase db push`, so schema.sql always
# reflects the live schema. Migration files are append-only history; schema.sql
# is the single source of truth for what the schema looks like RIGHT NOW.
#
# Usage:  ./supabase/refresh-schema-snapshot.sh
set -euo pipefail

# Resolve repo root regardless of where the script is invoked from.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (brew install jq)" >&2
  exit 1
fi

# Prefer the CLI's own login (supabase login); fall back to the env token.
# The token in app/.env.local has gone stale before (2026-07-12) and, when
# exported, OVERRIDES a working CLI login — so it is a fallback, not a default.
run_query() {
  supabase db query --linked --workdir "$ROOT" \
    --file supabase/schema-snapshot.gen.sql -o json 2>/dev/null \
    | jq -r '.rows[0].schema_sql'
}

TMP="$(mktemp)"
if ! run_query > "$TMP" || [ "$(wc -l < "$TMP" | tr -d ' ')" -lt 50 ]; then
  TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' app/.env.local | cut -d'=' -f2 || true)"
  if [ -n "$TOKEN" ]; then
    SUPABASE_ACCESS_TOKEN="$TOKEN" run_query > "$TMP" || true
  fi
fi

# Write to schema.sql only once the result looks sane — a failed query must
# never truncate the committed snapshot.
LINES="$(wc -l < "$TMP" | tr -d ' ')"
if [ "$LINES" -lt 50 ]; then
  rm -f "$TMP"
  echo "error: generated schema.sql looks empty ($LINES lines) — check auth (supabase login) and the connection" >&2
  exit 1
fi
mv "$TMP" supabase/schema.sql
echo "wrote supabase/schema.sql ($LINES lines)"
