-- App-open heartbeat (adoption analytics). The client pings log_app_open()
-- when the app comes to the foreground; we keep ONE row per member per day
-- (first/last open + a count), so a daily lurker who never posts is finally
-- visible. Volume stays trivial: members × active days.

create table public.app_opens (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  first_open_at timestamptz not null default now(),
  last_open_at timestamptz not null default now(),
  opens integer not null default 1,
  primary key (profile_id, day)
);

-- Own-row only; writes go through the RPC.
alter table public.app_opens enable row level security;
create policy app_opens_select on public.app_opens
  for select to authenticated using (profile_id = auth.uid());

create or replace function public.log_app_open()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into app_opens (profile_id, day)
  values (auth.uid(), current_date)
  on conflict (profile_id, day) do update
    set last_open_at = now(), opens = app_opens.opens + 1;
end;
$$;

-- ── Analytics layer ──────────────────────────────────────

-- Daily opens: how many members opened the app each day, and how often.
create or replace view analytics.daily_opens as
  select day,
         count(*) as members_opened,
         sum(opens) as total_opens
  from public.app_opens
  group by day
  order by day;

-- Fold opens into last-seen so lurkers stop looking like churn.
-- (drop first: replace can't insert the new column mid-view)
drop view if exists analytics.member_last_seen;
create view analytics.member_last_seen as
  select p.id as profile_id,
         p.display_name,
         p.created_at as joined_at,
         a.last_action_at,
         o.last_open_at,
         t.last_device_seen_at,
         r.last_bell_read_at,
         greatest(
           coalesce(a.last_action_at, 'epoch'),
           coalesce(o.last_open_at, 'epoch'),
           coalesce(t.last_device_seen_at, 'epoch'),
           coalesce(r.last_bell_read_at, 'epoch')
         ) as last_seen_at
  from public.profiles p
  left join (select profile_id, max(happened_at) as last_action_at
             from analytics.member_actions group by 1) a on a.profile_id = p.id
  left join (select profile_id, max(last_open_at) as last_open_at
             from public.app_opens group by 1) o on o.profile_id = p.id
  left join (select profile_id, max(updated_at) as last_device_seen_at
             from public.push_tokens group by 1) t on t.profile_id = p.id
  left join (select profile_id, max(last_read_at) as last_bell_read_at
             from public.activity_reads group by 1) r on r.profile_id = p.id;

-- Weekly retention-style view: members who opened at all, per week.
create or replace view analytics.weekly_openers as
  select date_trunc('week', day)::date as week,
         count(distinct profile_id) as members_opened,
         sum(opens) as total_opens
  from public.app_opens
  group by 1
  order by 1;

grant select on all tables in schema analytics to dashboards_ro;
