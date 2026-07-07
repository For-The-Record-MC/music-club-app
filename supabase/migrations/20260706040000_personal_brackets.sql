-- Personal brackets: any member can run a solo Track Madness bracket outside
-- the club-wide one. Solo runs are private until closed (then browsable by the
-- club + shown on the owner's profile shelf with a "solo" tag), emit no
-- activity events, and never touch the club's live game or competitive stats.
-- When the club later launches a bracket for the same artist, the owner can
-- import their solo rankings as a pre-filled (still editable) starting point
-- via import_bracket_picks.

alter table public.brackets
  add column scope text not null default 'club' check (scope in ('club', 'personal')),
  add column owner_id uuid references public.profiles (id) on delete cascade;

-- One live bracket per club applies to CLUB brackets only; solo runs are
-- unlimited and concurrent.
drop index public.brackets_one_open_idx;
create unique index brackets_one_open_idx on public.brackets (club_id)
  where (status = 'open' and scope = 'club');

create index brackets_owner_idx on public.brackets (owner_id, created_at desc)
  where (scope = 'personal');

-- Who may see a bracket: club brackets → members; personal → the owner, or
-- any member once it's closed. Security definer so RLS policies across the
-- five bracket tables can share it without recursion.
create or replace function public.can_view_bracket(p_bracket uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from brackets b
    where b.id = p_bracket
      and (
        (b.scope = 'club' and public.is_club_member(b.club_id))
        or (b.scope = 'personal' and (
          b.owner_id = auth.uid()
          or (b.status = 'closed' and public.is_club_member(b.club_id))
        ))
      )
  );
$$;

revoke execute on function public.can_view_bracket(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- RPCs — recreated with scope awareness
-- ═══════════════════════════════════════════════════════

drop function public.create_bracket(uuid, text, text, text, int, jsonb);

create or replace function public.create_bracket(
  p_club uuid,
  p_artist_name text,
  p_artist_spotify_id text,
  p_artist_image_url text,
  p_size int,
  p_tracks jsonb,
  p_scope text default 'club'
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
  if p_scope not in ('club', 'personal') then
    raise exception 'Invalid scope';
  end if;
  if p_scope = 'club' then
    if not public.can_run_bracket(p_club) then
      raise exception 'Only an admin or the current picker can start a bracket';
    end if;
    if exists (select 1 from brackets where club_id = p_club and status = 'open' and scope = 'club') then
      raise exception 'A bracket is already live — close it first';
    end if;
  else
    -- Solo: any member, no live-bracket limit.
    if not public.is_club_member(p_club) then
      raise exception 'Not a club member';
    end if;
  end if;
  if p_size not in (16, 32, 64) then
    raise exception 'Bracket size must be 16, 32, or 64';
  end if;
  if jsonb_typeof(p_tracks) <> 'array' or jsonb_array_length(p_tracks) <> p_size then
    raise exception 'Expected exactly % tracks', p_size;
  end if;

  insert into brackets (club_id, artist_name, artist_spotify_id, artist_image_url, size, created_by, scope, owner_id)
  values (
    p_club, trim(p_artist_name), coalesce(p_artist_spotify_id, ''), p_artist_image_url, p_size, auth.uid(),
    p_scope, case when p_scope = 'personal' then auth.uid() end
  )
  returning * into v_bracket;

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

  -- Solo runs are silent; only club brackets announce.
  if p_scope = 'club' then
    perform public.publish_activity_event(
      p_club, 'bracket_started',
      jsonb_build_object('artist_name', v_bracket.artist_name, 'size', p_size, 'bracket_id', v_bracket.id)
    );
  end if;

  return v_bracket;
end;
$$;

-- save_bracket_pick: personal brackets accept picks from their owner only.
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
  if v_bracket.scope = 'personal' and v_bracket.owner_id <> auth.uid() then
    raise exception 'This is a solo bracket';
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

-- crown_champion: a solo crown closes the bracket immediately (single player),
-- silently. Club behavior unchanged.
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
  if v_bracket.scope = 'personal' and v_bracket.owner_id <> auth.uid() then
    raise exception 'This is a solo bracket';
  end if;
  if v_bracket.status <> 'open' then
    raise exception 'The bracket is closed';
  end if;

  v_rounds := floor(log(2, v_bracket.size))::int;
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

  if v_bracket.scope = 'personal' then
    update brackets set status = 'closed', closed_at = now() where id = p_bracket;
    return v_entry;
  end if;

  select count(*) filter (where e.completed_at is not null), count(*)
    into v_done, v_total
  from club_members cm
  left join bracket_entries e on e.bracket_id = p_bracket and e.profile_id = cm.profile_id
  where cm.club_id = v_bracket.club_id;

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

-- close_bracket: solo owners may close (abandon) their own runs; silent for
-- personal scope.
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
  if v_bracket.scope = 'personal' then
    if v_bracket.owner_id <> auth.uid() then
      raise exception 'This is a solo bracket';
    end if;
  elsif v_bracket.created_by <> auth.uid() and not public.can_run_bracket(v_bracket.club_id) then
    raise exception 'Only an admin or the current picker can close the bracket';
  end if;
  if v_bracket.status <> 'open' then
    raise exception 'The bracket is already closed';
  end if;

  update brackets set status = 'closed', closed_at = now()
  where id = p_bracket
  returning * into v_bracket;

  if v_bracket.scope = 'club' then
    perform public.publish_activity_event(
      v_bracket.club_id, 'bracket_closed',
      jsonb_build_object('artist_name', v_bracket.artist_name, 'bracket_id', p_bracket)
    );
  end if;

  return v_bracket;
end;
$$;

-- Bulk import: apply a full pick set in one call (the "use my solo rankings"
-- flow — 63 sequential save_bracket_pick round-trips would crawl). Validates
-- exactly like save_bracket_pick, ordered by round, and requires a clean
-- slate so an import can never clobber real picks.
create or replace function public.import_bracket_picks(p_bracket uuid, p_picks jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bracket public.brackets;
  v_rounds int;
  pk jsonb;
  v_round int;
  v_slot int;
  v_winner uuid;
begin
  select * into v_bracket from brackets where id = p_bracket;
  if not found then
    raise exception 'Bracket not found';
  end if;
  if not public.is_club_member(v_bracket.club_id) then
    raise exception 'Not a club member';
  end if;
  if v_bracket.scope = 'personal' and v_bracket.owner_id <> auth.uid() then
    raise exception 'This is a solo bracket';
  end if;
  if v_bracket.status <> 'open' then
    raise exception 'The bracket is closed';
  end if;
  if exists (select 1 from bracket_picks where bracket_id = p_bracket and profile_id = auth.uid()) then
    raise exception 'You already have picks here — imports need a fresh bracket';
  end if;
  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) <> v_bracket.size - 1 then
    raise exception 'Expected exactly % picks', v_bracket.size - 1;
  end if;

  v_rounds := floor(log(2, v_bracket.size))::int;

  insert into bracket_entries (bracket_id, profile_id)
  values (p_bracket, auth.uid())
  on conflict (bracket_id, profile_id) do nothing;

  for pk in
    select value from jsonb_array_elements(p_picks)
    order by (value ->> 'round')::int, (value ->> 'slot')::int
  loop
    v_round := (pk ->> 'round')::int;
    v_slot := (pk ->> 'slot')::int;
    v_winner := (pk ->> 'winner')::uuid;
    if v_round < 1 or v_round > v_rounds
       or v_slot < 1 or v_slot > v_bracket.size / (2 ^ v_round)::int then
      raise exception 'Invalid matchup %/%', v_round, v_slot;
    end if;
    if v_round = 1 then
      if not exists (
        select 1 from bracket_tracks
        where bracket_id = p_bracket and id = v_winner and position in (2 * v_slot - 1, 2 * v_slot)
      ) then
        raise exception 'Pick %/% is not in that matchup', v_round, v_slot;
      end if;
    else
      if not exists (
        select 1 from bracket_picks
        where bracket_id = p_bracket and profile_id = auth.uid()
          and round = v_round - 1 and slot in (2 * v_slot - 1, 2 * v_slot)
          and winner_track_id = v_winner
      ) then
        raise exception 'Pick %/% is not in that matchup', v_round, v_slot;
      end if;
    end if;
    insert into bracket_picks (bracket_id, profile_id, round, slot, winner_track_id)
    values (p_bracket, auth.uid(), v_round, v_slot, v_winner);
  end loop;
end;
$$;

revoke execute on function public.create_bracket(uuid, text, text, text, int, jsonb, text) from anon, public;
revoke execute on function public.import_bracket_picks(uuid, jsonb) from anon, public;

-- ═══════════════════════════════════════════════════════
-- RLS — visibility now flows through can_view_bracket
-- ═══════════════════════════════════════════════════════

drop policy brackets_select on public.brackets;
create policy brackets_select on public.brackets
  for select to authenticated using (public.can_view_bracket(id));

-- Solo owners can scrap their own runs anytime (open or closed — it's their
-- data); club rules unchanged.
drop policy brackets_delete on public.brackets;
create policy brackets_delete on public.brackets
  for delete to authenticated
  using (
    (scope = 'personal' and owner_id = auth.uid())
    or (
      scope = 'club' and status = 'open'
      and (created_by = auth.uid() or public.club_role(club_id) in ('owner', 'admin'))
    )
  );

drop policy bracket_tracks_select on public.bracket_tracks;
create policy bracket_tracks_select on public.bracket_tracks
  for select to authenticated using (public.can_view_bracket(bracket_id));

-- Own rows always; others' rows per club spoiler guard (club scope) or once a
-- solo run is closed and browsable.
drop policy bracket_entries_select on public.bracket_entries;
create policy bracket_entries_select on public.bracket_entries
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from brackets b
      where b.id = bracket_id and public.can_view_bracket(b.id)
        and (b.status = 'closed' or (b.scope = 'club' and public.has_completed_bracket(b.id)))
    )
  );

drop policy bracket_picks_select on public.bracket_picks;
create policy bracket_picks_select on public.bracket_picks
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from brackets b
      where b.id = bracket_id and public.can_view_bracket(b.id)
        and (b.status = 'closed' or (b.scope = 'club' and public.has_completed_bracket(b.id)))
    )
  );

