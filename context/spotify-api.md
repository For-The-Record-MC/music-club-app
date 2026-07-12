# Spotify & music-data APIs — constraints and integration map

## ‼ The Spotify app is in restricted "development mode" (post-2025 rules)

Verified live on 2026-07-03 against our client-credentials app. These WILL bite
any new feature that assumes the documented Web API:

| Endpoint | Status for our app |
|---|---|
| `/v1/search` | ✅ Works (limit ≤ ~10; the workhorse — spotify-search + bracket-seed both live on it) |
| `/v1/artists/{id}/albums` | ⚠️ Works only with small `limit` (≤ ~6 verified; 20/50 → `400 Invalid limit`) |
| `/v1/albums/{id}/tracks` | ✅ Works with small limits |
| `/v1/albums?ids=…` (batch) | ❌ 403 Forbidden |
| `/v1/tracks?ids=…` (batch) | ❌ 403 Forbidden |
| `/v1/artists/{id}/top-tracks` | ❌ 403 Forbidden |
| `preview_url` on track objects | ❌ Always null for apps created after late 2024 |
| `/v1/search?type=playlist` | ✅ Works (names, owners, ids) |
| `/v1/playlists/{id}` (user-made) | ⚠️ 200, but the embedded `tracks` field is **stripped** — metadata only |
| `/v1/playlists/{id}/tracks` | ❌ 403 with client-credentials AND with the app account's user token |
| `/v1/playlists/{id}/items` (read) | ❌ 401 (cc) / 403 (user token) |
| `/v1/playlists/{id}` (Spotify-owned/editorial) | ❌ 404 |

**Playlist contents are fully unreadable** (verified live 2026-07-12 via a
throwaway probe function, both token types): every path to a playlist's track
list is blocked, so any "import a Spotify playlist" feature is a dead end.
If playlist import is ever wanted, the viable route is **Apple Music** catalog
playlists via our existing developer token (the apple-music function's auth).

Rules of thumb: **route everything through `/v1/search`**, keep page limits ≤ 10,
and never rely on batch endpoints or stream/play counts (Spotify exposes no
play counts at all — only the 0-100 `popularity` score, which IS present on
search-result track objects).

## ‼ Extended 429 penalty — search bursts bench the WHOLE app for hours

Seen twice: the bingo/previews backfill, and again 2026-07-12 after theme-mode
seeding tests (~150 searches within the hour) — Spotify returned `429` with
`Retry-After ≈ 64,000s` (~18h) on EVERY call from the app until the window
passed. There is no reset lever; you wait it out.

- **Never run bulk search loops against prod credentials** (backfills, seeding
  tests). Batch them across days or accept degraded metadata.
- **Structural guardrails** (20260712110000 migration + `_shared/spotifyGuard.ts`,
  verified live): a single `spotify_api_state` row holds (a) a shared **hourly
  call budget** (cap 200 in `spotify_acquire`) that `spotify-search` (1/call)
  and `bracket-seed` (bulk acquire for cache-unknown titles) must reserve from
  before touching Spotify, and (b) a **persisted bench**: the first 429
  anywhere writes `benched_until` from Retry-After, and every worker of every
  function short-circuits against it (verified: one 429 → all subsequent calls
  denied from the DB). Guard failures fail OPEN; in-memory breakers remain the
  backstop.
- **`spotify_track_cache`**: resolved `(artist|title)` → track metadata, plus
  confirmed misses. bracket-seed resolves cache-first, so repeat seedings (any
  club, same tag/artist) cost ~zero searches. Transient errors are never cached.
- Bracket resolution runs at concurrency 3 with a capped input tail; keep any
  new bulk resolution at least that gentle.
- During a bench/budget denial, feed search falls back to iTunes results (no
  spotify_url/uri on those posts, so playlist sync skips them) and bracket
  creation returns a clean "cooling down" error; tag PROBES stay live (Last.fm
  only).
- **Key rotation does NOT clear a bench** — the penalty rides the client id
  (the app), not the secret. A brand-new app gets fresh quota, but swapping
  prod apps invalidates every refresh token (app-scoped: SPOTIFY_APP_REFRESH_TOKEN
  and each club's connect token) and must be coordinated with the bundled
  EXPO_PUBLIC_SPOTIFY_CLIENT_ID + redirect URIs + an OTA.

## Where each service is used

- **spotify-search** (Edge Function): track/album/artist search proxy,
  client-credentials token cached module-wide. Used by feed composer, album
  picker, Convince Me, Track Madness swaps.
- **bracket-seed** (Edge Function): Track Madness seeding, two modes. Artist:
  ranking from **Last.fm** `artist.getTopTracks` (real all-time scrobble
  playcounts, secret `LASTFM_API_KEY`); each ranked title is resolved to its
  canonical Spotify track via one `/search` call (concurrency 6, dedupe by
  normalized title, album releases preferred over singles/compilations, live
  cuts dropped). Fallback when Last.fm is thin: paged `artist:"…"` searches
  ranked by `popularity`. Theme: Last.fm `tag.getTopTracks` in tag-relevance
  order (max 2 tracks/artist), same `/search` resolution, display playcounts
  per track via the shared `_shared/lastfm.ts` `trackPlaycount` helper (also
  used by track-stats). `{tag, probe:true}` returns a cheap `{count, artists}`
  viability check with no Spotify calls.
- **iTunes Search API** (`app/src/utils/itunes.ts`): keyless, client-side.
  Apple links, album track lists, and 30-sec `previewUrl` clips (the only
  preview source now that Spotify's is dead). Throttles bursts per IP — keep
  batches small (Track Madness publish resolves 4 at a time).
- **spotify-oauth / spotify-sync / cycle-highlights**: playlist writes via the
  shared app account (see `context/notifications.md` neighbors; scopes:
  `playlist-modify-public`).

## Secrets (supabase secrets set …)

`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_APP_REFRESH_TOKEN`,
`LASTFM_API_KEY`, `TICKETMASTER_API_KEY`.

## Two Spotify apps (since 2026-07-12)

- **Prod**: the app on the vinny vino account (client id `18aedca4…`). Its id
  also lives in `app/eas.json`, `app/.env.local`
  (`EXPO_PUBLIC_SPOTIFY_CLIENT_ID`), and the GitHub Actions secret of the same
  name — all four places must match or the Connect flow 400s.
- **Dev/testing**: the ORIGINAL app (client id `647b0e8e…`, credentials in its
  own Spotify dashboard). ALL bulk testing, backfills, and pipeline
  experiments use this one — never prod. It ate the 2026-07-12 bench.
- Registered redirect URIs (both apps):
  `https://for-the-record-mc.github.io/music-club-app/spotify-callback` and
  `fortherecordmc://spotify-callback`.
- Refresh tokens are app-scoped: swapping apps kills `SPOTIFY_APP_REFRESH_TOKEN`
  and every per-club connect token — each must be re-minted under the new app.
