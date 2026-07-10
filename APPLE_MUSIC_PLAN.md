# Apple Music Parity & Streaming Preference Plan

**Status: design locked, build NOT started. Nothing here ships until v1 App Store approval — no backend deploys, no migrations, no commits.**

## Goal

Every song in the app has a verified Apple Music match. Users pick a preferred
streaming service (Spotify or Apple Music) and only ever see links to their
service — including per-cycle playlists, which get real Apple Music mirrors
kept in sync alongside the Spotify ones.

## Decisions (locked via grill session, 2026-07-08)

| Question | Decision |
|---|---|
| Service scope | Spotify + Apple Music only (no YouTube Music, no Odesli) |
| Match method | Apple Music API catalog search — **ISRC exact lookup first**, name+artist text search fallback |
| Playlist owner | Dedicated club bot Apple ID with its own Apple Music subscription (~$11/mo) |
| Link UX | Preferred service's pill only; if that service has no match, show the other service's pill (working link beats brand purity) |
| Match layer | New `apple-music` Edge Function called at submission + `apple_match_queue` retry table swept by a scheduled job |
| Backfill | Re-resolve **everything** via spotify_url → ISRC → Apple exact match (fixes wrong fuzzy matches, not just missing ones) |
| Playlist scope | All four: per-cycle feed playlist, Perfect Playlists, cycle highlights, club favorites |
| Share-link risk | Phase 0 spike decides; fallback is a once-per-cycle manual share from the bot's Music app |
| Bot user token | Minted via a local MusicKit JS HTML page, pasted into Supabase secrets; expired-token 403s surfaced in sync logs |
| Search source | Spotify stays canonical for everyone; preference affects display only, never data capture |
| Preference storage | `profiles.preferred_service` enum `'spotify' \| 'apple' \| 'both'`, default `'both'` (today's behavior); picker in profile settings |
| Playlist divergence | Apple mirror silently skips unmatched songs; skip count logged |
| Rollout | **Everything waits for v1 approval.** Then: free tier first (0a → 1 → 2 → 4: matching, backfill, previews data, preference UI — zero new spend); paid playlist tier (0b → 3) whenever the ~$11/mo is worth it |

## Current state (as explored 2026-07-08)

- `apple_url` already exists on: `feed_posts.metadata`, `albums`, `best_bars`,
  `perfect_playlist_songs`, `bingo_boxes`, `bracket_tracks`, `aux_battle_songs`,
  `convince_tracks`, `showdown_submissions` — populated by best-effort fuzzy
  iTunes Search at submission time ([app/src/utils/itunes.ts](app/src/utils/itunes.ts)).
  Many rows missing or matched to wrong versions.
- All link pills render through `ListenLinks` in
  [app/src/components/ui.tsx:168-207](app/src/components/ui.tsx#L168-L207) —
  single choke point for preference routing. Its `onOpen` callback stamps the
  Listening Bingo timer and must fire for whichever pill is shown.
- Spotify playlist sync: `spotify-sync` Edge Function (dual personal/app-account
  model, lazy playlist create, batch append, removal path, `playlist_synced_at`
  marker). Highlights playlists are created by the separate `cycle-highlights`
  function using the same `_shared/spotify.ts` helpers.
- Spotify search results include ISRC (`external_ids.isrc`) — capture it at pick time.
- No user preference system exists anywhere today.

## Costs & accounts — the free/paid split

The two credentials unlock different halves of the plan, and **only playlists
cost money**:

- **Developer token (FREE)**: MusicKit private key in the existing Apple
  Developer account. Unlocks all *catalog* endpoints — ISRC/UPC matching, text
  search, preview URLs. Phases 1, 2, and 4 need only this.
- **Music User Token (PAID)**: requires the bot Apple ID + Apple Music
  subscription (~$11/mo), because playlists must live in a subscribed account's
  library. Only Phase 3 (playlist mirrors) needs it. It can't be refreshed
  server-side and expires (~6 months, undocumented) → recurring 2-minute
  re-mint ritual. **Deferrable indefinitely** — until then, playlist pills fall
  back to the Spotify URL for everyone.

SONG_PREVIEWS_PLAN.md depends only on the free tier.

---

## Phase 0 — Setup + spike

**0a (free, unblocks everything except playlists):**
1. In the Apple Developer account, create a MusicKit private key (.p8).
   Secrets: `APPLE_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY`.

**0b (paid — do only when ready to fund playlist mirrors; gates Phase 3 design):**
1. Create bot Apple ID; subscribe it to Apple Music (~$11/mo).
2. Add `tools/apple-music-token.html` — MusicKit JS page run locally (paste in
   a dev token): sign in as bot Apple ID, copy the Music User Token →
   `APPLE_MUSIC_USER_TOKEN` secret.
3. Script test: create a library playlist via API, add tracks by catalog ID,
   then try to obtain a **public share URL** programmatically (check the
   library playlist → catalog relationship, `GET /v1/me/library/playlists/{id}/catalog`).
   - Works → fully automatic mirrors.
   - Doesn't → sync still creates/fills playlists; once per cycle someone opens
     the Music app as the bot, shares the playlist, and pastes the URL into an
     admin field (add that small input to club settings in Phase 4).

## Phase 1 — Matching infrastructure (backend)

- New Edge Function **`apple-music`**:
  - Mints/caches the ES256 developer-token JWT from the .p8 secret.
  - `resolve-track`: `GET /v1/catalog/us/songs?filter[isrc]=...` → exact match;
    fallback text search on title+artist. Returns `{ apple_url, apple_song_id,
    isrc, preview_url }` — preview_url feeds SONG_PREVIEWS_PLAN.md at no extra
    API cost.
  - `resolve-album`: match by UPC (`filter[upc]`, Spotify albums carry UPC in
    `external_ids`), fallback text search.
  - Storefront: `us`.
- Schema (one migration):
  - `apple_song_id` + `isrc` columns on the playlist-feeding tables
    (`perfect_playlist_songs`; feed posts keep them in `metadata` jsonb).
  - `apple_match_queue` table: `source_table`, `source_id`, `title`, `artist`,
    `spotify_url`, `attempts`, `last_attempt_at`, `resolved_at`.
- Submission path: keep client-side iTunes resolve for instant UX, but after
  insert, fire the `apple-music` resolver server-side; it overwrites with the
  ISRC-verified match or enqueues on miss.
- Scheduled retry (pg_cron → Edge Function): sweep unresolved queue rows —
  new releases often land on Apple days after Spotify.

## Phase 2 — Backfill

One batch script (run via Edge Function or locally with service role), per table:
1. Row has `spotify_url` → extract track ID → Spotify `GET /v1/tracks/{id}` →
   ISRC → Apple exact lookup → overwrite `apple_url`, store `apple_song_id`/`isrc`.
2. No `spotify_url` → text search; on miss, enqueue.
3. Albums: UPC path.
Log per-table match/miss counts.

## Phase 3 — Apple playlist mirrors (the only paid phase; requires 0b)

- Schema: `apple_playlist_id`/`apple_playlist_url` on `cycles` (feed +
  highlights variants), `perfect_playlists`, `clubs` (favorites);
  `apple_synced_at` on `feed_posts` (existing `playlist_synced_at` stays
  Spotify's marker so the two syncs can't starve each other).
- New `_shared/apple.ts` (create library playlist, add/remove tracks by
  catalog ID) mirroring `_shared/spotify.ts`.
- Extend `spotify-sync` (rename conceptually to playlist sync) with an Apple
  branch: same lazy-create + append flow using the bot user token; skip
  unmatched songs silently, log skip count. Same for `cycle-highlights` and
  Perfect Playlist sync.
- Expired user token (403) → mark sync status + loud log so the re-mint ritual
  happens; Spotify side keeps working independently.

## Phase 4 — Client (post-approval EAS OTA batch)

- Migration: `profiles.preferred_service text not null default 'both'`.
- Preference picker in the profile/settings screen (Spotify / Apple Music / Both).
- `ListenLinks`: route by preference — preferred pill only, other-service pill
  as fallback when preferred link is null; `onOpen` bingo stamp fires either way;
  `'both'` keeps today's dual pills.
- Playlist link pills (activity, cycle page, history, Perfect Playlist): show
  `apple_playlist_url` for Apple-preferring users, Spotify URL as fallback.
- If the spike said "manual share": admin input field for pasting the shared
  playlist URL in club settings.

## Risks

- **Share URL for library playlists** — the whole reason Phase 0 exists.
- **Music User Token expiry** — no programmatic refresh; mitigated by 403
  detection + local re-mint page.
- **Catalog gaps** — Spotify-only tracks never match; UX fallback pill covers it.
- **Apple ToS** — a bot subscriber account is unusual usage; low risk at club
  scale, but don't build anything that requires more than one such account.