drop policy bracket_comments_select on public.bracket_comments;
create policy bracket_comments_select on public.bracket_comments
  for select to authenticated using (public.can_view_bracket(bracket_id));
drop policy bracket_comments_insert on public.bracket_comments;
create policy bracket_comments_insert on public.bracket_comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_view_bracket(bracket_id));

-- ═══════════════════════════════════════════════════════
-- Stats stay club-pure: solo brackets tag the champions gallery but never
-- count as competitive credit, and never appear in cycle recaps.
-- ═══════════════════════════════════════════════════════

create or replace function public.member_studio_stats(p_club uuid, p_profile uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.is_club_member(p_club) then null else jsonb_build_object(
    'showdown_wins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cycle_number', c.number, 'title', ss.title, 'artist', ss.artist, 'theme', sd.theme_text
      ) order by c.number)
      from showdowns sd
      join cycles c on c.id = sd.cycle_id
      join showdown_submissions ss on ss.id = sd.winner_submission_id
      where sd.club_id = p_club and ss.profile_id = p_profile
    ), '[]'::jsonb),
    'aux_wins', coalesce((
      select jsonb_agg(jsonb_build_object('cycle_number', c.number, 'theme', ab.theme_text) order by c.number)
      from aux_battles ab
      join cycles c on c.id = ab.cycle_id
      where ab.club_id = p_club and ab.winner_profile_id = p_profile
    ), '[]'::jsonb),
    'bingo_crowns', coalesce((
      select jsonb_agg(jsonb_build_object('at', fc.resolved_at) order by fc.resolved_at)
      from (
        select distinct on (k.game_id) k.game_id, k.profile_id, cl.resolved_at
        from bingo_claims cl
        join bingo_cards k on k.id = cl.card_id
        join bingo_games g on g.id = k.game_id
        where g.club_id = p_club and cl.status = 'verified'
        order by k.game_id, cl.resolved_at asc
      ) fc
      where fc.profile_id = p_profile
    ), '[]'::jsonb),
    'blackouts', coalesce((
      select jsonb_agg(jsonb_build_object('at', bo.done_at) order by bo.done_at)
      from (
        select k.id, max(b.activated_at) as done_at
        from bingo_cards k
        join bingo_games g on g.id = k.game_id
        join bingo_boxes b on b.card_id = k.id
        where g.club_id = p_club and k.profile_id = p_profile and b.activated_at is not null
        group by k.id
        having count(*) = 24
      ) bo
    ), '[]'::jsonb),
    'champions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bracket_id', br.id, 'artist_name', br.artist_name, 'size', br.size,
        'closed_at', br.closed_at, 'champ_title', t.title,
        'champ_artwork_url', t.artwork_url, 'champ_seed', t.seed,
        'scope', br.scope
      ) order by e.completed_at desc)
      from bracket_entries e
      join brackets br on br.id = e.bracket_id
      join bracket_tracks t on t.id = e.champion_track_id
      where br.club_id = p_club and e.profile_id = p_profile and e.completed_at is not null
        and (br.scope = 'club' or br.status = 'closed')
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'brackets_finished', (
        select count(*) from bracket_entries e join brackets br on br.id = e.bracket_id
        where br.club_id = p_club and e.profile_id = p_profile and e.completed_at is not null
          and br.scope = 'club'
      ),
      'takes', (select count(*) from musical_takes where club_id = p_club and author_id = p_profile),
      'bars', (select count(*) from best_bars where club_id = p_club and author_id = p_profile),
      'boxes_lit', (
        select count(*) from bingo_boxes b
        join bingo_cards k on k.id = b.card_id
        join bingo_games g on g.id = k.game_id
        where g.club_id = p_club and k.profile_id = p_profile and b.activated_at is not null
      ),
      'bingos', (
        select count(*) from bingo_claims cl
        join bingo_cards k on k.id = cl.card_id
        join bingo_games g on g.id = k.game_id
        where g.club_id = p_club and k.profile_id = p_profile and cl.status = 'verified'
      ),
      'conversions', (
        select count(*) from convince_targets t
        join convince_posts cp on cp.id = t.post_id
        where cp.club_id = p_club and cp.author_id = p_profile and t.verdict = 'converted'
      )
    )
  ) end;
