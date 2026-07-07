-- Profile trophies + cycle Studio recap (TROPHIES_RECAP_PLAN.md).
--
-- Two READ-ONLY security-definer RPCs — no new tables. Trophies are computed
-- from the game tables on demand (retroactive for all past wins, no write-path
-- drift); the Studio recap is computed live because game results freeze when
-- the cycle closes, so every past cycle gains a Studio tab with zero backfill.

-- ═══════════════════════════════════════════════════════
-- member_studio_stats: one member's wins, feats, champions gallery, and
-- participation counts within one club.
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
    -- Crown = the game's FIRST verified bingo.
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
        'champ_artwork_url', t.artwork_url, 'champ_seed', t.seed
      ) order by e.completed_at desc)
      from bracket_entries e
      join brackets br on br.id = e.bracket_id
      join bracket_tracks t on t.id = e.champion_track_id
      where br.club_id = p_club and e.profile_id = p_profile and e.completed_at is not null
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'brackets_finished', (
        select count(*) from bracket_entries e join brackets br on br.id = e.bracket_id
        where br.club_id = p_club and e.profile_id = p_profile and e.completed_at is not null
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

-- ═══════════════════════════════════════════════════════
-- cycle_studio_recap: everything the studio produced during one cycle.
-- Cycle-tied rooms report results; standing rooms filter by the cycle's
-- open→close window (created_at → coalesce(closed_at, now())).
-- ═══════════════════════════════════════════════════════

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

revoke execute on function public.member_studio_stats(uuid, uuid) from anon, public;
revoke execute on function public.cycle_studio_recap(uuid) from anon, public;
