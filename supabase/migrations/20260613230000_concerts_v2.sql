-- Concerts v2: editable posts, optional time, going/interested status,
-- comments, and post-show reviews (mark complete + 1–5 star rating).

-- ═══════════════════════════════════════════════════════
-- CONCERTS — new columns + the missing UPDATE policy
-- ═══════════════════════════════════════════════════════

alter table public.concerts
  add column concert_time time,                                   -- optional, paired with concert_date (which stays the calendar day; null = TBA)
  add column review text check (review is null or char_length(review) <= 2000),
  add column rating integer check (rating is null or rating between 1 and 5),
  add column completed_at timestamptz,                            -- non-null = the show happened; surfaces it in the "Completed" section
  add column updated_at timestamptz not null default now();

-- Edits: the original poster or a club admin, while still a member.
create policy concerts_update on public.concerts
  for update to authenticated
  using (added_by = auth.uid() or public.club_role(club_id) in ('owner', 'admin'))
  with check (public.is_club_member(club_id));

-- ═══════════════════════════════════════════════════════
-- CONCERT INTEREST — interested vs going
-- ═══════════════════════════════════════════════════════

-- Existing rows were all plain "interested"; that's the default.
alter table public.concert_interest
  add column status text not null default 'interested'
    check (status in ('interested', 'going'));

-- ═══════════════════════════════════════════════════════
-- CONCERT COMMENTS — mirrors post_comments
-- ═══════════════════════════════════════════════════════

create table public.concert_comments (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index concert_comments_concert_idx on public.concert_comments (concert_id, created_at);

alter table public.concert_comments enable row level security;

create policy concert_comments_select on public.concert_comments
  for select to authenticated
  using (exists (
    select 1 from concerts c where c.id = concert_id and public.is_club_member(c.club_id)
  ));

create policy concert_comments_insert on public.concert_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from concerts c where c.id = concert_id and public.is_club_member(c.club_id))
  );

create policy concert_comments_delete on public.concert_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from concerts c where c.id = concert_id and public.club_role(c.club_id) in ('owner', 'admin'))
  );
