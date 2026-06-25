-- Song Notes & Review Overhaul — Phase 1 (data model).
--
-- Expands the personal listening journal and the formal review with richer,
-- structured fields, and adds the primitives the redesigned recap will read:
--
--   • song_notes        — favorite lyric / reminds-me-of / initial-thoughts
--                          boxes, a private "saved to my library" flag, and
--                          per-song vibe tags.
--   • vibe_tags          — a shared catalog (canonical seed + member-added
--                          custom tags) powering the vibe-chip picker.
--   • album_impressions  — a per-(album, member) FIRST-LISTEN scratchpad:
--                          initial score (locks the first time it's set) and an
--                          initial album review. The rate screen reads this back
--                          to show score "drift".
--   • ratings            — score becomes decimal (slider); a REQUIRED (app-side)
--                          one-sentence take; best-3-song-run, replayability,
--                          favorite lyric, best moment, and album-level vibe.
--   • cycle_preferences  — the head-to-head "why this over the other" reasons.
--
-- Design decisions captured in the grilling session live in PLAN.md.

-- ═══════════════════════════════════════════════════════
-- song_notes — richer per-track journal
-- ═══════════════════════════════════════════════════════

alter table public.song_notes
  add column favorite_lyric   text check (favorite_lyric   is null or char_length(favorite_lyric)   <= 1000),
  add column reminds_me_of    text check (reminds_me_of    is null or char_length(reminds_me_of)    <= 1000),
  add column initial_thoughts text check (initial_thoughts is null or char_length(initial_thoughts) <= 2000),
  add column saved_to_library boolean not null default false,
  add column vibe_tags        text[]  not null default '{}';

-- NOTE: RLS is unchanged. `song_notes_select` already opens a member's whole
-- row to the club once they've shared the album. The "what's shared" decision
-- (general comment + favorite lyric + vibe tags visible; reminds-me-of and
-- initial-thoughts kept private) is enforced in the recap/read queries, which
-- only ever project the shareable columns — never via RLS column filtering.

-- ═══════════════════════════════════════════════════════
-- vibe_tags — shared catalog (canonical + custom)
-- ═══════════════════════════════════════════════════════

create table public.vibe_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  -- Normalized key for case-insensitive uniqueness so "Late night" and
  -- "late night" don't fork the recap stats. A real (generated) column rather
  -- than an expression index, so PostgREST upserts can target it via onConflict.
  name_key text generated always as (lower(trim(name))) stored,
  is_canonical boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (name_key)
);
-- The chosen tag strings still live denormalized in the text[] columns; this
-- table is the pick-list + dedupe source.

alter table public.vibe_tags enable row level security;

-- Anyone signed in can read the catalog and add a custom tag. Canonical rows
-- are seeded below with created_by = null and are never edited/deleted by users.
create policy vibe_tags_select on public.vibe_tags
  for select to authenticated using (true);

create policy vibe_tags_insert on public.vibe_tags
  for insert to authenticated
  with check (created_by = auth.uid() and is_canonical = false);

-- Seed the canonical vibe vocabulary.
insert into public.vibe_tags (name, is_canonical) values
  ('Cozy', true), ('Sad', true), ('Chaotic', true), ('Late night', true),
  ('Summer', true), ('Expensive', true), ('Angry', true), ('Weird', true),
  ('Romantic', true), ('Nostalgic', true), ('Driving', true),
  ('Background music', true), ('Headphones album', true), ('Party album', true),
  ('Grower', true), ('Too long', true), ('Skipless', true), ('Front-loaded', true)
on conflict do nothing;

-- ═══════════════════════════════════════════════════════
-- album_impressions — first-listen scratchpad
-- ═══════════════════════════════════════════════════════

create table public.album_impressions (
  album_id uuid not null references public.albums (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Initial score is a slider value (1.0–10.0). It LOCKS the first time it's set
  -- (enforced by the trigger below) so initial→final drift stays honest.
  initial_score numeric(3, 1) check (initial_score is null or initial_score between 1 and 10),
  initial_review text check (initial_review is null or char_length(initial_review) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (album_id, profile_id)
);

-- Lock initial_score on first set: once non-null, it can never change to a
-- different non-null value (clearing back to null is also rejected). Everything
-- else on the row stays freely editable.
create or replace function public.lock_initial_score()
returns trigger
language plpgsql
as $$
begin
  if old.initial_score is not null
     and new.initial_score is distinct from old.initial_score then
    raise exception 'Your first-listen score is locked and cannot be changed.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger album_impressions_lock_initial
  before update on public.album_impressions
  for each row execute function public.lock_initial_score();

alter table public.album_impressions enable row level security;

-- Private to the author. (First-listen impressions aren't shared; the formal
-- ratings row carries the snapshot that the post-reveal recap reads.)
-- All policies are gated to membership of the album's club, mirroring song_notes.
create policy album_impressions_select on public.album_impressions
  for select to authenticated
  using (profile_id = auth.uid());

create policy album_impressions_insert on public.album_impressions
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id and public.is_club_member(c.club_id)
    )
  );

create policy album_impressions_update on public.album_impressions
  for update to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from albums a
      join cycles c on c.id = a.cycle_id
      where a.id = album_id and public.is_club_member(c.club_id)
    )
  );

create policy album_impressions_delete on public.album_impressions
  for delete to authenticated
  using (profile_id = auth.uid());

-- ═══════════════════════════════════════════════════════
-- ratings — decimal score + richer formal review
-- ═══════════════════════════════════════════════════════

-- Score becomes a slider value. The existing `score between 1 and 10` check
-- stays valid for numeric; avg()/min()/max() in get_cycle_highlights and
-- get_album_summary keep working unchanged.
alter table public.ratings
  alter column score type numeric(3, 1) using score::numeric;

alter table public.ratings
  -- Required at submit (enforced in the app; nullable here so legacy rows and
  -- in-progress drafts are valid). A single punchy line shown atop the review.
  add column one_sentence_take text check (one_sentence_take is null or char_length(one_sentence_take) <= 280),
  -- Snapshot of the member's first-listen score, copied from album_impressions
  -- when they submit. Drift = score - initial_score.
  add column initial_score numeric(3, 1) check (initial_score is null or initial_score between 1 and 10),
  -- Best consecutive 3-song run: the starting track number + the run's rating.
  add column best_run_start integer check (best_run_start is null or best_run_start >= 1),
  add column best_run_rating numeric(3, 1) check (best_run_rating is null or best_run_rating between 1 and 10),
  -- Optional extras.
  add column replayability numeric(3, 1) check (replayability is null or replayability between 1 and 10),
  add column favorite_lyric text check (favorite_lyric is null or char_length(favorite_lyric) <= 1000),
  add column best_moment text check (best_moment is null or char_length(best_moment) <= 1000),
  -- Album-level vibe, pre-filled in the UI from the member's per-song vibe tags.
  add column album_vibe_tags text[] not null default '{}';

-- ═══════════════════════════════════════════════════════
-- cycle_preferences — head-to-head reasons
-- ═══════════════════════════════════════════════════════

alter table public.cycle_preferences
  -- Why the chosen album beat the other.
  add column preference_reason text check (preference_reason is null or char_length(preference_reason) <= 1000),
  -- What the album they DIDN'T pick still did better.
  add column other_album_merit text check (other_album_merit is null or char_length(other_album_merit) <= 1000);
