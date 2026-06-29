-- v5 Phase 4: owner/admin custom announcements.
-- A club announcement is just a broadcast activity_events row (event_type
-- 'club_announcement') whose payload carries author-written title/body — the
-- first event whose text isn't templated. It rides the same Phase-1 fan-out
-- trigger, so it pushes to every member (un-muted, Announcements category on)
-- exactly like a lifecycle event. Guardrails, since text is user-authored:
--   • owner + admins only
--   • per-CLUB cap of 3 / rolling 24h (multiple admins share the budget) so it
--     can't spam members' lock screens
--   • length limits on title/body

create or replace function public.post_announcement(p_club uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := btrim(coalesce(p_body, ''));
  v_recent int;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Only owners and admins can post announcements';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'Announcement message cannot be empty';
  end if;
  if char_length(v_body) > 500 then
    raise exception 'Announcement message is too long (max 500 characters)';
  end if;
  if v_title is not null and char_length(v_title) > 80 then
    raise exception 'Announcement title is too long (max 80 characters)';
  end if;

  select count(*) into v_recent
  from activity_events
  where club_id = p_club
    and event_type = 'club_announcement'
    and created_at >= now() - interval '24 hours';
  if v_recent >= 3 then
    raise exception 'This club has hit its limit of 3 announcements per day.'
      using errcode = 'check_violation';
  end if;

  perform public.publish_activity_event(
    p_club, 'club_announcement',
    jsonb_build_object('title', v_title, 'body', v_body)
  );
end;
$$;

-- Surfaced to the composer so it can show "2 of 3 announcements left today"
-- without re-deriving the window.
create or replace function public.my_announcement_quota(p_club uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_used int;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  select count(*) into v_used
  from activity_events
  where club_id = p_club
    and event_type = 'club_announcement'
    and created_at >= now() - interval '24 hours';
  return json_build_object('limit', 3, 'used', v_used);
end;
$$;
