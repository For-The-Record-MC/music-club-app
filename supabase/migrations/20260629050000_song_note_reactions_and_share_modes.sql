-- Paige feedback Batch C: richer shared song notes.
--
--   • Share mode: a member can now share their album song notes either
--     immediately ('now', the old behavior) or only once the cycle is revealed
--     ('at_reveal'), matching the blind-until-reveal model. Modeled as a column
--     on song_note_shares (row-presence still means "shared").
--   • Reactions: fellow club members can react to a shared song note with
--     support / disagree / love — a lightweight signal that also powers future
--     "top note" detection.

-- ── Share mode ───────────────────────────────────────────────────────────────
alter table public.song_note_shares
  add column mode text not null default 'now' check (mode in ('now', 'at_reveal'));

-- Upserting the share row to flip its mode needs UPDATE (only INSERT/DELETE
-- existed before). Own row only, as a club member of the album's club.
create policy song_note_shares_update on public.song_note_shares
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

-- Re-create the song_notes read policy so an 'at_reveal' share stays hidden
-- until the album's cycle is revealed. ('now' shares behave exactly as before;
-- your own notes are always visible to you.)
drop policy if exists song_notes_select on public.song_notes;
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
        and (s.mode = 'now' or c.revealed_at is not null)
    )
  );

-- ── Reactions on shared notes ────────────────────────────────────────────────
create table public.song_note_reactions (
  id uuid primary key default gen_random_uuid(),
  song_note_id uuid not null references public.song_notes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  value text not null check (value in ('support', 'disagree', 'love')),
  created_at timestamptz not null default now(),
  unique (song_note_id, profile_id)
);

create index song_note_reactions_note_idx on public.song_note_reactions (song_note_id);

alter table public.song_note_reactions enable row level security;

-- Read: any member of the note's club (so counts render for everyone).
create policy song_note_reactions_select on public.song_note_reactions
  for select to authenticated
  using (
    exists (
      select 1 from song_notes n
      join albums a on a.id = n.album_id
      join cycles c on c.id = a.cycle_id
      where n.id = song_note_reactions.song_note_id
        and public.is_club_member(c.club_id)
    )
  );

-- Write: only your own reaction, only on a note in a club you belong to.
create policy song_note_reactions_insert on public.song_note_reactions
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from song_notes n
      join albums a on a.id = n.album_id
      join cycles c on c.id = a.cycle_id
      where n.id = song_note_id and public.is_club_member(c.club_id)
    )
  );

create policy song_note_reactions_update on public.song_note_reactions
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy song_note_reactions_delete on public.song_note_reactions
  for delete to authenticated
  using (profile_id = auth.uid());
