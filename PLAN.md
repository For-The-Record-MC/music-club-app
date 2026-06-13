# Music Club App — Build Plan

Moving from the single-file localStorage MVP (`index.html`, by Dad + Claude) to a real
multi-club product on the Pindejos architecture: Expo app + Supabase Postgres backend,
migrations-only schema changes, typed `db.ts` query layer, hooks + pure compute
functions, `context/` doc index.

## Decisions (locked 2026-06-12)

| # | Area | Decision |
|---|------|----------|
| 1 | Platform | Expo / React Native **with web target**. Deploys: TestFlight (native) + static web export to GitHub Pages — same dual-channel model as Pindejos. |
| 2 | Auth | Real Supabase auth accounts per member; `profiles` linked to `auth.users`; RLS scoped by club membership (Pindejos `AUTH.md` patterns). |
| 3 | Core loop | Club listens to **2 albums per cycle**. **One picker per cycle picks both albums.** |
| 4 | Picker selection | **Random spinning wheel.** Eligible pool = club members minus the pickers of the **last 3 cycles**. |
| 5 | Cycle clock | Host-set dates, **one meeting per cycle**. Lifecycle: spin → albums set → meeting scheduled → RSVP → meeting/reveal → closed → next spin. "Current cycle" is a status query (`status = 'open'`), never max-id. |
| 6 | Ratings | One row per (album, member): **score 1–10**, written review, **favorite song**, **least favorite song**, optional reasoning for each. Editable until cycle close. Unique constraint keeps averages honest. |
| 7 | Rating visibility | Three-stage ladder, **server-enforced**: (a) before submitting — only the who-has-submitted checklist; (b) after submitting — also the club's running **average score** (no individual scores/text); (c) after admin hits **reveal** at the meeting (or cycle close) — everything. |
| 8 | Suggestions | **One social feed** (track/album/playlist + streaming link + note, with reactions + comments) replacing the MVP's Now Listening + Links tabs. Posts flagged `is_album_suggestion` also appear in a **backlog view** the picker browses when their spin comes up. |
| 9 | v1 scope | **Keep:** Guest RSVPs, Concerts board (with "I'm in" interest). **Cut:** Food/potluck signup, SMS texting. |
| 10 | Multiplicity | **Full multi-club product.** `club_id` on every table; lobby; per-club roles; users can own/join many clubs. |
| 11 | Roles | **Owner → admins → members.** Owner: delete club, transfer ownership, promote admins. Admins: spin, schedule, reveal, close, manage members, rotate invite code. Exception: the current cycle's **picker** may set their two albums regardless of role. |
| 12 | Joining | **Invite link + rotating code** (revocable/regenerable by admins). Clubs are private; no directory. Replaces the MVP's query-param `welcome.html`. |
| 13 | Music metadata | **iTunes Search API** (free, keyless) type-ahead for albums/tracks → store a metadata snapshot (artist, year, artwork, track list, links); **manual entry fallback** for obscure releases. Track lists power structured favorite/least-favorite song pickers. Spotify links addable by hand. |
| 14 | The wheel | **Server RPC randomness**: `spin_wheel(club_id)` computes eligibility, picks randomly in Postgres, creates the cycle atomically (unique partial index = one open cycle per club). Client wheel animation is choreographed to land on the returned winner. |
| 15 | Notifications | **In-app activity feed only** (event rows + client-side templates, Pindejos Market-Moves style) powering a bell with unread state. Expo push deferred; same events table can feed it later. |
| 16 | Logistics | Build in **this repo**. New Supabase project already created by Jordan (credentials provided when prompted). `index.html` moves to `legacy/` as the **design reference** — its theme (DM Sans/Mono, dark/light palettes, card system) gets ported to the Expo theme. |

