-- Phase 3: ratings & the sealed-until-reveal visibility ladder.
--
-- The ladder (server-enforced):
--   (a) before you submit  → only WHO has submitted (via get_album_summary)
--   (b) after you submit   → also the club average score (numbers only)
--   (c) after reveal/close → everything (individual rows open up via RLS)
--
-- Ratings are editable until the cycle closes; reveal happens at the meeting
-- (reveal_cycle RPC, Phase 2) or implicitly on close_cycle.

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null check (score between 1 and 10),
  review text check (review is null or char_length(review) <= 4000),
  favorite_track text,
  favorite_reason text check (favorite_reason is null or char_length(favorite_reason) <= 1000),
  least_track text,
  least_reason text check (least_reason is null or char_length(least_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (album_id, profile_id)
);

create index ratings_album_idx on public.ratings (album_id);

-- ═══════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════

alter table public.ratings enable row level security;

-- Read: your own row always; everyone's rows only once the cycle is revealed.
create policy ratings_select on public.ratings
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1
      from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and c.revealed_at is not null
        and public.is_club_member(c.club_id)
    )
  );

-- Write: only your own row, only while the cycle is open, only as a member.
create policy ratings_insert on public.ratings
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and c.status = 'open'
        and public.is_club_member(c.club_id)
    )
  );

create policy ratings_update on public.ratings
  for update to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and c.status = 'open'
        and public.is_club_member(c.club_id)
    )
  );

create policy ratings_delete on public.ratings
  for delete to authenticated
  using (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id and c.status = 'open'
    )
  );

-- ═══════════════════════════════════════════════════════
-- GATED SUMMARY RPC — the only pre-reveal window into others' ratings
-- ═══════════════════════════════════════════════════════

-- Returns: who has submitted (social pressure checklist) always; the club
-- average only if the caller has submitted their own rating OR the cycle is
-- revealed. Never individual scores/text pre-reveal.
create or replace function public.get_album_summary(p_album uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_revealed boolean;
  v_submitted uuid[];
  v_mine boolean;
  v_avg numeric;
begin
  select c.club_id, c.revealed_at is not null
  into v_club, v_revealed
  from albums a
  join cycles c on c.id = a.cycle_id
  where a.id = p_album;
  if not found then
    raise exception 'Album not found';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;

  select coalesce(array_agg(profile_id), '{}')
  into v_submitted
  from ratings
  where album_id = p_album;

  v_mine := auth.uid() = any (v_submitted);

  if v_mine or v_revealed then
    select round(avg(score)::numeric, 1) into v_avg
    from ratings
    where album_id = p_album;
  end if;

  return json_build_object(
    'submitted', coalesce(to_json(v_submitted), '[]'::json),
    'count', coalesce(array_length(v_submitted, 1), 0),
    'avg_score', v_avg,
    'revealed', v_revealed,
    'mine_submitted', v_mine
  );
end;
$$;

revoke execute on function public.get_album_summary(uuid) from anon, public;
