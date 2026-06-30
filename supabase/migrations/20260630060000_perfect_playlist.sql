-- The Perfect Playlist: a per-cycle, collaborative themed playlist.
-- The picker kicks it off with a theme + a seed song; every member then adds up
-- to three songs toward the vibe (e.g. "Roadtrip", "Beach Day"). No voting, no
-- winner — the assembled playlist IS the payoff. It rides the cycle lifecycle
-- like the Showdown: adds are allowed only while the cycle is open, and it
-- freezes (nothing to crown) at close. Auto-synced to its own Spotify playlist.
--
-- Mirrors the Showdown spine. Songs dedup across the whole playlist by norm_key
-- (reusing public.showdown_norm). RPCs are security definer and pin the actor.

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

-- One optional playlist per cycle. spotify_playlist_id/url are filled lazily by
-- the perfect-playlist sync (its OWN playlist, distinct from the cycle feed's).
create table public.perfect_playlists (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.cycles (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  theme_text text not null check (char_length(trim(theme_text)) between 1 and 140),
  created_by uuid not null references public.profiles (id),
  spotify_playlist_id text,
  spotify_playlist_url text,
  created_at timestamptz not null default now()
);

create index perfect_playlists_club_idx on public.perfect_playlists (club_id);

-- Up to three songs per member (enforced in add_perfect_playlist_song). norm_key
-- blocks duplicates across the whole playlist, first-come-first-served.
-- playlist_synced_at marks a song already pushed to Spotify.
create table public.perfect_playlist_songs (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.perfect_playlists (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 300),
  artist text not null default '',
  artwork_url text,
  spotify_url text,
  apple_url text,
  norm_key text not null,
  playlist_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (playlist_id, norm_key)
);

create index perfect_playlist_songs_playlist_idx on public.perfect_playlist_songs (playlist_id, created_at);

-- ═══════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════

-- Kick off the cycle's playlist: the picker (or an admin) sets the theme and the
-- seed song. The seed counts as the picker's first of three contributions.
create or replace function public.start_perfect_playlist(
  p_cycle uuid,
  p_theme text,
  p_title text,
  p_artist text default '',
  p_artwork_url text default null,
  p_spotify_url text default null,
  p_apple_url text default null
)
returns public.perfect_playlists
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
  v_playlist public.perfect_playlists;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'The cycle is closed';
  end if;
  if v_cycle.picker_id <> auth.uid()
     and public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Only the picker or an admin can start the playlist';
  end if;
  if char_length(trim(coalesce(p_theme, ''))) = 0 then
    raise exception 'Theme cannot be empty';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'A seed song is required';
  end if;
  if exists (select 1 from perfect_playlists where cycle_id = p_cycle) then
    raise exception 'The playlist has already been started';
  end if;

  insert into perfect_playlists (cycle_id, club_id, theme_text, created_by)
  values (p_cycle, v_cycle.club_id, trim(p_theme), auth.uid())
  returning * into v_playlist;

  insert into perfect_playlist_songs
    (playlist_id, profile_id, title, artist, artwork_url, spotify_url, apple_url, norm_key)
  values
    (v_playlist.id, auth.uid(), trim(p_title), coalesce(p_artist, ''),
     p_artwork_url, p_spotify_url, p_apple_url, public.showdown_norm(p_title, p_artist));

  perform public.publish_activity_event(
    v_cycle.club_id, 'perfect_playlist_started',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', p_cycle, 'theme', v_playlist.theme_text)
  );

  return v_playlist;
end;
$$;

-- Add one song to the playlist. Any member, while the cycle is open; capped at
-- three per member; duplicates (by norm_key, across the whole playlist) rejected
-- first-come-first-served.
create or replace function public.add_perfect_playlist_song(
  p_playlist uuid,
  p_title text,
  p_artist text default '',
  p_artwork_url text default null,
  p_spotify_url text default null,
  p_apple_url text default null
)
returns public.perfect_playlist_songs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_status text;
  v_norm text;
  v_mine integer;
  v_row public.perfect_playlist_songs;
begin
  select c.club_id, c.status into v_club, v_status
  from perfect_playlists pp join cycles c on c.id = pp.cycle_id
  where pp.id = p_playlist;
  if not found then
    raise exception 'Playlist not found';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;
  if v_status <> 'open' then
    raise exception 'The playlist is closed';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'A song title is required';
  end if;

  select count(*) into v_mine
  from perfect_playlist_songs where playlist_id = p_playlist and profile_id = auth.uid();
  if v_mine >= 3 then
    raise exception 'You have already added your 3 songs.';
  end if;

  v_norm := public.showdown_norm(p_title, p_artist);
  if exists (select 1 from perfect_playlist_songs where playlist_id = p_playlist and norm_key = v_norm) then
    raise exception 'That song is already on the playlist — pick another.';
  end if;

  insert into perfect_playlist_songs
    (playlist_id, profile_id, title, artist, artwork_url, spotify_url, apple_url, norm_key)
  values
    (p_playlist, auth.uid(), trim(p_title), coalesce(p_artist, ''),
     p_artwork_url, p_spotify_url, p_apple_url, v_norm)
  returning * into v_row;

  return v_row;
end;
$$;

-- Remove one of your own songs (admins may remove any), while the cycle is open.
-- The Spotify copy is reconciled on the next sync (removed songs are dropped by
-- re-pushing is not automatic, so this only affects the in-app list + future
-- adds; a removed track lingers on Spotify until a manual rebuild — acceptable).
create or replace function public.remove_perfect_playlist_song(p_song uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_club uuid;
  v_status text;
begin
  select s.profile_id, c.club_id, c.status into v_owner, v_club, v_status
  from perfect_playlist_songs s
  join perfect_playlists pp on pp.id = s.playlist_id
  join cycles c on c.id = pp.cycle_id
  where s.id = p_song;
  if not found then
    return;
  end if;
  if v_status <> 'open' then
    raise exception 'The playlist is closed';
  end if;
  if v_owner <> auth.uid() and public.club_role(v_club) not in ('owner', 'admin') then
    raise exception 'You can only remove your own songs';
  end if;
  delete from perfect_playlist_songs where id = p_song;
end;
$$;

revoke execute on function public.start_perfect_playlist(uuid, text, text, text, text, text, text) from anon, public;
revoke execute on function public.add_perfect_playlist_song(uuid, text, text, text, text, text) from anon, public;
revoke execute on function public.remove_perfect_playlist_song(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- RLS — members read; all writes flow through the security-definer RPCs.
-- ═══════════════════════════════════════════════════════

alter table public.perfect_playlists enable row level security;
alter table public.perfect_playlist_songs enable row level security;

create policy perfect_playlists_select on public.perfect_playlists
  for select to authenticated using (public.is_club_member(club_id));

create policy perfect_playlist_songs_select on public.perfect_playlist_songs
  for select to authenticated
  using (exists (
    select 1 from perfect_playlists pp where pp.id = playlist_id and public.is_club_member(pp.club_id)
  ));
