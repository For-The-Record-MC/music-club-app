-- Phase 2: the cycle engine.
-- cycles (one open per club, wheel-spun picker), albums (two slots per cycle),
-- rsvps, cycle_guests, and the wheel/lifecycle RPCs.

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  number integer not null,
  picker_id uuid not null references public.profiles (id),
  status text not null default 'open' check (status in ('open', 'closed')),
  start_date date not null default current_date,
  meeting_date date,
  meeting_time_location text,
  revealed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (club_id, number)
);

-- THE invariant: at most one open cycle per club. "Current cycle" is always
-- a status query, never max(number).
create unique index cycles_one_open_idx on public.cycles (club_id) where status = 'open';
create index cycles_club_idx on public.cycles (club_id);

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  slot integer not null check (slot in (1, 2)),
  title text not null check (char_length(trim(title)) between 1 and 200),
  artist text not null default '',
  year integer,
  artwork_url text,
  itunes_collection_id bigint,
  apple_url text,
  spotify_url text,
  tracks jsonb,
  set_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (cycle_id, slot)
);

create index albums_cycle_idx on public.albums (cycle_id);

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('yes', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  unique (cycle_id, profile_id)
);

create index rsvps_cycle_idx on public.rsvps (cycle_id);

create table public.cycle_guests (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  status text not null default 'yes' check (status in ('yes', 'maybe', 'no')),
  added_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index cycle_guests_cycle_idx on public.cycle_guests (cycle_id);

-- ═══════════════════════════════════════════════════════
-- WHEEL
-- ═══════════════════════════════════════════════════════

-- Eligible picker pool: members minus the pickers of the last 3 cycles.
-- Relaxes for small clubs (exclude last 1, then nobody) so the pool is never
-- empty. Used by spin_wheel AND by the app to render the wheel — single
-- source of truth for eligibility.
create or replace function public.wheel_pool(p_club uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_excl integer;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  foreach v_excl in array array[3, 1, 0] loop
    return query
      select cm.profile_id
      from club_members cm
      where cm.club_id = p_club
        and cm.profile_id not in (
          select c.picker_id from cycles c
          where c.club_id = p_club
          order by c.number desc
          limit v_excl
        );
    if found then
      return;
    end if;
  end loop;
end;
$$;

-- Spin: server-side randomness, atomic cycle creation. The client wheel
-- animation is choreographed to land on the returned picker.
create or replace function public.spin_wheel(p_club uuid)
returns public.cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_picker uuid;
  v_cycle public.cycles;
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

  return v_cycle;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- LIFECYCLE RPCs
-- ═══════════════════════════════════════════════════════

-- Reveal ratings at the meeting (idempotent). Ratings visibility (Phase 3)
-- keys off revealed_at.
create or replace function public.reveal_cycle(p_cycle uuid)
returns public.cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  update cycles set revealed_at = coalesce(revealed_at, now())
  where id = p_cycle
  returning * into v_cycle;
  return v_cycle;
end;
$$;

-- Close the cycle (implies reveal). Frees the club for the next spin.
create or replace function public.close_cycle(p_cycle uuid)
returns public.cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'Cycle is already closed';
  end if;
  update cycles
  set status = 'closed',
      closed_at = now(),
      revealed_at = coalesce(revealed_at, now())
  where id = p_cycle
  returning * into v_cycle;
  return v_cycle;
end;
$$;

revoke execute on function public.spin_wheel(uuid) from anon, public;
revoke execute on function public.wheel_pool(uuid) from anon, public;
revoke execute on function public.reveal_cycle(uuid) from anon, public;
revoke execute on function public.close_cycle(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════

alter table public.cycles enable row level security;
alter table public.albums enable row level security;
alter table public.rsvps enable row level security;
alter table public.cycle_guests enable row level security;

-- cycles: members read; admins update (meeting fields); owner may delete a
-- mis-spun cycle. Creation + status transitions go through the RPCs.
create policy cycles_select on public.cycles
  for select to authenticated using (public.is_club_member(club_id));
create policy cycles_update on public.cycles
  for update to authenticated
  using (public.club_role(club_id) in ('owner', 'admin'))
  with check (public.club_role(club_id) in ('owner', 'admin'));
create policy cycles_delete on public.cycles
  for delete to authenticated using (public.club_role(club_id) = 'owner');

-- albums: members read; the cycle's picker (the ritual) or an admin writes,
-- only while the cycle is open.
create policy albums_select on public.albums
  for select to authenticated
  using (exists (
    select 1 from cycles c
    where c.id = cycle_id and public.is_club_member(c.club_id)
  ));
create policy albums_write on public.albums
  for all to authenticated
  using (exists (
    select 1 from cycles c
    where c.id = cycle_id
      and c.status = 'open'
      and (c.picker_id = auth.uid() or public.club_role(c.club_id) in ('owner', 'admin'))
  ))
  with check (
    set_by = auth.uid()
    and exists (
      select 1 from cycles c
      where c.id = cycle_id
        and c.status = 'open'
        and (c.picker_id = auth.uid() or public.club_role(c.club_id) in ('owner', 'admin'))
    )
  );

-- rsvps: members read; each member upserts their own row while the cycle is open.
create policy rsvps_select on public.rsvps
  for select to authenticated
  using (exists (
    select 1 from cycles c
    where c.id = cycle_id and public.is_club_member(c.club_id)
  ));
create policy rsvps_write on public.rsvps
  for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from cycles c
      where c.id = cycle_id
        and c.status = 'open'
        and public.is_club_member(c.club_id)
    )
  );

-- cycle_guests: members read; any member adds a guest while open; the adder
-- or an admin edits/removes.
create policy cycle_guests_select on public.cycle_guests
  for select to authenticated
  using (exists (
    select 1 from cycles c
    where c.id = cycle_id and public.is_club_member(c.club_id)
  ));
create policy cycle_guests_insert on public.cycle_guests
  for insert to authenticated
  with check (
    added_by = auth.uid()
    and exists (
      select 1 from cycles c
      where c.id = cycle_id
        and c.status = 'open'
        and public.is_club_member(c.club_id)
    )
  );
create policy cycle_guests_update on public.cycle_guests
  for update to authenticated
  using (
    added_by = auth.uid()
    or exists (
      select 1 from cycles c
      where c.id = cycle_id and public.club_role(c.club_id) in ('owner', 'admin')
    )
  );
create policy cycle_guests_delete on public.cycle_guests
  for delete to authenticated
  using (
    added_by = auth.uid()
    or exists (
      select 1 from cycles c
      where c.id = cycle_id and public.club_role(c.club_id) in ('owner', 'admin')
    )
  );
