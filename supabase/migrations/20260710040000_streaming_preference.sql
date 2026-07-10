-- Per-user streaming service preference (APPLE_MUSIC_PLAN.md Phase 4).
--
-- 'both' preserves today's behavior (dual pills) and is the default so nobody
-- sees a change until they pick. The preference affects DISPLAY only — Spotify
-- stays the canonical search/data source for everyone (locked decision).
-- Members already have RLS update rights on their own profile row, which is
-- all the picker needs.

alter table public.profiles
  add column preferred_service text not null default 'both'
    check (preferred_service in ('spotify', 'apple', 'both'));
