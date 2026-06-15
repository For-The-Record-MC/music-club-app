-- Lock album selections once reviews exist.
--
-- The cycle's picker (or an admin) can swap the two album slots freely while the
-- cycle is open and nobody has rated yet — but the moment ANY rating row exists
-- for an album, that album is frozen. Changing an album in place keeps the same
-- albums.id, so every rating attached to it (score, review text, fav/least) would
-- silently re-point at a different record. Deleting it cascades those ratings
-- away entirely. Both are data-integrity hazards, so we block all writes (update
-- + delete) to an album that already carries reviews.
--
-- This only rebuilds albums_write to add the no-ratings guard; everything else
-- (open-cycle + picker/admin checks, set_by = auth.uid()) is unchanged. INSERTs
-- of a brand-new slot still pass because a fresh album id carries no ratings.

drop policy albums_write on public.albums;

create policy albums_write on public.albums
  for all to authenticated
  using (
    not exists (select 1 from ratings r where r.album_id = albums.id)
    and exists (
      select 1 from cycles c
      where c.id = cycle_id
        and c.status = 'open'
        and (c.picker_id = auth.uid() or public.club_role(c.club_id) in ('owner', 'admin'))
    )
  )
  with check (
    set_by = auth.uid()
    and not exists (select 1 from ratings r where r.album_id = albums.id)
    and exists (
      select 1 from cycles c
      where c.id = cycle_id
        and c.status = 'open'
        and (c.picker_id = auth.uid() or public.club_role(c.club_id) in ('owner', 'admin'))
    )
  );
