# Listening Bingo 🎱 — Studio Room

Design locked 2026-07-03 via grill session. **BUILT + DEPLOYED 2026-07-03**
(migration `20260703120000_listening_bingo.sql` applied, 175 categories seeded,
`spotify-search` extended with `durationMs`, `send-push` redeployed with the
four bingo events; client ships via EAS OTA post-approval). As-built deviations
from the plan below:

- **Self-certify at close applies to ALL pending claims**, not only the
  admin's own. Rationale: the closer could reject bad claims before closing,
  and voiding a completed line for others' inaction is backwards. The badge
  ("SELF-CERTIFIED") marks any claim that wasn't peer-cleared.
- **Categories**: one global `bingo_categories` table (the 175 built-ins);
  the launch UI passes the final label list (kept built-ins + customs) to
  `create_bingo_game`, which snapshots it into `bingo_game_categories`.
  Customs never touch the global pool. Minimum pool: 24.
- **Verification is single-verifier with per-box challenges** as planned; a
  rejected claim deactivates the challenged boxes (listen resets) and the line
  can be re-claimed with a fresh claim row (history kept).
- **Time gate**: track duration from Spotify search (`duration_ms`), minimum
  30s, 90s fallback when duration is unknown (e.g. iTunes-sourced picks).
- **Bonus lines → blackout** (`20260704010000_bingo_bonus_lines.sql` +
  `20260704020000_bingo_unlock_on_claim.sql`): the moment every qualifying
  line has a live claim (pending or verified), `claim_bingo` appends a random
  new line from the ones not dealt (3 → 4 → … → 12) — review never stalls
  progress. A rejected claim keeps the already-unlocked line (you'd earn it
  anyway once fixed); `resolve_bingo_claim` keeps an all-verified expansion
  check as a backstop. Self-certifications at forced close don't expand.
  Bonus chips show ⭐; all 24 boxes lit = FULL-CARD BLACKOUT with an animated
  banner (spring-in + pulse + spinning 🎱, core `Animated`) and a ⬛ badge on
  the board list.
- **Rarity scoring** (`20260703140000_bingo_rarity.sql` + `track-stats` Edge
  Function): each box stores the song's Last.fm all-time playcount
  (`lastfm_playcount`), fetched at pick time (and lazily backfilled for
  earlier picks via `set_bingo_playcount`, own boxes only). Scoring is pure
  client math in `utils/listeningBingo.ts` — `rarity = clamp(100 − 11·log₁₀
  (playcount), 1, 100)`; bingo rarity = line average (free center excluded),
  card rarity = average of lit scored boxes; unknown counts are excluded, not
  zeroed. Shown as 💎 in standings, board headers, and the box panel.
- **Max 3 concurrent listens per card** (`20260703130000_bingo_listen_cap.sql`):
  timers run independently, so an uncapped card could be speedrun by tapping
  out on all 24 boxes and waiting one song length. The cap of 3 tolerates
  casual playlist queuing while keeping a full card at real listening
  wall-clock. Marking a box listened (or swapping its song) frees a slot;
  re-tapping the same box only restarts its own timer.
- **Events**: `bingo_started` (lifecycle), `bingo_claimed` (social — doubles
  as the verify nudge), `bingo_verified` (social), `bingo_closed` (lifecycle),
  plus a `bingo` mention context for the comment thread.
- **Screen**: `app/src/app/clubhouse/bingo.tsx`; grid cells show compressed
  category labels ("Song by a boy band" → "by a boy band"); other members'
  boards browsable inline; archive shelf like Track Madness.

## Concept