### Assumed defaults (flag if wrong)
- Scores are integers 1–10 (no halves).
- Meeting "time & location" stays a free-text field (like the MVP); meeting date is a real `date`.
- If a club has < 4 members, the last-3-cycles exclusion relaxes to "not the immediately previous picker" so the wheel always has a pool.
- Reactions on feed posts: small fixed emoji set (👍 ❤️ 🔥 😂 🤔), one per member per post.
- Cycle numbers are per-club sequential ints for display ("Cycle 7"); ids are uuids like everything else.

## Schema sketch (~15 tables)

- `profiles` — 1:1 with `auth.users`: display name, avatar color index.
- `clubs` — name, emoji, owner profile, invite code, created_at.
- `club_members` — (club_id, profile_id) unique, role `owner|admin|member`, joined_at.
- `cycles` — club_id, number, picker (club_member), status `open|closed`, start_date,
  meeting_date, meeting_time_location, revealed_at, closed_at.
  Partial unique index: one `open` cycle per club.
- `albums` — cycle_id, slot 1|2, title, artist, year, artwork_url, itunes_collection_id,
  apple_url, spotify_url, tracks jsonb (iTunes snapshot), set_by, set_at.
- `ratings` — album_id, profile_id (unique pair), score 1–10, review,
  favorite_track, favorite_reason, least_track, least_reason, timestamps.
  RLS: own row always readable/writable while cycle open; others' rows only after reveal.
  Aggregate-after-submit via SECURITY DEFINER RPC `get_album_summary`.
- `rsvps` — cycle_id, profile_id (unique pair), status `yes|maybe|no`.
- `cycle_guests` — cycle_id, name, status, added_by.
- `feed_posts` — club_id, author, kind, title, artist, url, platform, note,
  is_album_suggestion, metadata jsonb.
- `post_reactions` — post_id, profile_id, emoji (unique per member/post).
- `post_comments` — post_id, author, text.
- `concerts` — club_id, artist, date, venue, price text, ticket_url, note, added_by.
- `concert_interest` — (concert_id, profile_id) unique.
- `activity_events` — club_id, event_type, actor, payload jsonb, created_at
  (rendered by client templates; no stored display text).
- `activity_reads` — (club_id, profile_id) → last_read_at (powers unread badge).

**RPCs:** `spin_wheel(club)`, `set_cycle_albums`, `schedule_meeting`, `reveal_cycle`,
`close_cycle`, `join_club(invite_code)`, `rotate_invite_code(club)`,
`get_album_summary(album)` (visibility-gated aggregate). Lifecycle RPCs publish
matching `activity_events` rows transactionally.

## Status

- **Phase 0** shipped 2026-06-12 (scaffold, Supabase link, theme, Pages deploy).
- **Phase 1** shipped 2026-06-12 (identity & clubs: migration `20260612210000`, email-OTP auth + password path, lobby, create/join club, invite links, member/role management).
- **Phase 2** shipped 2026-06-12 (cycle engine: migration `20260612230000`, wheel screen with server-side spin, album picks via iTunes search, meeting scheduling, RSVPs + guests, cycle close).
- **Phase 3** shipped 2026-06-12 (ratings & reveal: migration `20260613010000`, rate form with track pickers, album detail with checklist → club-average → full-reveal ladder, admin reveal, past-cycle history).
- **Phase 4** shipped 2026-06-12 (social layer: migration `20260613030000`, club feed with reactions/comments + album-suggestion backlog, concerts board with interest, activity feed with client-side templates + unread bell wired into lifecycle RPCs and member actions).
- **Phase 5** shipped 2026-06-13 (polish & launch: per-user theme toggle system/dark/light, pull-to-refresh on browse screens, web document title, launch/ops doc in [context/launch.md](context/launch.md)). Remaining pre-launch step is operational, not code: configure SMTP + the OTP email template (see launch.md).
- **All six phases complete.** Follow-ups (non-blocking): bulk history import, Expo push, Spotify links, native TestFlight build.
- Email/SMTP configured 2026-06-13 (Gmail App Password, port 587; see [context/launch.md](context/launch.md)).

## v2 (2026-06-13)

