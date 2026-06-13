-- v2: "which album did you like more?" — one pick per member per cycle,
-- between the cycle's two albums. Sealed until reveal, like ratings: you can
-- always see your own pick; the tally opens to everyone once the cycle is revealed.

create table public.cycle_preferences (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  album_id uuid not null references public.albums (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, profile_id)
);

create index cycle_preferences_cycle_idx on public.cycle_preferences (cycle_id);

alter table public.cycle_preferences enable row level security;

-- Read your own row always; everyone's once the cycle is revealed.
create policy cycle_preferences_select on public.cycle_preferences
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from cycles c
      where c.id = cycle_id
        and c.revealed_at is not null
        and public.is_club_member(c.club_id)
    )
  );

-- Set/replace your own pick while the cycle is open; the album must belong to
-- this cycle.
create policy cycle_preferences_write on public.cycle_preferences
  for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and a.cycle_id = cycle_id
        and c.status = 'open'
        and public.is_club_member(c.club_id)
    )
  );
