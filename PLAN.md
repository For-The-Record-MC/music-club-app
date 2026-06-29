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

## v3 — Club admin + Spotify integration (planned 2026-06-13)

Locked via a grill-me design session. Three independently shippable phases.

**Decisions:**
- **Admin hub:** new `club/[id]/settings.tsx` (owner **+ admin**), with member management
  folded in; reached via a **gear icon on Clubs-tab tiles** where `role≠member`.
- **Streaming:** separate **owner-only** sub-screen `club/[id]/streaming.tsx`.
- **Song limit:** `clubs.song_limit_per_cycle int NULL` (NULL = unlimited, default NULL).
  Counts `kind='track'` posts per member since the **open cycle's start**;
  **no open cycle → no cap**; **server-enforced** via a `feed_posts` insert trigger.
- **Spotify only** (Apple Music deferred). Search via an Edge Function proxy
  (client-credentials token) so every member can search without connecting; composer
  **defaults to Spotify**, stores the Spotify track URI, keeps iTunes as a secondary toggle.
- **Connection:** per-club, owner-only, Auth Code + PKCE (`expo-auth-session`),
  **web + native**; token exchange/refresh/storage all server-side (Edge Function +
  RLS-locked `streaming_connections` table; tokens never reach the client).
- **Playlists:** **one per cycle**, auto-created lazily, **public**. Every track post with
  a Spotify URI is appended (best-effort match for Apple/manual; skip unmatched).
  **Client calls a sync Edge Function after posting + a manual re-sync button**;
  per-post `playlist_synced_at` marker dedupes.
- **Links surfaced:** feed header, home/current-cycle card, closed-cycle history.
- **Disconnect:** stop syncing, keep playlists/links; revoked token → owner "reconnect" banner.

**Phase A — Settings + song limit** (no Spotify): migration (`song_limit_per_cycle`
column + enforcement trigger + `my_song_quota` RPC), `settings.tsx` admin hub, gear entry
on Clubs tab, feed composer "X of N songs left" + graceful limit error.

**Phase B — Spotify search proxy:** first Edge Function in the repo (`spotify-search`,
client-credentials), `utils/spotify.ts` mirroring `itunes.ts`, composer defaults to Spotify
and stores the URI, iTunes kept as a secondary toggle.

