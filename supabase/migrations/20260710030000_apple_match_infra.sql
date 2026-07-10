-- Apple Music matching infrastructure (APPLE_MUSIC_PLAN.md Phase 1).
--
-- Every song row gets a server-side, ISRC-verified Apple Music match: an AFTER
-- INSERT trigger on each song table POSTs (source_table, source_id) to the new
-- apple-music Edge Function via pg_net (same vault-secret + fail-open pattern
-- as notify_send_push). The function resolves the row against Apple's catalog
-- (ISRC exact lookup first, text search fallback) and writes apple_url back.
-- Misses land in apple_match_queue, swept hourly by pg_cron — new releases
-- often reach Apple days after Spotify.
--
-- The client's keyless iTunes fuzzy match stays for instant UX; this pipeline
-- overwrites it with the verified match shortly after.

-- ═══════════════════════════════════════════════════════
-- COLUMNS — verified-match identifiers on the playlist-feeding table.
-- (feed_posts keeps the same fields inside its metadata jsonb; the other
-- song tables only need apple_url, which they already have.)
-- ═══════════════════════════════════════════════════════

alter table public.perfect_playlist_songs
  add column apple_song_id text,
  add column isrc text;

-- ═══════════════════════════════════════════════════════
-- RETRY QUEUE — rows the resolver couldn't match yet.
-- ═══════════════════════════════════════════════════════

create table public.apple_match_queue (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  kind text not null default 'track' check (kind in ('track', 'album')),
  title text not null,
  artist text not null default '',
  spotify_url text,
  isrc text,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_table, source_id)
);

create index apple_match_queue_pending_idx
  on public.apple_match_queue (last_attempt_at)
  where resolved_at is null;

-- Service-role only (the Edge Function). RLS on with no policies blocks
-- everyone else.
alter table public.apple_match_queue enable row level security;

-- ═══════════════════════════════════════════════════════
-- TRIGGER — song row lands → ask apple-music to resolve it.
-- ═══════════════════════════════════════════════════════

-- URL + shared secret live in Vault (set manually, out of git):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/apple-music', 'apple_music_url');
--   select vault.create_secret('<random-secret>', 'apple_music_secret');
-- apple-music reads the same secret from APPLE_MATCH_SECRET and rejects other
-- callers. Missing secrets (local/dev) → silent no-op. FAIL OPEN: matching is
-- an enhancement; an error here must never roll back a member's post.
create or replace function public.request_apple_match()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'apple_music_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'apple_music_secret';
    if v_url is null or v_secret is null then
      return new;
    end if;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-apple-secret', v_secret),
      body := jsonb_build_object('source_table', tg_table_name, 'source_id', new.id)
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

-- Plain-insert song tables.
create trigger best_bars_apple_match
  after insert on public.best_bars
  for each row execute function public.request_apple_match();
create trigger perfect_playlist_songs_apple_match
  after insert on public.perfect_playlist_songs
  for each row execute function public.request_apple_match();
create trigger aux_battle_songs_apple_match
  after insert on public.aux_battle_songs
  for each row execute function public.request_apple_match();
create trigger convince_tracks_apple_match
  after insert on public.convince_tracks
  for each row execute function public.request_apple_match();
create trigger showdown_submissions_apple_match
  after insert on public.showdown_submissions
  for each row execute function public.request_apple_match();
create trigger bracket_tracks_apple_match
  after insert on public.bracket_tracks
  for each row execute function public.request_apple_match();

-- Feed: only track posts and album suggestions carry a resolvable song/album
-- (playlist posts don't).
create trigger feed_posts_apple_match
  after insert on public.feed_posts
  for each row when (new.kind in ('track', 'album'))
  execute function public.request_apple_match();

-- Albums are picked via upsert (insert or slot re-pick update); bingo boxes are
-- pre-created empty and filled by UPDATE (set_bingo_song) — so those two also
-- need the update path, gated on the title actually changing.
create trigger albums_apple_match
  after insert on public.albums
  for each row execute function public.request_apple_match();
create trigger albums_apple_match_repick
  after update on public.albums
  for each row when (new.title is distinct from old.title)
  execute function public.request_apple_match();
create trigger bingo_boxes_apple_match
  after update on public.bingo_boxes
  for each row when (new.title is not null and new.title is distinct from old.title)
  execute function public.request_apple_match();

-- ═══════════════════════════════════════════════════════
-- HOURLY SWEEP — retry queued misses.
-- ═══════════════════════════════════════════════════════

create or replace function public.apple_match_sweep()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'apple_music_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'apple_music_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-apple-secret', v_secret),
    body := jsonb_build_object('action', 'sweep')
  );
end;
$$;

-- cron.schedule upserts by job name, so re-applying is safe. Offset minute to
-- avoid piling onto the half-hour meeting-reminders job.
select cron.schedule('apple-match-sweep', '23 * * * *', $$select public.apple_match_sweep()$$);
