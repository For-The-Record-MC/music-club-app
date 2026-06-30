-- Musical Takes: a standing, club-scoped wall of hot takes.
-- A take is one short opinion; members register a position on a 5-point
-- agree↔disagree scale (-2..2, 0 = neutral) and discuss in comments. Unlike the
-- per-cycle contests, takes never close — they're an evergreen room in the
-- Clubhouse hub. Reactions are deliberately omitted (the position scale is the
-- only signal). Mirrors the feed_posts/post_reactions/post_comments spine; no
-- RPCs — direct upserts under RLS, the same pattern as post_reactions.

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

create table public.musical_takes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);

create index musical_takes_club_idx on public.musical_takes (club_id, created_at desc);

-- One position per member per take. value is the 5-point scale:
-- -2 strongly disagree, -1 disagree, 0 neutral, 1 agree, 2 strongly agree.
-- Clearing a position is a DELETE (there is no "no opinion" sentinel — absence
-- of a row is exactly that).
create table public.musical_take_positions (
  id uuid primary key default gen_random_uuid(),
  take_id uuid not null references public.musical_takes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  value smallint not null check (value between -2 and 2),
  created_at timestamptz not null default now(),
  unique (take_id, profile_id)
);

create index musical_take_positions_take_idx on public.musical_take_positions (take_id);

-- Comment thread per take. Mirrors post_comments exactly.
create table public.musical_take_comments (
  id uuid primary key default gen_random_uuid(),
  take_id uuid not null references public.musical_takes (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index musical_take_comments_take_idx on public.musical_take_comments (take_id, created_at);

-- ═══════════════════════════════════════════════════════
-- RLS — club-scoped; members read, authors write their own, admins moderate
-- ═══════════════════════════════════════════════════════

alter table public.musical_takes enable row level security;
alter table public.musical_take_positions enable row level security;
alter table public.musical_take_comments enable row level security;

create policy musical_takes_select on public.musical_takes
  for select to authenticated using (public.is_club_member(club_id));
create policy musical_takes_insert on public.musical_takes
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_club_member(club_id));
create policy musical_takes_delete on public.musical_takes
  for delete to authenticated
  using (author_id = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));

create policy musical_take_positions_select on public.musical_take_positions
  for select to authenticated
  using (exists (
    select 1 from musical_takes t where t.id = take_id and public.is_club_member(t.club_id)
  ));
create policy musical_take_positions_write on public.musical_take_positions
  for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (select 1 from musical_takes t where t.id = take_id and public.is_club_member(t.club_id))
  );

create policy musical_take_comments_select on public.musical_take_comments
  for select to authenticated
  using (exists (
    select 1 from musical_takes t where t.id = take_id and public.is_club_member(t.club_id)
  ));
create policy musical_take_comments_insert on public.musical_take_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from musical_takes t where t.id = take_id and public.is_club_member(t.club_id))
  );
create policy musical_take_comments_delete on public.musical_take_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from musical_takes t where t.id = take_id and public.club_role(t.club_id) in ('owner', 'admin'))
  );
