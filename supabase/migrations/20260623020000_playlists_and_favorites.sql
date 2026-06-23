-- v4 Phase 5: end-of-cycle playlists.
--
-- On cycle close, the cycle-highlights Edge Function (owner's Spotify token,
-- service role) builds two playlists:
--   • a per-cycle "Cycle N Highlights" playlist (the combined-signal top songs)
--   • the club's ongoing "All-Time Favorites" playlist, which gains the cycle's
--     top 1–3 songs each close.
-- Playlist pointers live on cycles/clubs (member-readable). The enshrined songs
-- are also recorded in club_favorite_tracks so an all-time list works even with
-- no Spotify connection. close_cycle now also publishes a 'cycle_closed' event.

-- ── Playlist pointers ────────────────────────────────────────────────────────
alter table public.cycles add column spotify_highlights_playlist_id text;
alter table public.cycles add column spotify_highlights_playlist_url text;

alter table public.clubs add column spotify_favorites_playlist_id text;
alter table public.clubs add column spotify_favorites_playlist_url text;

-- ── All-time favorites (one row per enshrined track) ─────────────────────────
create table public.club_favorite_tracks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  cycle_id uuid references public.cycles (id) on delete set null,
  title text not null,
  artist text,
  spotify_uri text,
  source text check (source is null or source in ('album', 'feed')),
  added_at timestamptz not null default now()
);

create index club_favorite_tracks_club_idx on public.club_favorite_tracks (club_id, added_at desc);
-- Never enshrine the same track twice for a club.
create unique index club_favorite_tracks_uri_idx
  on public.club_favorite_tracks (club_id, spotify_uri)
  where spotify_uri is not null;

alter table public.club_favorite_tracks enable row level security;

-- Members read their club's favorites. Writes happen ONLY via the Edge Function
-- (service role, bypasses RLS) — no client insert/update/delete policy.
create policy club_favorite_tracks_select on public.club_favorite_tracks
  for select to authenticated using (public.is_club_member(club_id));

-- ── close_cycle: also announce the wrap on the activity feed ─────────────────
create or replace function public.close_cycle(p_cycle uuid)
returns public.cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'Cycle is already closed';
  end if;
  update cycles
  set status = 'closed',
      closed_at = now(),
      revealed_at = coalesce(revealed_at, now())
  where id = p_cycle
  returning * into v_cycle;

  perform public.publish_activity_event(
    v_cycle.club_id, 'cycle_closed',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', v_cycle.id)
  );

  return v_cycle;
end;
$$;

revoke execute on function public.close_cycle(uuid) from anon, public;
