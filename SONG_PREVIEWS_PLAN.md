# Song Previews Plan

**Status: BUILT 2026-07-10 on the `listening-previews` branch — ships in the
v1.1 binary (expo-audio is native, not OTA-able). Data side (Phase A) is live
in prod already via the apple-music pipeline + backfills.**

## As built (2026-07-10)

- **Phase A**: `preview_url` columns added to best_bars, perfect_playlist_songs,
  aux_battle_songs, convince_tracks, showdown_submissions, bingo_boxes
  (bracket_tracks already had one; feed_posts uses metadata). The apple-music
  resolver writes it on every match (preserving an existing value when a match
  arrives without one); `list_showdown` RPC now returns it. Backfilled via
  supabase/backfill-apple-matches.mjs; `album-tracks` mode refreshes
  albums.tracks jsonb with per-track previewUrl from keyless iTunes lookup, and
  getAlbumTracks/pick flows keep it for new albums.
  Ops note: Spotify /search rate-limits sustained backfill bursts (429s
  silently downgrade verified→kept) — re-run big tables with CONCURRENCY=1.
- **Phase B**: `expo-audio` (~56.0.12, config plugin in app.json).
  `stores/previewPlayerStore.ts` — zustand singleton around one
  createAudioPlayer: play(id, url, refetch?) / stop / {playingId, progress};
  plays in silent mode, stops on app background, stale-URL refetch after 4s of
  no playback via keyless iTunes re-lookup (row update skipped — deviation
  from plan, not worth a write path for a rare case).
  `components/PreviewArt.tsx` — drop-in replacement for a song row's artwork
  Image: play/pause badge + bottom progress bar; renders plain artwork when
  preview_url is null; stops playback on unmount.
- **Surfaces**: feed posts (clubhouse/activity), Perfect Playlist, Showdown,
  Aux Battle, Convince, Best Bars, Track Madness (versus card, track rows,
  final-four), Bingo (box panel, verify claim, other-boards peek), album
  tracklist rows in notes (play chip appears only when the track has a
  preview). Profile featured tracks intentionally skipped (not in locked
  scope; profile_tracks has no preview column).
- Bingo listen timer untouched — previews don't stamp it (locked decision).

## Goal

A 30-second preview plays from a play button overlaid on the artwork of every
song row in the app — feed posts, bingo boxes, brackets, aux battle, convince,
showdown, Perfect Playlist, best bars, and album tracklists. One preview plays
at a time.

## Feasibility verdict (explored 2026-07-08)

Realistic and cheap on the data side; moderate on the client side.

- **Preview source is Apple, and it's free.** iTunes Search already returns a
  30s `previewUrl` per track (Track Madness already stores it —
  `bracket_tracks.preview_url`, populated in
  [madness.tsx:317-347](app/src/app/clubhouse/madness.tsx#L317-L347) but never
  played). The Apple Music API catalog response used by the planned ISRC
  matcher includes the same preview in `attributes.previews[0].url`, so the
  APPLE_MUSIC_PLAN backfill can populate previews for every existing song as a
  byproduct.
- **Spotify is not an option**: `preview_url` was removed from the Web API for
  apps created after Nov 2024.
- **The hard constraint is playback**: the app has NO audio library today
  (no expo-av/expo-audio in package.json). Adding `expo-audio` (SDK 56's
  supported lib) changes the native binary → App Store v1.1 release, not OTA.

## Decisions (locked)

| Question | Decision |
|---|---|
| Preview source | Apple previews, captured by the `apple-music` matcher + backfill; keyless iTunes lookup as re-fetch fallback |
| Playback lib | `expo-audio` (expo-av is deprecated) — v1.1 binary |
| UI | Play/pause button overlaid on the artwork thumbnail; progress indicator while playing; global singleton player (starting one stops any other) |
| Scope | Every surface that renders a song, including album tracklists |
| Bingo interaction | Previews do NOT stamp the Listening Bingo listen timer — only link-outs count (unchanged) |
| Missing preview | Hide the play button (no dead controls) |

## Phase A — Data (rides with APPLE_MUSIC_PLAN Phases 1–2)

- The `apple-music` Edge Function's resolve responses include `preview_url`
  (from `attributes.previews[0].url`).
- Store it wherever `apple_url` lives: real column on game tables
  (`bingo_boxes`, `aux_battle_songs`, `convince_tracks`, `showdown_submissions`,
  `perfect_playlist_songs`, `best_bars`; `bracket_tracks` already has it),
  `metadata.preview_url` for `feed_posts`. Album tracklists: the `albums.tracks`
  jsonb already comes from iTunes lookup — keep each track's `previewUrl` when
  building it.
- The ISRC backfill writes `preview_url` in the same pass. Zero extra API calls.

## Phase B — Client (v1.1 binary)

1. Add `expo-audio`; configure audio session (play in silent mode ON, stop on
   app background).
2. `usePreviewPlayer` — module-level singleton: `play(url, id)`, `stop()`,
   exposes `{ playingId, progress }`. Starting a new preview stops the current
   one; navigation/unmount stops playback.
3. `PreviewButton` component — wraps the existing artwork `Image`, centers a
   translucent play/pause glyph, thin progress ring/bar while playing. Renders
   nothing extra when `preview_url` is null.
4. Integrate across surfaces (all render artwork already): feed track posts,
   bingo box detail, bracket matchups, aux battle, convince, showdown voting,
   Perfect Playlist rows, best bars, album tracklist rows.
5. Stale-URL handling: mzstatic preview URLs occasionally rot. On playback
   error, re-resolve once via keyless iTunes lookup (by `apple_song_id` or
   title+artist), play the fresh URL, and best-effort update the row.

## Sequencing

**This plan needs NO new accounts and NO new spend.** The Apple Music API
catalog access it relies on uses only a developer token — a free MusicKit key
in the existing Apple Developer account. The bot Apple ID + $11/mo subscription
in APPLE_MUSIC_PLAN.md is exclusively for playlist mirrors (Phase 3 there) and
can be deferred indefinitely without affecting previews.

1. v1 approval clears (nothing before that).
2. Phase A ships inside APPLE_MUSIC_PLAN Phases 1–2 (same migration, same
   backfill run — free tier, dev token only).
3. Phase B lands in the v1.1 binary — can be developed alongside the OTA batch
   but releases through App Store review.

If we ever wanted previews with literally zero Apple API setup, the keyless
iTunes Search fallback could populate `preview_url` fuzzy-matched (as Track
Madness does today) into the same schema — the ISRC matcher would later
overwrite with verified URLs. Not recommended (the dev token is free and the
match quality is much better), but the schema is future-proof either way.

## Risks

- **Binary release dependency** — previews are gated on v1.1 review, full stop.
- **Preview URL rot** — mitigated by on-error re-fetch.
- **Coverage gaps** — songs with no Apple match have no preview; button hidden.
- **ToS** — Apple previews must be streamed, not downloaded/cached to disk;
  expo-audio streaming satisfies this. Show title/artist/artwork alongside
  (already the case everywhere).
