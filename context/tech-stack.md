# Tech stack & how to run

## Stack

- **App:** Expo SDK 56, React Native 0.85, React 19, TypeScript (strict), expo-router (file-based routing under `app/src/app/`), React Compiler + typed routes enabled.
- **Web:** react-native-web with `web.output: "static"` — the same codebase exports to a static site. `experiments.baseUrl = "/music-club-app"` so the export works under the GitHub Pages subpath.
- **Backend:** Supabase Postgres (project ref `yecjvvnposykmrzemcej`). No other backend.
- **Fonts/theme:** DM Sans + DM Mono via `@expo-google-fonts/*`, loaded in `src/app/_layout.tsx`. Tokens in `src/theme/index.ts` (ported from `legacy/index.html`); active palette via `useTheme()` (`src/hooks/use-theme.ts`).

## Key files

| Path | Purpose |
|---|---|
| `app/src/app/` | expo-router routes (`_layout.tsx` = root stack + fonts + status bar) |
| `app/src/utils/supabase/client.ts` | The single `createClient` instance (AsyncStorage on native, localStorage on web) |
| `app/src/utils/supabase/db.ts` | ALL queries, as typed query objects — never call the raw client elsewhere |
| `app/src/theme/index.ts` | Palettes (dark/light), radii, font names, avatar colors, club emojis |
| `supabase/migrations/` | Append-only migration history (`supabase db push`) |
| `supabase/schema.sql` | Generated current-state DDL snapshot — regenerate via `./supabase/refresh-schema-snapshot.sh` |
| `legacy/index.html` | The original single-file MVP — design reference only, not deployed |

## Environment

`app/.env.local` (gitignored; template in `app/.env.example`):

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — baked into the client bundle (public-safe; RLS protects data).
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` — CLI-only secrets for `supabase link/push/dump`.

## Run

```bash
cd app
npm install
npx expo start      # i = iOS simulator, w = web
npx tsc --noEmit    # type check (no test suite)
```

## Deploy

- **Web:** every push to `main` runs `.github/workflows/deploy-web.yml` → `expo export --platform web` → GitHub Pages at https://jordanreticker.github.io/music-club-app/. Build-time env comes from repo Actions secrets `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- **Native:** EAS/TestFlight deferred until later phases.

## Local prerequisites

- Node ≥ 20, Supabase CLI (`supabase`), and **Docker Desktop** (only needed for `refresh-schema-snapshot.sh` / `db dump`; not installed on this machine as of 2026-06-12).