A cycle-tied studio room game. When launched, every club member gets a random
5x5 bingo card of music categories ("a song under 2 minutes", "a one-hit
wonder", …). Members fill boxes with songs and prove the listen via a
time-gated Spotify/Apple link-out. Only 3 randomly-chosen lines per card
qualify for bingo. Claims are peer-verified; the admin/picker resolves
stragglers before the cycle closes.

## Locked decisions

| # | Decision | Ruling |
|---|----------|--------|
| 1 | Qualifying paths | **3 random lines per card, visible from the start** (highlighted on the card). Different members chase different lines |
| 2 | Board | **5x5 with free center square** (club logo). Free center makes diagonals + middle row/column cost 4 listens instead of 5 — strategic texture across qualifying lines |
| 3 | Categories | **Built-in curated pool (175 seeded) + admin extras**: launcher can add custom categories and disable ones they dislike before dealing. Room for inside jokes / cycle-theme tie-ins |
| 4 | Card dealing | **Independent random draw of 24 per card** from the game's active pool (keep active pool ≥ ~35 so cards overlap heavily but aren't identical); random positions |
| 5 | Song rules | **Unique per card only** — one song can't fill two boxes on your card; cross-member duplicates are fine (comparing picks is a feature). Songs come from the existing Spotify search proxy |
| 6 | Box activation | **Tap link-out → time gate → mark listened.** Tapping Spotify/Apple puts the box in a "listening" state; the "mark listened" button unlocks only after the track's duration (from Spotify search metadata) has elapsed. Honor-system with a tap-spam blocker; peer verification is the real enforcement |
| 7 | Box edits | **Swap resets activation** — swapping a song in an unclaimed box darkens it; re-listen (tap-out + duration gate) to relight. Boxes inside a claimed or verified line are locked. Invariant: a lit box always reflects a listened song |
| 8 | Claiming | **Explicit BINGO! button** unlocked when a qualifying line completes. Tapping stamps claim time, fires the activity event, opens verification. Members may hold a claim to shore up a shaky box first |
| 9 | Verification | **Peer judges category fit, per box**: verifier sees the line's songs beside their categories, approves or challenges individual boxes with a reason. Challenged box deactivates; claimer swaps a new song in and re-claims. Listening isn't re-litigated (the time gate handled it). Any member except the claimer can verify |
| 10 | Admin resolution | **Anytime fallback, never self-clear.** Admin/picker can resolve any pending claim at any time (stale claims shouldn't hang for days). Nobody verifies their own claim; an admin's claim needs another member (or the picker if that's someone else). At forced cycle-close, a still-unverified admin claim passes as valid with a **"self-certified" badge** |
| 11 | Win & end | **Game runs the whole cycle.** First verified bingo takes the crown 🏆; later bingos rank by verification time; multiple lines / full-card blackout live on as bragging rights. Nobody's card dies early |
| 12 | Lifecycle | **Manual launch by owner/admin or current picker** (tweak pool → deal cards), any time during a cycle; **auto-closes when the cycle completes**, with the admin prompted to resolve pending claims first. Opt-in per cycle — a treat, not an obligation. One active game per club |
| 13 | Visibility | **Fully public boards** from the start — cards, songs, lit boxes. No spoiler problem (cards differ); rival-at-4/5 tension and song discovery are the point |
| 14 | Participation | **Card dealt lazily on first room open** (including mid-game joiners). No opt-in ceremony; non-players just show an untouched card |
| 15 | Notifications | **Exactly four**: game launched (cards dealt!), BINGO claimed (doubles as verify-me nudge), claim verified (crown moment), game closed with final standings. No box-level noise — public boards are the passive nudge |
| 16 | Identity | Room name **Listening Bingo**, 🎱. One comment thread per game (Best Bars pattern) |
| 17 | Archive | **Full archive in room** (Track Madness pattern): final boards, bingo order, winning lines and songs |

## Data model (new migration `..._listening_bingo.sql`)

- `bingo_games` — id, club_id, cycle_id, status ('open'|'closed'), created_by,
  created_at, closed_at. Partial unique index: one open game per club.
- `bingo_categories` — id, game_id (null = built-in pool row), label,
  is_custom, disabled. Built-ins seeded once; admin extras/disables per game.
- `bingo_cards` — id, game_id, profile_id, qualifying_lines (int[3] of line
  indexes 0–11), dealt_at. Unique (game_id, profile_id). Dealt lazily by RPC.
- `bingo_boxes` — card_id, position (0–24, 12 = free), category_id,
  track fields (title, artist, artwork_url, spotify_url, apple_url,
  duration_ms), state ('empty'|'filled'|'listening'|'lit'), listen_started_at,
  activated_at. Unique (card_id, position); unique lit song per card enforced
  in RPC.
- `bingo_claims` — id, card_id, line_index, claimed_at, status
  ('pending'|'verified'|'rejected'), resolved_by, resolved_at, self_certified
  bool. Rank = order of verified resolved_at.
- `bingo_challenges` — claim_id, box position, challenger_id, reason,
  created_at.
- `bingo_comments` — game_id, profile_id, body, created_at (Best Bars pattern).

RLS: club members read everything (public boards). Writes to own card/boxes
only while game open; claims on own card only; verification/challenge writes
blocked on own claims.

RPCs (security definer):
- `create_bingo_game(...)` — role check (owner/admin/picker), no open game;
  snapshots active category pool.
- `deal_bingo_card(p_game)` — idempotent; random 24 categories + 3 qualifying
  lines.
- `fill_bingo_box`, `start_listen`, `mark_listened` — mark_listened validates
  `now() - listen_started_at >= duration_ms`; fill/swap resets state and
  rejects duplicate songs on the card; locked if box is in a
  pending/verified claim line.
- `claim_bingo(p_card, p_line)` — validates line is qualifying + all 5 boxes
  lit (or free); emits activity event.
- `resolve_claim(p_claim, verdict)` — any member ≠ claimer, or admin/picker;
  challenge path deactivates named boxes.
- `close_bingo_game(p_game)` — called at cycle completion (and manually);
  admin-claim fallback → self_certified; emits standings event.

## Notes

- Apple links resolve client-side via iTunes Search at fill time (Track
  Madness pattern — iTunes throttles server IPs).
- Spotify dev-mode: everything goes through the existing `/search` proxy
  (see `context/spotify-api.md`); duration_ms comes from search results.
- **Seed pool: 175 categories in `supabase/seed/bingo_categories.csv`**
  (provided 2026-07-03). Rough bands: artist facts (1–30), genres (31–70),
  eras/release context (71–90), musical features (91–110), title tricks
  (111–120), lyrical themes (121–150), personal/subjective (151–175).
- Verification nuance the seed exposes: categories 151–175 (and a few others
  like 79, 16, 164) are **self-referential** — a verifier can't factually check
  "recommended by someone older than you." Verification for those reduces to
  plausibility/honor; that's acceptable, but the card-dealing draw could cap
  self-referential picks per qualifying line (v2 idea: tag pool rows
  `objective` vs `personal`).
