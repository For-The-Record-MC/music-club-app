-- v4 Phase 4: get_cycle_highlights(p_cycle) — the data behind the History
-- detail page (and the source ranking the cycle-highlights playlist reuses).
--
-- Member-gated, post-reveal only. Returns one JSON blob:
--   cycle          — number, picker, meeting/closed dates
--   albums         — per-album avg score, rating count, 👑 favorite votes, spread
--   winner_album_id — album with the most favorite votes (null on tie / no votes)
--   top_songs      — the COMBINED-SIGNAL ranking (album favorite/least votes +
--                    shared song-note thumbs/high ratings + feed reaction counts),
--                    positive scores only, best first
--   reviews        — the highest- and lowest-scoring written review per album
--   popular_shares — most-reacted feed posts shared during the cycle window
--
-- "Cycle window" for feed signal = [cycle.created_at, coalesce(closed_at, now())],
-- the same window spotify-sync uses for the per-cycle feed playlist.

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
  -- ── per-album stats ────────────────────────────────────────────────────────
  album_stats as (
    select a.id, a.slot, a.title, a.artist, a.artwork_url,
      round(avg(r.score)::numeric, 1) as avg_score,
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
  -- ── combined-signal song ranking ───────────────────────────────────────────
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
  -- ── standout reviews: highest + lowest scored written review per album ───────
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
    -- drop the low pick when it's the same row as the high pick (single review)
    select rl.* from review_low rl
    where not exists (
      select 1 from review_high rh
      where rh.album_id = rl.album_id and rh.profile_id = rl.profile_id
    )
  ),
  -- ── popular feed shares in the cycle window ─────────────────────────────────
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
        'artwork_url', s.artwork_url, 'avg_score', s.avg_score,
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

revoke execute on function public.get_cycle_highlights(uuid) from anon, public;
