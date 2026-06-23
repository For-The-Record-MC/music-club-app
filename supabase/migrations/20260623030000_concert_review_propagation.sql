-- Concert review propagation.
--
-- A shared concert is an independent copy per club (linked by origin_concert_id).
-- Reviews were per-copy, but a review is really "my take on the show" — it should
-- land on every copy. set_concert_review writes the rating/review/completion to
-- all sibling copies (same root) THAT THE CALLER CAN MANAGE — i.e. they're the
-- adder or an admin of that copy's club. That mirrors the per-row concerts_update
-- rule, so this never writes into a club where the caller couldn't already edit
-- the concert, and never clobbers a review in a club the caller doesn't run.

create or replace function public.set_concert_review(
  p_concert uuid,
  p_rating integer,
  p_review text,
  p_mark_complete boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root uuid;
  v_club uuid;
  v_count integer;
begin
  select coalesce(origin_concert_id, id), club_id
  into v_root, v_club
  from concerts where id = p_concert;
  if not found then
    raise exception 'Concert not found';
  end if;

  -- Caller must be able to manage the source concert (adder or admin), same as
  -- the concerts_update policy.
  if not (
    exists (select 1 from concerts c where c.id = p_concert and c.added_by = auth.uid())
    or public.club_role(v_club) in ('owner', 'admin')
  ) then
    raise exception 'Not allowed to review this concert';
  end if;

  update concerts set
    rating = p_rating,
    review = p_review,
    -- Marking complete sets the timestamp once; edits preserve the original.
    completed_at = case when p_mark_complete then coalesce(completed_at, now()) else completed_at end,
    updated_at = now()
  where (id = v_root or origin_concert_id = v_root)
    and (added_by = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.set_concert_review(uuid, integer, text, boolean) from anon, public;
