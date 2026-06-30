-- The Archive: a pre-club album shelf.
--
-- Albums the group listened to before the app existed live in ONE special
-- "archive" cycle per club (kind='archive', closed + revealed from birth,
-- number=0). They reuse the albums + ratings spine so reviews, Spotify links,
-- and feed surfacing all work unchanged. Differences from standard albums:
--   • no slot (slot is null) — a club's archive holds N albums, not 2
--   • claimed_by names the member who originally picked it (claimable)
--   • reviews are always-open + always-public (no reveal ritual)
-- The archive cycle is excluded from numbering, the wheel, and all stats.

-- ═══════════════════════════════════════════════════════
-- COLUMNS
-- ═══════════════════════════════════════════════════════

alter table public.cycles
  add column kind text not null default 'standard'
    check (kind in ('standard', 'archive'));

-- The single claimer (the member who picked this back in the pre-app days).
-- null = unclaimed. set_by stays the importer/admin (provenance + not-null).
alter table public.albums
  add column claimed_by uuid references public.profiles (id);

-- The Spotify album id, extracted from spotify_url. The dedup key.
alter table public.albums
  add column spotify_album_id text;

-- ═══════════════════════════════════════════════════════
-- RELAX THE SLOT CONSTRAINT (archive rows have null slots)
-- ═══════════════════════════════════════════════════════

-- Standard cycles keep the two-slot invariant; archive rows opt out with null.
alter table public.albums alter column slot drop not null;

alter table public.albums drop constraint albums_slot_check;
alter table public.albums
  add constraint albums_slot_check check (slot is null or slot in (1, 2));

-- The old table-level unique(cycle_id, slot) rejected nulls fine in theory, but
-- re-express it as a partial index so intent is explicit and archive nulls are
-- unambiguously exempt.
alter table public.albums drop constraint albums_cycle_id_slot_key;
create unique index albums_cycle_slot_uniq
  on public.albums (cycle_id, slot) where slot is not null;

-- Archive dedup: a club can't hold the same Spotify album twice in its archive.
-- Archive rows all share the club's single archive cycle, so cycle_id is
-- effectively the club key here.
create unique index albums_archive_spotify_uniq
  on public.albums (cycle_id, spotify_album_id)
  where slot is null and spotify_album_id is not null;

-- One archive cycle per club.
create unique index cycles_one_archive_idx
  on public.cycles (club_id) where kind = 'archive';

-- ═══════════════════════════════════════════════════════
-- HELPERS
-- ═══════════════════════════════════════════════════════

