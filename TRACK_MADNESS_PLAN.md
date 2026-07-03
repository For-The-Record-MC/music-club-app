# Track Madness 🏆 — Artist Bracket Studio Room

Design locked 2026-07-03 via grill session. **BUILT + DEPLOYED 2026-07-03**
(migration applied, bracket-seed live, LASTFM_API_KEY set). As-built deviations
from the plan below:

- **No stored consensus snapshot.** Picks freeze at close (RPC guards), so the
  consensus is always recomputed from the immutable picks by one shared client
  function (`app/src/utils/trackMadness.ts`) — live view and archive can never
  disagree. The `consensus_snapshot` column was dropped from the design.
- **bracket-seed resolves via `/search`, not catalog walking.** The Spotify app
  is in restricted dev mode (batch endpoints + top-tracks are 403, big page
  limits rejected) — see `context/spotify-api.md`. Last.fm ranking is unchanged;
  each title costs one search call (concurrency 6).
- **Apple links resolve client-side at publish** (iTunes Search, batches of 4)
  rather than in the Edge Function — iTunes throttles per-IP bursts, and the
  admin's phone is the friendlier IP.
- **Bracket view is sectioned rounds** (collapsible per-round matchup lists),
  not a pinch-zoom tree — phone-honest v1; a zoomable tree remains a v2 idea.

## Concept

A standing studio room where an owner/admin or the current cycle's picker launches a
seeded tournament bracket of one artist's most-played songs. Every club member fills
out their own private copy of the bracket to crown a personal champion; a live
club-consensus bracket emerges from the finished copies. One bracket active at a
time; past brackets archive in the room.

## Locked decisions

