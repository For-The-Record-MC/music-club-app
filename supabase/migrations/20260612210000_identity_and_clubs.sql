-- Phase 1: identity & clubs.
-- profiles (1:1 auth.users), clubs, club_members (owner/admin/member),
-- invite-code join flow, RLS scoped by club membership.

-- ═══════════════════════════════════════════════════════
-- PROFILES
-- ═══════════════════════════════════════════════════════

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  avatar_color integer not null default 0 check (avatar_color between 0 and 6),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row on signup. display_name stays null until the user
-- sets it in the app ("complete your profile" step). Random avatar color.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_color)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    floor(random() * 7)::int
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════
-- CLUBS & MEMBERSHIP
-- ═══════════════════════════════════════════════════════

-- 8-char invite code from an unambiguous alphabet (no 0/O/1/I).
create or replace function public.generate_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1),
    ''
  )
  from generate_series(1, 8);
$$;

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  emoji text not null default '🎵',
  owner_id uuid not null references public.profiles (id),
  invite_code text not null unique default public.generate_invite_code(),
  created_at timestamptz not null default now()
);

create table public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (club_id, profile_id)
);

create index club_members_profile_idx on public.club_members (profile_id);
create index club_members_club_idx on public.club_members (club_id);

-- Exactly one owner row per club.
create unique index club_members_one_owner_idx
  on public.club_members (club_id)
  where role = 'owner';

-- ═══════════════════════════════════════════════════════
-- RLS HELPERS (security definer to avoid policy self-recursion)
-- ═══════════════════════════════════════════════════════

create or replace function public.is_club_member(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from club_members
    where club_id = p_club and profile_id = auth.uid()
  );
$$;

create or replace function public.club_role(p_club uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from club_members
  where club_id = p_club and profile_id = auth.uid();
$$;

-- ═══════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;

-- profiles: any signed-in user can read display names (needed for member lists
-- across clubs); only the owner of the profile can change it.
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- clubs: visible to members only. Created via create_club RPC (no direct
-- insert). Updated by owner/admins; deleted by owner. Note: authority checks
-- always come from club_members.role (one-owner index below); clubs.owner_id
-- is informational/FK convenience.
create policy clubs_select on public.clubs
  for select to authenticated using (public.is_club_member(id));
create policy clubs_update on public.clubs
  for update to authenticated
  using (public.club_role(id) in ('owner', 'admin'))
  with check (public.club_role(id) in ('owner', 'admin'));
create policy clubs_delete on public.clubs
  for delete to authenticated using (public.club_role(id) = 'owner');

-- club_members: visible to fellow members. Rows are created only via the
-- create_club / join_club RPCs (security definer), never direct insert.
create policy club_members_select on public.club_members
  for select to authenticated using (public.is_club_member(club_id));

-- Role changes: owner only, never on their own (owner) row, and never minting
-- a second owner.
create policy club_members_update on public.club_members
  for update to authenticated
  using (public.club_role(club_id) = 'owner' and profile_id <> auth.uid())
  with check (role in ('admin', 'member'));

-- Removal: leave (any non-owner removes self), owner removes anyone else,
-- admins remove plain members.
create policy club_members_delete on public.club_members
  for delete to authenticated
  using (
    (profile_id = auth.uid() and role <> 'owner')
    or (public.club_role(club_id) = 'owner' and profile_id <> auth.uid())
    or (public.club_role(club_id) = 'admin' and role = 'member')
  );

-- ═══════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════

-- Atomically create a club + its owner membership.
create or replace function public.create_club(p_name text, p_emoji text default '🎵')
returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.clubs;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into clubs (name, emoji, owner_id)
  values (trim(p_name), coalesce(nullif(p_emoji, ''), '🎵'), auth.uid())
  returning * into v_club;

  insert into club_members (club_id, profile_id, role)
  values (v_club.id, auth.uid(), 'owner');

  return v_club;
end;
$$;

-- Join a club by invite code. Idempotent: re-joining returns the club.
create or replace function public.join_club(p_code text)
returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.clubs;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_club from clubs where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'Invalid invite code';
  end if;

  insert into club_members (club_id, profile_id, role)
  values (v_club.id, auth.uid(), 'member')
  on conflict (club_id, profile_id) do nothing;

  return v_club;
end;
$$;

-- Invalidate the current invite link (admin+).
create or replace function public.rotate_invite_code(p_club uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  update clubs set invite_code = public.generate_invite_code()
  where id = p_club
  returning invite_code into v_code;
  return v_code;
end;
$$;

-- RPCs are for signed-in users only.
revoke execute on function public.create_club(text, text) from anon, public;
revoke execute on function public.join_club(text) from anon, public;
revoke execute on function public.rotate_invite_code(uuid) from anon, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
