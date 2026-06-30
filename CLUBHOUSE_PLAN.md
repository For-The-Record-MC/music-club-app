# Clubhouse — Feed Tab Redesign Implementation Plan

The "Feed" tab becomes **Clubhouse 🎪**: a tiled hub fronting the club's interaction
rooms. Today there are two rooms (the activity Feed and Jukebox Showdown, currently an
in-page pill toggle in `feed.tsx`). This redesign promotes the hub to the tab's landing
screen and adds four new rooms:

- **Musical Takes** — standing wall of hot takes; 5-point agree↔disagree scale + comments.
- **The Perfect Playlist** — per-cycle collaborative themed playlist; auto-synced to Spotify.
- **Aux Battle** — per-cycle 1v1 head-to-head; auto-paired, A/B voting, wins tracked on profiles.
- **Convince Me** — standing artist-rec board; artist + 3 tracks, aimed-at tagging, Converted verdict.

Design locked via grill-me. This plan is the build breakdown.

## Core architecture decisions

1. **Hub-as-landing (model A).** The Feed tab's root renders a 2-column grid of
   **status-line tiles**, each routing to its own screen under `src/app/(tabs)/feed/`.
   The classic activity feed becomes tile #1 (its own route); Showdown becomes a tile
   (lift `ShowdownPanel` into a route). No more in-page `tab` toggle in `feed.tsx`.
2. **Tab rename.** Bottom tab `feed` → label **"Clubhouse"**, icon **🎪** (route name can
   stay `feed` to avoid churn; only `title`/`tabBarIcon` change in `_layout.tsx`).
3. **Two spines.** Two of the new features ride the **cycle lifecycle** exactly like
   Showdown (per-cycle, optional, picker-kicked-off, frozen/crowned at `close_cycle`):
   **Perfect Playlist** and **Aux Battle**. Two are **standing boards** that mirror the
   activity-feed/reactions/comments machinery and never close: **Musical Takes** and
   **Convince Me**.
4. **Everything is per-club.** No cross-club/global walls.
5. **Discovery layer.** Each feature drops **lightweight activity-feed entries** that
   deep-link into its room, and the hub tiles carry **live status lines**. Pushes are
   **direct/personal only** (never broadcast).
6. **Reuse, don't rebuild.** Song/track/album search reuses the existing Spotify/Apple/
   iTunes pickers; mentions reuse the `Mentions` component; comments reuse the existing
   `comments` table/component; Spotify playlist ops reuse `_shared/spotify.ts`
   (`createPlaylist`/`addTracks`/`searchTrackUri`); per-cycle contest patterns reuse the
   Showdown machinery (theme-idea pool, `norm_key` dedup, `close_cycle` crowning,
   History sections).

---

## Phase 0 — Hub shell

Convert the Feed tab into the Clubhouse hub. No new tables.

1. **Routing.** Introduce `src/app/(tabs)/feed/` as a stack:
   - `index.tsx` — the hub grid (landing).
   - `activity.tsx` — the classic activity feed (move the current `feed.tsx` feed body here).
   - `showdown.tsx` — wraps `ShowdownPanel` as a route.
   - Later phases add `takes.tsx`, `convince.tsx`, `playlist.tsx`, `aux.tsx`.
2. **Hub grid component.** 2-col grid of `HubTile`s. Each tile: emoji, name, one-line
   **status** string, and a subtle "new" indicator. Tiles route via `router.push`.
3. **Status-line data.** A single `useClubhouseStatus(clubId, cycleId)` hook returns per-tile
   summaries (counts + a "needs you" flag). Phase 0 wires only Feed + Showdown lines
   ("3 new", "Showdown reveals in 2d"); later phases extend it.
4. **Tab chrome.** `_layout.tsx`: `feed` screen `title: 'Clubhouse'`, `tabBarIcon: 🎪`.
5. **Deep-link / push targets.** Each room is a real route, so existing push deep-links and
   `tabParam` handling migrate to path-based navigation.

*Ships immediately; existing Feed + Showdown behavior preserved, just relocated.*

---

## Phase 1 — Musical Takes (standing board)

A permanent, club-scoped wall of hot takes with a polarization meter.

**Schema** (`migration: musical_takes.sql`):
- `musical_takes` — `id, club_id, author_id, body (1..280), created_at`.
- `musical_take_positions` — `id, take_id, profile_id, value smallint check (value between -2 and 2)`,
  `unique(take_id, profile_id)`. (-2 strongly disagree … +2 strongly agree; 0 neutral.)
