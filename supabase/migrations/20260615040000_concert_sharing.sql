-- Concert sharing: cross-post a concert to your other clubs.
--
-- Sharing creates an independent copy of the concert in each target club (its
-- own interest list, comments, and review). The copy points back to the
-- original via origin_concert_id so we can show "already shared" status and
-- avoid duplicate shares. Null = an original (not a copy).
--
-- No new RLS is needed: concerts_insert already allows inserting into any club
-- where the caller is a member (added_by = auth.uid() and is_club_member),
-- which is exactly the constraint we want — you can only share to your own
-- clubs. on delete set null keeps copies alive if the original is removed.

alter table public.concerts
  add column origin_concert_id uuid references public.concerts (id) on delete set null;

comment on column public.concerts.origin_concert_id is
  'Set on copies created by sharing a concert to another club; points to the original concert. Null = original.';

create index concerts_origin_idx on public.concerts (origin_concert_id);
