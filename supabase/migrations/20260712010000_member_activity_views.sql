-- Member-level activity views for the "who was in the app and what did they
-- do" dashboard panels. Names are joined here because dashboards_ro can only
-- read the analytics schema, never public.profiles directly.

-- Every action with a name attached — the raw activity log.
create or replace view analytics.member_activity_log as
  select ma.happened_at,
         p.display_name,
         ma.kind,
         c.name as club
  from analytics.member_actions ma
  join public.profiles p on p.id = ma.profile_id
  left join public.clubs c on c.id = ma.club_id;

-- One row per member per day: did they open the app, and how much did they do.
-- (opens stays 0 until the heartbeat OTA ships; actions work today.)
create or replace view analytics.member_daily as
  select coalesce(o.day, a.day) as day,
         p.display_name,
         coalesce(o.opens, 0) as opens,
         coalesce(a.actions, 0) as actions
  from (
    select profile_id, day, opens from public.app_opens
  ) o
  full outer join (
    select profile_id, happened_at::date as day, count(*) as actions
    from analytics.member_actions
    group by 1, 2
  ) a on a.profile_id = o.profile_id and a.day = o.day
  join public.profiles p on p.id = coalesce(o.profile_id, a.profile_id);

grant select on all tables in schema analytics to dashboards_ro;
