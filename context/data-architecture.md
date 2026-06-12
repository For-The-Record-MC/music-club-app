# Data architecture

**Placeholder — fills in with Phase 1.**

The pattern to follow (inherited from the Pindejos project):

- `app/src/utils/supabase/db.ts` — typed query objects, one per domain (`db.clubs`, `db.cycles`, …). The ONLY place the supabase client is queried.
- `app/src/hooks/` — one hook per screen-level data need; hooks call `db.*`, own loading/refresh state, and return plain data.
- Compute functions (standings-style derivations, e.g. rating aggregates, wheel eligibility display) are pure, uncached, and wrapped in `useMemo` at the screen level.