-- Extract the album id from a Spotify album URL
-- (https://open.spotify.com/album/<id>[?...]). Returns null if it doesn't look
-- like one, so dedup simply doesn't apply to non-Spotify rows.
create or replace function public.spotify_album_id_from_url(p_url text)
returns text
language sql
immutable
as $$
  select (regexp_match(p_url, 'album/([A-Za-z0-9]+)'))[1];
$$;

-- ═══════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════

-- Return the club's archive cycle, creating it lazily on first use. Admin-only.
create or replace function public.get_or_create_archive_cycle(p_club uuid)
returns public.cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;

  select * into v_cycle
  from cycles where club_id = p_club and kind = 'archive';
  if found then
    return v_cycle;
  end if;

  insert into cycles (club_id, number, picker_id, status, kind, revealed_at)
  values (
    p_club,
    0,
    (select owner_id from clubs where id = p_club),
    'closed',
    'archive',
    now()
  )
  returning * into v_cycle;

  return v_cycle;
end;
$$;

-- Add one album to the club's archive. Admin-only. Used by the admin "Add to
-- Archive" screen and the one-off seeding script alike.
create or replace function public.add_archive_album(
  p_club uuid,
  p_title text,
  p_artist text default '',
  p_year integer default null,
  p_artwork_url text default null,
  p_spotify_url text default null,
  p_apple_url text default null,
  p_tracks jsonb default null
)
returns public.albums
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
  v_album public.albums;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;

  v_cycle := public.get_or_create_archive_cycle(p_club);

  begin
    insert into albums (
      cycle_id, slot, title, artist, year, artwork_url,
      spotify_url, apple_url, tracks, spotify_album_id, set_by
    )
    values (
      v_cycle.id, null, trim(p_title), coalesce(p_artist, ''), p_year, p_artwork_url,
      p_spotify_url, p_apple_url, p_tracks,
      public.spotify_album_id_from_url(p_spotify_url), auth.uid()
    )
    returning * into v_album;
  exception when unique_violation then
    raise exception 'That album is already in the Archive';
  end;

  return v_album;
end;
$$;

-- Claim / release / reassign an archive album. Members may only claim an
-- unclaimed album for themselves or release their own claim; admins may set
-- claimed_by to any member (or null). Only ever writes claimed_by.
create or replace function public.claim_archive_album(
  p_album uuid,
  p_profile uuid default null
)
returns public.albums
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_kind text;
  v_current uuid;
  v_is_admin boolean;
  v_album public.albums;
begin
  select c.club_id, c.kind, a.claimed_by
  into v_club, v_kind, v_current
  from albums a
  join cycles c on c.id = a.cycle_id
  where a.id = p_album;
  if not found then
    raise exception 'Album not found';
  end if;
  if v_kind <> 'archive' then
    raise exception 'Not an archive album';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;

  v_is_admin := public.club_role(v_club) in ('owner', 'admin');

  if not v_is_admin then
    -- Member: only null -> self (claim) or self -> null (release).
    p_profile := coalesce(p_profile, auth.uid());
    if not (
      (v_current is null and p_profile = auth.uid())
      or (v_current = auth.uid() and p_profile is null)
    ) then
      raise exception 'You can only claim an unclaimed album or release your own';
    end if;
  else
    -- Admin may assign to any member of the club, or clear.
    if p_profile is not null and not exists (
      select 1 from club_members where club_id = v_club and profile_id = p_profile
    ) then
      raise exception 'That person is not a club member';
    end if;
  end if;

  update albums set claimed_by = p_profile
  where id = p_album
  returning * into v_album;

  return v_album;
end;
$$;

revoke execute on function public.get_or_create_archive_cycle(uuid) from anon, public;
revoke execute on function public.add_archive_album(uuid, text, text, integer, text, text, text, jsonb) from anon, public;
revoke execute on function public.claim_archive_album(uuid, uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════

-- Ratings on archive albums are always-open + always-public: drop the
-- open-cycle requirement for the archive branch (visibility already works
-- because archive cycles carry revealed_at). Insert/update/delete each gain an
-- "or it's an archive album" path.
drop policy ratings_insert on public.ratings;
create policy ratings_insert on public.ratings
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and public.is_club_member(c.club_id)
        and (c.kind = 'archive' or (c.status = 'open' and c.revealed_at is null))
    )
  );

drop policy ratings_update on public.ratings;
create policy ratings_update on public.ratings
  for update to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and public.is_club_member(c.club_id)
        and (c.kind = 'archive' or (c.status = 'open' and c.revealed_at is null))
    )
  );

drop policy ratings_delete on public.ratings;
create policy ratings_delete on public.ratings
  for delete to authenticated
  using (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and (c.kind = 'archive' or (c.status = 'open' and c.revealed_at is null))
    )
  );

-- Admins manage archive albums directly (fix a mis-matched Spotify link, delete
-- an entry). Claiming goes through claim_archive_album; adding goes through
-- add_archive_album (security definer). This policy covers admin update/delete.
-- The existing albums_write policy is untouched (its open-cycle gate can never
-- match an archive row).
create policy albums_archive_manage on public.albums
  for all to authenticated
  using (exists (
    select 1 from cycles c
    where c.id = cycle_id
      and c.kind = 'archive'
      and public.club_role(c.club_id) in ('owner', 'admin')
  ))
  with check (exists (
    select 1 from cycles c
    where c.id = cycle_id
      and c.kind = 'archive'
      and public.club_role(c.club_id) in ('owner', 'admin')
  ));
