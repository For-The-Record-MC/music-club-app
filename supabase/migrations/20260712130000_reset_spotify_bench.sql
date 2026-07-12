-- Operational reset, 2026-07-12: production moved to a fresh Spotify app
-- (dev/prod split after the 429 outage — the old app, still benched until
-- 2026-07-13 ~14:17 UTC, is demoted to dev/testing credentials). The guard's
-- persisted bench and window belong to the OLD app; the new one starts clean.

update public.spotify_api_state
set benched_until = null,
    window_start = now(),
    window_calls = 0
where id;
