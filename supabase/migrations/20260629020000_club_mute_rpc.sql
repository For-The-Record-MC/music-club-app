-- v5 Phase 3: let a member mute one club's push for themselves.
-- club_members UPDATE is RLS-locked to owners editing OTHER members (role
-- management), so a member can't flip their own row directly. This RPC updates
-- only notifications_muted for the caller's own membership — no privilege path.
create or replace function public.set_club_mute(p_club uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  update club_members
    set notifications_muted = coalesce(p_muted, false)
  where club_id = p_club and profile_id = auth.uid();
end;
$$;
