# For The Record MC (music-club-app) — Agent Reference

## ‼ HARD CONSTRAINTS — read first, no exceptions

Every agent working in this codebase MUST follow these rules. They override any default behavior. Full text + commands in [context/agent-rules.md](context/agent-rules.md).

1. **Migrations only.** ALL database changes go through `.sql` files in `supabase/migrations/` applied via `supabase db push`. NEVER execute `INSERT`/`UPDATE`/`DELETE`/DDL directly against the live database.
2. **Never read migrations to learn the current schema.** Migration files are append-only *history*. Current-state DDL lives in [supabase/schema.sql](supabase/schema.sql) (generated snapshot — never hand-edit; regenerate with `./supabase/refresh-schema-snapshot.sh` as the last step of every push). Only open a migration to understand history or to author a new one.
3. **Supabase CLI setup.** Every `supabase` command needs the env from `app/.env.local` (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) plus `--linked --workdir $(pwd)` from the repo root — otherwise it fails with 401 or a password prompt.
4. **All data comes from Supabase; all queries live in `db.ts`.** Never build ad-hoc queries from raw `supabase` client calls in screens/hooks — add a method to a typed query object in `app/src/utils/supabase/db.ts`.
5. **"Current cycle" ≠ highest number.** It is the cycle with `status = 'open'` for the club — always query by status, never by max id/number.
6. **Compute functions are pure and uncached.** Wrap them in `useMemo` at the screen level; no memoization inside hooks or compute functions.
7. **All ids are `uuid` / TypeScript `string`.** No integer keys anywhere.
8. **No test suite.** Verify behavior via `expo start` (press `w` for web) and `npx tsc --noEmit` for types.
9. **Theme tokens only.** Colors/fonts/radii come from `app/src/theme` via `useTheme()` — never hardcode hex values in components. The design reference is [legacy/index.html](legacy/index.html).
10. **This `AGENTS.md` is an INDEX, never a content file.** Reference material lives in self-contained markdown files under [context/](context/), one file per domain. When documenting a finding or pattern: prefer updating the existing `context/*.md`; otherwise create a new `context/<domain>.md` and add a row below. Never paste reference content here.

## Project overview

React Native / Expo app (with web target) for "For The Record MC" listening clubs. Each cycle, a randomly-spun picker chooses **two albums**; the club schedules one meeting, RSVPs, listens, and submits sealed 1–10 ratings + reviews that are revealed at the meeting. A social feed carries suggestions, reactions, and comments; a concerts board tracks shows. Full multi-club product with owner/admin/member roles and invite-link joining. Sole backend: Supabase Postgres via typed query objects in `app/src/utils/supabase/db.ts`.

Product decisions and the phased build plan: [PLAN.md](PLAN.md).

## Context map

| File | Read it when you need… |
|---|---|
| [context/tech-stack.md](context/tech-stack.md) | Tech stack/versions, how to run, env vars, Supabase client + data-layer file locations, deploy channels (GitHub Pages now, TestFlight later) |
| [context/agent-rules.md](context/agent-rules.md) | Full text of the hard constraints incl. CLI commands and the migration workflow |
| [context/database-schema.md](context/database-schema.md) | The schema: tables, columns, invariants (cycle lifecycle, rating-visibility ladder, role model) — *placeholder until Phase 1 migration lands* |
| [context/data-architecture.md](context/data-architecture.md) | The hook + compute-function pattern, `db.ts` query-object conventions, routing/auth gating, UI primitives, theme store, pull-to-refresh |
| [context/launch.md](context/launch.md) | Launch/ops checklist: email (SMTP + OTP template), admin/dev login, seeding the existing club's data, deferred native build, known follow-ups |
| [context/notifications.md](context/notifications.md) | Push notifications: the activity_events→pg_net→send-push pipeline, category preferences + per-club mute, the two template files, announcements, pg_cron meeting reminders, client registration, secrets/ops |
| [context/spotify-api.md](context/spotify-api.md) | Spotify dev-mode API restrictions (blocked endpoints, limit caps — read BEFORE any Spotify work), Last.fm/iTunes integration map, music-API secrets |
