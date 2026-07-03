-- Track Madness: a standing studio room where an admin/picker launches a seeded
-- tournament bracket (16/32/64) of one artist's most-played songs (ranked by the
-- bracket-seed Edge Function). Every member fills out their OWN copy — pick a
-- winner per matchup, round by round — then crowns a champion, which locks the
-- bracket. A club consensus bracket is computed client-side from completed
-- copies (advancement points; see trackMadness.ts) — no stored snapshot, since
-- picks freeze at close and stay derivable forever.
--
-- Spoiler guard: another member's picks/entry are invisible until YOU have
-- completed your own bracket (or the bracket is closed). Progress counts come
-- through bracket_progress() so the tile can say "4 of 7 finished" without
-- leaking anyone's champion.
--
-- One open bracket per club; closed brackets archive in the room. Writes flow
-- through security-definer RPCs (matchup validity + lock rules); comments are
-- direct RLS writes like best_bar_comments.

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

create table public.brackets (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  artist_name text not null check (char_length(trim(artist_name)) between 1 and 200),
  artist_spotify_id text not null default '',
  artist_image_url text,
  size smallint not null check (size in (16, 32, 64)),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index brackets_club_idx on public.brackets (club_id, created_at desc);
-- One live bracket per club at a time.
create unique index brackets_one_open_idx on public.brackets (club_id) where (status = 'open');

-- The seeded field. seed is the strength ranking (1 = most played); position is
-- the bracket-order index (1..size) laid out so round-1 slot s is fed by
-- positions 2s-1 and 2s — true tournament placement (1 and 2 can only meet in
-- the final), computed by create_bracket.
create table public.bracket_tracks (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  seed smallint not null check (seed >= 1),
  position smallint not null check (position >= 1),
  title text not null check (char_length(trim(title)) between 1 and 300),
  album text not null default '',
  artwork_url text,
  spotify_url text,
  apple_url text,
  preview_url text,
  playcount bigint not null default 0,
  unique (bracket_id, seed),
  unique (bracket_id, position)
);

create index bracket_tracks_bracket_idx on public.bracket_tracks (bracket_id);

-- One row per member per bracket, created on their first pick. completed_at is
-- the lock: set by crown_champion, after which picks are immutable and the
-- member can see everyone else's bracket + the consensus.
create table public.bracket_entries (
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  champion_track_id uuid references public.bracket_tracks (id) on delete set null,
  primary key (bracket_id, profile_id)
);

-- One pick per matchup per member. round 1..log2(size); slot 1..size/2^round.
-- Validity (winner must be a feeder of the slot) is enforced in save_bracket_pick.
create table public.bracket_picks (
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  round smallint not null check (round >= 1),
  slot smallint not null check (slot >= 1),
  winner_track_id uuid not null references public.bracket_tracks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bracket_id, profile_id, round, slot)
);

create index bracket_picks_winner_idx on public.bracket_picks (bracket_id, winner_track_id);

