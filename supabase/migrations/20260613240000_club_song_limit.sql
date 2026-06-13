-- v3 Phase A: per-cycle song-addition limit.
-- The club owner/admin caps how many SONG (kind='track') feed posts each member
-- may add per listening cycle, to encourage posting only favorites. NULL means
-- no cap (the default — existing behavior preserved). The window is the current
-- open cycle: counting starts at the open cycle's created_at; with no open cycle
-- the cap is dormant (members can post freely between cycles).

alter table public.clubs
  add column song_limit_per_cycle int
    check (song_limit_per_cycle is null or song_limit_per_cycle >= 1);

-- Server-side enforcement: reject a track post that would exceed the cap.
-- security definer so the count sees all of the author's posts regardless of the
-- caller's RLS view (it only ever counts the caller's own rows anyway).
create or replace function public.enforce_song_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_limit int;
  v_cycle_start timestamptz;
  v_count int;
begin
  if new.kind <> 'track' then
    return new;  -- only songs are capped
  end if;

  select song_limit_per_cycle into v_limit from clubs where id = new.club_id;
  if v_limit is null then
    return new;  -- unlimited
  end if;

  select created_at into v_cycle_start
  from cycles
  where club_id = new.club_id and status = 'open'
  limit 1;
  if v_cycle_start is null then
    return new;  -- no open cycle → cap dormant
  end if;

  select count(*) into v_count
  from feed_posts
  where club_id = new.club_id
    and author_id = new.author_id
    and kind = 'track'
    and created_at >= v_cycle_start;

  if v_count >= v_limit then
    raise exception 'You''ve hit this cycle''s limit of % song(s).', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger feed_posts_song_limit
  before insert on public.feed_posts
  for each row execute function public.enforce_song_limit();

-- The same window/count logic, surfaced to the client so the composer can show
-- "X of N songs left this cycle" without duplicating the rule. Returns the cap,
-- how many the caller has used, and whether a cycle is currently open.
create or replace function public.my_song_quota(p_club uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_limit int;
  v_cycle_start timestamptz;
  v_used int := 0;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;

  select song_limit_per_cycle into v_limit from clubs where id = p_club;

  select created_at into v_cycle_start
  from cycles
  where club_id = p_club and status = 'open'
  limit 1;

  if v_cycle_start is not null then
    select count(*) into v_used
    from feed_posts
    where club_id = p_club
      and author_id = auth.uid()
      and kind = 'track'
      and created_at >= v_cycle_start;
  end if;

  return json_build_object(
    'limit', v_limit,
    'used', v_used,
    'has_open_cycle', v_cycle_start is not null
  );
end;
$$;
