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

Rules of thumb: **route everything through `/v1/search`**, keep page limits ≤ 10,
and never rely on batch endpoints or stream/play counts (Spotify exposes no
play counts at all — only the 0-100 `popularity` score, which IS present on
search-result track objects).

## Where each service is used

- **spotify-search** (Edge Function): track/album/artist search proxy,
  client-credentials token cached module-wide. Used by feed composer, album
  picker, Convince Me, Track Madness swaps.
- **bracket-seed** (Edge Function): Track Madness seeding. Ranking comes from
  **Last.fm** `artist.getTopTracks` (real all-time scrobble playcounts, secret
  `LASTFM_API_KEY`); each ranked title is resolved to its canonical Spotify
  track via one `/search` call (concurrency 6, dedupe by normalized title,
  album releases preferred over singles/compilations, live cuts dropped).
  Fallback when Last.fm is thin: paged `artist:"…"` searches ranked by
  `popularity`.
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
