-- Spotify: app-account fallback for everyone except a personal-connect allowlist.
--
-- Until now every club owner connected their OWN Spotify on the Streaming screen,
-- and spotify-sync used that per-club token. We want that to stay true ONLY for a
-- small allowlist (Jordan + Tim), who keep connecting their personal accounts to
-- their own clubs. Every other club connects nothing: spotify-sync falls back to
-- a single shared "app" Spotify account (refresh token held as the
-- SPOTIFY_APP_REFRESH_TOKEN Edge secret), which silently creates and owns those
-- clubs' per-cycle playlists.
--
-- This migration only adds the allowlist flag + exposes it through
-- streaming_status. The app-account fallback itself lives in spotify-sync, and
-- the connect gate in spotify-oauth.

-- Who may connect a PERSONAL Spotify account to clubs they own. Everyone else's
-- clubs are served by the shared app account.
alter table public.profiles
  add column if not exists can_use_personal_spotify boolean not null default false;

-- Seed the allowlist. Replace / extend these emails as needed.
update public.profiles
set can_use_personal_spotify = true
where lower(email) in (
  'jordanreticker@gmail.com',
  'treticker@gmail.com'
);

-- streaming_status now also tells the client whether the CURRENT caller (when
-- they own the club) is allowed to connect a personal account. The client uses
-- this to choose between the "Connect Spotify" flow and the read-only
-- "playlists are automatic" message. No tokens are ever returned.
create or replace function public.streaming_status(p_club uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row streaming_connections;
  v_can_connect boolean;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;

  v_can_connect := public.club_role(p_club) = 'owner'
    and coalesce(
      (select can_use_personal_spotify from profiles where id = auth.uid()),
      false
    );

  select * into v_row from streaming_connections where club_id = p_club;
  if not found then
    -- No personal connection. can_connect true → owner may connect; false →
    -- the club is served automatically by the shared app account.
    return json_build_object('connected', false, 'can_connect', v_can_connect);
  end if;
  return json_build_object(
    'connected', true,
    'provider', v_row.provider,
    'display_name', v_row.display_name,
    'spotify_user_id', v_row.spotify_user_id,
    'status', v_row.status,
    'connected_by', v_row.connected_by,
    'can_connect', v_can_connect
  );
end;
$$;
