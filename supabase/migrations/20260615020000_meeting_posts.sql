-- Meeting board — a per-cycle discussion thread shown on the RSVP screen.
-- Members post short notes about the upcoming meeting: suggest a new time,
-- offer to bring something, etc. Tied to the cycle (one board per meeting), so
-- it resets when a new cycle is spun. Mirrors concert_comments.

create table public.meeting_posts (
  id uuid not null default gen_random_uuid() primary key,
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index meeting_posts_cycle_idx on public.meeting_posts using btree (cycle_id, created_at);

alter table public.meeting_posts enable row level security;

-- Read by any member of the cycle's club.
create policy meeting_posts_select on public.meeting_posts
  for select to authenticated
  using (exists (
    select 1 from public.cycles c
    where c.id = meeting_posts.cycle_id and is_club_member(c.club_id)
  ));

-- Post as yourself, only into a club you belong to.
create policy meeting_posts_insert on public.meeting_posts
  for insert to authenticated
  with check (author_id = auth.uid() and exists (
    select 1 from public.cycles c
    where c.id = meeting_posts.cycle_id and is_club_member(c.club_id)
  ));

-- Delete your own posts; owners/admins can moderate.
create policy meeting_posts_delete on public.meeting_posts
  for delete to authenticated
  using (author_id = auth.uid() or exists (
    select 1 from public.cycles c
    where c.id = meeting_posts.cycle_id and club_role(c.club_id) = any (array['owner', 'admin'])
  ));
