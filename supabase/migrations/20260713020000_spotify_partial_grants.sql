-- spotify_acquire v2: partial grants. The all-or-nothing version denied a
-- whole seeding when the hourly window couldn't cover the full request — a
-- 119-call ask against 60 remaining built NOTHING instead of a smaller field
-- (hit live 2026-07-12: "90s hip hop" probe said 79 tracks, build failed).
-- Now the reservation grants min(requested, remaining) and reports `granted`;
-- callers resolve as much as the window allows.

create or replace function public.spotify_acquire(p_calls int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.spotify_api_state;
  v_cap constant int := 200;
  v_grant int;
begin
  select * into v_state from spotify_api_state where id for update;
  if v_state.benched_until is not null and v_state.benched_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'benched', 'until', v_state.benched_until);
  end if;
  if v_state.window_start < now() - interval '1 hour' then
    update spotify_api_state set window_start = now(), window_calls = 0 where id;
    v_state.window_calls := 0;
    v_state.window_start := now();
  end if;
  v_grant := least(greatest(p_calls, 0), v_cap - v_state.window_calls);
  if v_grant <= 0 then
    return jsonb_build_object(
      'ok', false, 'reason', 'budget',
      'until', v_state.window_start + interval '1 hour'
    );
  end if;
  update spotify_api_state set window_calls = window_calls + v_grant where id;
  return jsonb_build_object('ok', true, 'granted', v_grant, 'remaining', v_cap - v_state.window_calls - v_grant);
end;
$$;
