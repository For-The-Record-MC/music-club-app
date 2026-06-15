-- Profiles & per-club leaderboard.
--   profile_tracks  — three featured songs per profile (new / old / obsession),
--                     a global property of the person (shows in every club).
--   clubs.leaderboard_weights — owner/admin-tunable scoring for "Most Active".
--   club_leaderboard RPC — one trusted place that computes every member's stats
--                     (and the weighted active score) for a club, enforcing the
--                     ratings reveal-seal centrally.

-- ═══════════════════════════════════════════════════════
-- FEATURED TRACKS (global, on the profile)
-- ═══════════════════════════════════════════════════════

create table public.profile_tracks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  slot text not null check (slot in ('new', 'old', 'obsession')),
  track_name text not null check (char_length(trim(track_name)) between 1 and 300),
  artist_name text not null default '',
  album_name text not null default '',
  artwork_url text,
  spotify_url text,
  spotify_uri text,
  caption text check (caption is null or char_length(caption) <= 140),
  updated_at timestamptz not null default now(),
  primary key (profile_id, slot)
);

alter table public.profile_tracks enable row level security;

-- Read by anyone signed in (matches profiles: names/avatars are public to all
-- members). Write only your own rows.
create policy profile_tracks_select on public.profile_tracks
  for select to authenticated using (true);
create policy profile_tracks_write on public.profile_tracks
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ═══════════════════════════════════════════════════════
-- LEADERBOARD SCORING WEIGHTS (per club, owner/admin-tunable)
-- ═══════════════════════════════════════════════════════

-- Weights for the "Most Active" points score. Only the keys present here are
-- scored; missing keys count as 0. "Top Rated" (avg rating) and "Most Loved"
-- (interactions received) are intentionally NOT weighted — they stay legible.
alter table public.clubs
  add column leaderboard_weights jsonb not null default jsonb_build_object(
    'songs_shared', 3,
    'interactions_given', 1,
    'ratings_given', 2,
    'concerts_added', 2,
    'meetings_attended', 5,
    'albums_chosen', 4
  );

-- ═══════════════════════════════════════════════════════
-- LEADERBOARD RPC — the single source of truth for member stats
-- ═══════════════════════════════════════════════════════

