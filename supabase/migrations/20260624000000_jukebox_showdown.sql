-- Jukebox Showdown: an optional per-cycle themed song contest.
-- A cycle MAY have a showdown (theme + member song submissions + blind voting).
-- It rides the cycle lifecycle: submissions/votes while the cycle is open,
-- everything stays blind until reveal (revealed_at), winner crowned at close.
--
-- showdown_theme_ideas (club pool + global seeds), showdowns (1:1 with a cycle),
-- showdown_submissions (one song / member), showdown_votes (2 up + 1 down budget),
-- the RPCs that enforce the rules, and winner-crowning folded into close_cycle.

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

-- The theme-idea backlog. club_id NULL = a global seed theme available to every
-- club (read-only). used_cycle_id marks an idea as spent so the picker list can
-- hide it by default (history still surfaces it with the winner).
create table public.showdown_theme_ideas (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 140),
  created_by uuid references public.profiles (id) on delete set null,
  used_cycle_id uuid references public.cycles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index showdown_theme_ideas_club_idx on public.showdown_theme_ideas (club_id);

-- One optional showdown per cycle. Status is derived from the parent cycle
-- (open while the cycle is open, results unblind at cycles.revealed_at, winner
-- frozen at close). winner_submission_id is set by close_cycle.
create table public.showdowns (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.cycles (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  theme_text text not null check (char_length(trim(theme_text)) between 1 and 140),
  theme_idea_id uuid references public.showdown_theme_ideas (id) on delete set null,
  created_by uuid not null references public.profiles (id),
  winner_submission_id uuid,
  created_at timestamptz not null default now()
);

create index showdowns_club_idx on public.showdowns (club_id);

-- One song per member per showdown. norm_key is the normalized title|artist used
-- to block duplicates (first-come-first-served) across the whole field.
create table public.showdown_submissions (
  id uuid primary key default gen_random_uuid(),
  showdown_id uuid not null references public.showdowns (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 300),
  artist text not null default '',
  artwork_url text,
  spotify_url text,
  apple_url text,
  norm_key text not null,
  created_at timestamptz not null default now(),
  unique (showdown_id, profile_id),
  unique (showdown_id, norm_key)
);

create index showdown_submissions_showdown_idx on public.showdown_submissions (showdown_id);

-- close_cycle reads winner_submission_id back, so wire the FK now that the
-- submissions table exists.
alter table public.showdowns
  add constraint showdowns_winner_fk
  foreign key (winner_submission_id) references public.showdown_submissions (id) on delete set null;

-- Votes: +1 (up) or -1 (down). Budget (2 up + 1 down) and self-vote/downvote-gate
-- rules are enforced in cast_showdown_vote, not by constraints.
create table public.showdown_votes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.showdown_submissions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  created_at timestamptz not null default now(),
  unique (submission_id, profile_id)
);

create index showdown_votes_submission_idx on public.showdown_votes (submission_id);

-- ═══════════════════════════════════════════════════════
-- HELPERS
-- ═══════════════════════════════════════════════════════

-- Canonical "same song" key: lowercased title|artist with all non-alphanumeric
-- characters stripped. The human notion of a duplicate, source-agnostic.
create or replace function public.showdown_norm(p_title text, p_artist text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(trim(coalesce(p_title, '')) || '|' || trim(coalesce(p_artist, ''))),
    '[^a-z0-9|]+', '', 'g'
  );
$$;

-- ═══════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════

-- Set (or change) a cycle's theme. The picker OR an admin, while the cycle is
-- open. Upserts the showdown, marks the chosen idea used, and announces it.
create or replace function public.set_showdown_theme(
  p_cycle uuid,
  p_text text,
  p_idea_id uuid default null
)
returns public.showdowns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
  v_showdown public.showdowns;
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
    raise exception 'Only the picker or an admin can set the theme';
  end if;
  if char_length(trim(coalesce(p_text, ''))) = 0 then
    raise exception 'Theme cannot be empty';
  end if;

  insert into showdowns (cycle_id, club_id, theme_text, theme_idea_id, created_by)
  values (p_cycle, v_cycle.club_id, trim(p_text), p_idea_id, auth.uid())
  on conflict (cycle_id) do update
    set theme_text = excluded.theme_text,
        theme_idea_id = excluded.theme_idea_id
  returning * into v_showdown;

  if p_idea_id is not null then
    update showdown_theme_ideas set used_cycle_id = p_cycle where id = p_idea_id;
  end if;

  perform public.publish_activity_event(
    v_cycle.club_id, 'showdown_started',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', p_cycle, 'theme', v_showdown.theme_text)
  );

  return v_showdown;
