-- Convince Me: a standing artist-recommendation board.
-- A post pitches one artist with exactly three starter tracks + a blurb, aimed
-- at specific members ("who's this for"). Each target can return a verdict —
-- Converted or Not for me — which feeds the author's "Convinced N" profile stat.
-- A standing room like Musical Takes (never closes); club-scoped throughout.
--
-- Posts are created through create_convince_post (post + 3 tracks + targets +
-- activity events, atomically); verdicts through set_convince_verdict. Comments
-- mirror post_comments. Both RPCs are security definer and pin the actor.

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

create table public.convince_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  artist_name text not null check (char_length(trim(artist_name)) between 1 and 200),
  artist_image_url text,
  artist_ref text, -- spotify artist id/url, when resolved via search
  blurb text not null check (char_length(trim(blurb)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index convince_posts_club_idx on public.convince_posts (club_id, created_at desc);
create index convince_posts_author_idx on public.convince_posts (author_id);

-- Exactly three starter tracks per post (enforced in create_convince_post).
create table public.convince_tracks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.convince_posts (id) on delete cascade,
  position smallint not null check (position in (1, 2, 3)),
  title text not null check (char_length(trim(title)) between 1 and 300),
  artist text not null default '',
  artwork_url text,
  spotify_url text,
  apple_url text,
  norm_key text not null default '',
  unique (post_id, position)
);

create index convince_tracks_post_idx on public.convince_tracks (post_id);

-- The members a post is aimed at, plus their verdict (null = no response yet).
create table public.convince_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.convince_posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  verdict text check (verdict in ('converted', 'not_for_me')),
  created_at timestamptz not null default now(),
  unique (post_id, profile_id)
);

create index convince_targets_post_idx on public.convince_targets (post_id);
create index convince_targets_profile_idx on public.convince_targets (profile_id);

-- Comment thread per post. Mirrors post_comments.
create table public.convince_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.convince_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index convince_comments_post_idx on public.convince_comments (post_id, created_at);

-- ═══════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════

-- Create a rec atomically: the post, its three tracks, its targets, a broadcast
-- discovery event, and one targeted push event per aimed-at member. Pins the
-- author to auth.uid(). p_tracks is a 3-element json array of
-- {title, artist, artwork_url, spotify_url, apple_url, norm_key}.
create or replace function public.create_convince_post(
  p_club uuid,
  p_artist_name text,
  p_artist_image text,
  p_artist_ref text,
  p_blurb text,
  p_tracks jsonb,
  p_targets uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_post uuid;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  if jsonb_array_length(coalesce(p_tracks, '[]'::jsonb)) <> 3 then
    raise exception 'Exactly 3 tracks are required';
  end if;

  insert into convince_posts (club_id, author_id, artist_name, artist_image_url, artist_ref, blurb)
  values (p_club, v_actor, p_artist_name, nullif(p_artist_image, ''), nullif(p_artist_ref, ''), p_blurb)
  returning id into v_post;

  insert into convince_tracks (post_id, position, title, artist, artwork_url, spotify_url, apple_url, norm_key)
  select
    v_post,
    ord::smallint,
    t->>'title',
    coalesce(t->>'artist', ''),
    nullif(t->>'artwork_url', ''),
    nullif(t->>'spotify_url', ''),
    nullif(t->>'apple_url', ''),
    coalesce(t->>'norm_key', '')
  from jsonb_array_elements(p_tracks) with ordinality as e(t, ord);

  insert into convince_targets (post_id, profile_id)
  select v_post, r
  from unnest(p_targets) as r
  where r <> v_actor
    and exists (select 1 from club_members m where m.club_id = p_club and m.profile_id = r)
  on conflict (post_id, profile_id) do nothing;

  -- Broadcast discovery event (social category — bell + hub, no push by default).
  insert into activity_events (club_id, actor_id, event_type, payload)
  values (
    p_club, v_actor, 'convince_post',
    jsonb_build_object(
      'post_id', v_post,
      'artist', p_artist_name,
      'target_count', coalesce(array_length(p_targets, 1), 0)
    )
  );

  -- One targeted event per aimed-at member (mentions category — direct push).
  insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
  select p_club, v_actor, t.profile_id, 'convince_target',
    jsonb_build_object('post_id', v_post, 'artist', p_artist_name)
  from convince_targets t
  where t.post_id = v_post;

  return v_post;
end;
$$;

-- A target records (or changes) their verdict on a rec aimed at them.
create or replace function public.set_convince_verdict(p_post uuid, p_verdict text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_verdict is not null and p_verdict not in ('converted', 'not_for_me') then
    raise exception 'Invalid verdict';
  end if;
  update convince_targets
  set verdict = p_verdict
  where post_id = p_post and profile_id = auth.uid();
  if not found then
    raise exception 'You are not a target of this rec';
  end if;
end;
$$;

revoke execute on function public.create_convince_post(uuid, text, text, text, text, jsonb, uuid[]) from anon, public;
revoke execute on function public.set_convince_verdict(uuid, text) from anon, public;

-- ═══════════════════════════════════════════════════════
-- RLS — club-scoped reads; posts/verdicts go through the RPCs (security
-- definer), so the tables get no direct insert/update policy.
-- ═══════════════════════════════════════════════════════

alter table public.convince_posts enable row level security;
alter table public.convince_tracks enable row level security;
alter table public.convince_targets enable row level security;
alter table public.convince_comments enable row level security;

create policy convince_posts_select on public.convince_posts
  for select to authenticated using (public.is_club_member(club_id));
create policy convince_posts_delete on public.convince_posts
  for delete to authenticated
  using (author_id = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));

create policy convince_tracks_select on public.convince_tracks
  for select to authenticated
  using (exists (
    select 1 from convince_posts p where p.id = post_id and public.is_club_member(p.club_id)
  ));

create policy convince_targets_select on public.convince_targets
  for select to authenticated
  using (exists (
    select 1 from convince_posts p where p.id = post_id and public.is_club_member(p.club_id)
  ));

create policy convince_comments_select on public.convince_comments
  for select to authenticated
  using (exists (
    select 1 from convince_posts p where p.id = post_id and public.is_club_member(p.club_id)
  ));
create policy convince_comments_insert on public.convince_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from convince_posts p where p.id = post_id and public.is_club_member(p.club_id))
  );
create policy convince_comments_delete on public.convince_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from convince_posts p where p.id = post_id and public.club_role(p.club_id) in ('owner', 'admin'))
  );