-- Returns a JSON array, one object per club member:
--   { profile_id, display_name, avatar_color, avatar_url, avatar_label,
--     role, joined_at, last_active_at,
--     stats: { albums_chosen, avg_rating_received, ratings_given,
--              interactions_given, interactions_received, songs_shared,
--              concerts_added, meetings_attended },
--     active_score }
--
-- security definer so it can aggregate across members regardless of the
-- caller's RLS view, but gated to club members. The ratings seal is honoured
-- here: avg_rating_received aggregates REVEALED cycles only, so an in-flight
-- cycle never leaks. Adding a future metric = one subquery + (optionally) one
-- weight key — no client or RLS changes.
create or replace function public.club_leaderboard(p_club uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_weights jsonb;
  v_result json;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;

  select coalesce(leaderboard_weights, '{}'::jsonb) into v_weights
  from clubs where id = p_club;

  select coalesce(json_agg(r order by r.active_score desc), '[]'::json)
  into v_result
  from (
    select
      cm.profile_id,
      p.display_name,
      p.avatar_color,
      p.avatar_url,
      p.avatar_label,
      cm.role,
      cm.joined_at,
      -- Most recent club activity, for client-side tie-breaking. GREATEST
      -- ignores NULLs, returning NULL only when the member has done nothing.
      greatest(
        (select max(fp.created_at) from feed_posts fp
           where fp.club_id = p_club and fp.author_id = cm.profile_id),
        (select max(pr.created_at) from post_reactions pr
           join feed_posts fp on fp.id = pr.post_id
          where fp.club_id = p_club and pr.profile_id = cm.profile_id),
        (select max(pc.created_at) from post_comments pc
           join feed_posts fp on fp.id = pc.post_id
          where fp.club_id = p_club and pc.author_id = cm.profile_id),
        (select max(rt.updated_at) from ratings rt
           join albums a on a.id = rt.album_id
           join cycles c on c.id = a.cycle_id
          where c.club_id = p_club and rt.profile_id = cm.profile_id),
        (select max(co.created_at) from concerts co
           where co.club_id = p_club and co.added_by = cm.profile_id)
      ) as last_active_at,
      jsonb_build_object(
        'albums_chosen', stats.albums_chosen,
        'avg_rating_received', stats.avg_rating_received,
        'ratings_given', stats.ratings_given,
        'interactions_given', stats.interactions_given,
        'interactions_received', stats.interactions_received,
        'songs_shared', stats.songs_shared,
        'concerts_added', stats.concerts_added,
        'meetings_attended', stats.meetings_attended
      ) as stats,
      ( stats.songs_shared        * coalesce((v_weights->>'songs_shared')::numeric, 0)
      + stats.interactions_given  * coalesce((v_weights->>'interactions_given')::numeric, 0)
      + stats.ratings_given       * coalesce((v_weights->>'ratings_given')::numeric, 0)
      + stats.concerts_added      * coalesce((v_weights->>'concerts_added')::numeric, 0)
      + stats.meetings_attended   * coalesce((v_weights->>'meetings_attended')::numeric, 0)
      + stats.albums_chosen       * coalesce((v_weights->>'albums_chosen')::numeric, 0)
      ) as active_score
    from club_members cm
    join profiles p on p.id = cm.profile_id
    cross join lateral (
      select
        -- albums chosen: every album this member set in the club
        (select count(*)::int from albums a
           join cycles c on c.id = a.cycle_id
          where c.club_id = p_club and a.set_by = cm.profile_id) as albums_chosen,
        -- avg rating received on their picks — REVEALED cycles only (the seal)
        (select round(avg(rt.score)::numeric, 1) from ratings rt
           join albums a on a.id = rt.album_id
           join cycles c on c.id = a.cycle_id
          where c.club_id = p_club and a.set_by = cm.profile_id
            and c.revealed_at is not null) as avg_rating_received,
        -- ratings they submitted in the club
        (select count(*)::int from ratings rt
           join albums a on a.id = rt.album_id
           join cycles c on c.id = a.cycle_id
          where c.club_id = p_club and rt.profile_id = cm.profile_id) as ratings_given,
        -- interactions given: reactions + comments on OTHERS' posts (no self)
        ( (select count(*) from post_reactions pr
             join feed_posts fp on fp.id = pr.post_id
            where fp.club_id = p_club and pr.profile_id = cm.profile_id
              and fp.author_id <> cm.profile_id)
        + (select count(*) from post_comments pc
             join feed_posts fp on fp.id = pc.post_id
            where fp.club_id = p_club and pc.author_id = cm.profile_id
              and fp.author_id <> cm.profile_id) )::int as interactions_given,
        -- interactions received: OTHERS reacting/commenting on my posts (no self)
        ( (select count(*) from post_reactions pr
             join feed_posts fp on fp.id = pr.post_id
            where fp.club_id = p_club and fp.author_id = cm.profile_id
              and pr.profile_id <> cm.profile_id)
        + (select count(*) from post_comments pc
             join feed_posts fp on fp.id = pc.post_id
            where fp.club_id = p_club and fp.author_id = cm.profile_id
              and pc.author_id <> cm.profile_id) )::int as interactions_received,
        -- songs shared: feed posts they authored
        (select count(*)::int from feed_posts fp
          where fp.club_id = p_club and fp.author_id = cm.profile_id) as songs_shared,
        -- concerts added
        (select count(*)::int from concerts co
          where co.club_id = p_club and co.added_by = cm.profile_id) as concerts_added,
        -- meetings attended: 'yes' RSVP on a closed cycle
        (select count(*)::int from rsvps rv
           join cycles c on c.id = rv.cycle_id
          where c.club_id = p_club and rv.profile_id = cm.profile_id
            and rv.status = 'yes' and c.status = 'closed') as meetings_attended
    ) stats
    where cm.club_id = p_club
  ) r;

  return v_result;
end;
$$;

revoke execute on function public.club_leaderboard(uuid) from anon, public;
