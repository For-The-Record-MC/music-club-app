-- Recap v3: surface the last two collected-but-hidden review signals.
--
--   • albums[].avg_replayability — average "would I come back" slider per album.
--   • head_to_head               — each member's cycle pick with their reasons
--                                  ("why X over Y" + "what the other did better").
--
-- Still member-gated + post-reveal. This is a full re-create of the function
-- (Postgres requires the whole body); only album_stats, the new h2h CTE, and two
-- json fields differ from v2.

create or replace function public.get_cycle_highlights(p_cycle uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_revealed timestamptz;
  v_result json;
begin
  select c.club_id, c.revealed_at into v_club, v_revealed
  from cycles c where c.id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;
  if v_revealed is null then
    raise exception 'Cycle not revealed yet';
  end if;

  with cyc as (
    select c.*, p.display_name as picker_name
    from cycles c
    left join profiles p on p.id = c.picker_id
    where c.id = p_cycle
  ),
  alb as (
    select * from albums where cycle_id = p_cycle
  ),
  album_track_nums as (
    select a.id as album_id,
      coalesce((t.val->>'trackNumber')::int, t.ord::int) as track_number,
      (t.val->>'trackName') as track_name
    from alb a,
      jsonb_array_elements(coalesce(a.tracks, '[]'::jsonb)) with ordinality as t(val, ord)
    where (t.val->>'trackName') is not null
  ),
  album_stats as (
    select a.id, a.slot, a.title, a.artist, a.artwork_url,
      round(avg(r.score)::numeric, 1) as avg_score,
      round(avg(r.initial_score)::numeric, 1) as avg_initial,
      round(avg(r.replayability)::numeric, 1) as avg_replayability,
      count(r.*) as rating_count,
      min(r.score) as min_score,
      max(r.score) as max_score
    from alb a
    left join ratings r on r.album_id = a.id
    group by a.id, a.slot, a.title, a.artist, a.artwork_url
  ),
  fav_votes as (
    select album_id, count(*) as votes
    from cycle_preferences
    where cycle_id = p_cycle
    group by album_id
  ),
  album_tracks as (
    select a.id as album_id, a.artist as album_artist, a.artwork_url,
      (t->>'trackName') as track_name
    from alb a, jsonb_array_elements(coalesce(a.tracks, '[]'::jsonb)) t
    where (t->>'trackName') is not null
  ),
  fav_pts as (
    select album_id, favorite_track as track_name, count(*) * 3 as pts
    from ratings
    where album_id in (select id from alb) and favorite_track is not null
    group by album_id, favorite_track
  ),
  least_pts as (
    select album_id, least_track as track_name, count(*) * -2 as pts
    from ratings
    where album_id in (select id from alb) and least_track is not null
    group by album_id, least_track
  ),
  note_pts as (
    select sn.album_id, sn.track_name,
      sum(
        (case when sn.thumb = 'up' then 1 when sn.thumb = 'down' then -1 else 0 end)
        + (case when sn.rating >= 8 then 1 else 0 end)
      ) as pts
    from song_notes sn
    join song_note_shares sh
      on sh.album_id = sn.album_id and sh.profile_id = sn.profile_id
    where sn.album_id in (select id from alb)
    group by sn.album_id, sn.track_name
  ),
  album_song_scores as (
    select at.album_id, at.album_artist, at.artwork_url, at.track_name,
      coalesce(f.pts, 0) + coalesce(l.pts, 0) + coalesce(n.pts, 0) as score
    from album_tracks at
    left join fav_pts f on f.album_id = at.album_id and f.track_name = at.track_name
    left join least_pts l on l.album_id = at.album_id and l.track_name = at.track_name
    left join note_pts n on n.album_id = at.album_id and n.track_name = at.track_name
  ),
  feed_songs as (
    select fp.id as post_id, fp.title, fp.artist,
      fp.metadata->>'spotify_uri' as spotify_uri,
      fp.metadata->>'artwork' as artwork_url,
      count(pr.*) filter (where pr.emoji in ('👍', '❤️', '🔥', '😂')) as score
    from feed_posts fp
    left join post_reactions pr on pr.post_id = fp.id
    where fp.club_id = (select club_id from cyc)
      and fp.kind = 'track'
      and fp.created_at >= (select created_at from cyc)
      and fp.created_at <= coalesce((select closed_at from cyc), now())
    group by fp.id, fp.title, fp.artist, fp.metadata
  ),
  song_ranking as (
    select json_build_object(
      'source', 'album', 'title', track_name, 'artist', album_artist,
      'album_id', album_id, 'artwork_url', artwork_url, 'score', score
    ) as obj, score
    from album_song_scores where score > 0
    union all
    select json_build_object(
      'source', 'feed', 'title', title, 'artist', artist, 'post_id', post_id,
      'spotify_uri', spotify_uri, 'artwork_url', artwork_url, 'score', score
    ) as obj, score
    from feed_songs where score > 0
  ),
  review_high as (
    select distinct on (r.album_id)
      r.album_id, a.title as album_title, r.profile_id, r.score, r.review, 'high' as kind
    from ratings r join alb a on a.id = r.album_id
    where r.review is not null and char_length(trim(r.review)) > 0
    order by r.album_id, r.score desc, char_length(r.review) desc
  ),
  review_low as (
    select distinct on (r.album_id)
      r.album_id, a.title as album_title, r.profile_id, r.score, r.review, 'low' as kind
    from ratings r join alb a on a.id = r.album_id
    where r.review is not null and char_length(trim(r.review)) > 0
    order by r.album_id, r.score asc, char_length(r.review) desc
  ),
  reviews as (
    select * from review_high
    union all
    select rl.* from review_low rl
    where not exists (
      select 1 from review_high rh
      where rh.album_id = rl.album_id and rh.profile_id = rl.profile_id
    )
  ),
  takes as (
    select r.album_id, a.title as album_title, a.slot, r.profile_id,
      r.score, r.one_sentence_take
    from ratings r join alb a on a.id = r.album_id
    where r.one_sentence_take is not null and char_length(trim(r.one_sentence_take)) > 0
  ),
  vibe_counts as (
    select tag, count(*) as n
    from (
      select unnest(sn.vibe_tags) as tag
      from song_notes sn
      join song_note_shares sh
        on sh.album_id = sn.album_id and sh.profile_id = sn.profile_id
      where sn.album_id in (select id from alb)
      union all
      select unnest(r.album_vibe_tags) as tag
      from ratings r
      where r.album_id in (select id from alb)
    ) t
    where tag is not null and char_length(trim(tag)) > 0
    group by tag
    order by n desc, tag
    limit 8
  ),
  fav_lyrics as (
    select sn.album_id, sn.track_name as context, sn.favorite_lyric as lyric, sn.profile_id
    from song_notes sn
    join song_note_shares sh
      on sh.album_id = sn.album_id and sh.profile_id = sn.profile_id
    where sn.album_id in (select id from alb)
      and sn.favorite_lyric is not null and char_length(trim(sn.favorite_lyric)) > 0
    union all
    select r.album_id, a.title as context, r.favorite_lyric as lyric, r.profile_id
    from ratings r join alb a on a.id = r.album_id
    where r.favorite_lyric is not null and char_length(trim(r.favorite_lyric)) > 0
  ),
  run_pick as (
    select album_id, best_run_start,
      count(*) as picks, round(avg(best_run_rating)::numeric, 1) as avg_rating
    from ratings
    where album_id in (select id from alb) and best_run_start is not null
    group by album_id, best_run_start
  ),
  best_run as (
    select distinct on (album_id) album_id, best_run_start, picks, avg_rating
    from run_pick
    order by album_id, picks desc, avg_rating desc nulls last
  ),
  saved as (
    select sn.album_id, sn.track_name, count(*) as saves
    from song_notes sn
    where sn.album_id in (select id from alb) and sn.saved_to_library
    group by sn.album_id, sn.track_name
    order by saves desc, sn.track_name
    limit 8
  ),
  -- ── head-to-head: each member's cycle pick + reasons ────────────────────────
  h2h as (
    select cp.profile_id, cp.album_id, a.title as album_title,
      cp.preference_reason, cp.other_album_merit
    from cycle_preferences cp
    join alb a on a.id = cp.album_id
    where cp.cycle_id = p_cycle
      and (cp.preference_reason is not null or cp.other_album_merit is not null)
  ),
  popular as (
    select fp.id as post_id, fp.kind, fp.title, fp.artist, fp.url,
      fp.metadata->>'artwork' as artwork_url,
      count(pr.*) filter (where pr.emoji in ('👍', '❤️', '🔥', '😂')) as reactions
    from feed_posts fp
    left join post_reactions pr on pr.post_id = fp.id
    where fp.club_id = (select club_id from cyc)
      and fp.created_at >= (select created_at from cyc)
      and fp.created_at <= coalesce((select closed_at from cyc), now())
    group by fp.id, fp.kind, fp.title, fp.artist, fp.url, fp.metadata
    having count(pr.*) filter (where pr.emoji in ('👍', '❤️', '🔥', '😂')) > 0
    order by reactions desc
    limit 3
  )
  select json_build_object(
    'cycle', (
      select json_build_object(
        'id', id, 'number', number, 'picker_id', picker_id, 'picker_name', picker_name,
        'meeting_at', meeting_at, 'closed_at', closed_at,
        'spotify_playlist_url', spotify_playlist_url
      ) from cyc
    ),
    'albums', coalesce((
      select json_agg(json_build_object(
        'album_id', s.id, 'slot', s.slot, 'title', s.title, 'artist', s.artist,
        'artwork_url', s.artwork_url, 'avg_score', s.avg_score, 'avg_initial', s.avg_initial,
        'avg_replayability', s.avg_replayability,
        'rating_count', s.rating_count, 'min_score', s.min_score, 'max_score', s.max_score,
        'favorite_votes', coalesce(fv.votes, 0)
      ) order by s.slot)
      from album_stats s left join fav_votes fv on fv.album_id = s.id
    ), '[]'::json),
    'winner_album_id', (
      select album_id from fav_votes
      where votes = (select max(votes) from fav_votes)
        and (select count(*) from fav_votes f2 where f2.votes = (select max(votes) from fav_votes)) = 1
      limit 1
    ),
    'top_songs', coalesce((
      select json_agg(obj order by score desc) from song_ranking
    ), '[]'::json),
    'reviews', coalesce((
      select json_agg(json_build_object(
        'album_id', rv.album_id, 'album_title', rv.album_title, 'kind', rv.kind,
        'profile_id', rv.profile_id, 'score', rv.score, 'review', rv.review,
        'display_name', p.display_name, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
      ))
      from reviews rv left join profiles p on p.id = rv.profile_id
    ), '[]'::json),
    'takes', coalesce((
      select json_agg(json_build_object(
        'album_id', tk.album_id, 'album_title', tk.album_title, 'profile_id', tk.profile_id,
        'score', tk.score, 'take', tk.one_sentence_take,
        'display_name', p.display_name, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
      ) order by tk.slot, tk.score desc)
      from takes tk left join profiles p on p.id = tk.profile_id
    ), '[]'::json),
    'cycle_vibe', coalesce((
      select json_agg(json_build_object('tag', tag, 'count', n) order by n desc, tag)
      from vibe_counts
    ), '[]'::json),
    'favorite_lyrics', coalesce((
      select json_agg(json_build_object(
        'album_id', fl.album_id, 'context', fl.context, 'lyric', fl.lyric,
        'display_name', p.display_name, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
      ))
      from fav_lyrics fl left join profiles p on p.id = fl.profile_id
    ), '[]'::json),
    'best_runs', coalesce((
      select json_agg(json_build_object(
        'album_id', br.album_id, 'album_title', a.title, 'start', br.best_run_start,
        'picks', br.picks, 'avg_rating', br.avg_rating,
        'tracks', coalesce((
          select json_agg(atn.track_name order by atn.track_number)
          from album_track_nums atn
          where atn.album_id = br.album_id
            and atn.track_number between br.best_run_start and br.best_run_start + 2
        ), '[]'::json)
      ) order by a.slot)
      from best_run br join alb a on a.id = br.album_id
    ), '[]'::json),
    'most_saved', coalesce((
      select json_agg(json_build_object(
        'album_id', sv.album_id, 'album_title', a.title, 'artwork_url', a.artwork_url,
        'track_name', sv.track_name, 'saves', sv.saves
      ) order by sv.saves desc, sv.track_name)
      from saved sv join alb a on a.id = sv.album_id
    ), '[]'::json),
    'head_to_head', coalesce((
      select json_agg(json_build_object(
        'profile_id', h.profile_id, 'album_id', h.album_id, 'album_title', h.album_title,
        'preference_reason', h.preference_reason, 'other_album_merit', h.other_album_merit,
        'display_name', p.display_name, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
      ))
      from h2h h left join profiles p on p.id = h.profile_id
    ), '[]'::json),
    'popular_shares', coalesce((
      select json_agg(json_build_object(
        'post_id', post_id, 'kind', kind, 'title', title, 'artist', artist,
        'url', url, 'artwork_url', artwork_url, 'reactions', reactions
      ) order by reactions desc)
      from popular
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;
