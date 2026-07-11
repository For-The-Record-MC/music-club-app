-- Per-club unread bell counts in one call, for the club switcher's badges.
-- Mirrors the bell's semantics exactly (useActivity + activity_events RLS):
-- events in my clubs, visible to me (broadcast or addressed to me), not my own
-- actions, newer than my activity_reads marker. One query instead of the
-- 2-per-club the bell itself does — the switcher lists every club at once.
create or replace function public.my_unread_counts()
returns table (club_id uuid, unread integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.club_id, count(*)::integer as unread
  from activity_events e
  join club_members m
    on m.club_id = e.club_id and m.profile_id = auth.uid()
  left join activity_reads r
    on r.club_id = e.club_id and r.profile_id = auth.uid()
  where (e.recipient_id is null or e.recipient_id = auth.uid())
    and e.actor_id is distinct from auth.uid()
    and e.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
  group by e.club_id;
$$;