**Phase C — OAuth + playlists:** `streaming_connections` table (RLS-locked) + per-cycle
playlist fields on `cycles` + `feed_posts.playlist_synced_at`; Edge Functions
`spotify-oauth` (token exchange/refresh) and `spotify-sync` (lazy public playlist create +
append using owner's token); `streaming.tsx` PKCE connect flow; client sync-after-post +
re-sync button; surface links + reconnect banner.

Prereqs: register a Spotify Developer app (client_id/secret, redirect URIs for web +
`fortherecordmc://`), scaffold `supabase/functions/` (none exist yet — check `~/Code/PindejosBowling`
for an Edge Function + deploy pattern to port), set `SPOTIFY_CLIENT_ID`/`SECRET` secrets.

**Status 2026-06-13:** All three phases built; `npx tsc --noEmit` clean. Phase A + C
migrations applied to the live DB (`20260613240000`, `20260613250000`); Edge Functions
`spotify-search`, `spotify-oauth`, `spotify-sync` deployed (project `yecjvvnposykmrzemcej`)
with `SPOTIFY_CLIENT_ID`/`SECRET` secrets set; `spotify-search` smoke-tested OK. App code
ready but **uncommitted/unpushed** (live web unchanged). Remaining manual steps before
OAuth works end-to-end: (1) register redirect URIs in the Spotify app — `fortherecordmc://spotify-callback`,
`https://for-the-record-mc.github.io/music-club-app/spotify-callback`, and (for local web dev)
`http://127.0.0.1:8081/spotify-callback`; (2) add GitHub Actions secret
`EXPO_PUBLIC_SPOTIFY_CLIENT_ID`. (Client secret was rotated + re-set on Supabase 2026-06-13.)
Deferred: Apple Music; home-screen reconnect banner for owners (today reconnect lives on the
streaming screen).

## v4 — End-of-cycle & history (planned 2026-06-23)

Locked via a design Q&A. Five independently shippable phases. Conventions throughout:
migrations-only schema, all queries via `db.ts`, then `refresh-schema-snapshot.sh` +
regenerate `database.types.ts`, update the relevant `context/*.md`.

**Decisions:**
- **Ratings lock at reveal** (not close): once `cycles.revealed_at` is set, members can no
  longer edit ratings *or* their 👑 favorite vote. Song notes stay editable forever (unchanged).
- **Shared song notes surface on the revealed album** — when a member has shared their notes
  (`song_note_shares`) for an album, they're tappable/expandable on the album reveal screen.
- **History replaces Activity as a bottom tab**; Activity moves to a **bell in the Home topbar**
  (keeps the unread badge), routed to a pushed `club/[id]/activity` screen.
- **Cycle highlights page** per closed cycle: Album scores & winner · Top songs · Standout
  reviews & comments · Popular feed shares.
- **"Top songs" = combined signal**: album favorite-track votes (`+3` fav / `-2` least),
  shared song-note thumbs/high ratings (`±1`, `+1` if ≥8), and feed track-post positive
  reactions (`+1` each). One ranked list; shared by the highlights RPC and the playlist function.
- **Two new playlists, auto-built on cycle close** (silent no-op if Spotify not connected):
  a per-cycle **Cycle Highlights** playlist (the top songs) and an **All-Time Club Favorites**
  playlist that auto-gains the cycle's top **1–3** songs each close. Manual "generate" button on
  the cycle page as a fallback for clubs that connect Spotify after a close.

**Phase 1 — Lock ratings at reveal** (migration `ratings_lock_on_reveal`): tighten
`ratings_*` + `cycle_preferences` write policies to `status='open' AND revealed_at IS NULL`;
rate screen renders read-only when revealed; album-detail edit CTA gated on `!revealed_at`.

**Phase 2 — Shared song notes on the album reveal** (no schema): on the revealed
`album/[albumId]`, fetch `song_note_shares` + `songNotes.listVisible` (both already in `db.ts`,
RLS already opens shared notes) and render a per-member `📝 Song notes` expander.

**Phase 3 — History tab + activity bell**: swap the `activity` tab for a `history` (📜) tab;
move the activity screen to pushed `club/[id]/activity.tsx` reading `currentClubStore`; add a
badge-carrying bell to the Home topbar. `(tabs)/history.tsx` lists closed cycles
(`cycles.listClosed`) → tap into the cycle detail. Retire Home's "Past cycles" strip for a
"See all → History" link.

**Phase 4 — Cycle highlights data + detail page** (migration: `get_cycle_highlights(p_cycle)`
security-definer RPC, member-gated, requires reveal/close): returns albums + scores + winner
(`cycle_preferences` tally) + score spread, the combined-signal `top_songs` ranking, standout
reviews (highest- & lowest-scorer per album + most-reacted feed comment), and popular feed
shares in the window `[cycle.created_at, closed_at]`. New `club/[id]/cycle/[cycleId].tsx`
renders the four sections + playlist links; `db.ts` gets `cycles.highlights` + a typed payload.

**Phase 5 — Auto-built playlists on close** (migration `playlists_and_favorites`):
`cycles.spotify_highlights_playlist_id/_url`, `clubs.spotify_favorites_playlist_id/_url`,
`club_favorite_tracks(id, club_id, cycle_id, title, artist, spotify_uri, source, added_at)`
(member-readable; powers an all-time list even without Spotify). New Edge Function
`cycle-highlights` mirrors `spotify-sync` (service role, owner token, idempotent, `ok:false/reason`
for recoverable states): resolves ranked songs to URIs (feed `metadata.spotify_uri` else search;
album tracks via best-effort `searchTrackUri(track_name, album_artist)` — same limitation the feed
sync has), creates the Cycle Highlights playlist, appends the top 1–3 not-yet-enshrined songs to
the all-time favorites playlist + records `club_favorite_tracks`. `home.tsx` `closeCycle` fires it
after `cycles.close` (fire-and-forget + toast, like sync-after-post); manual admin button on the
cycle page as fallback; publish a `cycle_closed` / `highlights_ready` activity event.

**Sequencing:** 1 & 2 are small/self-contained (ship first); 3 is the nav restructure; 4 delivers
the History payoff with no Spotify dependency; 5 layers playlists on top.

**Status 2026-06-23:** All five phases built; `npx tsc --noEmit` clean. Migrations applied to the
live DB (`20260623000000` ratings-lock, `20260623010000` cycle-highlights RPC,
`20260623020000` playlists+favorites); snapshot + types regenerated. Edge Function
`cycle-highlights` deployed (project `yecjvvnposykmrzemcej`). `get_cycle_highlights` smoke-tested
live (2 albums, 10 ranked songs, winner). App code uncommitted/unpushed (live web unchanged).
Not yet exercised end-to-end in the running app — recommend a manual pass (rate-lock at reveal,
shared notes on reveal, History tab + bell, a cycle's highlights page, and a real close on a
Spotify-connected club to verify playlist creation).

## v5 — Push notifications (planned + built 2026-06-29)

Locked via two design sessions. Push rides the existing `activity_events` table
(decision #15's intended seam) — it's a delivery pipe, not a new event system.
Full reference: [context/notifications.md](context/notifications.md).

**Decisions:**
- **Categories:** Mentions + Lifecycle + Announcements on by default; **Social
  (`feed_post`, `concert_added`) off (opt-in)**. Per-category prefs + a **per-club
  mute**.
- **Picker split:** the wheel emits a personal `you_are_picker` push to the winner
  plus the existing broadcast.
- **Announcements:** owner/admin custom broadcast, per-**club** cap 3/24h.
- **Meeting reminders** via `pg_cron` (24h + 1h out); reactive push for everything
  else. "Rate before reveal" folds into the meeting reminder (reveal is manual, no
  countdown).
- **Push text lives in TS** (`_shared/pushTemplate.ts`, mirroring
  `activityTemplates.ts`), not SQL. **Web stays bell-only.**

**Phase 1 — Reactive pipeline** (migration `20260629000000`): `push_tokens`,
`notification_preferences`, `club_members.notifications_muted`, `pg_net` +
fail-open AFTER INSERT trigger → `send-push` Edge Function (recipient resolution,
Expo Push API batching, dead-token pruning). Client: `expo-notifications`,
`utils/push.ts` (register + foreground-suppress handler + deep-link), `_layout.tsx`
wiring, `db.ts` query objects.

**Phase 2 — Picker split** (migration `20260629010000`): `spin_wheel` also emits
targeted `you_are_picker`; bell + push templates.

**Phase 3 — Preferences UI** (migration `20260629020000` for the `set_club_mute`
RPC): `notifications.tsx` (category switches + per-club mute), account-menu entry.

**Phase 4 — Announcements** (migration `20260629030000`): `post_announcement` +
`my_announcement_quota` RPCs (role + 3/24h cap), "📣 Announce" composer in
`settings.tsx`, `club_announcement` templates.

**Phase 5 — Meeting reminders** (migration `20260629040000`): `pg_cron` job +
`send_meeting_reminders()` + per-cycle sent-at markers.

**Status 2026-06-29:** All five phases built; `npx tsc --noEmit` clean. Migrations
`20260629000000`–`20260629040000` applied to the live DB; snapshot + types
regenerated. `send-push` deployed (`--no-verify-jwt`, project `yecjvvnposykmrzemcej`);
`PUSH_SHARED_SECRET` set + `send_push_url`/`send_push_secret` Vault secrets created;
function smoke-tested (auth gate + DB path) and `send_meeting_reminders()` + the
`meeting-reminders` cron job verified live. App code uncommitted/unpushed.
**Remaining before push lands on iOS:** an EAS dev/prod build with an APNs key
(Expo Go won't deliver), then a real-device end-to-end pass (token registration,
a broadcast push + tap deep-link, foreground-suppress, mute). Deferred:
server-driven app-icon badge counts.

## Backlog / future ideas

- **Auto-generate Google Meet links on schedule** (deferred 2026-06-13). Today the schedule form takes a pasted video link with a `meet.new` shortcut (shipped) — works, but one manual step. Truly automatic minting (a Meet link created the instant a meeting is scheduled) requires Google OAuth: only Google can create a real Meet link, via the Calendar API (event with `conferenceData`, `conferenceDataVersion=1`) or the Meet API (`spaces`). Needs a Google Cloud project, OAuth consent-screen verification for sensitive calendar scopes, an admin Google sign-in + token storage, and an Edge Function to hold the secret. A consumer `@gmail.com` can't do it via a service account (that needs Workspace domain-wide delegation). Same weight as the Ticketmaster integration — only worth it if the manual paste becomes annoying.

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
