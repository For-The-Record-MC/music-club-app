-- Spotify guardrails, after the 2026-07-12 outage: a ~150-search burst (theme
-- seeding tests) tripped Spotify's extended rate penalty and benched the whole
-- dev-mode app for ~18 hours (429 + Retry-After ≈ 64,000s on every call).
-- In-memory circuit breakers aren't enough — Edge Function workers don't share
-- state, so each one had to eat its own 429 to learn. This migration makes the
-- protection structural:
--
-- • spotify_api_state — one row: a rolling hourly call budget (no combination
--   of features can burst past Spotify's penalty threshold again) and a
--   persisted bench deadline (the FIRST 429 anywhere short-circuits every
--   worker of every function until the window passes).
-- • spotify_track_cache — resolved (artist|title) → Spotify track metadata.
--   Resolutions never change, and tag fields repeat across clubs (every club's
--   "shoegaze" is the same songs), so repeat seedings cost ~zero searches.
--
-- Both tables are service-role only (RLS on, no policies; RPCs granted to
-- service_role) — clients never touch them.

create table public.spotify_api_state (
  id boolean primary key default true,
  constraint spotify_api_state_singleton check (id),
  benched_until timestamptz,
  window_start timestamptz not null default now(),
  window_calls integer not null default 0
);

insert into public.spotify_api_state (id) values (true);

create table public.spotify_track_cache (
  key text primary key, -- normalized "artist|title"
  miss boolean not null default false, -- searched before, nothing matched
  spotify_id text not null default '',
  title text not null default '',
  album text not null default '',
  artwork_url text,
  spotify_url text,
  resolved_at timestamptz not null default now()
);

alter table public.spotify_api_state enable row level security;
alter table public.spotify_track_cache enable row level security;

-- Reserve p_calls from the hourly budget, or say why not. The cap is sized so
-- one bracket seeding (~115 worst case) plus normal search traffic fits, but a
-- second seeding in the same hour waits — brackets are rare; the quota is not.
create or replace function public.spotify_acquire(p_calls int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.spotify_api_state;
  v_cap constant int := 200;
begin
  select * into v_state from spotify_api_state where id for update;
  if v_state.benched_until is not null and v_state.benched_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'benched', 'until', v_state.benched_until);
  end if;
  if v_state.window_start < now() - interval '1 hour' then
    update spotify_api_state set window_start = now(), window_calls = 0 where id;
    v_state.window_calls := 0;
    v_state.window_start := now();
  end if;
  if v_state.window_calls + p_calls > v_cap then
    return jsonb_build_object(
      'ok', false, 'reason', 'budget',
      'until', v_state.window_start + interval '1 hour'
    );
  end if;
  update spotify_api_state set window_calls = window_calls + p_calls where id;
  return jsonb_build_object('ok', true, 'remaining', v_cap - v_state.window_calls - p_calls);
end;
$$;

-- Persist a 429 bench so every worker of every function backs off at once.
-- greatest() keeps the furthest deadline if Spotify extends the penalty.
create or replace function public.spotify_bench(p_seconds int)
returns void
language sql
security definer
set search_path = public
as $$
  update spotify_api_state
  set benched_until = greatest(
    coalesce(benched_until, now()),
    now() + make_interval(secs => least(greatest(p_seconds, 0), 86400))
  )
  where id;
$$;

create or replace function public.spotify_cache_get(p_keys text[])
returns setof public.spotify_track_cache
language sql
stable
security definer
set search_path = public
as $$
  select * from spotify_track_cache where key = any(p_keys);
$$;

-- Upsert resolutions (hits AND attempted misses — a title Spotify can't match
-- shouldn't be re-searched every seeding).
create or replace function public.spotify_cache_put(p_rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into spotify_track_cache (key, miss, spotify_id, title, album, artwork_url, spotify_url)
  select
    r ->> 'key',
    coalesce((r ->> 'miss')::boolean, false),
    coalesce(r ->> 'spotify_id', ''),
    coalesce(r ->> 'title', ''),
    coalesce(r ->> 'album', ''),
    nullif(r ->> 'artwork_url', ''),
    nullif(r ->> 'spotify_url', '')
  from jsonb_array_elements(p_rows) as r
  where coalesce(r ->> 'key', '') <> ''
  on conflict (key) do update set
    miss = excluded.miss,
    spotify_id = excluded.spotify_id,
    title = excluded.title,
    album = excluded.album,
    artwork_url = excluded.artwork_url,
    spotify_url = excluded.spotify_url,
    resolved_at = now();
$$;

revoke execute on function public.spotify_acquire(int) from anon, authenticated, public;
revoke execute on function public.spotify_bench(int) from anon, authenticated, public;
revoke execute on function public.spotify_cache_get(text[]) from anon, authenticated, public;
revoke execute on function public.spotify_cache_put(jsonb) from anon, authenticated, public;
grant execute on function public.spotify_acquire(int) to service_role;
grant execute on function public.spotify_bench(int) to service_role;
grant execute on function public.spotify_cache_get(text[]) to service_role;
grant execute on function public.spotify_cache_put(jsonb) to service_role;
