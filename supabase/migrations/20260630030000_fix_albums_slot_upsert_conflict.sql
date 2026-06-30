-- The archive migration (20260629070000) replaced the table-level
-- unique(cycle_id, slot) constraint with a partial unique index:
--   create unique index albums_cycle_slot_uniq
--     on public.albums (cycle_id, slot) where slot is not null;
--
-- The app upserts album picks with PostgREST's `onConflict: 'cycle_id,slot'`,
-- which emits `ON CONFLICT (cycle_id, slot)` with no WHERE predicate. Postgres
-- can't infer a *partial* index without the matching predicate, and PostgREST
-- can't pass one, so the upsert failed with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification".
--
-- A plain UNIQUE constraint treats NULLs as distinct, so archive rows (slot
-- null) coexist fine — the partial index was never needed for that. Restore the
-- full constraint so onConflict inference works again. Archive Spotify dedup
-- stays handled by its own partial index (albums_archive_spotify_uniq).
drop index if exists public.albums_cycle_slot_uniq;

alter table public.albums
  add constraint albums_cycle_id_slot_key unique (cycle_id, slot);