| # | Decision | Ruling |
|---|----------|--------|
| 1 | Individual vs. club | Individual brackets **plus** computed club consensus bracket + stats panel |
| 2 | Consensus visibility | Progressive/live ("4 of 7 in"), but a member sees others' picks/consensus **only after finishing their own** (spoiler guard) |
| 3 | Track sourcing | **Last.fm `artist.getTopTracks`** (real playcounts, all-time) → normalize/dedupe → resolve each track to Spotify via existing search proxy; fallback to Spotify `popularity` ranking if Last.fm is thin. Spotify top-tracks API only returns 10 and exposes no stream counts — hence the hybrid |
| 4 | Size | Admin picks **16 / 32 / 64** at creation (15/31/63 total picks per member); sizes the deduped catalog can't fill are disabled |
| 5 | Scope | **Standing room** (not cycle-tied), one active bracket per club, archive of closed brackets |
| 6 | Who launches | Owner/admin **or** current cycle's picker |
| 7 | Pick UX | **Hybrid**: versus-card flow for input (two songs, artwork, seed, listen links, tap winner), read-only zoomable bracket view for progress/display |
| 8 | Progress | Every pick saves immediately (resumable); picks freely editable until champion is crowned, then the bracket **locks** (confirm dialog on final pick) |
| 9 | Consensus math | **Advancement-score tree**: each song earns 1 point per win across all finished brackets; each consensus matchup won by higher total; tie → head-to-head among members who faced that pair → better seed. Stats panel: champion tally, final-four frequency, most controversial matchup, biggest upset. Consensus champion may be a song nobody crowned — accepted as a feature |
| 10 | Listen links | External deep links (Spotify + Apple icons) in v1; `preview_url` (iTunes) stored on each track row for a future in-app preview button. Missing link → hide icon |
| 11 | Display | Room shows consensus + each finished member's champion/final-four card (tap → full bracket). Finishing emits a Club Radio activity event; close emits consensus champion event. Profile "champions shelf" deferred to v2 |
| 12 | Notifications | Exactly three: bracket launched, member crowned champion (social category), consensus champion on close. No per-round nudges — the status tile is the passive nudge |
| 13 | Lifecycle | Auto-close when every member finishes **and** manual close by launcher/admin. On close: consensus snapshotted, bracket archived, unfinished brackets frozen & excluded. Launching a new bracket prompts to close the current one |
| 14 | Participation | Anyone can start/finish while open, including members who join mid-bracket; consensus includes whoever finished by close |
| 15 | Creation flow | Artist search (existing proxy) → size choice → **review screen** (seeded list with playcounts; swap any track — same-artist search only, inherits seed; remove+promote pulls #N+1 up) → publish with **true tournament seeding** (1v32, 2v31; 1 & 2 can only meet in final) |
| 16 | Identity | Room name **Track Madness**, 🏆, one comment thread per bracket (Best Bars comment pattern; no per-matchup comments) |

## Data model (new migration `..._track_madness.sql`)

- `brackets` — id, club_id, artist_name, artist_spotify_id, artist_image_url,
  size (16|32|64), status ('open'|'closed'), created_by, created_at, closed_at,
  consensus_snapshot jsonb (null until close). Partial unique index: one open
  bracket per club.
- `bracket_tracks` — id, bracket_id, seed, title, album, artwork_url,
  spotify_url, apple_url, preview_url, lastfm_playcount. Unique (bracket_id, seed).
- `bracket_picks` — bracket_id, profile_id, round, slot, winner_track_id.
  Unique (bracket_id, profile_id, round, slot). Upsert-able until locked.
- `bracket_entries` — bracket_id, profile_id, completed_at (lock timestamp),
  champion_track_id. Row created on first pick; completed_at set by crown RPC.
- `bracket_comments` — bracket_id, profile_id, body, created_at (Best Bars pattern).

RLS: members of the club read everything **except** other members' `bracket_picks`
/ `bracket_entries` rows are hidden until the caller has a completed entry
(spoiler guard — enforce in RLS or via a view). Writes to own picks only while
bracket open and own entry unlocked.

RPCs (security definer):
- `create_bracket(...)` — validates role (owner/admin/picker) + no open bracket; inserts bracket + 16/32/64 tracks atomically.
- `save_bracket_pick(p_bracket, p_round, p_slot, p_winner)` — validates matchup consistency (winner must be a feeder of that slot per caller's own picks), clears downstream picks when an upstream pick changes.
- `crown_champion(p_bracket)` — validates complete tree, sets completed_at + champion, emits activity event, auto-closes bracket if all members done.
- `close_bracket(p_bracket)` — launcher/admin/picker; computes + stores consensus_snapshot, status='closed', emits consensus activity event.

## Edge Function `bracket-seed`

Input: artist (Spotify id + name), desired size. Steps:
1. Last.fm `artist.getTopTracks` (top ~100, paginated) — new secret `LASTFM_API_KEY`.
2. Normalize + dedupe: strip "(Live)", "- Remastered YYYY", "(Deluxe)", feat.
   variants; merge by normalized title; drop live versions.
3. Rank by playcount, take top N (+ a buffer of ~10 alternates for remove+promote).
4. Resolve each to Spotify via existing search helpers (title + artist) →
   spotify_url, artwork; resolve apple_url + preview_url via iTunes Search API.
5. Fallback: if Last.fm returns too few tracks, rank by Spotify `popularity`
   across the artist's albums instead.
Returns the candidate list to the client for the review screen; actual insert
happens via `create_bracket` after admin review.

## Frontend

- Tile in `app/src/app/(tabs)/feed.tsx` → route `/clubhouse/madness`.
- Screen `app/src/app/clubhouse/madness.tsx`: active bracket (versus-card flow /
  my bracket view / club results + consensus + stats / comments), creation flow
  (admin), archive list of closed brackets.
- Hook `app/src/hooks/useTrackMadness.ts`; queries in `app/src/utils/supabase/db.ts`.
- Status line in `useClubhouseStatus.ts`: "Radiohead bracket — 4 of 7 finished" /
  "No bracket live — start one" (admin) etc.
- Consensus computed client-side (or SQL view) from completed entries' picks while
  open; read from `consensus_snapshot` once closed.

## Build phases

1. **Seeding backend** — `bracket-seed` Edge Function, LASTFM_API_KEY secret,
   dedupe/normalize logic, link resolution. Testable standalone.
2. **Schema + RPCs** — migration, RLS incl. spoiler guard, the four RPCs.
3. **Creation flow** — artist search, size picker, review/swap screen, publish.
4. **Pick experience** — versus-card flow, save-per-pick, editable branches with
   downstream clearing, crown+lock confirm, read-only bracket view.
5. **Social layer** — consensus tree + stats panel, club results cards, comments,
   archive, activity events + the three pushes, hub tile + status line.

## Known edge cases

- Thin catalog: disable unfillable sizes at creation.
- Changing an upstream pick invalidates downstream picks on that branch (RPC clears them).
- Ghost members: manual close; unfinished excluded from consensus.
- Popularity/scrobble quirks (remix outranking classic): admin swap is the safety valve.
- Spotify `preview_url` is dead for new apps — previews, if ever added, come from iTunes.
