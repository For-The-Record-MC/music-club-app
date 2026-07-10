-- Expose preview_url in list_showdown's submission rows (SONG_PREVIEWS_PLAN.md
-- Phase B) — the only song surface that reads through an RPC instead of a
-- table select. Body otherwise identical to the previous version.

create or replace function public.list_showdown(p_cycle uuid)
returns json
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_sd public.showdowns;
  v_revealed boolean;
  v_club uuid;
  v_field integer;
  v_up integer;
  v_down integer;
  v_subs json;
begin
  select * into v_sd from showdowns where cycle_id = p_cycle;
  if not found then
    return null;
  end if;
  v_club := v_sd.club_id;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;

  select (revealed_at is not null) into v_revealed from cycles where id = p_cycle;
  select count(*) into v_field from showdown_submissions where showdown_id = v_sd.id;

  select
    coalesce(count(*) filter (where value = 1), 0),
    coalesce(count(*) filter (where value = -1), 0)
  into v_up, v_down
  from showdown_votes v
  join showdown_submissions s on s.id = v.submission_id
  where s.showdown_id = v_sd.id and v.profile_id = auth.uid();

  select coalesce(json_agg(row order by row.created_at), '[]'::json) into v_subs
  from (
    select
      s.id,
      s.title,
      s.artist,
      s.artwork_url,
      s.spotify_url,
      s.apple_url,
      s.preview_url,
      s.created_at,
      (s.profile_id = auth.uid()) as is_mine,
      (select v.value from showdown_votes v where v.submission_id = s.id and v.profile_id = auth.uid()) as my_vote,
      -- Author only after reveal (or if it's mine).
      case when v_revealed or s.profile_id = auth.uid() then p.display_name end as author_name,
      case when v_revealed or s.profile_id = auth.uid() then p.avatar_color end as author_color,
      case when v_revealed or s.profile_id = auth.uid() then p.avatar_url end as author_avatar,
      -- Net score only after reveal.
      case when v_revealed then (
        select coalesce(sum(v.value), 0) from showdown_votes v where v.submission_id = s.id
      ) end as net_score
    from showdown_submissions s
    join profiles p on p.id = s.profile_id
    where s.showdown_id = v_sd.id
  ) row;

  return json_build_object(
    'showdown_id', v_sd.id,
    'theme_text', v_sd.theme_text,
    'revealed', v_revealed,
    'submission_count', v_field,
    'downvote_unlocked', (v_field >= 4),
    'up_remaining', 2 - v_up,
    'down_remaining', 1 - v_down,
    'winner_submission_id', v_sd.winner_submission_id,
    'submissions', v_subs
  );
end;
$$;
