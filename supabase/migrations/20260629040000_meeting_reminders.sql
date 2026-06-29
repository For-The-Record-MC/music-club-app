-- v5 Phase 5: scheduled meeting reminders.
-- The only push that isn't reactive — it's time-based off cycles.meeting_at, so
-- it needs pg_cron rather than the activity_events trigger. A job runs every 30
-- min and, for any open un-revealed cycle whose meeting is within the next 24h
-- (and again within the next 1h), inserts a targeted `meeting_reminder` event for
-- every member who hasn't RSVP'd 'no'. Those rows ride the Phase-1 fan-out like
-- everything else. Per-cycle sent-at markers make each window fire exactly once.
-- ("Rate before reveal" folds in here — reveal is a manual action with no
-- countdown, so there's nothing else to schedule against.)

create extension if not exists pg_cron;

alter table public.cycles
  add column meeting_reminder_24h_sent_at timestamptz,
  add column meeting_reminder_1h_sent_at timestamptz;

create or replace function public.send_meeting_reminders()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c record;
begin
  -- 24-hours-out window
  for c in
    select id, club_id, number from cycles
    where status = 'open' and revealed_at is null and meeting_at is not null
      and meeting_at > now() and meeting_at <= now() + interval '24 hours'
      and meeting_reminder_24h_sent_at is null
  loop
    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select c.club_id, null, m.profile_id, 'meeting_reminder',
           jsonb_build_object('cycle_number', c.number, 'window', '24h')
    from club_members m
    where m.club_id = c.club_id
      and not exists (
        select 1 from rsvps r
        where r.cycle_id = c.id and r.profile_id = m.profile_id and r.status = 'no'
      );
    update cycles set meeting_reminder_24h_sent_at = now() where id = c.id;
  end loop;

  -- 1-hour-out window (same recipients, tighter timing)
  for c in
    select id, club_id, number from cycles
    where status = 'open' and revealed_at is null and meeting_at is not null
      and meeting_at > now() and meeting_at <= now() + interval '1 hour'
      and meeting_reminder_1h_sent_at is null
  loop
    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select c.club_id, null, m.profile_id, 'meeting_reminder',
           jsonb_build_object('cycle_number', c.number, 'window', '1h')
    from club_members m
    where m.club_id = c.club_id
      and not exists (
        select 1 from rsvps r
        where r.cycle_id = c.id and r.profile_id = m.profile_id and r.status = 'no'
      );
    update cycles set meeting_reminder_1h_sent_at = now() where id = c.id;
  end loop;
end;
$$;

-- Run every 30 minutes. cron.schedule upserts by job name, so re-applying is safe.
select cron.schedule('meeting-reminders', '*/30 * * * *', $$select public.send_meeting_reminders()$$);
