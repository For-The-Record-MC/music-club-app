-- Meeting time poll: members propose candidate date/times for a cycle's meeting
-- and vote on the ones that work for them. The cycle admin then locks a winner
-- into the existing cycles.meeting_at via the normal schedule flow.
--
-- Timezone is a single club-level setting (clubs.meeting_timezone, an IANA name
-- like 'America/New_York') shown next to each slot. The slots themselves are
-- stored as absolute instants (timestamptz), so the label is purely cosmetic —
-- it tells everyone which wall-clock the proposer meant.

alter table public.clubs
  add column if not exists meeting_timezone text;

-- Candidate slots for a cycle. unique(cycle_id, slot_at) stops two people from
-- proposing the exact same instant.
create table if not exists public.meeting_time_options (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id),
  slot_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (cycle_id, slot_at)
);

create index if not exists meeting_time_options_cycle_idx
  on public.meeting_time_options (cycle_id);

-- One row per member per slot they're up for.
create table if not exists public.meeting_time_votes (
  option_id uuid not null references public.meeting_time_options(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, profile_id)
);

-- The club a cycle belongs to. security definer so RLS policies can resolve it
-- without recursing through cycles' own policies.
create or replace function public.cycle_club(p_cycle uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select club_id from cycles where id = p_cycle;
$$;

alter table public.meeting_time_options enable row level security;
alter table public.meeting_time_votes enable row level security;

-- options: club members read; any member proposes (as themselves); the proposer
-- or a club admin/owner can remove a slot.
create policy mto_select on public.meeting_time_options
  for select to authenticated
  using (public.is_club_member(public.cycle_club(cycle_id)));

create policy mto_insert on public.meeting_time_options
  for insert to authenticated
  with check (
    proposed_by = auth.uid()
    and public.is_club_member(public.cycle_club(cycle_id))
  );

create policy mto_delete on public.meeting_time_options
  for delete to authenticated
  using (
    proposed_by = auth.uid()
    or public.club_role(public.cycle_club(cycle_id)) in ('owner', 'admin')
  );

-- votes: club members read all tallies; a member manages only their own votes.
create policy mtv_select on public.meeting_time_votes
  for select to authenticated
  using (
    public.is_club_member(public.cycle_club(
      (select cycle_id from public.meeting_time_options o where o.id = option_id)
    ))
  );

create policy mtv_insert on public.meeting_time_votes
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.is_club_member(public.cycle_club(
      (select cycle_id from public.meeting_time_options o where o.id = option_id)
    ))
  );

create policy mtv_delete on public.meeting_time_votes
  for delete to authenticated
  using (profile_id = auth.uid());
