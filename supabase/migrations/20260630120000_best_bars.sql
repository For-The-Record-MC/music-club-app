-- Best Bars: a standing board of favorite lyrics. A post pins one song (picked
-- via search) + the lyric the member wants to shout out; others rate it 1–10 and
-- discuss in comments. A standing room like Musical Takes / Convince Me (never
-- closes), club-scoped. Mirrors the musical_takes spine — direct writes under RLS,
-- no RPCs.

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

create table public.best_bars (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 300),
  artist text not null default '',
  artwork_url text,
  spotify_url text,
  apple_url text,
  lyric text not null check (char_length(trim(lyric)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index best_bars_club_idx on public.best_bars (club_id, created_at desc);

-- One 1–10 rating per member per bar. Clearing a rating is a DELETE.
create table public.best_bar_ratings (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.best_bars (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  score smallint not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  unique (bar_id, profile_id)
);

create index best_bar_ratings_bar_idx on public.best_bar_ratings (bar_id);

create table public.best_bar_comments (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.best_bars (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index best_bar_comments_bar_idx on public.best_bar_comments (bar_id, created_at);

-- ═══════════════════════════════════════════════════════
-- RLS — club-scoped; members read, authors write their own, admins moderate.
-- ═══════════════════════════════════════════════════════

alter table public.best_bars enable row level security;
alter table public.best_bar_ratings enable row level security;
alter table public.best_bar_comments enable row level security;

create policy best_bars_select on public.best_bars
  for select to authenticated using (public.is_club_member(club_id));
create policy best_bars_insert on public.best_bars
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_club_member(club_id));
create policy best_bars_delete on public.best_bars
  for delete to authenticated
  using (author_id = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));

create policy best_bar_ratings_select on public.best_bar_ratings
  for select to authenticated
  using (exists (
    select 1 from best_bars b where b.id = bar_id and public.is_club_member(b.club_id)
  ));
create policy best_bar_ratings_write on public.best_bar_ratings
  for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (select 1 from best_bars b where b.id = bar_id and public.is_club_member(b.club_id))
  );

create policy best_bar_comments_select on public.best_bar_comments
  for select to authenticated
  using (exists (
    select 1 from best_bars b where b.id = bar_id and public.is_club_member(b.club_id)
  ));
create policy best_bar_comments_insert on public.best_bar_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from best_bars b where b.id = bar_id and public.is_club_member(b.club_id))
  );
create policy best_bar_comments_delete on public.best_bar_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from best_bars b where b.id = bar_id and public.club_role(b.club_id) in ('owner', 'admin'))
  );
