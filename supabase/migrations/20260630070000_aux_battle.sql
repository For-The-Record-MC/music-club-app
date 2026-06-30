-- Aux Battle: one featured 1v1 per cycle. Two members are auto-paired (weighted
-- toward whoever's gone longest without a battle), handed the same theme, and
-- each submits a song. Everyone else votes A or B. The winner is crowned at
-- close_cycle; wins surface on the profile. Unlike the Showdown it is NOT blind —
-- the rivalry is the point, so combatants + songs are attributed from the start.
--
-- Mirrors the per-cycle spine. Theme pool mirrors showdown_theme_ideas. Pairing,
-- submission, and voting rules are enforced in security-definer RPCs.

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

-- Theme-idea pool: club's own + global seeds (club_id null). used_cycle_id
-- retires a spent idea from the spin reel.
create table public.aux_battle_theme_ideas (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 140),
  created_by uuid references public.profiles (id) on delete set null,
  used_cycle_id uuid references public.cycles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index aux_battle_theme_ideas_club_idx on public.aux_battle_theme_ideas (club_id);

-- One optional battle per cycle. winner_profile_id is set by close_cycle (null
-- on a tie or an empty battle).
create table public.aux_battles (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.cycles (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  theme_text text not null check (char_length(trim(theme_text)) between 1 and 140),
  theme_idea_id uuid references public.aux_battle_theme_ideas (id) on delete set null,
  member_a uuid not null references public.profiles (id) on delete cascade,
  member_b uuid not null references public.profiles (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  winner_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (member_a <> member_b)
);

create index aux_battles_club_idx on public.aux_battles (club_id);

-- One song per combatant. Only member_a / member_b may submit (enforced in RPC).
create table public.aux_battle_songs (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.aux_battles (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 300),
  artist text not null default '',
  artwork_url text,
  spotify_url text,
  apple_url text,
  created_at timestamptz not null default now(),
  unique (battle_id, profile_id)
);

create index aux_battle_songs_battle_idx on public.aux_battle_songs (battle_id);

-- One vote per non-combatant member. choice is member_a or member_b.
create table public.aux_battle_votes (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.aux_battles (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  choice uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (battle_id, profile_id)
);

create index aux_battle_votes_battle_idx on public.aux_battle_votes (battle_id);

-- Global seed themes (available to every club, read-only).
insert into public.aux_battle_theme_ideas (club_id, text) values
  (null, 'Best summer song'),
  (null, 'Best sad banger'),
  (null, 'Best song for 2008'),
  (null, 'Best driving song'),
  (null, 'Best breakup song'),
  (null, 'Best one-hit wonder'),
  (null, 'Best song under 2 minutes'),
  (null, 'Best song to clean the house to'),
  (null, 'Best karaoke song'),
  (null, 'Best song no one else knows');

-- ═══════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════

-- Pull one random unused theme idea (club's own + global seeds) for the reel.
-- Does NOT commit — start_aux_battle commits the landed theme.
create or replace function public.spin_aux_theme(p_club uuid)
returns public.aux_battle_theme_ideas
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_idea public.aux_battle_theme_ideas;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  select * into v_idea
  from aux_battle_theme_ideas
  where used_cycle_id is null and (club_id is null or club_id = p_club)
  order by random()
  limit 1;
  if not found then
    raise exception 'No theme ideas left to spin';
  end if;
  return v_idea;
end;
$$;

-- Kick off the cycle's battle: the picker (or an admin) commits a theme; the two
-- combatants are auto-picked, weighted toward whoever has gone longest without a
-- battle (never-battled first), ties broken at random.
create or replace function public.start_aux_battle(
  p_cycle uuid,
  p_theme text,
  p_idea_id uuid default null
)
returns public.aux_battles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
  v_members uuid[];
  v_a uuid;
  v_b uuid;
  v_battle public.aux_battles;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'The cycle is closed';
  end if;
  if v_cycle.picker_id <> auth.uid()
     and public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Only the picker or an admin can start the Aux Battle';
  end if;
  if char_length(trim(coalesce(p_theme, ''))) = 0 then
    raise exception 'Theme cannot be empty';
  end if;
  if exists (select 1 from aux_battles where cycle_id = p_cycle) then
    raise exception 'The Aux Battle has already started';
  end if;

  -- Least-recently-battled ordering: a member's most recent battle cycle number,
  -- nulls (never battled) first, random tiebreak. Take the first two.
  select array(
    select cm.profile_id
    from club_members cm
    where cm.club_id = v_cycle.club_id
    order by (
      select max(c.number)
      from aux_battles ab
      join cycles c on c.id = ab.cycle_id
      where ab.club_id = v_cycle.club_id
        and (ab.member_a = cm.profile_id or ab.member_b = cm.profile_id)
    ) asc nulls first, random()
  ) into v_members;

  if coalesce(array_length(v_members, 1), 0) < 2 then
    raise exception 'Need at least 2 members for an Aux Battle';
  end if;
  v_a := v_members[1];
  v_b := v_members[2];

  insert into aux_battles (cycle_id, club_id, theme_text, theme_idea_id, member_a, member_b, created_by)
  values (p_cycle, v_cycle.club_id, trim(p_theme), p_idea_id, v_a, v_b, auth.uid())
  returning * into v_battle;

  if p_idea_id is not null then
    update aux_battle_theme_ideas set used_cycle_id = p_cycle where id = p_idea_id;
  end if;

  -- Broadcast for the club + a direct push to each combatant ("you're up").
  perform public.publish_activity_event(
    v_cycle.club_id, 'aux_battle_started',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', p_cycle, 'theme', v_battle.theme_text)
  );
  insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
  select v_cycle.club_id, auth.uid(), m, 'aux_battle_picked',
    jsonb_build_object('cycle_number', v_cycle.number, 'theme', v_battle.theme_text)
  from unnest(array[v_a, v_b]) as m;

  return v_battle;
end;
$$;

-- A combatant submits (or replaces) their song while the cycle is open.
create or replace function public.submit_aux_song(
  p_battle uuid,
  p_title text,
  p_artist text default '',
  p_artwork_url text default null,
  p_spotify_url text default null,
  p_apple_url text default null
)
returns public.aux_battle_songs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle public.aux_battles;
  v_status text;
  v_row public.aux_battle_songs;
begin
  select * into v_battle from aux_battles where id = p_battle;
  if not found then
    raise exception 'Battle not found';
  end if;
  if auth.uid() <> v_battle.member_a and auth.uid() <> v_battle.member_b then
    raise exception 'Only the two combatants can submit a song';
  end if;
  select status into v_status from cycles where id = v_battle.cycle_id;
  if v_status <> 'open' then
    raise exception 'The battle is closed';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'A song title is required';
  end if;

  insert into aux_battle_songs (battle_id, profile_id, title, artist, artwork_url, spotify_url, apple_url)
  values (p_battle, auth.uid(), trim(p_title), coalesce(p_artist, ''), p_artwork_url, p_spotify_url, p_apple_url)
  on conflict (battle_id, profile_id) do update
    set title = excluded.title, artist = excluded.artist, artwork_url = excluded.artwork_url,
        spotify_url = excluded.spotify_url, apple_url = excluded.apple_url
  returning * into v_row;

  return v_row;
end;
$$;

-- A non-combatant member votes A or B (changeable while the cycle is open).
create or replace function public.cast_aux_vote(p_battle uuid, p_choice uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle public.aux_battles;
  v_status text;
begin
  select * into v_battle from aux_battles where id = p_battle;
  if not found then
    raise exception 'Battle not found';
  end if;
  if not public.is_club_member(v_battle.club_id) then
    raise exception 'Not a club member';
  end if;
  if auth.uid() = v_battle.member_a or auth.uid() = v_battle.member_b then
    raise exception 'Combatants cannot vote in their own battle';
  end if;
  select status into v_status from cycles where id = v_battle.cycle_id;
  if v_status <> 'open' then
    raise exception 'Voting is closed';
  end if;
  if p_choice <> v_battle.member_a and p_choice <> v_battle.member_b then
    raise exception 'Vote must be for one of the two combatants';
  end if;

  insert into aux_battle_votes (battle_id, profile_id, choice)
  values (p_battle, auth.uid(), p_choice)
  on conflict (battle_id, profile_id) do update set choice = excluded.choice;
end;
$$;

revoke execute on function public.spin_aux_theme(uuid) from anon, public;
revoke execute on function public.start_aux_battle(uuid, text, uuid) from anon, public;
revoke execute on function public.submit_aux_song(uuid, text, text, text, text, text) from anon, public;
revoke execute on function public.cast_aux_vote(uuid, uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- CLOSE_CYCLE — fold Aux Battle crowning in alongside the Showdown.
-- Re-created in full (append-only history); the showdown block is unchanged.
-- ═══════════════════════════════════════════════════════

create or replace function public.close_cycle(p_cycle uuid)
returns public.cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
  v_sd public.showdowns;
  v_winner uuid;
  v_w_title text;
  v_w_artist text;
  v_w_name text;
  v_battle public.aux_battles;
  v_a_votes integer;
  v_b_votes integer;
  v_ab_winner uuid;
  v_ab_name text;
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

  -- Crown the showdown winner: highest net (sum of votes), tiebreak by most
  -- upvotes, then earliest submission.
  select * into v_sd from showdowns where cycle_id = p_cycle;
  if found then
    select s.id, s.title, s.artist, p.display_name
      into v_winner, v_w_title, v_w_artist, v_w_name
    from showdown_submissions s
    join profiles p on p.id = s.profile_id
    where s.showdown_id = v_sd.id
    order by
      coalesce((select sum(v.value) from showdown_votes v where v.submission_id = s.id), 0) desc,
      coalesce((select count(*) from showdown_votes v where v.submission_id = s.id and v.value = 1), 0) desc,
      s.created_at asc
    limit 1;

    if v_winner is not null then
      update showdowns set winner_submission_id = v_winner where id = v_sd.id;
      perform public.publish_activity_event(
        v_cycle.club_id, 'showdown_winner',
        jsonb_build_object(
          'cycle_number', v_cycle.number, 'cycle_id', p_cycle,
          'title', v_w_title, 'artist', v_w_artist, 'submitter_name', v_w_name
        )
      );
    end if;
  end if;

  -- Crown the Aux Battle winner: more votes wins; a tie credits no one.
  select * into v_battle from aux_battles where cycle_id = p_cycle;
  if found then
    select count(*) filter (where choice = v_battle.member_a),
           count(*) filter (where choice = v_battle.member_b)
      into v_a_votes, v_b_votes
    from aux_battle_votes where battle_id = v_battle.id;

    if v_a_votes > v_b_votes then
      v_ab_winner := v_battle.member_a;
    elsif v_b_votes > v_a_votes then
      v_ab_winner := v_battle.member_b;
    else
      v_ab_winner := null; -- tie → no winner credited
    end if;

    if v_ab_winner is not null then
      update aux_battles set winner_profile_id = v_ab_winner where id = v_battle.id;
      select display_name into v_ab_name from profiles where id = v_ab_winner;
      perform public.publish_activity_event(
        v_cycle.club_id, 'aux_battle_winner',
        jsonb_build_object(
          'cycle_number', v_cycle.number, 'cycle_id', p_cycle,
          'theme', v_battle.theme_text, 'winner_name', v_ab_name
        )
      );
    end if;
  end if;

  perform public.publish_activity_event(
    v_cycle.club_id, 'cycle_closed',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', v_cycle.id)
  );

  return v_cycle;
end;
$$;

revoke execute on function public.close_cycle(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- RLS — members read; battle writes flow through the RPCs. Theme ideas are
-- member-insertable (club's own), mirroring the Showdown pool.
-- ═══════════════════════════════════════════════════════

alter table public.aux_battle_theme_ideas enable row level security;
alter table public.aux_battles enable row level security;
alter table public.aux_battle_songs enable row level security;
alter table public.aux_battle_votes enable row level security;

create policy aux_battle_theme_ideas_select on public.aux_battle_theme_ideas
  for select to authenticated
  using (club_id is null or public.is_club_member(club_id));
create policy aux_battle_theme_ideas_insert on public.aux_battle_theme_ideas
  for insert to authenticated
  with check (club_id is not null and created_by = auth.uid() and public.is_club_member(club_id));

create policy aux_battles_select on public.aux_battles
  for select to authenticated using (public.is_club_member(club_id));

create policy aux_battle_songs_select on public.aux_battle_songs
  for select to authenticated
  using (exists (
    select 1 from aux_battles ab where ab.id = battle_id and public.is_club_member(ab.club_id)
  ));

create policy aux_battle_votes_select on public.aux_battle_votes
  for select to authenticated
  using (exists (
    select 1 from aux_battles ab where ab.id = battle_id and public.is_club_member(ab.club_id)
  ));
