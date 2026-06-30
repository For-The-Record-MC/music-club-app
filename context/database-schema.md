# Database schema

Current-state DDL: [../supabase/schema.sql](../supabase/schema.sql) (generated — read that, not migrations). This file is the prose: what each table means and the invariants that aren't obvious from DDL. Planned future tables: see [../PLAN.md](../PLAN.md).

## Tables

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users` (auto-created by `handle_new_user` trigger on signup). `display_name` stays **null until the user completes profile setup** — the app gates the lobby on this. `avatar_color` indexes into the 7-color avatar palette. |
| `clubs` | A listening club. `invite_code` (8 chars, unambiguous alphabet) is the join credential; `owner_id` is informational/FK convenience — **authority always comes from `club_members.role`**. `song_limit_per_cycle` (nullable int, **NULL = no cap**) caps how many `kind='track'` feed posts each member may add per open cycle — enforced by the `feed_posts` insert trigger `enforce_song_limit`. |
| `club_members` | Membership + role: `owner` / `admin` / `member`. Unique `(club_id, profile_id)`. A partial unique index enforces **exactly one owner row per club**. |
| `cycles` | One listening cycle: per-club sequential `number`, wheel-chosen `picker_id`, `status` `open`/`closed`, host-set `meeting_date` + free-text `meeting_time_location`, `revealed_at` (ratings reveal, Phase 3), `closed_at`. **Partial unique index: at most one open cycle per club** — "current cycle" is the `status='open'` row, never `max(number)`. `kind` `standard`/`archive` discriminates a club's single **archive cycle** (`number` 0, `closed`+`revealed` from birth — see The Archive below); a **partial unique index** allows at most one archive cycle per club. |
| `albums` | The cycle's two picks: `slot` 1\|2 (unique per cycle **via partial index where `slot is not null`**), title/artist/year, iTunes metadata snapshot (`artwork_url`, `itunes_collection_id`, `apple_url`, `tracks` jsonb `[{trackNumber, trackName}]` — powers Phase 3 song pickers), optional `spotify_url`. **Archive rows** (in a `kind='archive'` cycle) have `slot` **null**, a nullable `claimed_by` (the member who picked it pre-app), and `spotify_album_id` (extracted from `spotify_url`; **partial unique `(cycle_id, spotify_album_id)` where `slot is null`** hard-blocks archive dupes). `set_by` on archive rows is the importer/admin. |
| `rsvps` | One row per (cycle, member): `yes`/`maybe`/`no`. Upserted by the member. |
| `cycle_guests` | Plus-ones for a cycle's meeting: name + status, `added_by` member. |
| `ratings` | One row per (album, member): `score` 1–10, `review`, `favorite_track`/`least_track` + optional reasons. Unique `(album_id, profile_id)`. **Editable only while the cycle is open AND not yet revealed** — ratings freeze at reveal, not close (`status='open' AND revealed_at IS NULL`). **Visibility ladder enforced server-side** — see below. |
| `song_notes` | Personal **per-track** listening journal: one row per `(album, member, track_number)` — `rating` 1–10, `thumb` `up`/`down`, `comment` (all nullable). Distinct from `ratings` (which is the formal sealed album score). **Private by default; editable any time, including past closed cycles** (not cycle-gated). Surfaced read-only on the rate screen so first impressions are handy. |
| `song_note_shares` | Row-presence = "I've shared my song notes for this album with the club." Per `(album, member)`. When present, the `song_notes` select policy opens that member's notes for that album to fellow club members. |
| `feed_posts` | The one club feed: `kind` track/album/playlist, title/artist/url/platform/note. `is_album_suggestion` also surfaces the post in the picker's backlog view. Author or admin deletes. |
| `post_reactions` | One emoji per (post, member) from a fixed set (👍❤️🔥😂🤔); upsert toggles. |
| `post_comments` | Threaded comments on a feed post; author or admin deletes. |
| `concerts` | Club concert board: artist, optional `concert_date` (calendar day) + `concert_time` (wall-clock), venue/price/ticket_url/note. Post-show fields: `rating` 1–5, `review`, `completed_at` (non-null = show happened → surfaces in the collapsed "Completed" section). Adder or admin edits/deletes (`concerts_update` policy). **Reviews are written via `set_concert_review`, which propagates the rating/review/completion to every shared copy (same root) the caller can manage** — so one review lands on the concert in all the caller's clubs. |
| `concert_interest` | One row per (concert, member) with `status` `interested`/`going` — a member picks one. |
| `concert_comments` | Threaded comments on a concert; mirrors `post_comments`. Author or admin deletes. |
| `activity_events` | Append-only club newswire. **Stores no display text** — only `event_type` + `payload` jsonb; rendered client-side by `utils/activityTemplates.ts`. Written only via `publish_activity_event`. |
| `activity_reads` | Per-(club, member) `last_read_at`; the unread bell counts events newer than this. |
| `club_favorite_tracks` | The club's all-time favorites — 1–3 enshrined per cycle close by the `cycle-highlights` Edge Function. `(club_id, cycle_id, title, artist, spotify_uri, source 'album'\|'feed')`. Member-readable; **written only by the Edge Function (service role)** — no client write policy. Partial unique index on `(club_id, spotify_uri)` (where uri not null) blocks double-enshrining. Powers an all-time list even with no Spotify connection. |
| `streaming_connections` | One per club (`club_id` PK). The owner's Spotify OAuth tokens (`access_token`/`refresh_token`/`expires_at`/`scope`), `spotify_user_id`, `display_name`, `status` `active`/`needs_reconnect`, `connected_by`. **RLS-on with NO policies — clients can never read/write it; only the Edge Functions (service role) touch it.** Status/disconnect go through the `streaming_status`/`streaming_disconnect` RPCs (never return tokens). `cycles.spotify_playlist_id`/`_url` (member-readable) hold the per-cycle **feed** playlist created from this connection; `feed_posts.playlist_synced_at` marks a post already pushed. Two more pointer pairs (also member-readable, written by Edge Functions): `cycles.spotify_highlights_playlist_id`/`_url` (the per-cycle **highlights** playlist) and `clubs.spotify_favorites_playlist_id`/`_url` (the club's **all-time favorites** playlist). |

## Rating visibility ladder

1. **Pre-submit:** only the who-has-submitted checklist, via `get_album_summary` (`submitted` ids + `count`; `avg_score` is null).
2. **Post-submit:** `get_album_summary` adds `avg_score` once the caller has their own rating row (numbers only — individual rows still RLS-hidden).
3. **Revealed** (`cycles.revealed_at` set by `reveal_cycle`/`close_cycle`): RLS opens everyone's rows to club members; the app reads them with a normal select. **Reveal also freezes writes** — `ratings` and `cycle_preferences` insert/update/delete require `revealed_at IS NULL`, so scores and 👑 votes are final once revealed.

Never bypass the ladder by adding a broader select policy or a new RPC that returns rows pre-reveal.

## Invariants & conventions

- **All ids are `uuid`.** Timestamps are `timestamptz`.
- **Roles:** owner ⊃ admin ⊃ member. Owner: delete club, promote/demote admins, remove anyone. Admin: remove plain members, rotate invite code, edit club. Member: read + leave.
- **Membership rows are never direct-inserted** — only the `create_club` / `join_club` RPCs (security definer) create them. Updates (role) and deletes (leave/remove) go through RLS policies that mirror the role rules.
- **RLS helpers** `is_club_member(uuid)` / `club_role(uuid)` are `security definer` specifically to avoid policy self-recursion on `club_members`. Reuse them in every future club-scoped policy.
- `profiles` are readable by **any** authenticated user (display names only); writable only by the owning user.

## RPCs

| Function | Access | Behavior |
|---|---|---|
| `create_club(p_name, p_emoji)` | authenticated | Insert club + owner membership atomically; returns the club row. |
| `join_club(p_code)` | authenticated | Code → club; idempotent membership insert; returns the club row. Raises on bad code. |
| `rotate_invite_code(p_club)` | admin+ (checked inside) | Regenerates and returns the invite code. |
| `wheel_pool(p_club)` | members | Eligible picker ids: members minus the last-3-cycle pickers, **relaxing 3→1→0** so small clubs always have a pool. Single source of eligibility truth — used by `spin_wheel` AND the wheel screen. |
| `spin_wheel(p_club)` | admin+ | Server-side random pick from `wheel_pool`; atomically creates the next open cycle (number = max+1). Raises if a cycle is already open. The client animation lands on the returned `picker_id`. |
| `reveal_cycle(p_cycle)` | admin+ | Sets `revealed_at` (idempotent). Phase 3 rating visibility keys off this. |
| `close_cycle(p_cycle)` | admin+ | `status='closed'` + `closed_at` (implies reveal); unlocks the next spin; publishes a `cycle_closed` activity event. The client then fires the `cycle-highlights` Edge Function to build the playlists. |
| `get_album_summary(p_album)` | members | The gated aggregate (ladder stage 1–2): submitted ids, count, avg (null unless caller submitted or revealed), revealed flag. |
| `set_concert_review(p_concert, p_rating, p_review, p_mark_complete)` | adder/admin of the concert | Writes the review to the concert AND every shared copy (same root: `id = root OR origin_concert_id = root`) **in clubs where the caller is the adder or an admin** — mirrors `concerts_update`, so it never writes where the caller couldn't already edit. Returns the affected row count. |
| `get_cycle_highlights(p_cycle)` | members (post-reveal) | The History detail payload: per-album scores/spread/👑 votes + winner, the combined-signal `top_songs` ranking (album favorite/least votes + shared song-note thumbs/high ratings + feed reaction counts, positive only), standout high/low reviews per album, and popular feed shares in the cycle window. Reused by `cycle-highlights` (called with the member's JWT) to pick playlist songs. |
| `publish_activity_event(club, type, payload)` | members (sec. definer) | Inserts an activity row, pinning `actor_id` to the caller. Called from the app (feed_post, albums_set, meeting_scheduled, concert_added) and inside `spin_wheel`/`reveal_cycle`. |
| `mark_activity_read(club)` | members | Upserts the caller's `last_read_at` to now (clears the bell). |
| `my_song_quota(p_club)` | members (sec. definer) | Returns `{limit, used, has_open_cycle}` for the caller — the per-cycle song cap, how many `kind='track'` posts they've made since the open cycle started, and whether a cycle is open. Drives the feed composer's "X of N songs left" hint (same window logic as the `enforce_song_limit` trigger). |
| `streaming_status(p_club)` | members (sec. definer) | Returns the club's Spotify connection state **without tokens**: `{connected, provider, display_name, spotify_user_id, status, connected_by}`. |
| `streaming_disconnect(p_club)` | owner (sec. definer) | Deletes the stored tokens. Existing playlists/links stay on Spotify; syncing stops. |
| `generate_invite_code()` | internal | 8 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. |
| `handle_new_user()` | trigger only | auth.users insert → profiles row (random avatar color). |
| `get_or_create_archive_cycle(p_club)` | owner/admin (sec. definer) | Returns the club's `kind='archive'` cycle, lazily creating it (`number` 0, `closed`, `revealed_at=now()`, picker = club owner). |
| `add_archive_album(p_club, title, artist, year, artwork_url, spotify_url, apple_url, tracks)` | owner/admin (sec. definer) | Inserts one album into the club's archive (creates the cycle via the above), `set_by`=caller, `slot` null, `spotify_album_id` extracted from the URL. Raises **"already in the Archive"** on the dedup index. |
| `claim_archive_album(p_album, p_profile?)` | members (sec. definer) | Sets `claimed_by`. Members may only `null→self` (claim) or `self→null` (release); owner/admin may assign to any member or clear. Only ever writes `claimed_by`. |
| `spotify_album_id_from_url(url)` | internal (immutable) | Extracts the album id from an `open.spotify.com/album/<id>` URL; null otherwise. |

## Cycle-table write rules (RLS)

- `cycles`: members read; admins update (meeting fields); owner may delete a mis-spun cycle; **creation/status transitions only via RPCs**.
- `albums`: members read; **the picker or an admin** writes, only while the cycle is `open`; `set_by` must be the caller. **Archive rows** are exempt from `albums_write` (its open-cycle gate never matches): a separate `albums_archive_manage` policy lets owner/admin update/delete them, and adds/claims go through the `add_archive_album`/`claim_archive_album` RPCs.
- `rsvps`: members read; each member upserts **their own row** while the cycle is open.
- `cycle_guests`: members read; any member adds while open; the adder or an admin edits/removes.
- `ratings`: the open-cycle/`revealed_at IS NULL` write gate is relaxed for **archive** albums — reviews on a `kind='archive'` cycle are **always-open + always-public** (visibility works because the archive cycle carries `revealed_at`). Still your own row only.

## The Archive

Pre-app albums a club listened to before the app existed. They reuse the `albums`+`ratings` spine via the club's single `kind='archive'` cycle, so reviews/Spotify links/feed surfacing work unchanged. Differences from a standard album: no `slot`, a claimable `claimed_by` (single claimer; admins reassign), and always-open/always-public reviews (no reveal ritual). The archive cycle is **excluded from numbering, the wheel, and all stats** — `listClosed`, `listByMember`, and `priorPicks` all filter `kind='standard'`. Surfaced as a "The Archive" section pinned at the bottom of the History tab (hidden when empty), curated via the admin **Add to Archive** screen (`club/[id]/archive`), and seeded for the founding club by `supabase/scripts/seed-archive.mjs`. Claims are cosmetic identity (shown as "Pre-FTR picks" on profiles); reviews count toward the album average but **not** cycle leaderboards/streaks. See `ARCHIVE_PLAN.md`.

## Auth model

Email OTP (6-digit code): `signInWithOtp` → `verifyOtp` — no redirect URLs, identical on web and native. **Dashboard prerequisite:** the *Magic Link* email template must include `{{ .Token }}` so the code appears in the email (Authentication → Email Templates).
