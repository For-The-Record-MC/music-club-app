# The Archive — Implementation Plan

A "pre-club" album shelf. Albums the group listened to before the app existed are
imported, linked to real Spotify albums, **claimed** by the member who originally
picked them, and open to always-public, out-of-cycle reviews. Ships generically to
all clubs; hidden when a club's archive is empty.

Design locked via grill-me (see conversation). This plan is the build breakdown.

## Core model decision

Reuse the existing `albums` + `ratings` spine instead of building a parallel stack.
Each club gets **one special `archive` cycle** that holds all its archive albums as
ordinary `albums` rows. Reviews reuse `ratings`. The archive cycle is `closed` +
`revealed` from birth and is excluded from numbering, the wheel, and all stats.

---

## Phase 1 — Schema (one migration)

New migration `supabase/migrations/2026MMDDHHMMSS_archive_albums.sql`:

1. **`cycles.kind`** — `add column kind text not null default 'standard' check (kind in ('standard','archive'))`.
2. **`albums.claimed_by`** — `add column claimed_by uuid null references public.profiles(id)`. The single claimer; `null` = unclaimed. `set_by` stays the importer/admin (provenance, satisfies not-null).
3. **`albums.spotify_album_id`** — `add column spotify_album_id text`. The dedup key, extracted from `spotify_url`.
4. **Relax the slot constraint.** Today: `slot integer not null check (slot in (1,2))` + `unique(cycle_id, slot)`. Change to allow `slot null` for archive rows:
   - Drop `not null` on `slot`; replace the inline check with one that permits null (`check (slot is null or slot in (1,2))`).
   - Drop the table-level `unique(cycle_id, slot)`; re-add as a **partial** unique index `where slot is not null` (preserves the two-slot invariant for standard cycles, lets archive rows have null slots).
5. **Archive dedup index** — `create unique index albums_archive_spotify_uniq on public.albums (cycle_id, spotify_album_id) where spotify_album_id is not null and slot is null`. (Archive rows share one cycle per club, so `cycle_id` here is effectively the club key. Hard-blocks archive↔archive dupes.)
6. **`get_or_create_archive_cycle(p_club uuid)` RPC** (`security definer`, admin-only): returns the club's archive cycle, creating it lazily on first use:
   ```
   insert into cycles (club_id, number, picker_id, status, kind, revealed_at)
   values (p_club, 0, <club owner>, 'closed', 'archive', now())
   ```
   `number = 0` is the archive sentinel. One per club (guard with `unique (club_id) where kind = 'archive'`).
7. **`claim_archive_album(p_album uuid, p_profile uuid default null)` RPC** (`security definer`):
   - Resolve the album's club; require membership.
   - Member path: only allowed transitions are `null → auth.uid()` (claim) and `auth.uid() → null` (release). Any other member transition → raise.
   - Admin path (`club_role in owner/admin`): may set `claimed_by` to any member or null.
   - Only ever writes `claimed_by` (never title/artist/links).
