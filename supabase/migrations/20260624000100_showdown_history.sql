-- Showdown history for the History tab: past themes with their crowned winner +
-- submitter. A security-definer RPC because submissions are otherwise blind
-- (members can only directly read their own row).

create or replace function public.get_showdown_history(p_club uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows json;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;

  select coalesce(json_agg(row order by row.cycle_number desc), '[]'::json) into v_rows
  from (
    select
      c.id as cycle_id,
      c.number as cycle_number,
      sd.theme_text,
      w.title as winner_title,
      w.artist as winner_artist,
      w.artwork_url as winner_artwork,
      w.spotify_url as winner_spotify_url,
      w.apple_url as winner_apple_url,
      p.display_name as winner_submitter,
      p.avatar_color as winner_color,
      p.avatar_url as winner_avatar
    from showdowns sd
    join cycles c on c.id = sd.cycle_id
    left join showdown_submissions w on w.id = sd.winner_submission_id
    left join profiles p on p.id = w.profile_id
    where sd.club_id = p_club
      and c.revealed_at is not null
  ) row;

  return v_rows;
end;
$$;

revoke execute on function public.get_showdown_history(uuid) from anon, public;
