-- @-mentions in comments. Any comment area (feed, concerts, meeting board) lets
-- you tag a club member with "@Name"; the tagged member gets an activity-feed
-- notification.
--
-- Activity events are normally club-wide (every member sees them). A mention is
-- directed at ONE person, so we add a nullable recipient_id: NULL keeps the old
-- broadcast behavior; a set recipient_id means only that member (plus nobody
-- else) sees the event. The select policy enforces this.

alter table public.activity_events
  add column recipient_id uuid references public.profiles (id) on delete cascade;

-- Targeted events are visible only to their recipient; broadcast events
-- (recipient_id null) stay visible to every club member.
drop policy activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events
  for select to authenticated
  using (
    is_club_member(club_id)
    and (recipient_id is null or recipient_id = auth.uid())
  );

create index activity_events_recipient_idx
  on public.activity_events using btree (recipient_id, created_at desc)
  where recipient_id is not null;

-- Publish one 'comment_mention' event per tagged member. security definer so it
-- can write activity_events; pins actor to auth.uid(), skips self-mentions, and
-- only notifies members of the club. Payload carries the context + the id the
-- activity row taps through to (post_id / concert_id / cycle_id) and a snippet.
create or replace function public.notify_comment_mentions(
  p_club uuid,
  p_recipients uuid[],
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
  select p_club, auth.uid(), r, 'comment_mention', coalesce(p_payload, '{}'::jsonb)
  from unnest(p_recipients) as r
  where r <> auth.uid()
    and exists (
      select 1 from club_members m
      where m.club_id = p_club and m.profile_id = r
    );
end;
$$;

revoke execute on function public.notify_comment_mentions(uuid, uuid[], jsonb) from anon, public;