8. **`add_archive_album(...)` RPC** (`security definer`, admin-only): inserts one archive album into the club's archive cycle (calling `get_or_create_archive_cycle`), `set_by = auth.uid()`, `slot = null`, with title/artist/year/artwork/spotify fields + extracted `spotify_album_id`. Raises on the dedup index violation with a friendly message. Used by both the admin screen **and** the seeding script.
9. **RLS — ratings on archive albums.** Extend `ratings_insert` and `ratings_update` `with check` to also pass when the album's cycle is `kind='archive'` and the caller is a club member — dropping the `c.status='open'` requirement for that branch. (Visibility already works: archive cycles have `revealed_at` set, so `ratings_select` opens them.) Net effect: archive reviews are always-open + always-public.
10. **RLS — claiming bypasses `albums_write`.** Leave `albums_write` as-is (it requires an open cycle, so it can't touch archive rows). All archive mutation goes through the RPCs above, which are `security definer`. Admin edit/delete of archive albums: add a narrow policy or RPC allowing `club_role in (owner,admin)` to update/delete albums whose cycle is `kind='archive'`.

`revoke execute ... from anon, public` on every new RPC, matching the existing convention.

After applying: regenerate types (`generate_typescript_types`) into `app/src/utils/supabase/database.types.ts`.

## Phase 2 — Data layer (`app/src/utils/supabase/db.ts`)

1. **`cycles.listClosed`** currently returns all `status='closed'` cycles — the archive cycle would leak in as a fake cycle. Add `.eq('kind','standard')` (or `.neq('kind','archive')`).
2. **`albums.listByMember`** keys on `set_by` and `cycles!inner`. Add `.eq('cycles.kind','standard')` so archive rows (whose `set_by` is the admin) never pollute a member's cycle picks.
3. New `archive` namespace in `db.ts`:
   - `archive.list(clubId)` — archive albums for the club (join archive cycle), ordered unclaimed-first then `artist`. Include `claimed_by` + claimer profile for the card.
   - `archive.add(...)` → `rpc('add_archive_album', ...)`.
   - `archive.claim(albumId, profileId?)` → `rpc('claim_archive_album', ...)`.
   - `archive.remove(albumId)` / `archive.update(...)` for admin management.
   - `archive.listByMember(clubId, profileId)` — albums where `claimed_by = profileId` and cycle `kind='archive'`, for the profile "Pre-FTR picks" group.
4. Add `kind`, `claimed_by`, `spotify_album_id` to the hand-maintained `Album`/`Cycle` types if they aren't picked up from generated types.

## Phase 3 — Album detail page (`album/[albumId].tsx`)

Make it render cleanly for an archive album (cycle `kind='archive'`):
- **Eyebrow**: show `THE ARCHIVE` instead of `CYCLE n · ALBUM slot`.
- **Rate button**: today gated on `isOpen` (`cycle.status==='open' && !revealed_at`). Add: for archive cycles the rate button is **always** shown (always-open). Compute `const isArchive = cycle?.kind === 'archive'` and `const canRate = isArchive || isOpen`.
- **Claim row**: when archive, show the claimer's avatar + name, or a **"Claim — were you the one who picked this?"** button (calls `archive.claim`). Show release affordance to the current claimer; admins get a reassign control.
- The reveal/checklist block already works (archive is revealed → shows everyone's reviews immediately). The "Submitted (n/members)" checklist is irrelevant for archive — branch to skip it and just show reviews under a "Reviews" label.

## Phase 4 — Rate screen (`rate/[albumId].tsx`)

The `locked` computation at line 77 locks any closed/revealed cycle — which would lock every archive album. Change to:
```
setLocked(!!c && c.kind !== 'archive' && (c.status !== 'open' || !!c.revealed_at));
```
The "both albums rated → bounce to the other slot" logic (line ~196) assumes 2 slots; guard it behind `!isArchive` so archive ratings just save and return.

## Phase 5 — History tab section (`(tabs)/history.tsx`)

- Fetch `archive.list(clubId)` alongside the existing closed/favorites/showdowns loads.
- Render a **distinct "The Archive" section pinned at the bottom**, only when the list is non-empty. Card grid: artwork, title · artist, claimer avatar **or** a "Claim" chip when unclaimed, club avg score. Card → existing `album/[albumId]` detail page.
- Unclaimed-first then alphabetical-by-artist (already sorted by the query).

## Phase 6 — Admin "Add to Archive" (generic, reusable)

- A screen/section reachable from club settings: a **single Spotify album search** (reuse the `searchAlbums` flow already used by `pick-albums.tsx` / `SongSearchField`) → pick a result → `archive.add(...)`.
- Admin-only (mirror existing settings gating). On dedup collision, show the RPC's friendly "already in the Archive" message.
- Admin management: edit a mis-matched album's Spotify link/artwork, delete an archive album (cascades its reviews). Members can't edit/delete — only claim/release + review.

## Phase 7 — Member profile (`member/[profileId].tsx`)

- Add a grouped **"Pre-FTR picks"** sub-section fed by `archive.listByMember`, visually separated from the cycle-earned picks (which now exclude archive via the Phase-2 `set_by`+`kind` filter).
- Claims are cosmetic: **no** contribution to numeric/competitive stats, leaderboards, or streaks. Display only.

## Phase 8 — Seeding script (your ~90 albums, one-off)

A Node/ts script (e.g. `scripts/seed-archive.ts`, following the Pindejos tooling pattern from memory) that:
1. Parses the 90 lines into `{artist, title}` (split on first ` - `; manually fix the wrapped "Dominic Fike – What Could Possibly Go Wrong" line and any em-dash cases).
2. Auto-matches each via the `spotify-search` Edge Function (`searchAlbums`), taking the top hit → `spotify_url`, `artwork_url`, `year`, `tracks`, `spotify_album_id`.
3. Emits a **reviewable JSON/CSV** of matches. You hand-correct the ~10–15 ambiguous ones (self-titled albums like "Led Zeppelin – Led Zeppelin", "King Gizzard – Quarters" full title, live/deluxe editions).
4. **Skips** any album already done in a real (standard) cycle in your club, reporting the skips (import↔cycle dedup).
5. Inserts the corrected rows via `add_archive_album` into your club's archive cycle.

Not an in-app bulk importer — the script is the only bulk path; the admin screen handles one-at-a-time additions for everyone.

## Notifications

**Fully silent.** No pushes for import, add, claim, or review. No new preference category.

## Stats / dedup invariants (the guardrails)

- Archive reviews: **included** in per-album average; **excluded** from cycle leaderboards/streaks.
- Archive claims: cosmetic identity only; **excluded** from competitive stats.
- Dedup: archive↔archive hard-blocked (partial unique index); import↔existing-cycle skipped by the script; a future real cycle re-picking an archived album is **never blocked** — both rows coexist.

## Docs to update

- `context/database-schema.md` — the `cycles.kind`, `albums.claimed_by`, `albums.spotify_album_id` columns, the archive RPCs, and the relaxed slot constraint (schema-snapshot lesson: keep this in sync with the migration).
- `PLAN.md` — add an "Archive" row to the feature decisions table.

## Build order

Phase 1 (schema) → 2 (db layer) → 3–5 (read/render: detail, rate, history) → 8 (seed
your data, exercise the whole read path with real albums) → 6 (admin add) → 7 (profile).
Ship 1–5 + 8 first; that's the full experience for your club. 6–7 are the generic
polish.
