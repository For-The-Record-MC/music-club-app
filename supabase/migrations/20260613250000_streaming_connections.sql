-- v3 Phase C: Spotify connection + per-cycle playlists.
--
-- A club owner connects their Spotify account once per club. We store the OAuth
-- tokens server-side ONLY — the client never reads this table (no select/write
-- policies; RLS denies all, the Edge Functions use the service role). Status and
-- disconnect are exposed through SECURITY DEFINER RPCs that never return tokens.
--
-- Each cycle gets its own public playlist, created lazily by spotify-sync on the
-- first qualifying track post. The playlist id/url live on `cycles` (member-
-- readable) so the app can surface "Listen on Spotify" links; tokens stay locked
-- away in streaming_connections.

create table public.streaming_connections (
  club_id uuid primary key references public.clubs (id) on delete cascade,
  provider text not null default 'spotify',
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  spotify_user_id text,
  display_name text,
  status text not null default 'active' check (status in ('active', 'needs_reconnect')),
  connected_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS on, NO policies: clients can never read/write tokens. Edge Functions reach
-- this table with the service role, which bypasses RLS.
alter table public.streaming_connections enable row level security;

-- Per-cycle playlist pointers (member-readable via the existing cycles select).
alter table public.cycles add column spotify_playlist_id text;
alter table public.cycles add column spotify_playlist_url text;

-- Marks a feed post as already pushed to its cycle's playlist (dedupe / re-sync).
alter table public.feed_posts add column playlist_synced_at timestamptz;

-- Connection status for the app — no tokens. Any member may see whether the club
-- is connected (so links/UI make sense); only the shape below is exposed.
create or replace function public.streaming_status(p_club uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row streaming_connections;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  select * into v_row from streaming_connections where club_id = p_club;
  if not found then
    return json_build_object('connected', false);
  end if;
  return json_build_object(
    'connected', true,
    'provider', v_row.provider,
    'display_name', v_row.display_name,
    'spotify_user_id', v_row.spotify_user_id,
    'status', v_row.status,
    'connected_by', v_row.connected_by
  );
end;
$$;

-- Owner-only disconnect: drop the stored tokens. Existing playlists stay on
-- Spotify and their links keep working; syncing simply stops.
create or replace function public.streaming_disconnect(p_club uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.club_role(p_club) <> 'owner' then
    raise exception 'Only the owner can disconnect streaming';
  end if;
  delete from streaming_connections where club_id = p_club;
end;
$$;
