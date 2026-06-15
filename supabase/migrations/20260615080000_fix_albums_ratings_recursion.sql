-- Fix: "infinite recursion detected in policy for relation albums".
--
-- 20260615060000 added a `not exists (select 1 from ratings ...)` guard directly
-- in the albums_write policy. But ratings has its own RLS policy that queries
-- albums (the reveal-seal check), so evaluating an albums policy required
-- evaluating a ratings policy which required evaluating an albums policy → cycle.
-- Postgres aborts every album write (including brand-new inserts) with the
-- recursion error.
--
-- The codebase already solves this for club_members via security-definer helpers
-- ("to avoid policy self-recursion"). Do the same here: a definer function reads
-- ratings with RLS bypassed, so the albums policy no longer transitively touches
-- albums.

create or replace function public.album_has_ratings(p_album uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from ratings where album_id = p_album);
$$;

drop policy albums_write on public.albums;

create policy albums_write on public.albums
  for all to authenticated
  using (
    not public.album_has_ratings(albums.id)
    and exists (
      select 1 from cycles c
      where c.id = cycle_id
        and c.status = 'open'
        and (c.picker_id = auth.uid() or public.club_role(c.club_id) in ('owner', 'admin'))
    )
  )
  with check (
    set_by = auth.uid()
    and not public.album_has_ratings(albums.id)
    and exists (
      select 1 from cycles c
      where c.id = cycle_id
        and c.status = 'open'
        and (c.picker_id = auth.uid() or public.club_role(c.club_id) in ('owner', 'admin'))
    )
  );