- Comments reuse the existing `comments` table (add a `context`/parent ref for takes,
  matching how feed comments key in).
- RLS: club members read/write within their club; authors + admins delete.
- RPC `set_take_position(take_id, value)` upsert; `value null` clears.

**Client** (`feed/takes.tsx`):
- Newest-first list. Each take card shows body, a **divisiveness meter** (stacked bar of the
  5 buckets + a computed "controversy" score), the viewer's current position selector, a
  comment count, and a comment thread (reused component).
- "+ New take" composer (body only).
- Delete-and-repost (no editing). Author/admin delete.

**Integration:** activity entry "🔥 {name} posted a take" → deep-links to the take.
Hub status line: "12 takes · 3 new". No pushes (broadcast-only feature).

---

## Phase 2 — Convince Me (standing board)

A standing artist-recommendation board with aimed-at tagging and a persuasion scoreboard.

**Schema** (`migration: convince_me.sql`):
- `convince_posts` — `id, club_id, author_id, artist_name, artist_image_url, artist_ref
  (spotify/apple id), blurb, created_at`.
- `convince_tracks` — `id, post_id, position (1..3), title, artist, artwork_url, spotify_url,
  apple_url, norm_key`; `unique(post_id, position)`. Exactly 3 enforced client-side + RPC.
- `convince_targets` — `id, post_id, profile_id, verdict text null check (verdict in
  ('converted','not_for_me'))`, `unique(post_id, profile_id)`. The "who's this for" list +
  each target's verdict.
- Comments reuse existing `comments`.
- RPC `create_convince_post(...)` (writes post + 3 tracks + targets atomically),
  `set_convince_verdict(post_id, verdict)` (target-only).

**Client** (`feed/convince.tsx`):
- Composer: artist search (reuse picker) → 3 track pickers → blurb → **"Who's this for?"**
  member multi-select (reuse `Mentions` member picker).
- Post card: artist header, 3 starter tracks with Listen-links, blurb, target chips, comments.
  Targets see **Converted ✅ / Not for me ❌** buttons.