-- One thread per bracket (Best Bars comment pattern; no per-matchup comments).
create table public.bracket_comments (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index bracket_comments_bracket_idx on public.bracket_comments (bracket_id, created_at);

-- ═══════════════════════════════════════════════════════
-- HELPERS
-- ═══════════════════════════════════════════════════════

-- Can the caller run a bracket (launch/close)? Owner/admin, or the picker of
-- the club's open cycle — the same trio that can start an Aux Battle.
create or replace function public.can_run_bracket(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.club_role(p_club) in ('owner', 'admin')
    or exists (
      select 1 from cycles
      where club_id = p_club and status = 'open' and picker_id = auth.uid()
    );
$$;

-- Has the caller locked in their own copy of this bracket? Security definer so
-- the spoiler-guard RLS policies can ask without recursing into their own table.
create or replace function public.has_completed_bracket(p_bracket uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from bracket_entries
    where bracket_id = p_bracket and profile_id = auth.uid() and completed_at is not null
  );
$$;

-- Standard tournament placement: returns the seeds in bracket-position order
-- (position i is fed by seed result[i]). Built by the classic doubling fold:
-- [1,2] → [1,4,2,3] → [1,8,4,5,2,7,3,6] → … so seeds 1 and 2 land in opposite
-- halves, 1–4 in distinct quarters, and round 1 pairs 1v{N}, 2v{N-1}, etc.
create or replace function public.bracket_seed_order(p_size int)
returns int[]
language plpgsql
immutable
as $$
declare
  v_order int[] := array[1, 2];
  v_next int[];
  v_len int;
  s int;
begin
  while array_length(v_order, 1) < p_size loop
    v_len := array_length(v_order, 1) * 2;
    v_next := '{}';
    foreach s in array v_order loop
      v_next := v_next || s || (v_len + 1 - s);
    end loop;
    v_order := v_next;
  end loop;
  return v_order;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════

-- Launch a bracket from the reviewed candidate list. p_tracks is a jsonb array
-- ordered by seed (element 0 = 1-seed) with title/album/artwork_url/spotify_url/
-- apple_url/preview_url/playcount, exactly p_size elements.
create or replace function public.create_bracket(
  p_club uuid,
  p_artist_name text,
  p_artist_spotify_id text,
  p_artist_image_url text,
  p_size int,
  p_tracks jsonb
)
returns public.brackets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bracket public.brackets;
  v_order int[];
  v_pos int[];
  i int;
  t jsonb;
begin
  if not public.can_run_bracket(p_club) then
    raise exception 'Only an admin or the current picker can start a bracket';
  end if;
  if p_size not in (16, 32, 64) then
    raise exception 'Bracket size must be 16, 32, or 64';
  end if;
  if jsonb_typeof(p_tracks) <> 'array' or jsonb_array_length(p_tracks) <> p_size then
    raise exception 'Expected exactly % tracks', p_size;
  end if;
  if exists (select 1 from brackets where club_id = p_club and status = 'open') then
    raise exception 'A bracket is already live — close it first';
  end if;

  insert into brackets (club_id, artist_name, artist_spotify_id, artist_image_url, size, created_by)
  values (p_club, trim(p_artist_name), coalesce(p_artist_spotify_id, ''), p_artist_image_url, p_size, auth.uid())
  returning * into v_bracket;

  -- Invert seed-order (position → seed) into seed → position.
  v_order := public.bracket_seed_order(p_size);
  v_pos := array_fill(0, array[p_size]);
  for i in 1..p_size loop
    v_pos[v_order[i]] := i;
  end loop;

  for i in 1..p_size loop
    t := p_tracks -> (i - 1);
    if char_length(trim(coalesce(t ->> 'title', ''))) = 0 then
      raise exception 'Track % is missing a title', i;
    end if;
    insert into bracket_tracks
      (bracket_id, seed, position, title, album, artwork_url, spotify_url, apple_url, preview_url, playcount)
    values (
      v_bracket.id, i, v_pos[i],
      trim(t ->> 'title'), coalesce(t ->> 'album', ''),
      nullif(t ->> 'artwork_url', ''), nullif(t ->> 'spotify_url', ''),
      nullif(t ->> 'apple_url', ''), nullif(t ->> 'preview_url', ''),
      coalesce((t ->> 'playcount')::bigint, 0)
    );
  end loop;

  perform public.publish_activity_event(
    p_club, 'bracket_started',
    jsonb_build_object('artist_name', v_bracket.artist_name, 'size', p_size, 'bracket_id', v_bracket.id)
  );

  return v_bracket;
end;
$$;

-- Save (or change) one matchup pick. Winner must be a legal feeder of the slot:
-- round 1 feeds from track positions 2s-1/2s; later rounds feed from the
-- caller's own picks at (round-1, 2s-1/2s). Changing a pick deletes the now-
-- invalid downstream picks on this branch (the ones that chose the old winner).
create or replace function public.save_bracket_pick(
  p_bracket uuid,
  p_round int,
  p_slot int,
  p_winner uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bracket public.brackets;
  v_rounds int;
  v_old uuid;
  r int;
begin
  select * into v_bracket from brackets where id = p_bracket;
  if not found then
    raise exception 'Bracket not found';
  end if;
  if not public.is_club_member(v_bracket.club_id) then
    raise exception 'Not a club member';
  end if;
  if v_bracket.status <> 'open' then
    raise exception 'The bracket is closed';
  end if;
  if exists (
    select 1 from bracket_entries
    where bracket_id = p_bracket and profile_id = auth.uid() and completed_at is not null
  ) then
    raise exception 'Your bracket is locked — you already crowned a champion';
  end if;

  v_rounds := floor(log(2, v_bracket.size))::int;
  if p_round < 1 or p_round > v_rounds
     or p_slot < 1 or p_slot > v_bracket.size / (2 ^ p_round)::int then
    raise exception 'Invalid matchup';
  end if;

  if p_round = 1 then
    if not exists (
      select 1 from bracket_tracks
      where bracket_id = p_bracket and id = p_winner and position in (2 * p_slot - 1, 2 * p_slot)
    ) then
      raise exception 'That song is not in this matchup';
    end if;
  else
    if not exists (
      select 1 from bracket_picks
      where bracket_id = p_bracket and profile_id = auth.uid()
        and round = p_round - 1 and slot in (2 * p_slot - 1, 2 * p_slot)
        and winner_track_id = p_winner
    ) then
      raise exception 'That song is not in this matchup';
    end if;
  end if;

  insert into bracket_entries (bracket_id, profile_id)
  values (p_bracket, auth.uid())
  on conflict (bracket_id, profile_id) do nothing;

  select winner_track_id into v_old
  from bracket_picks
  where bracket_id = p_bracket and profile_id = auth.uid() and round = p_round and slot = p_slot;

  insert into bracket_picks (bracket_id, profile_id, round, slot, winner_track_id)
  values (p_bracket, auth.uid(), p_round, p_slot, p_winner)
  on conflict (bracket_id, profile_id, round, slot) do update set winner_track_id = excluded.winner_track_id;

  -- A track's path through the tree is unique, so downstream picks that chose
  -- the replaced winner are exactly the invalid ones.
  if v_old is not null and v_old <> p_winner then
    for r in (p_round + 1)..v_rounds loop
      delete from bracket_picks
      where bracket_id = p_bracket and profile_id = auth.uid()
        and round = r
        and slot = ((p_slot - 1) / (2 ^ (r - p_round))::int) + 1
        and winner_track_id = v_old;
    end loop;
  end if;
end;
$$;

-- Crown the champion: validates the tree is complete, locks the entry, emits
-- the (spoiler-free) activity event, and auto-closes the bracket when this was
-- the last member standing.
create or replace function public.crown_champion(p_bracket uuid)
returns public.bracket_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bracket public.brackets;
  v_rounds int;
  v_champion uuid;
  v_entry public.bracket_entries;
  v_done int;
  v_total int;
begin
  select * into v_bracket from brackets where id = p_bracket;
  if not found then
    raise exception 'Bracket not found';
  end if;
  if not public.is_club_member(v_bracket.club_id) then
    raise exception 'Not a club member';
  end if;
  if v_bracket.status <> 'open' then
    raise exception 'The bracket is closed';
  end if;

  v_rounds := floor(log(2, v_bracket.size))::int;
  -- A full valid tree has size-1 picks (feeder validation + downstream cleanup
  -- guarantee internal consistency, so the count check is sufficient).
  if (select count(*) from bracket_picks where bracket_id = p_bracket and profile_id = auth.uid())
     <> v_bracket.size - 1 then
    raise exception 'Finish every matchup before crowning a champion';
  end if;

  select winner_track_id into v_champion
  from bracket_picks
  where bracket_id = p_bracket and profile_id = auth.uid() and round = v_rounds and slot = 1;

  update bracket_entries
  set completed_at = now(), champion_track_id = v_champion
  where bracket_id = p_bracket and profile_id = auth.uid() and completed_at is null
  returning * into v_entry;
  if not found then
    raise exception 'Your bracket is already locked';
  end if;

  select count(*) filter (where e.completed_at is not null), count(*)
    into v_done, v_total
  from club_members cm
  left join bracket_entries e on e.bracket_id = p_bracket and e.profile_id = cm.profile_id
  where cm.club_id = v_bracket.club_id;

  -- Spoiler-free on purpose: the push names the artist, never the song.
  perform public.publish_activity_event(
    v_bracket.club_id, 'bracket_champion',
    jsonb_build_object(
      'artist_name', v_bracket.artist_name, 'bracket_id', p_bracket,
      'done', v_done, 'total', v_total
    )
  );

  if v_done >= v_total then
    update brackets set status = 'closed', closed_at = now() where id = p_bracket;
    perform public.publish_activity_event(
      v_bracket.club_id, 'bracket_closed',
      jsonb_build_object('artist_name', v_bracket.artist_name, 'bracket_id', p_bracket)
    );
  end if;

  return v_entry;
end;
$$;

-- Manual close (the ghost-member valve): launcher/admin/picker ends the bracket;
-- unfinished copies freeze and are excluded from consensus (no completed_at).
create or replace function public.close_bracket(p_bracket uuid)
returns public.brackets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bracket public.brackets;
begin
  select * into v_bracket from brackets where id = p_bracket;
  if not found then
    raise exception 'Bracket not found';
  end if;
  if v_bracket.created_by <> auth.uid() and not public.can_run_bracket(v_bracket.club_id) then
    raise exception 'Only an admin or the current picker can close the bracket';
  end if;
  if v_bracket.status <> 'open' then
    raise exception 'The bracket is already closed';
  end if;

  update brackets set status = 'closed', closed_at = now()
  where id = p_bracket
  returning * into v_bracket;

  perform public.publish_activity_event(
    v_bracket.club_id, 'bracket_closed',
    jsonb_build_object('artist_name', v_bracket.artist_name, 'bracket_id', p_bracket)
  );

  return v_bracket;
end;
$$;

-- Progress for the tile/status line without leaking champions: who has finished
-- (names are fine — songs are the spoiler) and the member total.
create or replace function public.bracket_progress(p_bracket uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (select count(*) from club_members cm
              join brackets b on b.club_id = cm.club_id
              where b.id = p_bracket and public.is_club_member(b.club_id)),
    'completed_ids', coalesce((
      select jsonb_agg(e.profile_id)
      from bracket_entries e
      join brackets b on b.id = e.bracket_id
      where e.bracket_id = p_bracket and e.completed_at is not null
        and public.is_club_member(b.club_id)
    ), '[]'::jsonb),
    'started_ids', coalesce((
      select jsonb_agg(e.profile_id)
      from bracket_entries e
      join brackets b on b.id = e.bracket_id
      where e.bracket_id = p_bracket and e.completed_at is null
        and public.is_club_member(b.club_id)
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.can_run_bracket(uuid) from anon, public;
revoke execute on function public.has_completed_bracket(uuid) from anon, public;
revoke execute on function public.create_bracket(uuid, text, text, text, int, jsonb) from anon, public;
revoke execute on function public.save_bracket_pick(uuid, int, int, uuid) from anon, public;
revoke execute on function public.crown_champion(uuid) from anon, public;
revoke execute on function public.close_bracket(uuid) from anon, public;
revoke execute on function public.bracket_progress(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════

alter table public.brackets enable row level security;
alter table public.bracket_tracks enable row level security;
alter table public.bracket_entries enable row level security;
alter table public.bracket_picks enable row level security;
alter table public.bracket_comments enable row level security;

create policy brackets_select on public.brackets
  for select to authenticated using (public.is_club_member(club_id));
-- Escape hatch for a botched launch: the launcher or an admin can delete an
-- OPEN bracket outright (cascades picks/comments). Closed brackets are history.
create policy brackets_delete on public.brackets
  for delete to authenticated
  using (
    status = 'open'
    and (created_by = auth.uid() or public.club_role(club_id) in ('owner', 'admin'))
  );

create policy bracket_tracks_select on public.bracket_tracks
  for select to authenticated
  using (exists (
    select 1 from brackets b where b.id = bracket_id and public.is_club_member(b.club_id)
  ));

-- Spoiler guard: your own rows always; everyone's rows once YOU have completed
-- this bracket or it has closed. Writes only via the RPCs.
create policy bracket_entries_select on public.bracket_entries
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from brackets b
      where b.id = bracket_id and public.is_club_member(b.club_id)
        and (b.status = 'closed' or public.has_completed_bracket(b.id))
    )
  );

create policy bracket_picks_select on public.bracket_picks
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from brackets b
      where b.id = bracket_id and public.is_club_member(b.club_id)
        and (b.status = 'closed' or public.has_completed_bracket(b.id))
    )
  );

create policy bracket_comments_select on public.bracket_comments
  for select to authenticated
  using (exists (
    select 1 from brackets b where b.id = bracket_id and public.is_club_member(b.club_id)
  ));
create policy bracket_comments_insert on public.bracket_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from brackets b where b.id = bracket_id and public.is_club_member(b.club_id))
  );
create policy bracket_comments_delete on public.bracket_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from brackets b where b.id = bracket_id and public.club_role(b.club_id) in ('owner', 'admin'))
  );
