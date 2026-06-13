-- Song Notes: a personal, per-track listening scratchpad.
--
-- Distinct from `ratings` (the formal, sealed-until-reveal *album* score). Song
-- notes are PRIVATE by default and editable any time — including for past,
-- closed cycles — because they're where a member jots thoughts on each track
-- while listening. A member can opt to SHARE their notes for a given album with
-- the club; the share is per (album, member), modeled as row-presence in
-- song_note_shares. When shared, the select policy opens that member's notes
-- for that album to fellow club members.

create table public.song_notes (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  track_number integer not null,
  track_name text not null,
  rating integer check (rating is null or rating between 1 and 10),
  thumb text check (thumb is null or thumb in ('up', 'down')),
  comment text check (comment is null or char_length(comment) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (album_id, profile_id, track_number)
);

create index song_notes_album_profile_idx on public.song_notes (album_id, profile_id);

-- Presence of a row = "I have shared my song notes for this album with the club."
create table public.song_note_shares (
  album_id uuid not null references public.albums (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (album_id, profile_id)
);

-- ═══════════════════════════════════════════════════════
-- RLS — song_notes
-- ═══════════════════════════════════════════════════════

alter table public.song_notes enable row level security;

-- Read: your own notes always; another member's notes only once they've shared
-- that album AND you're a member of the album's club.
create policy song_notes_select on public.song_notes
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1
      from song_note_shares s
      join albums a on a.id = s.album_id
      join cycles c on c.id = a.cycle_id
      where s.album_id = song_notes.album_id
        and s.profile_id = song_notes.profile_id
        and public.is_club_member(c.club_id)
    )
  );

-- Write: only your own notes, only as a member of the album's club. NOT gated to
-- an open cycle — personal notes stay editable across past cycles.
create policy song_notes_insert on public.song_notes
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id and public.is_club_member(c.club_id)
    )
  );

create policy song_notes_update on public.song_notes
  for update to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id and public.is_club_member(c.club_id)
    )
  );

create policy song_notes_delete on public.song_notes
  for delete to authenticated
  using (profile_id = auth.uid());

-- ═══════════════════════════════════════════════════════
-- RLS — song_note_shares
-- ═══════════════════════════════════════════════════════

alter table public.song_note_shares enable row level security;

-- Read: any member of the album's club may see who has shared (powers the
-- "show others' notes" affordance in the Song Notes tab).
create policy song_note_shares_select on public.song_note_shares
  for select to authenticated
  using (
    exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id and public.is_club_member(c.club_id)
    )
  );

-- Write: only your own share row, only as a member of the album's club.
create policy song_note_shares_insert on public.song_note_shares
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id and public.is_club_member(c.club_id)
    )
  );

create policy song_note_shares_delete on public.song_note_shares
  for delete to authenticated
  using (profile_id = auth.uid());
