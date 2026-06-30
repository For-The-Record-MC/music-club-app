-- Fix claim_archive_album: the original conflated "claim for myself" with
-- "clear the claim" because both arrived as a null p_profile.
--
--   • The admin branch read a null p_profile as "set claimed_by = null", so an
--     owner/admin tapping "Claim" just no-op'd the album back to unclaimed.
--   • The member branch's coalesce(p_profile, auth.uid()) turned a release
--     (self → null) back into a self-claim, so releasing raised an error.
--
-- New contract: p_profile is now unambiguous — pass the target member's id to
-- claim/assign, pass NULL to release/clear. The client always sends an explicit
-- id when claiming (auth.uid() for self).

create or replace function public.claim_archive_album(
  p_album uuid,
  p_profile uuid default null
)
returns public.albums
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_kind text;
  v_current uuid;
  v_is_admin boolean;
  v_album public.albums;
begin
  select c.club_id, c.kind, a.claimed_by
  into v_club, v_kind, v_current
  from albums a
  join cycles c on c.id = a.cycle_id
  where a.id = p_album;
  if not found then
    raise exception 'Album not found';
  end if;
  if v_kind <> 'archive' then
    raise exception 'Not an archive album';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;

  v_is_admin := public.club_role(v_club) in ('owner', 'admin');

  if v_is_admin then
    -- Admin may assign to any member (p_profile = their id) or clear (null).
    if p_profile is not null and not exists (
      select 1 from club_members where club_id = v_club and profile_id = p_profile
    ) then
      raise exception 'That person is not a club member';
    end if;
  else
    -- Member: claim an unclaimed album for themselves (p_profile = auth.uid())
    -- or release their own (p_profile = null). Nothing else.
    if not (
      (v_current is null and p_profile = auth.uid())
      or (v_current = auth.uid() and p_profile is null)
    ) then
      raise exception 'You can only claim an unclaimed album or release your own';
    end if;
  end if;

  update albums set claimed_by = p_profile
  where id = p_album
  returning * into v_album;

  return v_album;
end;
$$;

revoke execute on function public.claim_archive_album(uuid, uuid) from anon, public;
