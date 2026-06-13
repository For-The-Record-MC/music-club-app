-- Phase 4: the social layer.
-- feed_posts (one feed, doubles as the album-suggestion backlog) + reactions +
-- comments, concerts + interest, and the activity feed (events + read marks).

-- ═══════════════════════════════════════════════════════
-- FEED
-- ═══════════════════════════════════════════════════════

create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'track' check (kind in ('track', 'album', 'playlist')),
  title text not null check (char_length(trim(title)) between 1 and 300),
  artist text not null default '',
  url text,
  platform text not null default 'other' check (platform in ('spotify', 'apple', 'other')),
  note text check (note is null or char_length(note) <= 2000),
  is_album_suggestion boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index feed_posts_club_idx on public.feed_posts (club_id, created_at desc);
create index feed_posts_suggestion_idx on public.feed_posts (club_id) where is_album_suggestion;

create table public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🔥', '😂', '🤔')),
  created_at timestamptz not null default now(),
  unique (post_id, profile_id)
);

create index post_reactions_post_idx on public.post_reactions (post_id);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index post_comments_post_idx on public.post_comments (post_id, created_at);

-- ═══════════════════════════════════════════════════════
-- CONCERTS
-- ═══════════════════════════════════════════════════════

create table public.concerts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  added_by uuid not null references public.profiles (id) on delete cascade,
  artist text not null check (char_length(trim(artist)) between 1 and 200),
  concert_date date,
  venue text,
  price text,
  ticket_url text,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index concerts_club_idx on public.concerts (club_id, concert_date);

create table public.concert_interest (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (concert_id, profile_id)
);

create index concert_interest_concert_idx on public.concert_interest (concert_id);

-- ═══════════════════════════════════════════════════════
-- ACTIVITY FEED — event rows; display text rendered client-side from payload
-- ═══════════════════════════════════════════════════════

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_events_club_idx on public.activity_events (club_id, created_at desc);

-- One read-marker per (club, member); the unread badge counts events newer
-- than last_read_at.
create table public.activity_reads (
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (club_id, profile_id)
);

-- Transactional publish helper. Called inside lifecycle RPCs and from the app
-- for member-driven events. security definer so it can write regardless of the
-- caller's direct insert rights, but it pins actor to auth.uid().
create or replace function public.publish_activity_event(
  p_club uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_events (club_id, actor_id, event_type, payload)
  values (p_club, auth.uid(), p_type, coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- Mark the club's feed read up to now.
create or replace function public.mark_activity_read(p_club uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  insert into activity_reads (club_id, profile_id, last_read_at)
  values (p_club, auth.uid(), now())
  on conflict (club_id, profile_id) do update set last_read_at = now();
end;
$$;

revoke execute on function public.publish_activity_event(uuid, text, jsonb) from anon, public;
revoke execute on function public.mark_activity_read(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- WIRE EVENTS INTO EXISTING LIFECYCLE RPCs
-- ═══════════════════════════════════════════════════════

create or replace function public.spin_wheel(p_club uuid)
returns public.cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_picker uuid;
  v_cycle public.cycles;
  v_name text;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  if exists (select 1 from cycles where club_id = p_club and status = 'open') then
    raise exception 'A cycle is already open';
  end if;

  select pool into v_picker
  from public.wheel_pool(p_club) as pool
  order by random()
  limit 1;
  if v_picker is null then
    raise exception 'No eligible members to pick from';
  end if;

  insert into cycles (club_id, number, picker_id, status, start_date)
  values (
    p_club,
    (select coalesce(max(number), 0) + 1 from cycles where club_id = p_club),
    v_picker,
    'open',
    current_date
  )
  returning * into v_cycle;

  select display_name into v_name from profiles where id = v_picker;
  perform public.publish_activity_event(
    p_club, 'wheel_spun',
    jsonb_build_object('cycle_number', v_cycle.number, 'picker_id', v_picker, 'picker_name', v_name)
  );

  return v_cycle;
end;
$$;

create or replace function public.reveal_cycle(p_cycle uuid)
returns public.cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
  v_was timestamptz;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  v_was := v_cycle.revealed_at;
  update cycles set revealed_at = coalesce(revealed_at, now())
  where id = p_cycle
  returning * into v_cycle;

  if v_was is null then
    perform public.publish_activity_event(
      v_cycle.club_id, 'ratings_revealed',
      jsonb_build_object('cycle_number', v_cycle.number)
    );
  end if;
  return v_cycle;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- RLS — all club-scoped, members read, sensible write rules
-- ═══════════════════════════════════════════════════════

alter table public.feed_posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;
alter table public.concerts enable row level security;
alter table public.concert_interest enable row level security;
alter table public.activity_events enable row level security;
alter table public.activity_reads enable row level security;

create policy feed_posts_select on public.feed_posts
  for select to authenticated using (public.is_club_member(club_id));
create policy feed_posts_insert on public.feed_posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_club_member(club_id));
create policy feed_posts_delete on public.feed_posts
  for delete to authenticated
  using (author_id = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));

create policy post_reactions_select on public.post_reactions
  for select to authenticated
  using (exists (
    select 1 from feed_posts p where p.id = post_id and public.is_club_member(p.club_id)
  ));
create policy post_reactions_write on public.post_reactions
  for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (select 1 from feed_posts p where p.id = post_id and public.is_club_member(p.club_id))
  );

create policy post_comments_select on public.post_comments
  for select to authenticated
  using (exists (
    select 1 from feed_posts p where p.id = post_id and public.is_club_member(p.club_id)
  ));
create policy post_comments_insert on public.post_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from feed_posts p where p.id = post_id and public.is_club_member(p.club_id))
  );
create policy post_comments_delete on public.post_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from feed_posts p where p.id = post_id and public.club_role(p.club_id) in ('owner', 'admin'))
  );

create policy concerts_select on public.concerts
  for select to authenticated using (public.is_club_member(club_id));
create policy concerts_insert on public.concerts
  for insert to authenticated
  with check (added_by = auth.uid() and public.is_club_member(club_id));
create policy concerts_delete on public.concerts
  for delete to authenticated
  using (added_by = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));

create policy concert_interest_select on public.concert_interest
  for select to authenticated
  using (exists (
    select 1 from concerts c where c.id = concert_id and public.is_club_member(c.club_id)
  ));
create policy concert_interest_write on public.concert_interest
  for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (select 1 from concerts c where c.id = concert_id and public.is_club_member(c.club_id))
  );

create policy activity_events_select on public.activity_events
  for select to authenticated using (public.is_club_member(club_id));
-- No direct insert policy: events are written only via publish_activity_event
-- (security definer). Members never INSERT here directly.

create policy activity_reads_select on public.activity_reads
  for select to authenticated using (profile_id = auth.uid());
-- Writes go through mark_activity_read (security definer).
