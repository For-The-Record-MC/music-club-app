# Agent rules — full text & commands

The hard-constraint summary lives in [../AGENTS.md](../AGENTS.md); this file is the operational detail.

## Migration workflow

1. Author a new file `supabase/migrations/<UTC timestamp>_<slug>.sql` (timestamp format `YYYYMMDDHHMMSS`).
2. From the repo root:
   ```bash
   set -a; source app/.env.local; set +a
   supabase db push --linked --workdir "$(pwd)" -p "$SUPABASE_DB_PASSWORD"
   ```
3. Regenerate the snapshot (no Docker — introspects the live catalog via `supabase db query` + `supabase/schema-snapshot.gen.sql`, needs `jq`):
   ```bash
   ./supabase/refresh-schema-snapshot.sh
   ```
4. Regenerate TypeScript types into the app (once Phase 1 lands):
   ```bash
   supabase gen types typescript --linked --workdir "$(pwd)" > app/src/utils/supabase/types.ts
   ```
5. Update [database-schema.md](database-schema.md) prose if invariants changed.

Never run DML/DDL against the live database outside this workflow. The CLI is for exactly two things: reading (`supabase db query` / `migration list`) and pushing migrations.

## Reading the database

- Current schema: read [../supabase/schema.sql](../supabase/schema.sql), never the migrations.
- Ad-hoc inspection: `supabase db query` (read-only) with the same env/flags as above.

## App-layer conventions

- New data need → add a method to a typed query object in `app/src/utils/supabase/db.ts`, then expose it through a hook; screens consume hooks and wrap compute functions in `useMemo`.
- ids are `uuid`/`string` everywhere.
- Theme tokens only (`useTheme()`); the visual reference is `legacy/index.html`.
- Verify by running the app (`npx expo start`) and `npx tsc --noEmit`; there is no test suite.

## Secrets

- `app/.env.local` is gitignored and holds all credentials. Never commit it, never echo its values into logs or docs, never prefix secrets with `EXPO_PUBLIC_`.