end;
$$;

-- Pull one random unused theme idea (club's own + global seeds) for the
-- "Spin the Jukebox" reel. Does NOT commit — the client commits the landed
-- theme via set_showdown_theme (allowing respin / manual override).
create or replace function public.spin_showdown_theme(p_club uuid)
returns public.showdown_theme_ideas
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_idea public.showdown_theme_ideas;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  select * into v_idea
  from showdown_theme_ideas
  where used_cycle_id is null
    and (club_id is null or club_id = p_club)
  order by random()
  limit 1;
  if not found then
    raise exception 'No theme ideas left to spin';
  end if;
  return v_idea;
end;
$$;

-- Submit (or replace) the caller's song. One per member; editable only while it
-- has zero votes; duplicates (by norm_key) rejected first-come-first-served.
create or replace function public.submit_showdown_song(
  p_showdown uuid,
  p_title text,
  p_artist text,
  p_artwork_url text default null,
  p_spotify_url text default null,
  p_apple_url text default null
)
returns public.showdown_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_status text;
  v_norm text;
  v_existing_id uuid;
  v_votes integer;
  v_row public.showdown_submissions;
begin
  select c.club_id, c.status into v_club, v_status
  from showdowns sd join cycles c on c.id = sd.cycle_id
  where sd.id = p_showdown;
  if not found then
    raise exception 'Showdown not found';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;
  if v_status <> 'open' then
    raise exception 'Submissions are closed';
  end if;

  v_norm := public.showdown_norm(p_title, p_artist);

  -- Duplicate held by someone else? Friendly rejection (leaks that the song is
  -- taken, not who took it — accepted tradeoff for the no-duplicates rule).
  if exists (
    select 1 from showdown_submissions s
    where s.showdown_id = p_showdown and s.norm_key = v_norm and s.profile_id <> auth.uid()
  ) then
    raise exception 'That song is already in the running — pick another.';
  end if;

  select s.id, (select count(*) from showdown_votes v where v.submission_id = s.id)
    into v_existing_id, v_votes
  from showdown_submissions s
  where s.showdown_id = p_showdown and s.profile_id = auth.uid();

  if v_existing_id is not null then
    if v_votes > 0 then
      raise exception 'Your song is locked in — it already has votes.';
    end if;
    update showdown_submissions
    set title = trim(p_title), artist = coalesce(p_artist, ''),
        artwork_url = p_artwork_url, spotify_url = p_spotify_url, apple_url = p_apple_url,
        norm_key = v_norm
    where id = v_existing_id
    returning * into v_row;
  else
    insert into showdown_submissions
      (showdown_id, profile_id, title, artist, artwork_url, spotify_url, apple_url, norm_key)
    values
      (p_showdown, auth.uid(), trim(p_title), coalesce(p_artist, ''), p_artwork_url, p_spotify_url, p_apple_url, v_norm)
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- Withdraw the caller's submission (only while it has no votes).
create or replace function public.delete_showdown_submission(p_showdown uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_votes integer;
begin
  select s.id, (select count(*) from showdown_votes v where v.submission_id = s.id)
    into v_id, v_votes
  from showdown_submissions s
  where s.showdown_id = p_showdown and s.profile_id = auth.uid();
  if v_id is null then
    return;
  end if;
  if v_votes > 0 then
    raise exception 'Your song is locked in — it already has votes.';
  end if;
  delete from showdown_submissions where id = v_id;
end;
$$;

-- Cast / change / clear a vote. p_value: 1 up, -1 down, 0 clears. Enforces the
-- 2-up/1-down budget, blocks self-votes, and gates downvotes until ≥4 entries.
create or replace function public.cast_showdown_vote(p_submission uuid, p_value integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_showdown uuid;
  v_club uuid;
  v_status text;
  v_owner uuid;
  v_field integer;
  v_up integer;
  v_down integer;
begin
  select sub.showdown_id, c.club_id, c.status, sub.profile_id
    into v_showdown, v_club, v_status, v_owner
  from showdown_submissions sub
  join showdowns sd on sd.id = sub.showdown_id
  join cycles c on c.id = sd.cycle_id
  where sub.id = p_submission;
  if not found then
    raise exception 'Submission not found';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;
  if v_status <> 'open' then
    raise exception 'Voting is closed';
  end if;
  if v_owner = auth.uid() then
    raise exception 'You can''t vote on your own song';
  end if;
  if p_value not in (1, -1, 0) then
    raise exception 'Invalid vote';
  end if;

  if p_value = 0 then
    delete from showdown_votes where submission_id = p_submission and profile_id = auth.uid();
    return;
  end if;

  if p_value = -1 then
    select count(*) into v_field from showdown_submissions where showdown_id = v_showdown;
    if v_field < 4 then
      raise exception 'Downvotes unlock once there are 4 songs';
    end if;
  end if;

  -- Budget across the whole field, excluding the song being (re)voted.
  select
    count(*) filter (where v.value = 1),
    count(*) filter (where v.value = -1)
  into v_up, v_down
  from showdown_votes v
  join showdown_submissions s on s.id = v.submission_id
  where s.showdown_id = v_showdown
    and v.profile_id = auth.uid()
    and v.submission_id <> p_submission;

  if p_value = 1 and v_up >= 2 then
    raise exception 'You''ve used both upvotes';
  end if;
  if p_value = -1 and v_down >= 1 then
    raise exception 'You''ve used your downvote';
  end if;

  insert into showdown_votes (submission_id, profile_id, value)
  values (p_submission, auth.uid(), p_value)
  on conflict (submission_id, profile_id) do update set value = excluded.value;
end;
$$;

-- The single read path for a cycle's showdown. Keeps the contest blind: author
-- names and net scores are withheld until the cycle is revealed (your own
-- submission + your own votes are always visible). Returns null if no showdown.
create or replace function public.list_showdown(p_cycle uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sd public.showdowns;
  v_revealed boolean;
  v_club uuid;
  v_field integer;
  v_up integer;
  v_down integer;
  v_subs json;
begin
  select * into v_sd from showdowns where cycle_id = p_cycle;
  if not found then
    return null;
  end if;
  v_club := v_sd.club_id;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;

  select (revealed_at is not null) into v_revealed from cycles where id = p_cycle;
  select count(*) into v_field from showdown_submissions where showdown_id = v_sd.id;

  select
    coalesce(count(*) filter (where value = 1), 0),
    coalesce(count(*) filter (where value = -1), 0)
  into v_up, v_down
  from showdown_votes v
  join showdown_submissions s on s.id = v.submission_id
  where s.showdown_id = v_sd.id and v.profile_id = auth.uid();

  select coalesce(json_agg(row order by row.created_at), '[]'::json) into v_subs
  from (
    select
      s.id,
      s.title,
      s.artist,
      s.artwork_url,
      s.spotify_url,
      s.apple_url,
      s.created_at,
      (s.profile_id = auth.uid()) as is_mine,
      (select v.value from showdown_votes v where v.submission_id = s.id and v.profile_id = auth.uid()) as my_vote,
      -- Author only after reveal (or if it's mine).
      case when v_revealed or s.profile_id = auth.uid() then p.display_name end as author_name,
      case when v_revealed or s.profile_id = auth.uid() then p.avatar_color end as author_color,
      case when v_revealed or s.profile_id = auth.uid() then p.avatar_url end as author_avatar,
      -- Net score only after reveal.
      case when v_revealed then (
        select coalesce(sum(v.value), 0) from showdown_votes v where v.submission_id = s.id
      ) end as net_score
    from showdown_submissions s
    join profiles p on p.id = s.profile_id
    where s.showdown_id = v_sd.id
  ) row;

  return json_build_object(
    'showdown_id', v_sd.id,
    'theme_text', v_sd.theme_text,
    'revealed', v_revealed,
    'submission_count', v_field,
    'downvote_unlocked', (v_field >= 4),
    'up_remaining', 2 - v_up,
    'down_remaining', 1 - v_down,
    'winner_submission_id', v_sd.winner_submission_id,
    'submissions', v_subs
  );
end;
$$;

-- ═══════════════════════════════════════════════════════
-- CLOSE: crown the showdown winner (folds into the existing close_cycle)
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

  perform public.publish_activity_event(
    v_cycle.club_id, 'cycle_closed',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', v_cycle.id)
  );

  return v_cycle;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════════

revoke execute on function public.set_showdown_theme(uuid, text, uuid) from anon, public;
revoke execute on function public.spin_showdown_theme(uuid) from anon, public;
revoke execute on function public.submit_showdown_song(uuid, text, text, text, text, text) from anon, public;
revoke execute on function public.delete_showdown_submission(uuid) from anon, public;
revoke execute on function public.cast_showdown_vote(uuid, integer) from anon, public;
revoke execute on function public.list_showdown(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- RLS — reads are blind by default; writes go through the RPCs above.
-- ═══════════════════════════════════════════════════════

alter table public.showdowns enable row level security;
alter table public.showdown_theme_ideas enable row level security;
alter table public.showdown_submissions enable row level security;
alter table public.showdown_votes enable row level security;

-- showdowns: members read (theme isn't secret); writes via set_showdown_theme.
create policy showdowns_select on public.showdowns
  for select to authenticated using (public.is_club_member(club_id));

-- theme ideas: members read their club's ideas + global seeds; any member adds
-- ideas to their own club.
create policy showdown_theme_ideas_select on public.showdown_theme_ideas
  for select to authenticated
  using (club_id is null or public.is_club_member(club_id));
create policy showdown_theme_ideas_insert on public.showdown_theme_ideas
  for insert to authenticated
  with check (club_id is not null and created_by = auth.uid() and public.is_club_member(club_id));

-- submissions: caller reads only their OWN row directly (anonymity). Everyone
-- reads the field through list_showdown (security definer). Writes via RPC.
create policy showdown_submissions_select_own on public.showdown_submissions
  for select to authenticated using (profile_id = auth.uid());

-- votes: caller reads only their own votes. Writes via cast_showdown_vote.
create policy showdown_votes_select_own on public.showdown_votes
  for select to authenticated using (profile_id = auth.uid());

-- ═══════════════════════════════════════════════════════
-- SEED — global theme ideas (club_id NULL), available to every club.
-- ═══════════════════════════════════════════════════════

insert into public.showdown_theme_ideas (club_id, text) values
  (null, 'Colors in the title'),
  (null, 'One-word titles'),
  (null, 'A person''s name in the title'),
  (null, 'A city or place in the title'),
  (null, 'Counting or numbers in the title'),
  (null, 'A season or the weather'),
  (null, 'Songs from the year you were born'),
  (null, 'Your parents'' favorite song'),
  (null, 'Your guilty pleasure'),
  (null, 'One-hit wonders'),
  (null, 'Most underrated song by a famous artist'),
  (null, 'Best bassline'),
  (null, 'Best opening track on an album'),
  (null, 'Best closing track on an album'),
  (null, 'Best feature or guest verse'),
  (null, 'A song with no chorus'),
  (null, 'Under 2 minutes'),
  (null, 'Over 6 minutes'),
  (null, 'A song that samples another song'),
  (null, 'Best song to drive to'),
  (null, 'A song that makes you cry'),
  (null, 'Breakup song'),
  (null, 'Funkiest song'),
  (null, 'A cover better than the original'),
  (null, 'A live version better than the studio'),
  (null, 'From a movie soundtrack'),
  (null, 'In a language you don''t speak');
