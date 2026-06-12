#!/usr/bin/env bash
# Regenerates supabase/schema.sql — the current-state DDL snapshot of the linked
# database. Run as the LAST step of every `supabase db push`. Never hand-edit
# schema.sql; never read migrations to learn the current schema.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source app/.env.local
set +a

supabase db dump --linked --workdir "$(pwd)" -p "$SUPABASE_DB_PASSWORD" -f supabase/schema.sql
echo "✓ supabase/schema.sql refreshed"
