-- Paige feedback Batch D: pre-meeting participation nudges.
--
-- Extends the existing time-based meeting-reminder cron so a member gets a
-- personalized "you still owe" digest before the meeting, listing only their
-- open gaps: unrated albums, no Jukebox Showdown submission, no Showdown votes.
--
-- Design (one push per member per window — never doubled):
--   • 72h out (new): participation_nudge to members WITH gaps only.
--   • 24h out: members WITH gaps → participation_nudge; everyone else (not
--     RSVP'd 'no') → the generic meeting_reminder, as before.
--   • 1h out: generic meeting_reminder to all not-'no' (unchanged simple ping).
-- The nudge rides the same activity_events fan-out/push pipeline; it's mapped to
-- the 'mentions' category in pushTemplate.ts (personal, actionable).

alter table public.cycles
  add column participation_nudge_72h_sent_at timestamptz;

-- Returns the member's open participation gaps for a cycle as jsonb, or NULL when
-- they've done everything. Showdown gaps only apply when the cycle has a
-- showdown; the vote gap only when someone else has submitted (nothing to vote
-- on otherwise) and the member has cast zero votes.
create or replace function public.participation_gaps(p_cycle uuid, p_member uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with unrated as (
    select count(*)::int as n
    from albums a
    where a.cycle_id = p_cycle
      and not exists (
        select 1 from ratings r where r.album_id = a.id and r.profile_id = p_member
      )
  ),
  sd as (select id from showdowns where cycle_id = p_cycle),
  needs_sub as (
    select exists (select 1 from sd)
       and not exists (
         select 1 from showdown_submissions s
         join sd on sd.id = s.showdown_id
         where s.profile_id = p_member
       ) as v
  ),
  needs_vote as (
    select exists (select 1 from sd)
       and exists (
         select 1 from showdown_submissions s
         join sd on sd.id = s.showdown_id
         where s.profile_id <> p_member
       )
       and not exists (
         select 1 from showdown_votes v
         join showdown_submissions s on s.id = v.submission_id
         join sd on sd.id = s.showdown_id
         where v.profile_id = p_member
       ) as v
  )
  select case
    when (select n from unrated) = 0
      and not (select v from needs_sub)
      and not (select v from needs_vote)
    then null
    else jsonb_build_object(
      'unrated', (select n from unrated),
      'needs_submission', (select v from needs_sub),
      'needs_votes', (select v from needs_vote)
    )
  end;
$$;

-- Replace the reminder driver to fold in participation nudges. cron.schedule
-- already points at this function name, so no re-scheduling is needed.
create or replace function public.send_meeting_reminders()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c record;
begin
  -- 72-hours-out: participation nudges to members with open gaps.
  for c in
    select id, club_id, number from cycles
    where status = 'open' and revealed_at is null and meeting_at is not null
      and meeting_at > now() and meeting_at <= now() + interval '72 hours'
      and participation_nudge_72h_sent_at is null
  loop
    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select c.club_id, null, m.profile_id, 'participation_nudge',
           public.participation_gaps(c.id, m.profile_id)
             || jsonb_build_object('cycle_number', c.number, 'window', '72h')
    from club_members m
    where m.club_id = c.club_id
      and not exists (
        select 1 from rsvps r
        where r.cycle_id = c.id and r.profile_id = m.profile_id and r.status = 'no'
      )
      and public.participation_gaps(c.id, m.profile_id) is not null;
    update cycles set participation_nudge_72h_sent_at = now() where id = c.id;
  end loop;

  -- 24-hours-out: gap members get the nudge; everyone else gets the generic ping.
  for c in
    select id, club_id, number from cycles
    where status = 'open' and revealed_at is null and meeting_at is not null
      and meeting_at > now() and meeting_at <= now() + interval '24 hours'
      and meeting_reminder_24h_sent_at is null
  loop
    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select c.club_id, null, m.profile_id, 'participation_nudge',
           public.participation_gaps(c.id, m.profile_id)
             || jsonb_build_object('cycle_number', c.number, 'window', '24h')
    from club_members m
    where m.club_id = c.club_id
      and not exists (
        select 1 from rsvps r
        where r.cycle_id = c.id and r.profile_id = m.profile_id and r.status = 'no'
      )
      and public.participation_gaps(c.id, m.profile_id) is not null;

    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select c.club_id, null, m.profile_id, 'meeting_reminder',
           jsonb_build_object('cycle_number', c.number, 'window', '24h')
    from club_members m
    where m.club_id = c.club_id
      and not exists (
        select 1 from rsvps r
        where r.cycle_id = c.id and r.profile_id = m.profile_id and r.status = 'no'
      )
      and public.participation_gaps(c.id, m.profile_id) is null;

    update cycles set meeting_reminder_24h_sent_at = now() where id = c.id;
  end loop;

  -- 1-hour-out: simple "meeting soon" ping to everyone not RSVP'd 'no'.
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