- Profile stat: **"Convinced N"** (count of `converted` verdicts on the author's posts) added
  to the member profile `Stat` grid.

**Integration:** **personal push** to each tagged target ("{name} thinks you'd like {artist}")
→ deep-links to the post. Activity entry "🎯 {name} has a rec for {targets}". Hub status line:
"5 recs · 1 for you".

---

## Phase 3 — The Perfect Playlist (per-cycle, collaborative)

One shared themed playlist per cycle, kicked off by the picker, built by everyone, synced to
Spotify. No voting, no winner — pure collaboration.

**Schema** (`migration: perfect_playlist.sql`, mirrors Showdown):
- `perfect_playlists` — `id, cycle_id unique, club_id, theme_text (1..140), created_by,
  spotify_playlist_id, spotify_playlist_url, created_at`. Optional per cycle (like Showdown).
- `perfect_playlist_songs` — `id, playlist_id, profile_id, title, artist, artwork_url,
  spotify_url, apple_url, norm_key, created_at`; `unique(playlist_id, norm_key)` (whole-list
  dedup, first-come). **Up to 3 songs per user**: enforced in RPC (no unique on profile_id).
- Optional reuse of `showdown_theme_ideas`-style pool, or free-text theme at kickoff.
- RPCs: `start_perfect_playlist(cycle_id, theme, seed_song)` (picker/admin only; seed song
  **counts as the picker's first of 3**), `add_playlist_song(...)` (member, enforces ≤3 own +
  dedup), `remove_playlist_song(...)` (own/admin).

**Spotify sync** (`supabase/functions/perfect-playlist-sync/`): sibling of `spotify-sync`.
Creates/maintains a **separate** Spotify playlist per cycle (its own `spotify_playlist_id` on
`perfect_playlists`, distinct from the cycle's feed playlist), appending each resolved song.
Reuses `_shared/spotify.ts`. Triggered on song add + a manual "Re-sync".

**Lifecycle:** at `close_cycle`, playlist just **freezes** (no crowning). Spotify playlist
persists. Surfaced in **History** as a browsable entry (theme + Spotify link).

**Client** (`feed/playlist.tsx`): theme header, contributor progress ("7/10 contributed"),
song list grouped/attributed, your remaining slots (x/3), add-song picker, ▶ Spotify button.
Pre-kickoff: "Not started — waiting on {picker}". Hub status line: "Roadtrip · 7/10".

---

## Phase 4 — Aux Battle (per-cycle, head-to-head)

One featured 1v1 per cycle. Two members auto-paired (LRU-weighted), same theme, each submits a
song, everyone else votes A/B, winner crowned at close, wins tracked on profiles.

**Schema** (`migration: aux_battle.sql`):
- `aux_battle_theme_ideas` — same shape as `showdown_theme_ideas` (`id, club_id null (null =
  global seed), text (1..140), created_by, used_cycle_id null, created_at`). Seeded with
  starters ("best 2008 song", "best sad banger", "best summer song", …). Members stock the
  pool; spent ideas marked via `used_cycle_id`.
- `aux_battles` — `id, cycle_id unique, club_id, theme_text (1..140), theme_idea_id null,
  member_a, member_b, created_by, winner_profile_id null, created_at`. Optional per cycle.
- `aux_battle_votes` — `id, battle_id, profile_id, choice uuid (member_a|member_b)`,
  `unique(battle_id, profile_id)`. Plain single vote (not the Showdown budget). Voters exclude
  the two combatants.
- Each combatant's song stored on the battle row or a small `aux_battle_songs(battle_id,
  profile_id, ...norm fields)` `unique(battle_id, profile_id)`.
- Pairing helper tracks **last-battled** per member (e.g. `member_last_battle_cycle`, or derive
  from history) to weight selection toward least-recently-played.
- RPCs: `start_aux_battle(cycle_id)` (picker/admin; LRU-weighted random pick of 2 active
  members + theme drawn from `aux_battle_theme_ideas` pool, picker may override with free text),
  `submit_aux_song(...)` (combatant-only), `cast_aux_vote(battle_id,
  choice)` (non-combatant member).

**Lifecycle:** fold into `close_cycle` — count votes, set `winner_profile_id` (more votes wins;
**tie → no winner credited**), **increment winner's profile win count**.

**Profile stat:** add **both** **"Aux Battle wins"** and **"Showdown wins"** to the member
`Stat` grid while it's open (Showdown wins derive from `showdowns.winner_submission_id` →
submission → profile; symmetric per-cycle-contest win counts).

**Client** (`feed/aux.tsx`): "A vs. B: {theme}" header (open/attributed, **not blind**), each
combatant's song with Listen-links, A/B vote for non-combatants, live tally while open, winner
banner at close. Combatants see a submit-song prompt. Pre-kickoff: "Not started this cycle".

**Integration:** **personal pushes** — "You've been picked for the Aux Battle, submit your song"
(to both combatants), and results to combatants at close. Activity entry "🏆 {winner} won the
Aux Battle". History gets an **"Aux Battle winners"** section beside Showdown winners. Hub status
line: "Best 2008 song · vote now" / "You're up — submit".

---

## Cross-cutting summary

| Concern | Decision |
|---|---|
| Hub model | Landing grid of status-line tiles; each room is its own route |
| Tab | "Clubhouse 🎪" |
| Per-cycle (ride lifecycle) | Perfect Playlist, Aux Battle |
| Standing (evergreen rooms) | Musical Takes, Convince Me |
| Kickoff (per-cycle) | Picker (admin fallback); fully optional per cycle |
| Posting | Any member posts takes/recs, contributes songs, votes |
| Edit | Delete-and-repost (no true edit); author + admin delete |
| Voting | Aux Battle = single A/B vote; Takes = 5-pt scale; Playlist = no vote |
| Pushes | Direct/personal only (Convince Me tag, Aux Battle "you're up"/results) |
| Discovery | Lightweight activity entries + hub status lines |
| Profile stats | Aux Battle wins, Showdown wins, Convince Me "Convinced N" |
| History | Aux Battle winners section + Perfect Playlist entries; standing boards excluded |
| Spotify | Perfect Playlist auto-syncs to its own per-cycle playlist |
| Scope | Per-club throughout |

## Build order

Phase 0 (hub shell) → 1 (Takes) → 2 (Convince Me) → 3 (Perfect Playlist) → 4 (Aux Battle).
Simplest → most lifecycle-coupled; hub ships first so every feature has a home; the two
`close_cycle`-touching features land last on patterns proven earlier.