- **Bottom-tab navigation** (migration-free): persistent tabs Clubs / Home / Feed / Concerts / Activity (Pindejos-style), with a selected-club store (`currentClubStore`) replacing the `/club/[id]` route-param model for browse screens. Detail/action screens stay at `club/[id]/*`. Activity tab shows an unread badge.
- **Real meeting date+time** (migration `20260613170000`): `cycles.meeting_at` timestamptz, cross-platform `DateTimeField` (native picker + web `datetime-local`), "Add to calendar" (Google Calendar template).
- **Album preference** (migration `20260613190000`): `cycle_preferences` — each member picks which of the cycle's two albums they liked more; sealed until reveal, then a vote tally.
- **iTunes song search in the feed** (`searchSongs`): members search Apple Music and pick a track (auto-fills title/artist/link/artwork) instead of pasting links; artwork shows on posts.

## Backlog / future ideas

- **Ticketmaster event search for concerts** (parked 2026-06-13 — liked the idea, not urgent). Instead of autocompleting just a venue, search the Ticketmaster Discovery API by artist and let the member pick a real event that fills the **whole** concert form at once: artist, date, venue, and ticket link — mirroring how the iTunes song search fills a feed post. Why it's a mini-project, not a quick add: Ticketmaster needs a registered API **key**, which can't ship in the public web bundle, so it requires a **Supabase Edge Function proxy** (the app calls our function; the function holds the key and calls Ticketmaster). Steps when we pick it up: (1) Jordan registers a free Ticketmaster developer key; (2) add an Edge Function `concert-search` that proxies `discovery/v2/events` and returns normalized `{artist, date, venue, ticketUrl}`; (3) a search UI in the concerts composer like the feed's song search. Free-text venue + the date picker are fine until then. (Rejected alternatives: Nominatim — free/keyless but 1 req/sec and weak venue results; Google Places/Foursquare — best data but billing + key + proxy.)

## Phases

**Phase 0 — Scaffold.** Move `index.html` + `welcome.html` refs → `legacy/`. Create
`app/` (Expo, TypeScript, web target), `supabase/` (config, `migrations/`,
`schema.sql` snapshot + refresh script), `context/` skeleton, `AGENTS.md` index
(hard constraints adapted from Pindejos). Link the new Supabase project
(credentials from Jordan). Port the MVP theme into a theme module. Set up GitHub
Actions: web export → GitHub Pages; EAS for TestFlight.

**Phase 1 — Identity & clubs.** Migration 1 (profiles, clubs, club_members, invite
RPCs, RLS + auth hook). Sign-in flow, lobby (club tiles ≈ MVP design), create-club
wizard, invite link/join flow, member management screen with roles.

**Phase 2 — Cycle engine.** Migration 2 (cycles, albums, rsvps, cycle_guests, wheel +
lifecycle RPCs). The wheel screen (animation lands on server result), album picker
with iTunes type-ahead + manual fallback, home/hero screen (two-album hero, meeting
card, picker history strip), meeting scheduling, RSVP screen with guests.

**Phase 3 — Ratings & reveal.** Migration 3 (ratings + visibility RPC/RLS). Rating
form (1–10, review, track pickers with reasoning), submission checklist,
post-submit club average, reveal moment at the meeting, past-cycles history with
averages and per-member stats.

**Phase 4 — Social layer.** Migration 4 (feed_posts, reactions, comments, concerts,
concert_interest, activity_events/reads). Feed screen with reactions/comments,
suggestion backlog view (surfaced to the current picker), concerts board,
notification bell + activity feed.

**Phase 5 — Polish & launch.** Empty states, pull-to-refresh, toasts, light/dark
parity with the MVP theme, web-export QA (react-native-web quirks), TestFlight
build, hand-enter Dad's existing club data, retire the legacy page.

Each phase ends with: `supabase db push` → regenerate `schema.sql` snapshot +
TypeScript types → update the relevant `context/*.md`.
