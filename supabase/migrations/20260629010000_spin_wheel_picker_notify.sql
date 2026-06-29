-- v5 Phase 2: personal "you're the picker" notification.
-- The wheel landing on you is the most actionable moment in the app, so split it:
-- keep the existing broadcast `wheel_spun` (everyone sees who won), and ALSO emit
-- a targeted `you_are_picker` (recipient_id = winner) so the picker gets a direct
-- push to go set their two albums. The targeted row is gated to the recipient by
-- the existing activity_events RLS, and send-push routes it to that member only.

create or replace function public.spin_wheel(p_club uuid)
 returns cycles
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_picker uuid;
  v_cycle public.cycles;
  v_name text;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  if exists (select 1 from cycles where club_id = p_club and status = 'open') then
    raise exception 'A cycle is already open';
  end if;

  select pool into v_picker
  from public.wheel_pool(p_club) as pool
  order by random()
  limit 1;
  if v_picker is null then
    raise exception 'No eligible members to pick from';
  end if;

  insert into cycles (club_id, number, picker_id, status, start_date)
  values (
    p_club,
    (select coalesce(max(number), 0) + 1 from cycles where club_id = p_club),
    v_picker,
    'open',
    current_date
  )
  returning * into v_cycle;

  select display_name into v_name from profiles where id = v_picker;
  perform public.publish_activity_event(
    p_club, 'wheel_spun',
    jsonb_build_object('cycle_number', v_cycle.number, 'picker_id', v_picker, 'picker_name', v_name)
  );

  -- Targeted nudge to the winner (skipped for them in the broadcast push by the
  -- actor-exclusion, surfaced here as a personal "you're up").
  insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
  values (
    p_club, auth.uid(), v_picker, 'you_are_picker',
    jsonb_build_object('cycle_number', v_cycle.number)
  );

  return v_cycle;
end;
$function$
;
