-- Denormalize the signup email onto profiles so member lists can fall back to it
-- when someone hasn't set a display name yet (the UI shows the local-part only,
-- e.g. "jordanreticker", never the full address).
--
-- Email lives in auth.users, which the client can't read and the security-definer
-- RPCs would otherwise have to join. profiles already carries display_name and
-- avatars as the "public to all members" identity row (profiles_select is
-- using(true)), so email belongs there too. We keep it fresh with triggers on
-- auth.users for both INSERT (via handle_new_user) and email changes.

alter table public.profiles add column if not exists email text;

-- Backfill existing rows from auth.users.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- Populate email alongside the profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, avatar_color)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    new.email,
    floor(random() * 7)::int
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- Keep profiles.email in sync when a user changes their auth email.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

revoke execute on function public.sync_profile_email() from anon, authenticated, public;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
after update of email on auth.users
for each row when (new.email is distinct from old.email)
execute function public.sync_profile_email();

-- ═══════════════════════════════════════════════════════
-- Add email to the leaderboard payload (members list + member profile screen).
-- Unchanged from 20260615000000 apart from the new p.email projection.
-- ═══════════════════════════════════════════════════════

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
      p.email,
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
