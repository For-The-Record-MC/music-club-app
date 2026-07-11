-- Adoption analytics layer for BI tools (Metabase now, Grafana-portable).
--
-- All dashboard logic lives HERE as SQL views so any tool is a dumb
-- `select * from analytics.<view>` away — swapping Metabase for Grafana Cloud
-- later means re-pointing charts, not rewriting queries.
--
-- Access: the `dashboards_ro` role can read ONLY the analytics schema (never
-- public tables directly). Its password is set out-of-band (never in git):
--   alter role dashboards_ro with password '<generated>';
-- Views are owned by postgres, so they read the underlying tables without
-- per-user RLS getting in the way — by design; they expose aggregates and
-- non-sensitive activity metadata only.

create schema if not exists analytics;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dashboards_ro') then
    create role dashboards_ro login;
  end if;
end
$$;

grant usage on schema analytics to dashboards_ro;
alter default privileges in schema analytics grant select on tables to dashboards_ro;

-- ═══════════════════════════════════════════════════════
-- Base event stream: one row per member ACTION, unioned from every table
-- that logs deliberate activity. This is the source for WAU/MAU/last-seen.
-- (Passive app opens are NOT captured anywhere yet — see member_last_seen.)
-- ═══════════════════════════════════════════════════════

create or replace view analytics.member_actions as
  select actor_id as profile_id, created_at as happened_at,
         'activity:' || event_type as kind, club_id
    from public.activity_events where actor_id is not null
  union all
  select author_id, created_at, 'feed_post', club_id from public.feed_posts
  union all
  select r.profile_id, coalesce(r.updated_at, r.created_at), 'rating', c.club_id
    from public.ratings r
    join public.albums a on a.id = r.album_id
    join public.cycles c on c.id = a.cycle_id
  union all
  select n.profile_id, coalesce(n.updated_at, n.created_at), 'song_note', c.club_id
    from public.song_notes n
    join public.albums a on a.id = n.album_id
    join public.cycles c on c.id = a.cycle_id
  union all
  select author_id, created_at, 'best_bar', club_id from public.best_bars
  union all
  select s.profile_id, s.created_at, 'showdown_submission', sd.club_id
    from public.showdown_submissions s
    join public.showdowns sd on sd.id = s.showdown_id
  union all
  select s.profile_id, s.created_at, 'perfect_playlist_song', pp.club_id
    from public.perfect_playlist_songs s
    join public.perfect_playlists pp on pp.id = s.playlist_id;

-- ═══════════════════════════════════════════════════════
-- Dashboard views
-- ═══════════════════════════════════════════════════════

-- Signups per week + running total.
create or replace view analytics.weekly_signups as
  select date_trunc('week', created_at)::date as week,
         count(*) as signups,
         sum(count(*)) over (order by date_trunc('week', created_at)::date) as total_members
  from public.profiles
  group by 1
  order by 1;

-- Distinct members taking any action, per week / per month.
create or replace view analytics.weekly_active_members as
  select date_trunc('week', happened_at)::date as week,
         count(distinct profile_id) as active_members,
         count(*) as actions
  from analytics.member_actions
  group by 1
  order by 1;

create or replace view analytics.monthly_active_members as
  select date_trunc('month', happened_at)::date as month,
         count(distinct profile_id) as active_members,
         count(*) as actions
  from analytics.member_actions
  group by 1
  order by 1;

-- Best-effort "when did we last see this member": latest action, latest push
-- token re-registration (device-level), latest bell read. NOTE: none of these
-- capture a silent app open by a member who just browses — that needs a
-- client-side heartbeat we don't have yet.
create or replace view analytics.member_last_seen as
  select p.id as profile_id,
         p.display_name,
         p.created_at as joined_at,
         a.last_action_at,
         t.last_device_seen_at,
         r.last_bell_read_at,
         greatest(
           coalesce(a.last_action_at, 'epoch'),
           coalesce(t.last_device_seen_at, 'epoch'),
           coalesce(r.last_bell_read_at, 'epoch')
         ) as last_seen_at
  from public.profiles p
  left join (select profile_id, max(happened_at) as last_action_at
             from analytics.member_actions group by 1) a on a.profile_id = p.id
  left join (select profile_id, max(updated_at) as last_device_seen_at
             from public.push_tokens group by 1) t on t.profile_id = p.id
  left join (select profile_id, max(last_read_at) as last_bell_read_at
             from public.activity_reads group by 1) r on r.profile_id = p.id;

-- Per-club vitals: size, recency, volume, whether a cycle is live.
create or replace view analytics.club_health as
  select c.id as club_id,
         c.name,
         count(distinct m.profile_id) as members,
         (select max(happened_at) from analytics.member_actions ma where ma.club_id = c.id) as last_action_at,
         (select count(*) from analytics.member_actions ma
           where ma.club_id = c.id and ma.happened_at > now() - interval '30 days') as actions_30d,
         exists (select 1 from public.cycles cy
                  where cy.club_id = c.id and cy.status = 'open') as has_open_cycle
  from public.clubs c
  left join public.club_members m on m.club_id = c.id
  group by c.id, c.name;

-- Which features actually get used (trailing 30 days).
create or replace view analytics.feature_usage_30d as
  select kind, count(*) as actions, count(distinct profile_id) as members
  from analytics.member_actions
  where happened_at > now() - interval '30 days'
  group by kind
  order by actions desc;

grant select on all tables in schema analytics to dashboards_ro;
