-- v4 Phase 1: lock ratings (and the 👑 favorite vote) at REVEAL, not close.
--
-- Until now, writes were gated only to status='open', so a cycle that was
-- revealed-but-not-yet-closed still accepted rating edits. The reveal is the
-- moment scores become public, so it must also be the moment they freeze.
--
-- New rule for ratings + cycle_preferences writes: the cycle must be open AND
-- not yet revealed (status='open' AND revealed_at IS NULL). close_cycle sets
-- revealed_at too, so this also covers closed cycles. Song notes are untouched —
-- they're a personal journal, editable across past cycles by design.

-- ═══════════════════════════════════════════════════════
-- ratings: write only while open AND unrevealed
-- ═══════════════════════════════════════════════════════

drop policy if exists ratings_insert on public.ratings;
create policy ratings_insert on public.ratings
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and c.status = 'open'
        and c.revealed_at is null
        and public.is_club_member(c.club_id)
    )
  );

drop policy if exists ratings_update on public.ratings;
create policy ratings_update on public.ratings
  for update to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and c.status = 'open'
        and c.revealed_at is null
        and public.is_club_member(c.club_id)
    )
  );

drop policy if exists ratings_delete on public.ratings;
create policy ratings_delete on public.ratings
  for delete to authenticated
  using (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and c.status = 'open'
        and c.revealed_at is null
    )
  );

-- ═══════════════════════════════════════════════════════
-- cycle_preferences: same freeze (the 👑 pick is sealed-until-reveal too)
-- ═══════════════════════════════════════════════════════

drop policy if exists cycle_preferences_write on public.cycle_preferences;
create policy cycle_preferences_write on public.cycle_preferences
  for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id
        and a.cycle_id = cycle_id
        and c.status = 'open'
        and c.revealed_at is null
        and public.is_club_member(c.club_id)
    )
  );
