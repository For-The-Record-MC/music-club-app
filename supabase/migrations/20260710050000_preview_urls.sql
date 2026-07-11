-- Song preview URLs on every game table (SONG_PREVIEWS_PLAN.md Phase A).
--
-- The apple-music resolver already returns Apple's 30s preview with every
-- track match; until now it only had a home on bracket_tracks (existing
-- column) and feed_posts (metadata jsonb). These columns give it one
-- everywhere else a song row renders. Populated by the resolver on new rows
-- and by re-running supabase/backfill-apple-matches.mjs for existing ones.

alter table public.best_bars add column preview_url text;
alter table public.perfect_playlist_songs add column preview_url text;
alter table public.aux_battle_songs add column preview_url text;
alter table public.convince_tracks add column preview_url text;
alter table public.showdown_submissions add column preview_url text;
alter table public.bingo_boxes add column preview_url text;