$$;

-- Cycle recaps list club brackets only — solo runs are not cycle events.
create or replace function public.cycle_studio_recap(p_cycle uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
  v_from timestamptz;
  v_to timestamptz;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found or not public.is_club_member(v_cycle.club_id) then
    return null;
  end if;
  v_from := v_cycle.created_at;
  v_to := coalesce(v_cycle.closed_at, now());

  return jsonb_build_object(
    'showdown', (
      select jsonb_build_object(
        'theme', sd.theme_text,
        'podium', coalesce((
          select jsonb_agg(row_json order by rn)
          from (
            select row_number() over (
              order by
                coalesce((select sum(v.value) from showdown_votes v where v.submission_id = s.id), 0) desc,
                coalesce((select count(*) from showdown_votes v where v.submission_id = s.id and v.value = 1), 0) desc,
                s.created_at asc
            ) as rn,
            jsonb_build_object(
              'title', s.title, 'artist', s.artist, 'artwork_url', s.artwork_url,
              'submitter', p.display_name,
              'net', coalesce((select sum(v.value) from showdown_votes v where v.submission_id = s.id), 0)
            ) as row_json
            from showdown_submissions s
            join profiles p on p.id = s.profile_id
            where s.showdown_id = sd.id
          ) ranked
          where rn <= 3
        ), '[]'::jsonb)
      )
      from showdowns sd where sd.cycle_id = p_cycle
    ),
    'aux', coalesce((
      select jsonb_agg(jsonb_build_object(
        'theme', ab.theme_text,
        'a', pa.display_name, 'b', pb.display_name,
        'winner', pw.display_name,
        'a_votes', (select count(*) from aux_battle_votes v where v.battle_id = ab.id and v.choice = ab.member_a),
        'b_votes', (select count(*) from aux_battle_votes v where v.battle_id = ab.id and v.choice = ab.member_b)
      ) order by ab.created_at)
      from aux_battles ab
      join profiles pa on pa.id = ab.member_a
      join profiles pb on pb.id = ab.member_b
      left join profiles pw on pw.id = ab.winner_profile_id
      where ab.cycle_id = p_cycle
    ), '[]'::jsonb),
    'playlist', (
      select jsonb_build_object(
        'theme', pp.theme_text,
        'song_count', (select count(*) from perfect_playlist_songs s where s.playlist_id = pp.id),
        'contributor_count', (select count(distinct s.profile_id) from perfect_playlist_songs s where s.playlist_id = pp.id)
      )
      from perfect_playlists pp where pp.cycle_id = p_cycle
    ),
    'bingo', (
      select jsonb_build_object(
        'cards', (select count(*) from bingo_cards k where k.game_id = g.id),
        'standings', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', p.display_name, 'line_index', cl.line_index, 'self_certified', cl.self_certified
          ) order by cl.resolved_at)
          from bingo_claims cl
          join bingo_cards k on k.id = cl.card_id
          join profiles p on p.id = k.profile_id
          where k.game_id = g.id and cl.status = 'verified'
        ), '[]'::jsonb),
        'blackouts', coalesce((
          select jsonb_agg(p.display_name)
          from bingo_cards k
          join profiles p on p.id = k.profile_id
          where k.game_id = g.id
            and (select count(*) from bingo_boxes b where b.card_id = k.id and b.activated_at is not null) = 24
        ), '[]'::jsonb)
      )
      from bingo_games g where g.cycle_id = p_cycle
    ),
    'brackets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', br.id, 'artist_name', br.artist_name, 'size', br.size, 'closed_at', br.closed_at
      ) order by br.closed_at)
      from brackets br
      where br.club_id = v_cycle.club_id and br.status = 'closed'
        and br.scope = 'club'
        and br.closed_at between v_from and v_to
    ), '[]'::jsonb),
    'window', jsonb_build_object(
      'takes', coalesce((
        select jsonb_agg(jsonb_build_object('author', p.display_name, 'snippet', left(mt.body, 140)) order by mt.created_at desc)
        from (
          select * from musical_takes
          where club_id = v_cycle.club_id and created_at between v_from and v_to
          order by created_at desc limit 6
        ) mt
        join profiles p on p.id = mt.author_id
      ), '[]'::jsonb),
      'bars', coalesce((
        select jsonb_agg(jsonb_build_object(
          'author', p.display_name, 'snippet', left(bb.lyric, 140), 'title', bb.title
        ) order by bb.created_at desc)
        from (
          select * from best_bars
          where club_id = v_cycle.club_id and created_at between v_from and v_to
          order by created_at desc limit 6
        ) bb
        join profiles p on p.id = bb.author_id
      ), '[]'::jsonb),
      'share_count', (
        select count(*) from feed_posts
        where club_id = v_cycle.club_id and not is_album_suggestion
          and created_at between v_from and v_to
      ),
      'convince_conversions', (
        select count(*) from convince_targets t
        join convince_posts cp on cp.id = t.post_id
        where cp.club_id = v_cycle.club_id and t.verdict = 'converted'
          and cp.created_at between v_from and v_to
      )
    )
  );
end;
$$;
