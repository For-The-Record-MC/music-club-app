-- Current-state schema snapshot of the public schema.
-- GENERATED — do not edit by hand. Regenerate after every `supabase db push`.
-- Source of truth for CURRENT schema; migration files are append-only history.

-- =====================================================
-- TABLES
-- =====================================================

CREATE TABLE activity_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  recipient_id uuid
);

CREATE TABLE activity_reads (
  club_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  last_read_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE album_impressions (
  album_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  initial_score numeric(3,1),
  initial_review text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE albums (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  slot integer,
  title text NOT NULL,
  artist text NOT NULL DEFAULT ''::text,
  year integer,
  artwork_url text,
  itunes_collection_id bigint,
  apple_url text,
  spotify_url text,
  tracks jsonb,
  set_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  claimed_by uuid,
  spotify_album_id text
);

CREATE TABLE app_opens (
  profile_id uuid NOT NULL,
  day date NOT NULL,
  first_open_at timestamp with time zone NOT NULL DEFAULT now(),
  last_open_at timestamp with time zone NOT NULL DEFAULT now(),
  opens integer NOT NULL DEFAULT 1
);

CREATE TABLE apple_match_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'track'::text,
  title text NOT NULL,
  artist text NOT NULL DEFAULT ''::text,
  spotify_url text,
  isrc text,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamp with time zone,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE aux_battle_songs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  title text NOT NULL,
  artist text NOT NULL DEFAULT ''::text,
  artwork_url text,
  spotify_url text,
  apple_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  preview_url text
);

CREATE TABLE aux_battle_theme_ideas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid,
  text text NOT NULL,
  created_by uuid,
  used_cycle_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE aux_battle_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  choice uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE aux_battles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  club_id uuid NOT NULL,
  theme_text text NOT NULL,
  theme_idea_id uuid,
  member_a uuid NOT NULL,
  member_b uuid NOT NULL,
  created_by uuid NOT NULL,
  winner_profile_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE best_bar_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bar_id uuid NOT NULL,
  author_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE best_bar_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bar_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  score smallint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE best_bars (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  author_id uuid NOT NULL,
  title text NOT NULL,
  artist text NOT NULL DEFAULT ''::text,
  artwork_url text,
  spotify_url text,
  apple_url text,
  lyric text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  preview_url text
);

CREATE TABLE bingo_boxes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL,
  "position" smallint NOT NULL,
  category_id uuid NOT NULL,
  title text,
  artist text NOT NULL DEFAULT ''::text,
  artwork_url text,
  spotify_url text,
  apple_url text,
  spotify_id text,
  duration_ms integer,
  listen_started_at timestamp with time zone,
  activated_at timestamp with time zone,
  lastfm_playcount bigint,
  preview_url text
);

CREATE TABLE bingo_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  qualifying_lines smallint[] NOT NULL,
  dealt_at timestamp with time zone NOT NULL DEFAULT now(),
  card_number smallint NOT NULL DEFAULT 1
);

CREATE TABLE bingo_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  label text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE bingo_challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL,
  "position" smallint NOT NULL,
  challenger_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE bingo_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL,
  line_index smallint NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  claimed_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamp with time zone,
  self_certified boolean NOT NULL DEFAULT false
);

CREATE TABLE bingo_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  author_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE bingo_game_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  label text NOT NULL
);

CREATE TABLE bingo_games (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open'::text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone
);

CREATE TABLE bracket_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bracket_id uuid NOT NULL,
  author_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE bracket_entries (
  bracket_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  champion_track_id uuid
);

CREATE TABLE bracket_picks (
  bracket_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  round smallint NOT NULL,
  slot smallint NOT NULL,
  winner_track_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE bracket_tracks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bracket_id uuid NOT NULL,
  seed smallint NOT NULL,
  "position" smallint NOT NULL,
  title text NOT NULL,
  album text NOT NULL DEFAULT ''::text,
  artwork_url text,
  spotify_url text,
  apple_url text,
  preview_url text,
  playcount bigint NOT NULL DEFAULT 0,
  artist text NOT NULL DEFAULT ''::text
);

CREATE TABLE brackets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  artist_name text NOT NULL,
  artist_spotify_id text NOT NULL DEFAULT ''::text,
  artist_image_url text,
  size smallint NOT NULL,
  status text NOT NULL DEFAULT 'open'::text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  scope text NOT NULL DEFAULT 'club'::text,
  owner_id uuid,
  kind text NOT NULL DEFAULT 'artist'::text,
  theme_art text[]
);

CREATE TABLE club_favorite_tracks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  cycle_id uuid,
  title text NOT NULL,
  artist text,
  spotify_uri text,
  source text,
  added_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE club_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  notifications_muted boolean NOT NULL DEFAULT false
);

CREATE TABLE clubs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '🎵'::text,
  owner_id uuid NOT NULL,
  invite_code text NOT NULL DEFAULT generate_invite_code(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  song_limit_per_cycle integer,
  leaderboard_weights jsonb NOT NULL DEFAULT jsonb_build_object('songs_shared', 3, 'interactions_given', 1, 'ratings_given', 2, 'concerts_added', 2, 'meetings_attended', 5, 'albums_chosen', 4),
  spotify_favorites_playlist_id text,
  spotify_favorites_playlist_url text,
  meeting_timezone text
);

CREATE TABLE concert_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL,
  author_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE concert_interest (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'interested'::text
);

CREATE TABLE concerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  added_by uuid NOT NULL,
  artist text NOT NULL,
  concert_date date,
  venue text,
  price text,
  ticket_url text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  concert_time time without time zone,
  review text,
  rating integer,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  origin_concert_id uuid,
  image_url text,
  tagged_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
);

CREATE TABLE convince_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  author_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE convince_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  author_id uuid NOT NULL,
  artist_name text NOT NULL,
  artist_image_url text,
  artist_ref text,
  blurb text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE convince_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  verdict text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE convince_tracks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  "position" smallint NOT NULL,
  title text NOT NULL,
  artist text NOT NULL DEFAULT ''::text,
  artwork_url text,
  spotify_url text,
  apple_url text,
  norm_key text NOT NULL DEFAULT ''::text,
  preview_url text
);

CREATE TABLE cycle_guests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'yes'::text,
  added_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE cycle_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  album_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  preference_reason text,
  other_album_merit text
);

CREATE TABLE cycles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  number integer NOT NULL,
  picker_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open'::text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  meeting_date date,
  meeting_time_location text,
  revealed_at timestamp with time zone,
  closed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  meeting_at timestamp with time zone,
  meeting_url text,
  spotify_playlist_id text,
  spotify_playlist_url text,
  spotify_highlights_playlist_id text,
  spotify_highlights_playlist_url text,
  meeting_reminder_24h_sent_at timestamp with time zone,
  meeting_reminder_1h_sent_at timestamp with time zone,
  participation_nudge_72h_sent_at timestamp with time zone,
  kind text NOT NULL DEFAULT 'standard'::text
);

CREATE TABLE feed_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  author_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'track'::text,
  title text NOT NULL,
  artist text NOT NULL DEFAULT ''::text,
  url text,
  platform text NOT NULL DEFAULT 'other'::text,
  note text,
  is_album_suggestion boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  playlist_synced_at timestamp with time zone,
  origin_post_id uuid
);

CREATE TABLE meeting_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  author_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meeting_time_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  proposed_by uuid NOT NULL,
  slot_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meeting_time_votes (
  option_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE musical_take_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  take_id uuid NOT NULL,
  author_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE musical_take_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  take_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  value smallint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE musical_takes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE notification_preferences (
  profile_id uuid NOT NULL,
  mentions boolean NOT NULL DEFAULT true,
  lifecycle boolean NOT NULL DEFAULT true,
  social boolean NOT NULL DEFAULT false,
  announcements boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE perfect_playlist_songs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  title text NOT NULL,
  artist text NOT NULL DEFAULT ''::text,
  artwork_url text,
  spotify_url text,
  apple_url text,
  norm_key text NOT NULL,
  playlist_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  apple_song_id text,
  isrc text,
  preview_url text
);

CREATE TABLE perfect_playlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  club_id uuid NOT NULL,
  theme_text text NOT NULL,
  created_by uuid NOT NULL,
  spotify_playlist_id text,
  spotify_playlist_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE post_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  author_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE post_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE profile_tracks (
  profile_id uuid NOT NULL,
  slot text NOT NULL,
  track_name text NOT NULL,
  artist_name text NOT NULL DEFAULT ''::text,
  album_name text NOT NULL DEFAULT ''::text,
  artwork_url text,
  spotify_url text,
  spotify_uri text,
  caption text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id uuid NOT NULL,
  display_name text,
  avatar_color integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  avatar_url text,
  avatar_label text,
  avatar_album_url text,
  email text,
  can_use_personal_spotify boolean NOT NULL DEFAULT false,
  preferred_service text NOT NULL DEFAULT 'both'::text
);

CREATE TABLE push_tokens (
  profile_id uuid NOT NULL,
  platform text NOT NULL,
  token text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  score numeric(3,1) NOT NULL,
  review text,
  favorite_track text,
  favorite_reason text,
  least_track text,
  least_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  one_sentence_take text,
  initial_score numeric(3,1),
  best_run_start integer,
  best_run_rating numeric(3,1),
  replayability numeric(3,1),
  favorite_lyric text,
  best_moment text,
  album_vibe_tags text[] NOT NULL DEFAULT '{}'::text[]
);

CREATE TABLE rsvps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  status text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE showdown_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  showdown_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  title text NOT NULL,
  artist text NOT NULL DEFAULT ''::text,
  artwork_url text,
  spotify_url text,
  apple_url text,
  norm_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  preview_url text
);

CREATE TABLE showdown_theme_ideas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid,
  text text NOT NULL,
  created_by uuid,
  used_cycle_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE showdown_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  value smallint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE showdowns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  club_id uuid NOT NULL,
  theme_text text NOT NULL,
  theme_idea_id uuid,
  created_by uuid NOT NULL,
  winner_submission_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE song_note_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  song_note_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  value text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE song_note_shares (
  album_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  mode text NOT NULL DEFAULT 'now'::text
);

CREATE TABLE song_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  track_number integer NOT NULL,
  track_name text NOT NULL,
  rating integer,
  thumb text,
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  favorite_lyric text,
  reminds_me_of text,
  initial_thoughts text,
  saved_to_library boolean NOT NULL DEFAULT false,
  vibe_tags text[] NOT NULL DEFAULT '{}'::text[]
);

CREATE TABLE spotify_api_state (
  id boolean NOT NULL DEFAULT true,
  benched_until timestamp with time zone,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  window_calls integer NOT NULL DEFAULT 0
);

CREATE TABLE spotify_track_cache (
  key text NOT NULL,
  miss boolean NOT NULL DEFAULT false,
  spotify_id text NOT NULL DEFAULT ''::text,
  title text NOT NULL DEFAULT ''::text,
  album text NOT NULL DEFAULT ''::text,
  artwork_url text,
  spotify_url text,
  resolved_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE streaming_connections (
  club_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'spotify'::text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  scope text,
  spotify_user_id text,
  display_name text,
  status text NOT NULL DEFAULT 'active'::text,
  connected_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE vibe_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_key text DEFAULT lower(TRIM(BOTH FROM name)),
  is_canonical boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);


-- =====================================================
-- CONSTRAINTS
-- =====================================================

ALTER TABLE activity_events ADD CONSTRAINT activity_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE activity_events ADD CONSTRAINT activity_events_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE activity_events ADD CONSTRAINT activity_events_pkey PRIMARY KEY (id);

ALTER TABLE activity_events ADD CONSTRAINT activity_events_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE activity_reads ADD CONSTRAINT activity_reads_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE activity_reads ADD CONSTRAINT activity_reads_pkey PRIMARY KEY (club_id, profile_id);

ALTER TABLE activity_reads ADD CONSTRAINT activity_reads_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE album_impressions ADD CONSTRAINT album_impressions_album_id_fkey FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;

ALTER TABLE album_impressions ADD CONSTRAINT album_impressions_initial_review_check CHECK (((initial_review IS NULL) OR (char_length(initial_review) <= 4000)));

ALTER TABLE album_impressions ADD CONSTRAINT album_impressions_initial_score_check CHECK (((initial_score IS NULL) OR ((initial_score >= (1)::numeric) AND (initial_score <= (10)::numeric))));

ALTER TABLE album_impressions ADD CONSTRAINT album_impressions_pkey PRIMARY KEY (album_id, profile_id);

ALTER TABLE album_impressions ADD CONSTRAINT album_impressions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE albums ADD CONSTRAINT albums_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES profiles(id);

ALTER TABLE albums ADD CONSTRAINT albums_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE albums ADD CONSTRAINT albums_cycle_id_slot_key UNIQUE (cycle_id, slot);

ALTER TABLE albums ADD CONSTRAINT albums_pkey PRIMARY KEY (id);

ALTER TABLE albums ADD CONSTRAINT albums_set_by_fkey FOREIGN KEY (set_by) REFERENCES profiles(id);

ALTER TABLE albums ADD CONSTRAINT albums_slot_check CHECK (((slot IS NULL) OR (slot = ANY (ARRAY[1, 2]))));

ALTER TABLE albums ADD CONSTRAINT albums_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 200)));

ALTER TABLE app_opens ADD CONSTRAINT app_opens_pkey PRIMARY KEY (profile_id, day);

ALTER TABLE app_opens ADD CONSTRAINT app_opens_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE apple_match_queue ADD CONSTRAINT apple_match_queue_kind_check CHECK ((kind = ANY (ARRAY['track'::text, 'album'::text])));

ALTER TABLE apple_match_queue ADD CONSTRAINT apple_match_queue_pkey PRIMARY KEY (id);

ALTER TABLE apple_match_queue ADD CONSTRAINT apple_match_queue_source_table_source_id_key UNIQUE (source_table, source_id);

ALTER TABLE aux_battle_songs ADD CONSTRAINT aux_battle_songs_battle_id_fkey FOREIGN KEY (battle_id) REFERENCES aux_battles(id) ON DELETE CASCADE;

ALTER TABLE aux_battle_songs ADD CONSTRAINT aux_battle_songs_battle_id_profile_id_key UNIQUE (battle_id, profile_id);

ALTER TABLE aux_battle_songs ADD CONSTRAINT aux_battle_songs_pkey PRIMARY KEY (id);

ALTER TABLE aux_battle_songs ADD CONSTRAINT aux_battle_songs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE aux_battle_songs ADD CONSTRAINT aux_battle_songs_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 300)));

ALTER TABLE aux_battle_theme_ideas ADD CONSTRAINT aux_battle_theme_ideas_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE aux_battle_theme_ideas ADD CONSTRAINT aux_battle_theme_ideas_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE aux_battle_theme_ideas ADD CONSTRAINT aux_battle_theme_ideas_pkey PRIMARY KEY (id);

ALTER TABLE aux_battle_theme_ideas ADD CONSTRAINT aux_battle_theme_ideas_text_check CHECK (((char_length(TRIM(BOTH FROM text)) >= 1) AND (char_length(TRIM(BOTH FROM text)) <= 140)));

ALTER TABLE aux_battle_theme_ideas ADD CONSTRAINT aux_battle_theme_ideas_used_cycle_id_fkey FOREIGN KEY (used_cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;

ALTER TABLE aux_battle_votes ADD CONSTRAINT aux_battle_votes_battle_id_fkey FOREIGN KEY (battle_id) REFERENCES aux_battles(id) ON DELETE CASCADE;

ALTER TABLE aux_battle_votes ADD CONSTRAINT aux_battle_votes_battle_id_profile_id_key UNIQUE (battle_id, profile_id);

ALTER TABLE aux_battle_votes ADD CONSTRAINT aux_battle_votes_choice_fkey FOREIGN KEY (choice) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE aux_battle_votes ADD CONSTRAINT aux_battle_votes_pkey PRIMARY KEY (id);

ALTER TABLE aux_battle_votes ADD CONSTRAINT aux_battle_votes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE aux_battles ADD CONSTRAINT aux_battles_check CHECK ((member_a <> member_b));

ALTER TABLE aux_battles ADD CONSTRAINT aux_battles_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE aux_battles ADD CONSTRAINT aux_battles_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE aux_battles ADD CONSTRAINT aux_battles_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE aux_battles ADD CONSTRAINT aux_battles_member_a_fkey FOREIGN KEY (member_a) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE aux_battles ADD CONSTRAINT aux_battles_member_b_fkey FOREIGN KEY (member_b) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE aux_battles ADD CONSTRAINT aux_battles_pkey PRIMARY KEY (id);

ALTER TABLE aux_battles ADD CONSTRAINT aux_battles_theme_idea_id_fkey FOREIGN KEY (theme_idea_id) REFERENCES aux_battle_theme_ideas(id) ON DELETE SET NULL;

ALTER TABLE aux_battles ADD CONSTRAINT aux_battles_theme_text_check CHECK (((char_length(TRIM(BOTH FROM theme_text)) >= 1) AND (char_length(TRIM(BOTH FROM theme_text)) <= 140)));

ALTER TABLE aux_battles ADD CONSTRAINT aux_battles_winner_profile_id_fkey FOREIGN KEY (winner_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE best_bar_comments ADD CONSTRAINT best_bar_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE best_bar_comments ADD CONSTRAINT best_bar_comments_bar_id_fkey FOREIGN KEY (bar_id) REFERENCES best_bars(id) ON DELETE CASCADE;

ALTER TABLE best_bar_comments ADD CONSTRAINT best_bar_comments_pkey PRIMARY KEY (id);

ALTER TABLE best_bar_comments ADD CONSTRAINT best_bar_comments_text_check CHECK (((char_length(TRIM(BOTH FROM text)) >= 1) AND (char_length(TRIM(BOTH FROM text)) <= 2000)));

ALTER TABLE best_bar_ratings ADD CONSTRAINT best_bar_ratings_bar_id_fkey FOREIGN KEY (bar_id) REFERENCES best_bars(id) ON DELETE CASCADE;

ALTER TABLE best_bar_ratings ADD CONSTRAINT best_bar_ratings_bar_id_profile_id_key UNIQUE (bar_id, profile_id);

ALTER TABLE best_bar_ratings ADD CONSTRAINT best_bar_ratings_pkey PRIMARY KEY (id);

ALTER TABLE best_bar_ratings ADD CONSTRAINT best_bar_ratings_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE best_bar_ratings ADD CONSTRAINT best_bar_ratings_score_check CHECK (((score >= 1) AND (score <= 10)));

ALTER TABLE best_bars ADD CONSTRAINT best_bars_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE best_bars ADD CONSTRAINT best_bars_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE best_bars ADD CONSTRAINT best_bars_lyric_check CHECK (((char_length(TRIM(BOTH FROM lyric)) >= 1) AND (char_length(TRIM(BOTH FROM lyric)) <= 500)));

ALTER TABLE best_bars ADD CONSTRAINT best_bars_pkey PRIMARY KEY (id);

ALTER TABLE best_bars ADD CONSTRAINT best_bars_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 300)));

ALTER TABLE bingo_boxes ADD CONSTRAINT bingo_boxes_card_id_fkey FOREIGN KEY (card_id) REFERENCES bingo_cards(id) ON DELETE CASCADE;

ALTER TABLE bingo_boxes ADD CONSTRAINT bingo_boxes_card_id_position_key UNIQUE (card_id, "position");

ALTER TABLE bingo_boxes ADD CONSTRAINT bingo_boxes_category_id_fkey FOREIGN KEY (category_id) REFERENCES bingo_game_categories(id) ON DELETE CASCADE;

ALTER TABLE bingo_boxes ADD CONSTRAINT bingo_boxes_pkey PRIMARY KEY (id);

ALTER TABLE bingo_boxes ADD CONSTRAINT bingo_boxes_position_check CHECK (((("position" >= 0) AND ("position" <= 24)) AND ("position" <> 12)));

ALTER TABLE bingo_boxes ADD CONSTRAINT bingo_boxes_title_check CHECK (((title IS NULL) OR ((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 300))));

ALTER TABLE bingo_cards ADD CONSTRAINT bingo_cards_game_id_fkey FOREIGN KEY (game_id) REFERENCES bingo_games(id) ON DELETE CASCADE;

ALTER TABLE bingo_cards ADD CONSTRAINT bingo_cards_game_profile_number_key UNIQUE (game_id, profile_id, card_number);

ALTER TABLE bingo_cards ADD CONSTRAINT bingo_cards_pkey PRIMARY KEY (id);

ALTER TABLE bingo_cards ADD CONSTRAINT bingo_cards_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE bingo_cards ADD CONSTRAINT bingo_cards_qualifying_lines_check CHECK (((array_length(qualifying_lines, 1) >= 3) AND (array_length(qualifying_lines, 1) <= 12)));

ALTER TABLE bingo_categories ADD CONSTRAINT bingo_categories_label_check CHECK (((char_length(TRIM(BOTH FROM label)) >= 1) AND (char_length(TRIM(BOTH FROM label)) <= 200)));

ALTER TABLE bingo_categories ADD CONSTRAINT bingo_categories_label_key UNIQUE (label);

ALTER TABLE bingo_categories ADD CONSTRAINT bingo_categories_pkey PRIMARY KEY (id);

ALTER TABLE bingo_challenges ADD CONSTRAINT bingo_challenges_challenger_id_fkey FOREIGN KEY (challenger_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE bingo_challenges ADD CONSTRAINT bingo_challenges_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES bingo_claims(id) ON DELETE CASCADE;

ALTER TABLE bingo_challenges ADD CONSTRAINT bingo_challenges_pkey PRIMARY KEY (id);

ALTER TABLE bingo_challenges ADD CONSTRAINT bingo_challenges_position_check CHECK (((("position" >= 0) AND ("position" <= 24)) AND ("position" <> 12)));

ALTER TABLE bingo_challenges ADD CONSTRAINT bingo_challenges_reason_check CHECK (((char_length(TRIM(BOTH FROM reason)) >= 1) AND (char_length(TRIM(BOTH FROM reason)) <= 500)));

ALTER TABLE bingo_claims ADD CONSTRAINT bingo_claims_card_id_fkey FOREIGN KEY (card_id) REFERENCES bingo_cards(id) ON DELETE CASCADE;

ALTER TABLE bingo_claims ADD CONSTRAINT bingo_claims_line_index_check CHECK (((line_index >= 0) AND (line_index <= 11)));

ALTER TABLE bingo_claims ADD CONSTRAINT bingo_claims_pkey PRIMARY KEY (id);

ALTER TABLE bingo_claims ADD CONSTRAINT bingo_claims_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE bingo_claims ADD CONSTRAINT bingo_claims_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])));

ALTER TABLE bingo_comments ADD CONSTRAINT bingo_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE bingo_comments ADD CONSTRAINT bingo_comments_game_id_fkey FOREIGN KEY (game_id) REFERENCES bingo_games(id) ON DELETE CASCADE;

ALTER TABLE bingo_comments ADD CONSTRAINT bingo_comments_pkey PRIMARY KEY (id);

ALTER TABLE bingo_comments ADD CONSTRAINT bingo_comments_text_check CHECK (((char_length(TRIM(BOTH FROM text)) >= 1) AND (char_length(TRIM(BOTH FROM text)) <= 2000)));

ALTER TABLE bingo_game_categories ADD CONSTRAINT bingo_game_categories_game_id_fkey FOREIGN KEY (game_id) REFERENCES bingo_games(id) ON DELETE CASCADE;

ALTER TABLE bingo_game_categories ADD CONSTRAINT bingo_game_categories_game_id_label_key UNIQUE (game_id, label);

ALTER TABLE bingo_game_categories ADD CONSTRAINT bingo_game_categories_label_check CHECK (((char_length(TRIM(BOTH FROM label)) >= 1) AND (char_length(TRIM(BOTH FROM label)) <= 200)));

ALTER TABLE bingo_game_categories ADD CONSTRAINT bingo_game_categories_pkey PRIMARY KEY (id);

ALTER TABLE bingo_games ADD CONSTRAINT bingo_games_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE bingo_games ADD CONSTRAINT bingo_games_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE bingo_games ADD CONSTRAINT bingo_games_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE bingo_games ADD CONSTRAINT bingo_games_pkey PRIMARY KEY (id);

ALTER TABLE bingo_games ADD CONSTRAINT bingo_games_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));

ALTER TABLE bracket_comments ADD CONSTRAINT bracket_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE bracket_comments ADD CONSTRAINT bracket_comments_bracket_id_fkey FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE;

ALTER TABLE bracket_comments ADD CONSTRAINT bracket_comments_pkey PRIMARY KEY (id);

ALTER TABLE bracket_comments ADD CONSTRAINT bracket_comments_text_check CHECK (((char_length(TRIM(BOTH FROM text)) >= 1) AND (char_length(TRIM(BOTH FROM text)) <= 2000)));

ALTER TABLE bracket_entries ADD CONSTRAINT bracket_entries_bracket_id_fkey FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE;

ALTER TABLE bracket_entries ADD CONSTRAINT bracket_entries_champion_track_id_fkey FOREIGN KEY (champion_track_id) REFERENCES bracket_tracks(id) ON DELETE SET NULL;

ALTER TABLE bracket_entries ADD CONSTRAINT bracket_entries_pkey PRIMARY KEY (bracket_id, profile_id);

ALTER TABLE bracket_entries ADD CONSTRAINT bracket_entries_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE bracket_picks ADD CONSTRAINT bracket_picks_bracket_id_fkey FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE;

ALTER TABLE bracket_picks ADD CONSTRAINT bracket_picks_pkey PRIMARY KEY (bracket_id, profile_id, round, slot);

ALTER TABLE bracket_picks ADD CONSTRAINT bracket_picks_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE bracket_picks ADD CONSTRAINT bracket_picks_round_check CHECK ((round >= 1));

ALTER TABLE bracket_picks ADD CONSTRAINT bracket_picks_slot_check CHECK ((slot >= 1));

ALTER TABLE bracket_picks ADD CONSTRAINT bracket_picks_winner_track_id_fkey FOREIGN KEY (winner_track_id) REFERENCES bracket_tracks(id) ON DELETE CASCADE;

ALTER TABLE bracket_tracks ADD CONSTRAINT bracket_tracks_artist_check CHECK ((char_length(artist) <= 300));

ALTER TABLE bracket_tracks ADD CONSTRAINT bracket_tracks_bracket_id_fkey FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE;

ALTER TABLE bracket_tracks ADD CONSTRAINT bracket_tracks_bracket_id_position_key UNIQUE (bracket_id, "position");

ALTER TABLE bracket_tracks ADD CONSTRAINT bracket_tracks_bracket_id_seed_key UNIQUE (bracket_id, seed);

ALTER TABLE bracket_tracks ADD CONSTRAINT bracket_tracks_pkey PRIMARY KEY (id);

ALTER TABLE bracket_tracks ADD CONSTRAINT bracket_tracks_position_check CHECK (("position" >= 1));

ALTER TABLE bracket_tracks ADD CONSTRAINT bracket_tracks_seed_check CHECK ((seed >= 1));

ALTER TABLE bracket_tracks ADD CONSTRAINT bracket_tracks_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 300)));

ALTER TABLE brackets ADD CONSTRAINT brackets_artist_name_check CHECK (((char_length(TRIM(BOTH FROM artist_name)) >= 1) AND (char_length(TRIM(BOTH FROM artist_name)) <= 200)));

ALTER TABLE brackets ADD CONSTRAINT brackets_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE brackets ADD CONSTRAINT brackets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE brackets ADD CONSTRAINT brackets_kind_check CHECK ((kind = ANY (ARRAY['artist'::text, 'theme'::text])));

ALTER TABLE brackets ADD CONSTRAINT brackets_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE brackets ADD CONSTRAINT brackets_pkey PRIMARY KEY (id);

ALTER TABLE brackets ADD CONSTRAINT brackets_scope_check CHECK ((scope = ANY (ARRAY['club'::text, 'personal'::text])));

ALTER TABLE brackets ADD CONSTRAINT brackets_size_check CHECK ((size = ANY (ARRAY[16, 32, 64])));

ALTER TABLE brackets ADD CONSTRAINT brackets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));

ALTER TABLE club_favorite_tracks ADD CONSTRAINT club_favorite_tracks_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE club_favorite_tracks ADD CONSTRAINT club_favorite_tracks_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;

ALTER TABLE club_favorite_tracks ADD CONSTRAINT club_favorite_tracks_pkey PRIMARY KEY (id);

ALTER TABLE club_favorite_tracks ADD CONSTRAINT club_favorite_tracks_source_check CHECK (((source IS NULL) OR (source = ANY (ARRAY['album'::text, 'feed'::text]))));

ALTER TABLE club_members ADD CONSTRAINT club_members_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE club_members ADD CONSTRAINT club_members_club_id_profile_id_key UNIQUE (club_id, profile_id);

ALTER TABLE club_members ADD CONSTRAINT club_members_pkey PRIMARY KEY (id);

ALTER TABLE club_members ADD CONSTRAINT club_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE club_members ADD CONSTRAINT club_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])));

ALTER TABLE clubs ADD CONSTRAINT clubs_invite_code_key UNIQUE (invite_code);

ALTER TABLE clubs ADD CONSTRAINT clubs_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 60)));

ALTER TABLE clubs ADD CONSTRAINT clubs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);

ALTER TABLE clubs ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);

ALTER TABLE clubs ADD CONSTRAINT clubs_song_limit_per_cycle_check CHECK (((song_limit_per_cycle IS NULL) OR (song_limit_per_cycle >= 1)));

ALTER TABLE concert_comments ADD CONSTRAINT concert_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE concert_comments ADD CONSTRAINT concert_comments_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE;

ALTER TABLE concert_comments ADD CONSTRAINT concert_comments_pkey PRIMARY KEY (id);

ALTER TABLE concert_comments ADD CONSTRAINT concert_comments_text_check CHECK (((char_length(TRIM(BOTH FROM text)) >= 1) AND (char_length(TRIM(BOTH FROM text)) <= 2000)));

ALTER TABLE concert_interest ADD CONSTRAINT concert_interest_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE;

ALTER TABLE concert_interest ADD CONSTRAINT concert_interest_concert_id_profile_id_key UNIQUE (concert_id, profile_id);

ALTER TABLE concert_interest ADD CONSTRAINT concert_interest_pkey PRIMARY KEY (id);

ALTER TABLE concert_interest ADD CONSTRAINT concert_interest_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE concert_interest ADD CONSTRAINT concert_interest_status_check CHECK ((status = ANY (ARRAY['interested'::text, 'going'::text])));

ALTER TABLE concerts ADD CONSTRAINT concerts_added_by_fkey FOREIGN KEY (added_by) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE concerts ADD CONSTRAINT concerts_artist_check CHECK (((char_length(TRIM(BOTH FROM artist)) >= 1) AND (char_length(TRIM(BOTH FROM artist)) <= 200)));

ALTER TABLE concerts ADD CONSTRAINT concerts_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE concerts ADD CONSTRAINT concerts_note_check CHECK (((note IS NULL) OR (char_length(note) <= 1000)));

ALTER TABLE concerts ADD CONSTRAINT concerts_origin_concert_id_fkey FOREIGN KEY (origin_concert_id) REFERENCES concerts(id) ON DELETE SET NULL;

ALTER TABLE concerts ADD CONSTRAINT concerts_pkey PRIMARY KEY (id);

ALTER TABLE concerts ADD CONSTRAINT concerts_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5))));

ALTER TABLE concerts ADD CONSTRAINT concerts_review_check CHECK (((review IS NULL) OR (char_length(review) <= 2000)));

ALTER TABLE convince_comments ADD CONSTRAINT convince_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE convince_comments ADD CONSTRAINT convince_comments_pkey PRIMARY KEY (id);

ALTER TABLE convince_comments ADD CONSTRAINT convince_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES convince_posts(id) ON DELETE CASCADE;

ALTER TABLE convince_comments ADD CONSTRAINT convince_comments_text_check CHECK (((char_length(TRIM(BOTH FROM text)) >= 1) AND (char_length(TRIM(BOTH FROM text)) <= 2000)));

ALTER TABLE convince_posts ADD CONSTRAINT convince_posts_artist_name_check CHECK (((char_length(TRIM(BOTH FROM artist_name)) >= 1) AND (char_length(TRIM(BOTH FROM artist_name)) <= 200)));

ALTER TABLE convince_posts ADD CONSTRAINT convince_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE convince_posts ADD CONSTRAINT convince_posts_blurb_check CHECK (((char_length(TRIM(BOTH FROM blurb)) >= 1) AND (char_length(TRIM(BOTH FROM blurb)) <= 1000)));

ALTER TABLE convince_posts ADD CONSTRAINT convince_posts_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE convince_posts ADD CONSTRAINT convince_posts_pkey PRIMARY KEY (id);

ALTER TABLE convince_targets ADD CONSTRAINT convince_targets_pkey PRIMARY KEY (id);

ALTER TABLE convince_targets ADD CONSTRAINT convince_targets_post_id_fkey FOREIGN KEY (post_id) REFERENCES convince_posts(id) ON DELETE CASCADE;

ALTER TABLE convince_targets ADD CONSTRAINT convince_targets_post_id_profile_id_key UNIQUE (post_id, profile_id);

ALTER TABLE convince_targets ADD CONSTRAINT convince_targets_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE convince_targets ADD CONSTRAINT convince_targets_verdict_check CHECK ((verdict = ANY (ARRAY['converted'::text, 'not_for_me'::text])));

ALTER TABLE convince_tracks ADD CONSTRAINT convince_tracks_pkey PRIMARY KEY (id);

ALTER TABLE convince_tracks ADD CONSTRAINT convince_tracks_position_check CHECK (("position" = ANY (ARRAY[1, 2, 3])));

ALTER TABLE convince_tracks ADD CONSTRAINT convince_tracks_post_id_fkey FOREIGN KEY (post_id) REFERENCES convince_posts(id) ON DELETE CASCADE;

ALTER TABLE convince_tracks ADD CONSTRAINT convince_tracks_post_id_position_key UNIQUE (post_id, "position");

ALTER TABLE convince_tracks ADD CONSTRAINT convince_tracks_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 300)));

ALTER TABLE cycle_guests ADD CONSTRAINT cycle_guests_added_by_fkey FOREIGN KEY (added_by) REFERENCES profiles(id);

ALTER TABLE cycle_guests ADD CONSTRAINT cycle_guests_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE cycle_guests ADD CONSTRAINT cycle_guests_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 60)));

ALTER TABLE cycle_guests ADD CONSTRAINT cycle_guests_pkey PRIMARY KEY (id);

ALTER TABLE cycle_guests ADD CONSTRAINT cycle_guests_status_check CHECK ((status = ANY (ARRAY['yes'::text, 'maybe'::text, 'no'::text])));

ALTER TABLE cycle_preferences ADD CONSTRAINT cycle_preferences_album_id_fkey FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;

ALTER TABLE cycle_preferences ADD CONSTRAINT cycle_preferences_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE cycle_preferences ADD CONSTRAINT cycle_preferences_cycle_id_profile_id_key UNIQUE (cycle_id, profile_id);

ALTER TABLE cycle_preferences ADD CONSTRAINT cycle_preferences_other_album_merit_check CHECK (((other_album_merit IS NULL) OR (char_length(other_album_merit) <= 1000)));

ALTER TABLE cycle_preferences ADD CONSTRAINT cycle_preferences_pkey PRIMARY KEY (id);

ALTER TABLE cycle_preferences ADD CONSTRAINT cycle_preferences_preference_reason_check CHECK (((preference_reason IS NULL) OR (char_length(preference_reason) <= 1000)));

ALTER TABLE cycle_preferences ADD CONSTRAINT cycle_preferences_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE cycles ADD CONSTRAINT cycles_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE cycles ADD CONSTRAINT cycles_club_id_number_key UNIQUE (club_id, number);

ALTER TABLE cycles ADD CONSTRAINT cycles_kind_check CHECK ((kind = ANY (ARRAY['standard'::text, 'archive'::text])));

ALTER TABLE cycles ADD CONSTRAINT cycles_picker_id_fkey FOREIGN KEY (picker_id) REFERENCES profiles(id);

ALTER TABLE cycles ADD CONSTRAINT cycles_pkey PRIMARY KEY (id);

ALTER TABLE cycles ADD CONSTRAINT cycles_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));

ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_kind_check CHECK ((kind = ANY (ARRAY['track'::text, 'album'::text, 'playlist'::text])));

ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_note_check CHECK (((note IS NULL) OR (char_length(note) <= 2000)));

ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_origin_post_id_fkey FOREIGN KEY (origin_post_id) REFERENCES feed_posts(id) ON DELETE SET NULL;

ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_pkey PRIMARY KEY (id);

ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_platform_check CHECK ((platform = ANY (ARRAY['spotify'::text, 'apple'::text, 'other'::text])));

ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 300)));

ALTER TABLE meeting_posts ADD CONSTRAINT meeting_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE meeting_posts ADD CONSTRAINT meeting_posts_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE meeting_posts ADD CONSTRAINT meeting_posts_pkey PRIMARY KEY (id);

ALTER TABLE meeting_posts ADD CONSTRAINT meeting_posts_text_check CHECK (((char_length(TRIM(BOTH FROM text)) >= 1) AND (char_length(TRIM(BOTH FROM text)) <= 2000)));

ALTER TABLE meeting_time_options ADD CONSTRAINT meeting_time_options_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE meeting_time_options ADD CONSTRAINT meeting_time_options_cycle_id_slot_at_key UNIQUE (cycle_id, slot_at);

ALTER TABLE meeting_time_options ADD CONSTRAINT meeting_time_options_pkey PRIMARY KEY (id);

ALTER TABLE meeting_time_options ADD CONSTRAINT meeting_time_options_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES profiles(id);

ALTER TABLE meeting_time_votes ADD CONSTRAINT meeting_time_votes_option_id_fkey FOREIGN KEY (option_id) REFERENCES meeting_time_options(id) ON DELETE CASCADE;

ALTER TABLE meeting_time_votes ADD CONSTRAINT meeting_time_votes_pkey PRIMARY KEY (option_id, profile_id);

ALTER TABLE meeting_time_votes ADD CONSTRAINT meeting_time_votes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE musical_take_comments ADD CONSTRAINT musical_take_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE musical_take_comments ADD CONSTRAINT musical_take_comments_pkey PRIMARY KEY (id);

ALTER TABLE musical_take_comments ADD CONSTRAINT musical_take_comments_take_id_fkey FOREIGN KEY (take_id) REFERENCES musical_takes(id) ON DELETE CASCADE;

ALTER TABLE musical_take_comments ADD CONSTRAINT musical_take_comments_text_check CHECK (((char_length(TRIM(BOTH FROM text)) >= 1) AND (char_length(TRIM(BOTH FROM text)) <= 2000)));

ALTER TABLE musical_take_positions ADD CONSTRAINT musical_take_positions_pkey PRIMARY KEY (id);

ALTER TABLE musical_take_positions ADD CONSTRAINT musical_take_positions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE musical_take_positions ADD CONSTRAINT musical_take_positions_take_id_fkey FOREIGN KEY (take_id) REFERENCES musical_takes(id) ON DELETE CASCADE;

ALTER TABLE musical_take_positions ADD CONSTRAINT musical_take_positions_take_id_profile_id_key UNIQUE (take_id, profile_id);

ALTER TABLE musical_take_positions ADD CONSTRAINT musical_take_positions_value_check CHECK (((value >= '-2'::integer) AND (value <= 2)));

ALTER TABLE musical_takes ADD CONSTRAINT musical_takes_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE musical_takes ADD CONSTRAINT musical_takes_body_check CHECK (((char_length(TRIM(BOTH FROM body)) >= 1) AND (char_length(TRIM(BOTH FROM body)) <= 280)));

ALTER TABLE musical_takes ADD CONSTRAINT musical_takes_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE musical_takes ADD CONSTRAINT musical_takes_pkey PRIMARY KEY (id);

ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (profile_id);

ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE perfect_playlist_songs ADD CONSTRAINT perfect_playlist_songs_pkey PRIMARY KEY (id);

ALTER TABLE perfect_playlist_songs ADD CONSTRAINT perfect_playlist_songs_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES perfect_playlists(id) ON DELETE CASCADE;

ALTER TABLE perfect_playlist_songs ADD CONSTRAINT perfect_playlist_songs_playlist_id_norm_key_key UNIQUE (playlist_id, norm_key);

ALTER TABLE perfect_playlist_songs ADD CONSTRAINT perfect_playlist_songs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE perfect_playlist_songs ADD CONSTRAINT perfect_playlist_songs_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 300)));

ALTER TABLE perfect_playlists ADD CONSTRAINT perfect_playlists_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE perfect_playlists ADD CONSTRAINT perfect_playlists_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE perfect_playlists ADD CONSTRAINT perfect_playlists_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE perfect_playlists ADD CONSTRAINT perfect_playlists_cycle_id_key UNIQUE (cycle_id);

ALTER TABLE perfect_playlists ADD CONSTRAINT perfect_playlists_pkey PRIMARY KEY (id);

ALTER TABLE perfect_playlists ADD CONSTRAINT perfect_playlists_theme_text_check CHECK (((char_length(TRIM(BOTH FROM theme_text)) >= 1) AND (char_length(TRIM(BOTH FROM theme_text)) <= 140)));

ALTER TABLE post_comments ADD CONSTRAINT post_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE post_comments ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);

ALTER TABLE post_comments ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE CASCADE;

ALTER TABLE post_comments ADD CONSTRAINT post_comments_text_check CHECK (((char_length(TRIM(BOTH FROM text)) >= 1) AND (char_length(TRIM(BOTH FROM text)) <= 2000)));

ALTER TABLE post_reactions ADD CONSTRAINT post_reactions_emoji_check CHECK ((emoji = ANY (ARRAY['👍'::text, '❤️'::text, '🔥'::text, '😂'::text, '🤔'::text])));

ALTER TABLE post_reactions ADD CONSTRAINT post_reactions_pkey PRIMARY KEY (id);

ALTER TABLE post_reactions ADD CONSTRAINT post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE CASCADE;

ALTER TABLE post_reactions ADD CONSTRAINT post_reactions_post_id_profile_id_key UNIQUE (post_id, profile_id);

ALTER TABLE post_reactions ADD CONSTRAINT post_reactions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE profile_tracks ADD CONSTRAINT profile_tracks_caption_check CHECK (((caption IS NULL) OR (char_length(caption) <= 140)));

ALTER TABLE profile_tracks ADD CONSTRAINT profile_tracks_pkey PRIMARY KEY (profile_id, slot);

ALTER TABLE profile_tracks ADD CONSTRAINT profile_tracks_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE profile_tracks ADD CONSTRAINT profile_tracks_slot_check CHECK ((slot = ANY (ARRAY['new'::text, 'old'::text, 'obsession'::text])));

ALTER TABLE profile_tracks ADD CONSTRAINT profile_tracks_track_name_check CHECK (((char_length(TRIM(BOTH FROM track_name)) >= 1) AND (char_length(TRIM(BOTH FROM track_name)) <= 300)));

ALTER TABLE profiles ADD CONSTRAINT profiles_avatar_album_url_check CHECK (((avatar_album_url IS NULL) OR (char_length(avatar_album_url) <= 500)));

ALTER TABLE profiles ADD CONSTRAINT profiles_avatar_color_check CHECK (((avatar_color >= 0) AND (avatar_color <= 6)));

ALTER TABLE profiles ADD CONSTRAINT profiles_avatar_label_check CHECK (((avatar_label IS NULL) OR (char_length(avatar_label) <= 200)));

ALTER TABLE profiles ADD CONSTRAINT profiles_avatar_url_check CHECK (((avatar_url IS NULL) OR (char_length(avatar_url) <= 500)));

ALTER TABLE profiles ADD CONSTRAINT profiles_display_name_check CHECK (((display_name IS NULL) OR ((char_length(display_name) >= 1) AND (char_length(display_name) <= 40))));

ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE profiles ADD CONSTRAINT profiles_preferred_service_check CHECK ((preferred_service = ANY (ARRAY['spotify'::text, 'apple'::text, 'both'::text])));

ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (profile_id, platform);

ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text])));

ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ratings ADD CONSTRAINT ratings_album_id_fkey FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;

ALTER TABLE ratings ADD CONSTRAINT ratings_album_id_profile_id_key UNIQUE (album_id, profile_id);

ALTER TABLE ratings ADD CONSTRAINT ratings_best_moment_check CHECK (((best_moment IS NULL) OR (char_length(best_moment) <= 1000)));

ALTER TABLE ratings ADD CONSTRAINT ratings_best_run_rating_check CHECK (((best_run_rating IS NULL) OR ((best_run_rating >= (1)::numeric) AND (best_run_rating <= (10)::numeric))));

ALTER TABLE ratings ADD CONSTRAINT ratings_best_run_start_check CHECK (((best_run_start IS NULL) OR (best_run_start >= 1)));

ALTER TABLE ratings ADD CONSTRAINT ratings_favorite_lyric_check CHECK (((favorite_lyric IS NULL) OR (char_length(favorite_lyric) <= 1000)));

ALTER TABLE ratings ADD CONSTRAINT ratings_favorite_reason_check CHECK (((favorite_reason IS NULL) OR (char_length(favorite_reason) <= 1000)));

ALTER TABLE ratings ADD CONSTRAINT ratings_initial_score_check CHECK (((initial_score IS NULL) OR ((initial_score >= (1)::numeric) AND (initial_score <= (10)::numeric))));

ALTER TABLE ratings ADD CONSTRAINT ratings_least_reason_check CHECK (((least_reason IS NULL) OR (char_length(least_reason) <= 1000)));

ALTER TABLE ratings ADD CONSTRAINT ratings_one_sentence_take_check CHECK (((one_sentence_take IS NULL) OR (char_length(one_sentence_take) <= 280)));

ALTER TABLE ratings ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);

ALTER TABLE ratings ADD CONSTRAINT ratings_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ratings ADD CONSTRAINT ratings_replayability_check CHECK (((replayability IS NULL) OR ((replayability >= (1)::numeric) AND (replayability <= (10)::numeric))));

ALTER TABLE ratings ADD CONSTRAINT ratings_review_check CHECK (((review IS NULL) OR (char_length(review) <= 4000)));

ALTER TABLE ratings ADD CONSTRAINT ratings_score_check CHECK (((score >= (1)::numeric) AND (score <= (10)::numeric)));

ALTER TABLE rsvps ADD CONSTRAINT rsvps_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE rsvps ADD CONSTRAINT rsvps_cycle_id_profile_id_key UNIQUE (cycle_id, profile_id);

ALTER TABLE rsvps ADD CONSTRAINT rsvps_pkey PRIMARY KEY (id);

ALTER TABLE rsvps ADD CONSTRAINT rsvps_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE rsvps ADD CONSTRAINT rsvps_status_check CHECK ((status = ANY (ARRAY['yes'::text, 'maybe'::text, 'no'::text])));

ALTER TABLE showdown_submissions ADD CONSTRAINT showdown_submissions_pkey PRIMARY KEY (id);

ALTER TABLE showdown_submissions ADD CONSTRAINT showdown_submissions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE showdown_submissions ADD CONSTRAINT showdown_submissions_showdown_id_fkey FOREIGN KEY (showdown_id) REFERENCES showdowns(id) ON DELETE CASCADE;

ALTER TABLE showdown_submissions ADD CONSTRAINT showdown_submissions_showdown_id_norm_key_key UNIQUE (showdown_id, norm_key);

ALTER TABLE showdown_submissions ADD CONSTRAINT showdown_submissions_showdown_id_profile_id_key UNIQUE (showdown_id, profile_id);

ALTER TABLE showdown_submissions ADD CONSTRAINT showdown_submissions_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 300)));

ALTER TABLE showdown_theme_ideas ADD CONSTRAINT showdown_theme_ideas_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE showdown_theme_ideas ADD CONSTRAINT showdown_theme_ideas_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE showdown_theme_ideas ADD CONSTRAINT showdown_theme_ideas_pkey PRIMARY KEY (id);

ALTER TABLE showdown_theme_ideas ADD CONSTRAINT showdown_theme_ideas_text_check CHECK (((char_length(TRIM(BOTH FROM text)) >= 1) AND (char_length(TRIM(BOTH FROM text)) <= 140)));

ALTER TABLE showdown_theme_ideas ADD CONSTRAINT showdown_theme_ideas_used_cycle_id_fkey FOREIGN KEY (used_cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;

ALTER TABLE showdown_votes ADD CONSTRAINT showdown_votes_pkey PRIMARY KEY (id);

ALTER TABLE showdown_votes ADD CONSTRAINT showdown_votes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE showdown_votes ADD CONSTRAINT showdown_votes_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES showdown_submissions(id) ON DELETE CASCADE;

ALTER TABLE showdown_votes ADD CONSTRAINT showdown_votes_submission_id_profile_id_key UNIQUE (submission_id, profile_id);

ALTER TABLE showdown_votes ADD CONSTRAINT showdown_votes_value_check CHECK ((value = ANY (ARRAY[1, '-1'::integer])));

ALTER TABLE showdowns ADD CONSTRAINT showdowns_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE showdowns ADD CONSTRAINT showdowns_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE showdowns ADD CONSTRAINT showdowns_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE showdowns ADD CONSTRAINT showdowns_cycle_id_key UNIQUE (cycle_id);

ALTER TABLE showdowns ADD CONSTRAINT showdowns_pkey PRIMARY KEY (id);

ALTER TABLE showdowns ADD CONSTRAINT showdowns_theme_idea_id_fkey FOREIGN KEY (theme_idea_id) REFERENCES showdown_theme_ideas(id) ON DELETE SET NULL;

ALTER TABLE showdowns ADD CONSTRAINT showdowns_theme_text_check CHECK (((char_length(TRIM(BOTH FROM theme_text)) >= 1) AND (char_length(TRIM(BOTH FROM theme_text)) <= 140)));

ALTER TABLE showdowns ADD CONSTRAINT showdowns_winner_fk FOREIGN KEY (winner_submission_id) REFERENCES showdown_submissions(id) ON DELETE SET NULL;

ALTER TABLE song_note_reactions ADD CONSTRAINT song_note_reactions_pkey PRIMARY KEY (id);

ALTER TABLE song_note_reactions ADD CONSTRAINT song_note_reactions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE song_note_reactions ADD CONSTRAINT song_note_reactions_song_note_id_fkey FOREIGN KEY (song_note_id) REFERENCES song_notes(id) ON DELETE CASCADE;

ALTER TABLE song_note_reactions ADD CONSTRAINT song_note_reactions_song_note_id_profile_id_key UNIQUE (song_note_id, profile_id);

ALTER TABLE song_note_reactions ADD CONSTRAINT song_note_reactions_value_check CHECK ((value = ANY (ARRAY['support'::text, 'disagree'::text, 'love'::text])));

ALTER TABLE song_note_shares ADD CONSTRAINT song_note_shares_album_id_fkey FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;

ALTER TABLE song_note_shares ADD CONSTRAINT song_note_shares_mode_check CHECK ((mode = ANY (ARRAY['now'::text, 'at_reveal'::text])));

ALTER TABLE song_note_shares ADD CONSTRAINT song_note_shares_pkey PRIMARY KEY (album_id, profile_id);

ALTER TABLE song_note_shares ADD CONSTRAINT song_note_shares_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE song_notes ADD CONSTRAINT song_notes_album_id_fkey FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;

ALTER TABLE song_notes ADD CONSTRAINT song_notes_album_id_profile_id_track_number_key UNIQUE (album_id, profile_id, track_number);

ALTER TABLE song_notes ADD CONSTRAINT song_notes_comment_check CHECK (((comment IS NULL) OR (char_length(comment) <= 4000)));

ALTER TABLE song_notes ADD CONSTRAINT song_notes_favorite_lyric_check CHECK (((favorite_lyric IS NULL) OR (char_length(favorite_lyric) <= 1000)));

ALTER TABLE song_notes ADD CONSTRAINT song_notes_initial_thoughts_check CHECK (((initial_thoughts IS NULL) OR (char_length(initial_thoughts) <= 2000)));

ALTER TABLE song_notes ADD CONSTRAINT song_notes_pkey PRIMARY KEY (id);

ALTER TABLE song_notes ADD CONSTRAINT song_notes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE song_notes ADD CONSTRAINT song_notes_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 10))));

ALTER TABLE song_notes ADD CONSTRAINT song_notes_reminds_me_of_check CHECK (((reminds_me_of IS NULL) OR (char_length(reminds_me_of) <= 1000)));

ALTER TABLE song_notes ADD CONSTRAINT song_notes_thumb_check CHECK (((thumb IS NULL) OR (thumb = ANY (ARRAY['up'::text, 'down'::text]))));

ALTER TABLE spotify_api_state ADD CONSTRAINT spotify_api_state_pkey PRIMARY KEY (id);

ALTER TABLE spotify_api_state ADD CONSTRAINT spotify_api_state_singleton CHECK (id);

ALTER TABLE spotify_track_cache ADD CONSTRAINT spotify_track_cache_pkey PRIMARY KEY (key);

ALTER TABLE streaming_connections ADD CONSTRAINT streaming_connections_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE streaming_connections ADD CONSTRAINT streaming_connections_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES profiles(id);

ALTER TABLE streaming_connections ADD CONSTRAINT streaming_connections_pkey PRIMARY KEY (club_id);

ALTER TABLE streaming_connections ADD CONSTRAINT streaming_connections_status_check CHECK ((status = ANY (ARRAY['active'::text, 'needs_reconnect'::text])));

ALTER TABLE vibe_tags ADD CONSTRAINT vibe_tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE vibe_tags ADD CONSTRAINT vibe_tags_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 40)));

ALTER TABLE vibe_tags ADD CONSTRAINT vibe_tags_name_key_key UNIQUE (name_key);

ALTER TABLE vibe_tags ADD CONSTRAINT vibe_tags_pkey PRIMARY KEY (id);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX activity_events_club_idx ON public.activity_events USING btree (club_id, created_at DESC);

CREATE INDEX activity_events_recipient_idx ON public.activity_events USING btree (recipient_id, created_at DESC) WHERE (recipient_id IS NOT NULL);

CREATE UNIQUE INDEX albums_archive_spotify_uniq ON public.albums USING btree (cycle_id, spotify_album_id) WHERE ((slot IS NULL) AND (spotify_album_id IS NOT NULL));

CREATE INDEX albums_cycle_idx ON public.albums USING btree (cycle_id);

CREATE INDEX apple_match_queue_pending_idx ON public.apple_match_queue USING btree (last_attempt_at) WHERE (resolved_at IS NULL);

CREATE INDEX aux_battle_songs_battle_idx ON public.aux_battle_songs USING btree (battle_id);

CREATE INDEX aux_battle_theme_ideas_club_idx ON public.aux_battle_theme_ideas USING btree (club_id);

CREATE INDEX aux_battle_votes_battle_idx ON public.aux_battle_votes USING btree (battle_id);

CREATE INDEX aux_battles_club_idx ON public.aux_battles USING btree (club_id);

CREATE INDEX aux_battles_cycle_idx ON public.aux_battles USING btree (cycle_id);

CREATE INDEX best_bar_comments_bar_idx ON public.best_bar_comments USING btree (bar_id, created_at);

CREATE INDEX best_bar_ratings_bar_idx ON public.best_bar_ratings USING btree (bar_id);

CREATE INDEX best_bars_club_idx ON public.best_bars USING btree (club_id, created_at DESC);

CREATE INDEX bingo_boxes_card_idx ON public.bingo_boxes USING btree (card_id);

CREATE INDEX bingo_cards_game_idx ON public.bingo_cards USING btree (game_id);

CREATE INDEX bingo_challenges_claim_idx ON public.bingo_challenges USING btree (claim_id);

CREATE INDEX bingo_claims_card_idx ON public.bingo_claims USING btree (card_id);

CREATE UNIQUE INDEX bingo_claims_one_pending_idx ON public.bingo_claims USING btree (card_id, line_index) WHERE (status = 'pending'::text);

CREATE UNIQUE INDEX bingo_claims_one_verified_idx ON public.bingo_claims USING btree (card_id, line_index) WHERE (status = 'verified'::text);

CREATE INDEX bingo_comments_game_idx ON public.bingo_comments USING btree (game_id, created_at);

CREATE INDEX bingo_game_categories_game_idx ON public.bingo_game_categories USING btree (game_id);

CREATE INDEX bingo_games_club_idx ON public.bingo_games USING btree (club_id, created_at DESC);

CREATE UNIQUE INDEX bingo_games_one_open_idx ON public.bingo_games USING btree (club_id) WHERE (status = 'open'::text);

CREATE INDEX bracket_comments_bracket_idx ON public.bracket_comments USING btree (bracket_id, created_at);

CREATE INDEX bracket_picks_winner_idx ON public.bracket_picks USING btree (bracket_id, winner_track_id);

CREATE INDEX bracket_tracks_bracket_idx ON public.bracket_tracks USING btree (bracket_id);

CREATE INDEX brackets_club_idx ON public.brackets USING btree (club_id, created_at DESC);

CREATE UNIQUE INDEX brackets_one_open_idx ON public.brackets USING btree (club_id) WHERE ((status = 'open'::text) AND (scope = 'club'::text));

CREATE INDEX brackets_owner_idx ON public.brackets USING btree (owner_id, created_at DESC) WHERE (scope = 'personal'::text);

CREATE INDEX club_favorite_tracks_club_idx ON public.club_favorite_tracks USING btree (club_id, added_at DESC);

CREATE UNIQUE INDEX club_favorite_tracks_uri_idx ON public.club_favorite_tracks USING btree (club_id, spotify_uri) WHERE (spotify_uri IS NOT NULL);

CREATE INDEX club_members_club_idx ON public.club_members USING btree (club_id);

CREATE UNIQUE INDEX club_members_one_owner_idx ON public.club_members USING btree (club_id) WHERE (role = 'owner'::text);

CREATE INDEX club_members_profile_idx ON public.club_members USING btree (profile_id);

CREATE INDEX concert_comments_concert_idx ON public.concert_comments USING btree (concert_id, created_at);

CREATE INDEX concert_interest_concert_idx ON public.concert_interest USING btree (concert_id);

CREATE INDEX concerts_club_idx ON public.concerts USING btree (club_id, concert_date);

CREATE INDEX concerts_origin_idx ON public.concerts USING btree (origin_concert_id);

CREATE INDEX convince_comments_post_idx ON public.convince_comments USING btree (post_id, created_at);

CREATE INDEX convince_posts_author_idx ON public.convince_posts USING btree (author_id);

CREATE INDEX convince_posts_club_idx ON public.convince_posts USING btree (club_id, created_at DESC);

CREATE INDEX convince_targets_post_idx ON public.convince_targets USING btree (post_id);

CREATE INDEX convince_targets_profile_idx ON public.convince_targets USING btree (profile_id);

CREATE INDEX convince_tracks_post_idx ON public.convince_tracks USING btree (post_id);

CREATE INDEX cycle_guests_cycle_idx ON public.cycle_guests USING btree (cycle_id);

CREATE INDEX cycle_preferences_cycle_idx ON public.cycle_preferences USING btree (cycle_id);

CREATE INDEX cycles_club_idx ON public.cycles USING btree (club_id);

CREATE UNIQUE INDEX cycles_one_archive_idx ON public.cycles USING btree (club_id) WHERE (kind = 'archive'::text);

CREATE UNIQUE INDEX cycles_one_open_idx ON public.cycles USING btree (club_id) WHERE (status = 'open'::text);

CREATE INDEX feed_posts_club_idx ON public.feed_posts USING btree (club_id, created_at DESC);

CREATE INDEX feed_posts_origin_idx ON public.feed_posts USING btree (origin_post_id);

CREATE INDEX feed_posts_suggestion_idx ON public.feed_posts USING btree (club_id) WHERE is_album_suggestion;

CREATE INDEX meeting_posts_cycle_idx ON public.meeting_posts USING btree (cycle_id, created_at);

CREATE INDEX meeting_time_options_cycle_idx ON public.meeting_time_options USING btree (cycle_id);

CREATE INDEX musical_take_comments_take_idx ON public.musical_take_comments USING btree (take_id, created_at);

CREATE INDEX musical_take_positions_take_idx ON public.musical_take_positions USING btree (take_id);

CREATE INDEX musical_takes_club_idx ON public.musical_takes USING btree (club_id, created_at DESC);

CREATE INDEX perfect_playlist_songs_playlist_idx ON public.perfect_playlist_songs USING btree (playlist_id, created_at);

CREATE INDEX perfect_playlists_club_idx ON public.perfect_playlists USING btree (club_id);

CREATE INDEX post_comments_post_idx ON public.post_comments USING btree (post_id, created_at);

CREATE INDEX post_reactions_post_idx ON public.post_reactions USING btree (post_id);

CREATE INDEX push_tokens_token_idx ON public.push_tokens USING btree (token);

CREATE INDEX ratings_album_idx ON public.ratings USING btree (album_id);

CREATE INDEX rsvps_cycle_idx ON public.rsvps USING btree (cycle_id);

CREATE INDEX showdown_submissions_showdown_idx ON public.showdown_submissions USING btree (showdown_id);

CREATE INDEX showdown_theme_ideas_club_idx ON public.showdown_theme_ideas USING btree (club_id);

CREATE INDEX showdown_votes_submission_idx ON public.showdown_votes USING btree (submission_id);

CREATE INDEX showdowns_club_idx ON public.showdowns USING btree (club_id);

CREATE INDEX song_note_reactions_note_idx ON public.song_note_reactions USING btree (song_note_id);

CREATE INDEX song_notes_album_profile_idx ON public.song_notes USING btree (album_id, profile_id);


-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_events_select ON activity_events AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_club_member(club_id) AND ((recipient_id IS NULL) OR (recipient_id = auth.uid()))));

ALTER TABLE activity_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_reads_select ON activity_reads AS PERMISSIVE FOR SELECT TO authenticated
  USING ((profile_id = auth.uid()));

ALTER TABLE album_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY album_impressions_delete ON album_impressions AS PERMISSIVE FOR DELETE TO authenticated
  USING ((profile_id = auth.uid()));

CREATE POLICY album_impressions_insert ON album_impressions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = album_impressions.album_id) AND is_club_member(c.club_id))))));

CREATE POLICY album_impressions_select ON album_impressions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((profile_id = auth.uid()));

CREATE POLICY album_impressions_update ON album_impressions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = album_impressions.album_id) AND is_club_member(c.club_id))))));

ALTER TABLE albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY albums_archive_manage ON albums AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = albums.cycle_id) AND (c.kind = 'archive'::text) AND (club_role(c.club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = albums.cycle_id) AND (c.kind = 'archive'::text) AND (club_role(c.club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY albums_select ON albums AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = albums.cycle_id) AND is_club_member(c.club_id)))));

CREATE POLICY albums_write ON albums AS PERMISSIVE FOR ALL TO authenticated
  USING (((NOT album_has_ratings(id)) AND (EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = albums.cycle_id) AND (c.status = 'open'::text) AND ((c.picker_id = auth.uid()) OR (club_role(c.club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))))))))
  WITH CHECK (((set_by = auth.uid()) AND (NOT album_has_ratings(id)) AND (EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = albums.cycle_id) AND (c.status = 'open'::text) AND ((c.picker_id = auth.uid()) OR (club_role(c.club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))))))));

ALTER TABLE app_opens ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_opens_select ON app_opens AS PERMISSIVE FOR SELECT TO authenticated
  USING ((profile_id = auth.uid()));

ALTER TABLE apple_match_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE aux_battle_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY aux_battle_songs_select ON aux_battle_songs AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM aux_battles ab
  WHERE ((ab.id = aux_battle_songs.battle_id) AND is_club_member(ab.club_id)))) AND ((NOT (EXISTS ( SELECT 1
   FROM aux_battles ab
  WHERE ((ab.id = aux_battle_songs.battle_id) AND ((ab.member_a = auth.uid()) OR (ab.member_b = auth.uid())))))) OR (profile_id = auth.uid()) OR aux_has_submitted(battle_id))));

ALTER TABLE aux_battle_theme_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY aux_battle_theme_ideas_insert ON aux_battle_theme_ideas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((club_id IS NOT NULL) AND (created_by = auth.uid()) AND is_club_member(club_id)));

CREATE POLICY aux_battle_theme_ideas_select ON aux_battle_theme_ideas AS PERMISSIVE FOR SELECT TO authenticated
  USING (((club_id IS NULL) OR is_club_member(club_id)));

ALTER TABLE aux_battle_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY aux_battle_votes_select ON aux_battle_votes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM aux_battles ab
  WHERE ((ab.id = aux_battle_votes.battle_id) AND is_club_member(ab.club_id)))));

ALTER TABLE aux_battles ENABLE ROW LEVEL SECURITY;

CREATE POLICY aux_battles_select ON aux_battles AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

ALTER TABLE best_bar_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY best_bar_comments_delete ON best_bar_comments AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM best_bars b
  WHERE ((b.id = best_bar_comments.bar_id) AND (club_role(b.club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))))));

CREATE POLICY best_bar_comments_insert ON best_bar_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM best_bars b
  WHERE ((b.id = best_bar_comments.bar_id) AND is_club_member(b.club_id))))));

CREATE POLICY best_bar_comments_select ON best_bar_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM best_bars b
  WHERE ((b.id = best_bar_comments.bar_id) AND is_club_member(b.club_id)))));

ALTER TABLE best_bar_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY best_bar_ratings_select ON best_bar_ratings AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM best_bars b
  WHERE ((b.id = best_bar_ratings.bar_id) AND is_club_member(b.club_id)))));

CREATE POLICY best_bar_ratings_write ON best_bar_ratings AS PERMISSIVE FOR ALL TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM best_bars b
  WHERE ((b.id = best_bar_ratings.bar_id) AND is_club_member(b.club_id))))));

ALTER TABLE best_bars ENABLE ROW LEVEL SECURITY;

CREATE POLICY best_bars_delete ON best_bars AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))));

CREATE POLICY best_bars_insert ON best_bars AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND is_club_member(club_id)));

CREATE POLICY best_bars_select ON best_bars AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

ALTER TABLE bingo_boxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY bingo_boxes_select ON bingo_boxes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (bingo_cards k
     JOIN bingo_games g ON ((g.id = k.game_id)))
  WHERE ((k.id = bingo_boxes.card_id) AND is_club_member(g.club_id)))));

ALTER TABLE bingo_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY bingo_cards_select ON bingo_cards AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM bingo_games g
  WHERE ((g.id = bingo_cards.game_id) AND is_club_member(g.club_id)))));

ALTER TABLE bingo_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY bingo_categories_select ON bingo_categories AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

ALTER TABLE bingo_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY bingo_challenges_select ON bingo_challenges AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((bingo_claims c
     JOIN bingo_cards k ON ((k.id = c.card_id)))
     JOIN bingo_games g ON ((g.id = k.game_id)))
  WHERE ((c.id = bingo_challenges.claim_id) AND is_club_member(g.club_id)))));

ALTER TABLE bingo_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY bingo_claims_select ON bingo_claims AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (bingo_cards k
     JOIN bingo_games g ON ((g.id = k.game_id)))
  WHERE ((k.id = bingo_claims.card_id) AND is_club_member(g.club_id)))));

ALTER TABLE bingo_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY bingo_comments_delete ON bingo_comments AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM bingo_games g
  WHERE ((g.id = bingo_comments.game_id) AND (club_role(g.club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))))));

CREATE POLICY bingo_comments_insert ON bingo_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM bingo_games g
  WHERE ((g.id = bingo_comments.game_id) AND is_club_member(g.club_id))))));

CREATE POLICY bingo_comments_select ON bingo_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM bingo_games g
  WHERE ((g.id = bingo_comments.game_id) AND is_club_member(g.club_id)))));

ALTER TABLE bingo_game_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY bingo_game_categories_select ON bingo_game_categories AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM bingo_games g
  WHERE ((g.id = bingo_game_categories.game_id) AND is_club_member(g.club_id)))));

ALTER TABLE bingo_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY bingo_games_delete ON bingo_games AS PERMISSIVE FOR DELETE TO authenticated
  USING (((status = 'open'::text) AND ((created_by = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))));

CREATE POLICY bingo_games_select ON bingo_games AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

ALTER TABLE bracket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY bracket_comments_delete ON bracket_comments AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM brackets b
  WHERE ((b.id = bracket_comments.bracket_id) AND (club_role(b.club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))))));

CREATE POLICY bracket_comments_insert ON bracket_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND can_view_bracket(bracket_id)));

CREATE POLICY bracket_comments_select ON bracket_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_bracket(bracket_id));

ALTER TABLE bracket_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY bracket_entries_select ON bracket_entries AS PERMISSIVE FOR SELECT TO authenticated
  USING (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM brackets b
  WHERE ((b.id = bracket_entries.bracket_id) AND can_view_bracket(b.id) AND ((b.status = 'closed'::text) OR ((b.scope = 'club'::text) AND has_completed_bracket(b.id))))))));

ALTER TABLE bracket_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY bracket_picks_select ON bracket_picks AS PERMISSIVE FOR SELECT TO authenticated
  USING (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM brackets b
  WHERE ((b.id = bracket_picks.bracket_id) AND can_view_bracket(b.id) AND ((b.status = 'closed'::text) OR ((b.scope = 'club'::text) AND has_completed_bracket(b.id))))))));

ALTER TABLE bracket_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY bracket_tracks_select ON bracket_tracks AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_bracket(bracket_id));

ALTER TABLE brackets ENABLE ROW LEVEL SECURITY;

CREATE POLICY brackets_delete ON brackets AS PERMISSIVE FOR DELETE TO authenticated
  USING ((((scope = 'personal'::text) AND (owner_id = auth.uid())) OR ((scope = 'club'::text) AND (status = 'open'::text) AND ((created_by = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY brackets_select ON brackets AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_bracket(id));

ALTER TABLE club_favorite_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY club_favorite_tracks_select ON club_favorite_tracks AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY club_members_delete ON club_members AS PERMISSIVE FOR DELETE TO authenticated
  USING ((((profile_id = auth.uid()) AND (role <> 'owner'::text)) OR ((club_role(club_id) = 'owner'::text) AND (profile_id <> auth.uid())) OR ((club_role(club_id) = 'admin'::text) AND (role = 'member'::text))));

CREATE POLICY club_members_select ON club_members AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

CREATE POLICY club_members_update ON club_members AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((club_role(club_id) = 'owner'::text) AND (profile_id <> auth.uid())))
  WITH CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])));

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY clubs_delete ON clubs AS PERMISSIVE FOR DELETE TO authenticated
  USING ((club_role(id) = 'owner'::text));

CREATE POLICY clubs_select ON clubs AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(id));

CREATE POLICY clubs_update ON clubs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((club_role(id) = ANY (ARRAY['owner'::text, 'admin'::text])))
  WITH CHECK ((club_role(id) = ANY (ARRAY['owner'::text, 'admin'::text])));

ALTER TABLE concert_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY concert_comments_delete ON concert_comments AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM concerts c
  WHERE ((c.id = concert_comments.concert_id) AND (club_role(c.club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))))));

CREATE POLICY concert_comments_insert ON concert_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM concerts c
  WHERE ((c.id = concert_comments.concert_id) AND is_club_member(c.club_id))))));

CREATE POLICY concert_comments_select ON concert_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM concerts c
  WHERE ((c.id = concert_comments.concert_id) AND is_club_member(c.club_id)))));

ALTER TABLE concert_interest ENABLE ROW LEVEL SECURITY;

CREATE POLICY concert_interest_select ON concert_interest AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM concerts c
  WHERE ((c.id = concert_interest.concert_id) AND is_club_member(c.club_id)))));

CREATE POLICY concert_interest_write ON concert_interest AS PERMISSIVE FOR ALL TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM concerts c
  WHERE ((c.id = concert_interest.concert_id) AND is_club_member(c.club_id))))));

ALTER TABLE concerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY concerts_delete ON concerts AS PERMISSIVE FOR DELETE TO authenticated
  USING (((added_by = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))));

CREATE POLICY concerts_insert ON concerts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((added_by = auth.uid()) AND is_club_member(club_id)));

CREATE POLICY concerts_select ON concerts AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

CREATE POLICY concerts_update ON concerts AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((added_by = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))))
  WITH CHECK (is_club_member(club_id));

ALTER TABLE convince_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY convince_comments_delete ON convince_comments AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM convince_posts p
  WHERE ((p.id = convince_comments.post_id) AND (club_role(p.club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))))));

CREATE POLICY convince_comments_insert ON convince_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM convince_posts p
  WHERE ((p.id = convince_comments.post_id) AND is_club_member(p.club_id))))));

CREATE POLICY convince_comments_select ON convince_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM convince_posts p
  WHERE ((p.id = convince_comments.post_id) AND is_club_member(p.club_id)))));

ALTER TABLE convince_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY convince_posts_delete ON convince_posts AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))));

CREATE POLICY convince_posts_select ON convince_posts AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

ALTER TABLE convince_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY convince_targets_select ON convince_targets AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM convince_posts p
  WHERE ((p.id = convince_targets.post_id) AND is_club_member(p.club_id)))));

ALTER TABLE convince_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY convince_tracks_select ON convince_tracks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM convince_posts p
  WHERE ((p.id = convince_tracks.post_id) AND is_club_member(p.club_id)))));

ALTER TABLE cycle_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY cycle_guests_delete ON cycle_guests AS PERMISSIVE FOR DELETE TO authenticated
  USING (((added_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = cycle_guests.cycle_id) AND (club_role(c.club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))))));

CREATE POLICY cycle_guests_insert ON cycle_guests AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((added_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = cycle_guests.cycle_id) AND (c.status = 'open'::text) AND is_club_member(c.club_id))))));

CREATE POLICY cycle_guests_select ON cycle_guests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = cycle_guests.cycle_id) AND is_club_member(c.club_id)))));

CREATE POLICY cycle_guests_update ON cycle_guests AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((added_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = cycle_guests.cycle_id) AND (club_role(c.club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))))));

ALTER TABLE cycle_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY cycle_preferences_select ON cycle_preferences AS PERMISSIVE FOR SELECT TO authenticated
  USING (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = cycle_preferences.cycle_id) AND (c.revealed_at IS NOT NULL) AND is_club_member(c.club_id))))));

CREATE POLICY cycle_preferences_write ON cycle_preferences AS PERMISSIVE FOR ALL TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = cycle_preferences.album_id) AND (a.cycle_id = a.cycle_id) AND (c.status = 'open'::text) AND (c.revealed_at IS NULL) AND is_club_member(c.club_id))))));

ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY cycles_delete ON cycles AS PERMISSIVE FOR DELETE TO authenticated
  USING ((club_role(club_id) = 'owner'::text));

CREATE POLICY cycles_select ON cycles AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

CREATE POLICY cycles_update ON cycles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))
  WITH CHECK ((club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])));

ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_posts_delete ON feed_posts AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))));

CREATE POLICY feed_posts_insert ON feed_posts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND is_club_member(club_id)));

CREATE POLICY feed_posts_select ON feed_posts AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

ALTER TABLE meeting_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_posts_delete ON meeting_posts AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = meeting_posts.cycle_id) AND (club_role(c.club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))))));

CREATE POLICY meeting_posts_insert ON meeting_posts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = meeting_posts.cycle_id) AND is_club_member(c.club_id))))));

CREATE POLICY meeting_posts_select ON meeting_posts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = meeting_posts.cycle_id) AND is_club_member(c.club_id)))));

ALTER TABLE meeting_time_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY mto_delete ON meeting_time_options AS PERMISSIVE FOR DELETE TO authenticated
  USING (((proposed_by = auth.uid()) OR (club_role(cycle_club(cycle_id)) = ANY (ARRAY['owner'::text, 'admin'::text]))));

CREATE POLICY mto_insert ON meeting_time_options AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((proposed_by = auth.uid()) AND is_club_member(cycle_club(cycle_id))));

CREATE POLICY mto_select ON meeting_time_options AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(cycle_club(cycle_id)));

ALTER TABLE meeting_time_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY mtv_delete ON meeting_time_votes AS PERMISSIVE FOR DELETE TO authenticated
  USING ((profile_id = auth.uid()));

CREATE POLICY mtv_insert ON meeting_time_votes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((profile_id = auth.uid()) AND is_club_member(cycle_club(( SELECT o.cycle_id
   FROM meeting_time_options o
  WHERE (o.id = meeting_time_votes.option_id))))));

CREATE POLICY mtv_select ON meeting_time_votes AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(cycle_club(( SELECT o.cycle_id
   FROM meeting_time_options o
  WHERE (o.id = meeting_time_votes.option_id)))));

ALTER TABLE musical_take_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY musical_take_comments_delete ON musical_take_comments AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM musical_takes t
  WHERE ((t.id = musical_take_comments.take_id) AND (club_role(t.club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))))));

CREATE POLICY musical_take_comments_insert ON musical_take_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM musical_takes t
  WHERE ((t.id = musical_take_comments.take_id) AND is_club_member(t.club_id))))));

CREATE POLICY musical_take_comments_select ON musical_take_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM musical_takes t
  WHERE ((t.id = musical_take_comments.take_id) AND is_club_member(t.club_id)))));

ALTER TABLE musical_take_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY musical_take_positions_select ON musical_take_positions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM musical_takes t
  WHERE ((t.id = musical_take_positions.take_id) AND is_club_member(t.club_id)))));

CREATE POLICY musical_take_positions_write ON musical_take_positions AS PERMISSIVE FOR ALL TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM musical_takes t
  WHERE ((t.id = musical_take_positions.take_id) AND is_club_member(t.club_id))))));

ALTER TABLE musical_takes ENABLE ROW LEVEL SECURITY;

CREATE POLICY musical_takes_delete ON musical_takes AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))));

CREATE POLICY musical_takes_insert ON musical_takes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND is_club_member(club_id)));

CREATE POLICY musical_takes_select ON musical_takes AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_preferences_insert ON notification_preferences AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((profile_id = auth.uid()));

CREATE POLICY notification_preferences_select ON notification_preferences AS PERMISSIVE FOR SELECT TO authenticated
  USING ((profile_id = auth.uid()));

CREATE POLICY notification_preferences_update ON notification_preferences AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK ((profile_id = auth.uid()));

ALTER TABLE perfect_playlist_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY perfect_playlist_songs_select ON perfect_playlist_songs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM perfect_playlists pp
  WHERE ((pp.id = perfect_playlist_songs.playlist_id) AND is_club_member(pp.club_id)))));

ALTER TABLE perfect_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY perfect_playlists_select ON perfect_playlists AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_comments_delete ON post_comments AS PERMISSIVE FOR DELETE TO authenticated
  USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM feed_posts p
  WHERE ((p.id = post_comments.post_id) AND (club_role(p.club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))))));

CREATE POLICY post_comments_insert ON post_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM feed_posts p
  WHERE ((p.id = post_comments.post_id) AND is_club_member(p.club_id))))));

CREATE POLICY post_comments_select ON post_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM feed_posts p
  WHERE ((p.id = post_comments.post_id) AND is_club_member(p.club_id)))));

ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_reactions_select ON post_reactions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM feed_posts p
  WHERE ((p.id = post_reactions.post_id) AND is_club_member(p.club_id)))));

CREATE POLICY post_reactions_write ON post_reactions AS PERMISSIVE FOR ALL TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM feed_posts p
  WHERE ((p.id = post_reactions.post_id) AND is_club_member(p.club_id))))));

ALTER TABLE profile_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_tracks_select ON profile_tracks AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY profile_tracks_write ON profile_tracks AS PERMISSIVE FOR ALL TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK ((profile_id = auth.uid()));

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY profiles_update ON profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_tokens_delete ON push_tokens AS PERMISSIVE FOR DELETE TO authenticated
  USING ((profile_id = auth.uid()));

CREATE POLICY push_tokens_insert ON push_tokens AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((profile_id = auth.uid()));

CREATE POLICY push_tokens_select ON push_tokens AS PERMISSIVE FOR SELECT TO authenticated
  USING ((profile_id = auth.uid()));

CREATE POLICY push_tokens_update ON push_tokens AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK ((profile_id = auth.uid()));

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ratings_delete ON ratings AS PERMISSIVE FOR DELETE TO authenticated
  USING (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = ratings.album_id) AND ((c.kind = 'archive'::text) OR ((c.status = 'open'::text) AND (c.revealed_at IS NULL))))))));

CREATE POLICY ratings_insert ON ratings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = ratings.album_id) AND is_club_member(c.club_id) AND ((c.kind = 'archive'::text) OR ((c.status = 'open'::text) AND (c.revealed_at IS NULL))))))));

CREATE POLICY ratings_select ON ratings AS PERMISSIVE FOR SELECT TO authenticated
  USING (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = ratings.album_id) AND (c.revealed_at IS NOT NULL) AND is_club_member(c.club_id))))));

CREATE POLICY ratings_update ON ratings AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = ratings.album_id) AND is_club_member(c.club_id) AND ((c.kind = 'archive'::text) OR ((c.status = 'open'::text) AND (c.revealed_at IS NULL))))))));

ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY rsvps_select ON rsvps AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = rsvps.cycle_id) AND is_club_member(c.club_id)))));

CREATE POLICY rsvps_write ON rsvps AS PERMISSIVE FOR ALL TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM cycles c
  WHERE ((c.id = rsvps.cycle_id) AND (c.status = 'open'::text) AND is_club_member(c.club_id))))));

ALTER TABLE showdown_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY showdown_submissions_select_own ON showdown_submissions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((profile_id = auth.uid()));

ALTER TABLE showdown_theme_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY showdown_theme_ideas_insert ON showdown_theme_ideas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((club_id IS NOT NULL) AND (created_by = auth.uid()) AND is_club_member(club_id)));

CREATE POLICY showdown_theme_ideas_select ON showdown_theme_ideas AS PERMISSIVE FOR SELECT TO authenticated
  USING (((club_id IS NULL) OR is_club_member(club_id)));

ALTER TABLE showdown_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY showdown_votes_select_own ON showdown_votes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((profile_id = auth.uid()));

ALTER TABLE showdowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY showdowns_select ON showdowns AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

ALTER TABLE song_note_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY song_note_reactions_delete ON song_note_reactions AS PERMISSIVE FOR DELETE TO authenticated
  USING ((profile_id = auth.uid()));

CREATE POLICY song_note_reactions_insert ON song_note_reactions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM ((song_notes n
     JOIN albums a ON ((a.id = n.album_id)))
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((n.id = song_note_reactions.song_note_id) AND is_club_member(c.club_id))))));

CREATE POLICY song_note_reactions_select ON song_note_reactions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((song_notes n
     JOIN albums a ON ((a.id = n.album_id)))
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((n.id = song_note_reactions.song_note_id) AND is_club_member(c.club_id)))));

CREATE POLICY song_note_reactions_update ON song_note_reactions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK ((profile_id = auth.uid()));

ALTER TABLE song_note_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY song_note_shares_delete ON song_note_shares AS PERMISSIVE FOR DELETE TO authenticated
  USING ((profile_id = auth.uid()));

CREATE POLICY song_note_shares_insert ON song_note_shares AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = song_note_shares.album_id) AND is_club_member(c.club_id))))));

CREATE POLICY song_note_shares_select ON song_note_shares AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = song_note_shares.album_id) AND is_club_member(c.club_id)))));

CREATE POLICY song_note_shares_update ON song_note_shares AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = song_note_shares.album_id) AND is_club_member(c.club_id))))));

ALTER TABLE song_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY song_notes_delete ON song_notes AS PERMISSIVE FOR DELETE TO authenticated
  USING ((profile_id = auth.uid()));

CREATE POLICY song_notes_insert ON song_notes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = song_notes.album_id) AND is_club_member(c.club_id))))));

CREATE POLICY song_notes_select ON song_notes AS PERMISSIVE FOR SELECT TO authenticated
  USING (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM ((song_note_shares s
     JOIN albums a ON ((a.id = s.album_id)))
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((s.album_id = song_notes.album_id) AND (s.profile_id = song_notes.profile_id) AND is_club_member(c.club_id) AND ((s.mode = 'now'::text) OR (c.revealed_at IS NOT NULL)))))));

CREATE POLICY song_notes_update ON song_notes AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = song_notes.album_id) AND is_club_member(c.club_id))))));

ALTER TABLE spotify_api_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE spotify_track_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE streaming_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE vibe_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY vibe_tags_insert ON vibe_tags AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((created_by = auth.uid()) AND (is_canonical = false)));

CREATE POLICY vibe_tags_select ON vibe_tags AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);


-- =====================================================
-- FUNCTIONS & PROCEDURES
-- =====================================================

CREATE OR REPLACE FUNCTION public.add_archive_album(p_club uuid, p_title text, p_artist text DEFAULT ''::text, p_year integer DEFAULT NULL::integer, p_artwork_url text DEFAULT NULL::text, p_spotify_url text DEFAULT NULL::text, p_apple_url text DEFAULT NULL::text, p_tracks jsonb DEFAULT NULL::jsonb)
 RETURNS albums
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle public.cycles;
  v_album public.albums;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;

  v_cycle := public.get_or_create_archive_cycle(p_club);

  begin
    insert into albums (
      cycle_id, slot, title, artist, year, artwork_url,
      spotify_url, apple_url, tracks, spotify_album_id, set_by
    )
    values (
      v_cycle.id, null, trim(p_title), coalesce(p_artist, ''), p_year, p_artwork_url,
      p_spotify_url, p_apple_url, p_tracks,
      public.spotify_album_id_from_url(p_spotify_url), auth.uid()
    )
    returning * into v_album;
  exception when unique_violation then
    raise exception 'That album is already in the Archive';
  end;

  return v_album;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_perfect_playlist_song(p_playlist uuid, p_title text, p_artist text DEFAULT ''::text, p_artwork_url text DEFAULT NULL::text, p_spotify_url text DEFAULT NULL::text, p_apple_url text DEFAULT NULL::text)
 RETURNS perfect_playlist_songs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club uuid;
  v_status text;
  v_norm text;
  v_mine integer;
  v_row public.perfect_playlist_songs;
begin
  select c.club_id, c.status into v_club, v_status
  from perfect_playlists pp join cycles c on c.id = pp.cycle_id
  where pp.id = p_playlist;
  if not found then
    raise exception 'Playlist not found';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;
  if v_status <> 'open' then
    raise exception 'The playlist is closed';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'A song title is required';
  end if;

  select count(*) into v_mine
  from perfect_playlist_songs where playlist_id = p_playlist and profile_id = auth.uid();
  if v_mine >= 3 then
    raise exception 'You have already added your 3 songs.';
  end if;

  v_norm := public.showdown_norm(p_title, p_artist);
  if exists (select 1 from perfect_playlist_songs where playlist_id = p_playlist and norm_key = v_norm) then
    raise exception 'That song is already on the playlist — pick another.';
  end if;

  insert into perfect_playlist_songs
    (playlist_id, profile_id, title, artist, artwork_url, spotify_url, apple_url, norm_key)
  values
    (p_playlist, auth.uid(), trim(p_title), coalesce(p_artist, ''),
     p_artwork_url, p_spotify_url, p_apple_url, v_norm)
  returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.album_has_ratings(p_album uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from ratings where album_id = p_album);
$function$
;

CREATE OR REPLACE FUNCTION public.apple_match_sweep()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.aux_has_submitted(p_battle uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from aux_battle_songs
    where battle_id = p_battle and profile_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.bingo_box_locked(p_card uuid, p_position integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from bingo_claims c
    where c.card_id = p_card and c.status in ('pending', 'verified')
      and p_position = any (public.bingo_line_positions(c.line_index))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.bingo_deal_internal(p_game uuid, p_card_number integer)
 RETURNS bingo_cards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_card public.bingo_cards;
  v_lines smallint[];
  v_fresh int;
begin
  select array_agg(l::smallint order by ord) into v_lines
  from (
    select l, random() as ord from generate_series(0, 11) as l order by 2 limit 3
  ) picked(l, ord);

  insert into bingo_cards (game_id, profile_id, qualifying_lines, card_number)
  values (p_game, auth.uid(), v_lines, p_card_number)
  returning * into v_card;

  -- Prefer categories this member hasn't already had in this game.
  select count(*) into v_fresh
  from bingo_game_categories gc
  where gc.game_id = p_game
    and not exists (
      select 1 from bingo_boxes b
      join bingo_cards k on k.id = b.card_id
      where k.game_id = p_game and k.profile_id = auth.uid()
        and k.id <> v_card.id and b.category_id = gc.id
    );

  insert into bingo_boxes (card_id, position, category_id)
  select v_card.id, p.pos, c.id
  from (
    select pos, row_number() over (order by random()) as rn
    from generate_series(0, 24) as pos
    where pos <> 12
  ) p
  join (
    select id, row_number() over (order by random()) as rn
    from (
      select gc.id from bingo_game_categories gc
      where gc.game_id = p_game
        and (
          v_fresh < 24
          or not exists (
            select 1 from bingo_boxes b
            join bingo_cards k on k.id = b.card_id
            where k.game_id = p_game and k.profile_id = auth.uid()
              and k.id <> v_card.id and b.category_id = gc.id
          )
        )
      order by random() limit 24
    ) sub
  ) c on c.rn = p.rn;

  if (select count(*) from bingo_boxes where card_id = v_card.id) < 24 then
    raise exception 'The category pool is too small to deal a card';
  end if;

  return v_card;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bingo_line_positions(p_line integer)
 RETURNS integer[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_line between 0 and 4 then array[p_line * 5, p_line * 5 + 1, p_line * 5 + 2, p_line * 5 + 3, p_line * 5 + 4]
    when p_line between 5 and 9 then array[p_line - 5, p_line, p_line + 5, p_line + 10, p_line + 15]
    when p_line = 10 then array[0, 6, 12, 18, 24]
    when p_line = 11 then array[4, 8, 12, 16, 20]
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.bracket_progress(p_bracket uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'total', (select count(*) from club_members cm
              join brackets b on b.club_id = cm.club_id
              where b.id = p_bracket and public.is_club_member(b.club_id)),
    'completed_ids', coalesce((
      select jsonb_agg(e.profile_id)
      from bracket_entries e
      join brackets b on b.id = e.bracket_id
      where e.bracket_id = p_bracket and e.completed_at is not null
        and public.is_club_member(b.club_id)
    ), '[]'::jsonb),
    'started_ids', coalesce((
      select jsonb_agg(e.profile_id)
      from bracket_entries e
      join brackets b on b.id = e.bracket_id
      where e.bracket_id = p_bracket and e.completed_at is null
        and public.is_club_member(b.club_id)
    ), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.bracket_seed_order(p_size integer)
 RETURNS integer[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_order int[] := array[1, 2];
  v_next int[];
  v_len int;
  s int;
begin
  while array_length(v_order, 1) < p_size loop
    v_len := array_length(v_order, 1) * 2;
    v_next := '{}';
    foreach s in array v_order loop
      v_next := v_next || s || (v_len + 1 - s);
    end loop;
    v_order := v_next;
  end loop;
  return v_order;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_run_bingo(p_club uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.club_role(p_club) in ('owner', 'admin')
    or exists (
      select 1 from cycles
      where club_id = p_club and status = 'open' and picker_id = auth.uid()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_run_bracket(p_club uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.club_role(p_club) in ('owner', 'admin')
    or exists (
      select 1 from cycles
      where club_id = p_club and status = 'open' and picker_id = auth.uid()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_bracket(p_bracket uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from brackets b
    where b.id = p_bracket
      and (
        (b.scope = 'club' and public.is_club_member(b.club_id))
        or (b.scope = 'personal' and (
          b.owner_id = auth.uid()
          or (b.status = 'closed' and public.is_club_member(b.club_id))
        ))
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.cast_aux_vote(p_battle uuid, p_choice uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_battle public.aux_battles;
  v_status text;
begin
  select * into v_battle from aux_battles where id = p_battle;
  if not found then
    raise exception 'Battle not found';
  end if;
  if not public.is_club_member(v_battle.club_id) then
    raise exception 'Not a club member';
  end if;
  if auth.uid() = v_battle.member_a or auth.uid() = v_battle.member_b then
    raise exception 'Combatants cannot vote in their own battle';
  end if;
  select status into v_status from cycles where id = v_battle.cycle_id;
  if v_status <> 'open' then
    raise exception 'Voting is closed';
  end if;
  if p_choice <> v_battle.member_a and p_choice <> v_battle.member_b then
    raise exception 'Vote must be for one of the two combatants';
  end if;

  insert into aux_battle_votes (battle_id, profile_id, choice)
  values (p_battle, auth.uid(), p_choice)
  on conflict (battle_id, profile_id) do update set choice = excluded.choice;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cast_showdown_vote(p_submission uuid, p_value integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_showdown uuid;
  v_club uuid;
  v_status text;
  v_owner uuid;
  v_field integer;
  v_up integer;
  v_down integer;
begin
  select sub.showdown_id, c.club_id, c.status, sub.profile_id
    into v_showdown, v_club, v_status, v_owner
  from showdown_submissions sub
  join showdowns sd on sd.id = sub.showdown_id
  join cycles c on c.id = sd.cycle_id
  where sub.id = p_submission;
  if not found then
    raise exception 'Submission not found';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;
  if v_status <> 'open' then
    raise exception 'Voting is closed';
  end if;
  if v_owner = auth.uid() then
    raise exception 'You can''t vote on your own song';
  end if;
  if p_value not in (1, -1, 0) then
    raise exception 'Invalid vote';
  end if;

  if p_value = 0 then
    delete from showdown_votes where submission_id = p_submission and profile_id = auth.uid();
    return;
  end if;

  if p_value = -1 then
    select count(*) into v_field from showdown_submissions where showdown_id = v_showdown;
    if v_field < 4 then
      raise exception 'Downvotes unlock once there are 4 songs';
    end if;
  end if;

  -- Budget across the whole field, excluding the song being (re)voted.
  select
    count(*) filter (where v.value = 1),
    count(*) filter (where v.value = -1)
  into v_up, v_down
  from showdown_votes v
  join showdown_submissions s on s.id = v.submission_id
  where s.showdown_id = v_showdown
    and v.profile_id = auth.uid()
    and v.submission_id <> p_submission;

  if p_value = 1 and v_up >= 2 then
    raise exception 'You''ve used both upvotes';
  end if;
  if p_value = -1 and v_down >= 1 then
    raise exception 'You''ve used your downvote';
  end if;

  insert into showdown_votes (submission_id, profile_id, value)
  values (p_submission, auth.uid(), p_value)
  on conflict (submission_id, profile_id) do update set value = excluded.value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_archive_album(p_album uuid, p_profile uuid DEFAULT NULL::uuid)
 RETURNS albums
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club uuid;
  v_kind text;
  v_current uuid;
  v_is_admin boolean;
  v_album public.albums;
begin
  select c.club_id, c.kind, a.claimed_by
  into v_club, v_kind, v_current
  from albums a
  join cycles c on c.id = a.cycle_id
  where a.id = p_album;
  if not found then
    raise exception 'Album not found';
  end if;
  if v_kind <> 'archive' then
    raise exception 'Not an archive album';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;

  v_is_admin := public.club_role(v_club) in ('owner', 'admin');

  if v_is_admin then
    -- Admin may assign to any member (p_profile = their id) or clear (null).
    if p_profile is not null and not exists (
      select 1 from club_members where club_id = v_club and profile_id = p_profile
    ) then
      raise exception 'That person is not a club member';
    end if;
  else
    -- Member: claim an unclaimed album for themselves (p_profile = auth.uid())
    -- or release their own (p_profile = null). Nothing else.
    if not (
      (v_current is null and p_profile = auth.uid())
      or (v_current = auth.uid() and p_profile is null)
    ) then
      raise exception 'You can only claim an unclaimed album or release your own';
    end if;
  end if;

  update albums set claimed_by = p_profile
  where id = p_album
  returning * into v_album;

  return v_album;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_bingo(p_card uuid, p_line integer)
 RETURNS bingo_claims
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_card public.bingo_cards;
  v_game public.bingo_games;
  v_claim public.bingo_claims;
  v_missing int;
  v_claimed int;
  v_next smallint;
begin
  select * into v_card from bingo_cards where id = p_card;
  if not found then
    raise exception 'Card not found';
  end if;
  if v_card.profile_id <> auth.uid() then
    raise exception 'Not your card';
  end if;
  select * into v_game from bingo_games where id = v_card.game_id;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;
  if not (p_line = any (v_card.qualifying_lines)) then
    raise exception 'That line is not one of your qualifying lines';
  end if;
  if exists (
    select 1 from bingo_claims
    where card_id = p_card and line_index = p_line and status in ('pending', 'verified')
  ) then
    raise exception 'That line is already claimed';
  end if;

  select count(*) into v_missing
  from unnest(public.bingo_line_positions(p_line)) as pos
  where pos <> 12
    and not exists (
      select 1 from bingo_boxes b
      where b.card_id = p_card and b.position = pos and b.activated_at is not null
    );
  if v_missing > 0 then
    raise exception 'Light every box on the line first (% to go)', v_missing;
  end if;

  insert into bingo_claims (card_id, line_index)
  values (p_card, p_line)
  returning * into v_claim;

  perform public.publish_activity_event(
    v_game.club_id, 'bingo_claimed',
    jsonb_build_object('game_id', v_game.id, 'line_index', p_line)
  );

  -- Every qualifying line live-claimed → unlock the next line, but ONLY from
  -- lines that still have unlit boxes: a pre-completed line would be a free
  -- bingo (double counting). No candidates → the card is done; blackout (and
  -- a fresh card) is the reward.
  select count(*) into v_claimed
  from bingo_claims
  where card_id = p_card and status in ('pending', 'verified')
    and line_index = any (v_card.qualifying_lines);
  if v_claimed >= array_length(v_card.qualifying_lines, 1)
     and array_length(v_card.qualifying_lines, 1) < 12 then
    select l::smallint into v_next
    from generate_series(0, 11) as l
    where not (l::smallint = any (v_card.qualifying_lines))
      and exists (
        select 1 from unnest(public.bingo_line_positions(l)) as pos
        where pos <> 12
          and not exists (
            select 1 from bingo_boxes b
            where b.card_id = p_card and b.position = pos and b.activated_at is not null
          )
      )
    order by random()
    limit 1;
    if v_next is not null then
      update bingo_cards
      set qualifying_lines = qualifying_lines || v_next
      where id = p_card;
    end if;
  end if;

  return v_claim;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.close_bingo_game(p_game uuid)
 RETURNS bingo_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game public.bingo_games;
  v_cycle_number int;
  v_winner text;
  v_count int;
begin
  select * into v_game from bingo_games where id = p_game;
  if not found then
    raise exception 'Game not found';
  end if;
  if v_game.created_by <> auth.uid() and not public.can_run_bingo(v_game.club_id) then
    raise exception 'Only an admin or the current picker can close the game';
  end if;
  if v_game.status <> 'open' then
    raise exception 'The game is already closed';
  end if;

  update bingo_claims c
  set status = 'verified', resolved_by = auth.uid(), resolved_at = now(), self_certified = true
  from bingo_cards k
  where c.card_id = k.id and k.game_id = p_game and c.status = 'pending';

  update bingo_games set status = 'closed', closed_at = now()
  where id = p_game
  returning * into v_game;

  select count(*) into v_count
  from bingo_claims c join bingo_cards k on k.id = c.card_id
  where k.game_id = p_game and c.status = 'verified';

  select p.display_name into v_winner
  from bingo_claims c
  join bingo_cards k on k.id = c.card_id
  join profiles p on p.id = k.profile_id
  where k.game_id = p_game and c.status = 'verified'
  order by c.resolved_at asc
  limit 1;

  select number into v_cycle_number from cycles where id = v_game.cycle_id;
  perform public.publish_activity_event(
    v_game.club_id, 'bingo_closed',
    jsonb_build_object(
      'game_id', p_game, 'cycle_number', v_cycle_number,
      'winner_name', v_winner, 'bingo_count', v_count
    )
  );

  return v_game;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.close_bracket(p_bracket uuid)
 RETURNS brackets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bracket public.brackets;
begin
  select * into v_bracket from brackets where id = p_bracket;
  if not found then
    raise exception 'Bracket not found';
  end if;
  if v_bracket.scope = 'personal' then
    if v_bracket.owner_id <> auth.uid() then
      raise exception 'This is a solo bracket';
    end if;
  elsif v_bracket.created_by <> auth.uid() and not public.can_run_bracket(v_bracket.club_id) then
    raise exception 'Only an admin or the current picker can close the bracket';
  end if;
  if v_bracket.status <> 'open' then
    raise exception 'The bracket is already closed';
  end if;

  update brackets set status = 'closed', closed_at = now()
  where id = p_bracket
  returning * into v_bracket;

  if v_bracket.scope = 'club' then
    perform public.publish_activity_event(
      v_bracket.club_id, 'bracket_closed',
      jsonb_build_object('artist_name', v_bracket.artist_name, 'bracket_id', p_bracket)
    );
  end if;

  return v_bracket;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.close_cycle(p_cycle uuid)
 RETURNS cycles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle public.cycles;
  v_sd public.showdowns;
  v_winner uuid;
  v_w_title text;
  v_w_artist text;
  v_w_name text;
  v_battle public.aux_battles;
  v_a_votes integer;
  v_b_votes integer;
  v_ab_winner uuid;
  v_ab_name text;
  v_bingo public.bingo_games;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'Cycle is already closed';
  end if;
  update cycles
  set status = 'closed',
      closed_at = now(),
      revealed_at = coalesce(revealed_at, now())
  where id = p_cycle
  returning * into v_cycle;

  -- Crown the showdown winner: highest net (sum of votes), tiebreak by most
  -- upvotes, then earliest submission.
  select * into v_sd from showdowns where cycle_id = p_cycle;
  if found then
    select s.id, s.title, s.artist, p.display_name
      into v_winner, v_w_title, v_w_artist, v_w_name
    from showdown_submissions s
    join profiles p on p.id = s.profile_id
    where s.showdown_id = v_sd.id
    order by
      coalesce((select sum(v.value) from showdown_votes v where v.submission_id = s.id), 0) desc,
      coalesce((select count(*) from showdown_votes v where v.submission_id = s.id and v.value = 1), 0) desc,
      s.created_at asc
    limit 1;

    if v_winner is not null then
      update showdowns set winner_submission_id = v_winner where id = v_sd.id;
      perform public.publish_activity_event(
        v_cycle.club_id, 'showdown_winner',
        jsonb_build_object(
          'cycle_number', v_cycle.number, 'cycle_id', p_cycle,
          'title', v_w_title, 'artist', v_w_artist, 'submitter_name', v_w_name
        )
      );
    end if;
  end if;

  -- Crown EACH Aux Battle in the cycle: more votes wins; a tie credits no one.
  for v_battle in select * from aux_battles where cycle_id = p_cycle loop
    select count(*) filter (where choice = v_battle.member_a),
           count(*) filter (where choice = v_battle.member_b)
      into v_a_votes, v_b_votes
    from aux_battle_votes where battle_id = v_battle.id;

    if v_a_votes > v_b_votes then
      v_ab_winner := v_battle.member_a;
    elsif v_b_votes > v_a_votes then
      v_ab_winner := v_battle.member_b;
    else
      v_ab_winner := null;
    end if;

    if v_ab_winner is not null then
      update aux_battles set winner_profile_id = v_ab_winner where id = v_battle.id;
      select display_name into v_ab_name from profiles where id = v_ab_winner;
      perform public.publish_activity_event(
        v_cycle.club_id, 'aux_battle_winner',
        jsonb_build_object(
          'cycle_number', v_cycle.number, 'cycle_id', p_cycle,
          'theme', v_battle.theme_text, 'winner_name', v_ab_name
        )
      );
    end if;
  end loop;

  -- Close the cycle's bingo game (pending claims self-certify inside).
  select * into v_bingo from bingo_games where cycle_id = p_cycle and status = 'open';
  if found then
    perform public.close_bingo_game(v_bingo.id);
  end if;

  perform public.publish_activity_event(
    v_cycle.club_id, 'cycle_closed',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', v_cycle.id)
  );

  return v_cycle;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.club_leaderboard(p_club uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_weights jsonb;
  v_result json;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;

  select coalesce(leaderboard_weights, '{}'::jsonb) into v_weights
  from clubs where id = p_club;

  select coalesce(json_agg(r order by r.active_score desc), '[]'::json)
  into v_result
  from (
    select
      cm.profile_id,
      p.display_name,
      p.email,
      p.avatar_color,
      p.avatar_url,
      p.avatar_label,
      cm.role,
      cm.joined_at,
      -- Most recent club activity, for client-side tie-breaking. GREATEST
      -- ignores NULLs, returning NULL only when the member has done nothing.
      greatest(
        (select max(fp.created_at) from feed_posts fp
           where fp.club_id = p_club and fp.author_id = cm.profile_id),
        (select max(pr.created_at) from post_reactions pr
           join feed_posts fp on fp.id = pr.post_id
          where fp.club_id = p_club and pr.profile_id = cm.profile_id),
        (select max(pc.created_at) from post_comments pc
           join feed_posts fp on fp.id = pc.post_id
          where fp.club_id = p_club and pc.author_id = cm.profile_id),
        (select max(rt.updated_at) from ratings rt
           join albums a on a.id = rt.album_id
           join cycles c on c.id = a.cycle_id
          where c.club_id = p_club and rt.profile_id = cm.profile_id),
        (select max(co.created_at) from concerts co
           where co.club_id = p_club and co.added_by = cm.profile_id)
      ) as last_active_at,
      jsonb_build_object(
        'albums_chosen', stats.albums_chosen,
        'avg_rating_received', stats.avg_rating_received,
        'ratings_given', stats.ratings_given,
        'interactions_given', stats.interactions_given,
        'interactions_received', stats.interactions_received,
        'songs_shared', stats.songs_shared,
        'concerts_added', stats.concerts_added,
        'meetings_attended', stats.meetings_attended
      ) as stats,
      ( stats.songs_shared        * coalesce((v_weights->>'songs_shared')::numeric, 0)
      + stats.interactions_given  * coalesce((v_weights->>'interactions_given')::numeric, 0)
      + stats.ratings_given       * coalesce((v_weights->>'ratings_given')::numeric, 0)
      + stats.concerts_added      * coalesce((v_weights->>'concerts_added')::numeric, 0)
      + stats.meetings_attended   * coalesce((v_weights->>'meetings_attended')::numeric, 0)
      + stats.albums_chosen       * coalesce((v_weights->>'albums_chosen')::numeric, 0)
      ) as active_score
    from club_members cm
    join profiles p on p.id = cm.profile_id
    cross join lateral (
      select
        -- albums chosen: real cycle picks only — archive uploads are shelf
        -- stocking, not picking
        (select count(*)::int from albums a
           join cycles c on c.id = a.cycle_id
          where c.club_id = p_club and a.set_by = cm.profile_id
            and c.kind <> 'archive') as albums_chosen,
        -- avg rating received on their picks — REVEALED standard cycles only
        (select round(avg(rt.score)::numeric, 1) from ratings rt
           join albums a on a.id = rt.album_id
           join cycles c on c.id = a.cycle_id
          where c.club_id = p_club and a.set_by = cm.profile_id
            and c.revealed_at is not null and c.kind <> 'archive') as avg_rating_received,
        -- ratings they submitted in the club (archive reviews count — the
        -- effort is real regardless of shelf)
        (select count(*)::int from ratings rt
           join albums a on a.id = rt.album_id
           join cycles c on c.id = a.cycle_id
          where c.club_id = p_club and rt.profile_id = cm.profile_id) as ratings_given,
        -- interactions given: reactions + comments on OTHERS' posts (no self)
        ( (select count(*) from post_reactions pr
             join feed_posts fp on fp.id = pr.post_id
            where fp.club_id = p_club and pr.profile_id = cm.profile_id
              and fp.author_id <> cm.profile_id)
        + (select count(*) from post_comments pc
             join feed_posts fp on fp.id = pc.post_id
            where fp.club_id = p_club and pc.author_id = cm.profile_id
              and fp.author_id <> cm.profile_id) )::int as interactions_given,
        -- interactions received: OTHERS reacting/commenting on my posts (no self)
        ( (select count(*) from post_reactions pr
             join feed_posts fp on fp.id = pr.post_id
            where fp.club_id = p_club and fp.author_id = cm.profile_id
              and pr.profile_id <> cm.profile_id)
        + (select count(*) from post_comments pc
             join feed_posts fp on fp.id = pc.post_id
            where fp.club_id = p_club and fp.author_id = cm.profile_id
              and pc.author_id <> cm.profile_id) )::int as interactions_received,
        -- songs shared: feed posts they authored
        (select count(*)::int from feed_posts fp
          where fp.club_id = p_club and fp.author_id = cm.profile_id) as songs_shared,
        -- concerts added
        (select count(*)::int from concerts co
          where co.club_id = p_club and co.added_by = cm.profile_id) as concerts_added,
        -- meetings attended: 'yes' RSVP on a closed cycle
        (select count(*)::int from rsvps rv
           join cycles c on c.id = rv.cycle_id
          where c.club_id = p_club and rv.profile_id = cm.profile_id
            and rv.status = 'yes' and c.status = 'closed') as meetings_attended
    ) stats
    where cm.club_id = p_club
  ) r;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.club_role(p_club uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from club_members
  where club_id = p_club and profile_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.create_bingo_game(p_club uuid, p_labels text[])
 RETURNS bingo_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle public.cycles;
  v_game public.bingo_games;
  v_count int;
begin
  if not public.can_run_bingo(p_club) then
    raise exception 'Only an admin or the current picker can start a bingo game';
  end if;
  select * into v_cycle from cycles where club_id = p_club and status = 'open';
  if not found then
    raise exception 'Bingo needs an open cycle';
  end if;
  if exists (select 1 from bingo_games where club_id = p_club and status = 'open') then
    raise exception 'A bingo game is already live — close it first';
  end if;

  select count(distinct trim(l)) into v_count
  from unnest(p_labels) as l
  where char_length(trim(l)) between 1 and 200;
  if v_count < 24 then
    raise exception 'The category pool needs at least 24 categories (got %)', v_count;
  end if;
  if v_count > 400 then
    raise exception 'That is too many categories';
  end if;

  insert into bingo_games (club_id, cycle_id, created_by)
  values (p_club, v_cycle.id, auth.uid())
  returning * into v_game;

  insert into bingo_game_categories (game_id, label)
  select v_game.id, trim(l)
  from unnest(p_labels) as l
  where char_length(trim(l)) between 1 and 200
  group by trim(l);

  perform public.publish_activity_event(
    p_club, 'bingo_started',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', v_cycle.id, 'game_id', v_game.id)
  );

  return v_game;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_bracket(p_club uuid, p_artist_name text, p_artist_spotify_id text, p_artist_image_url text, p_size integer, p_tracks jsonb, p_scope text DEFAULT 'club'::text, p_kind text DEFAULT 'artist'::text)
 RETURNS brackets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bracket public.brackets;
  v_order int[];
  v_pos int[];
  v_theme_art text[];
  i int;
  t jsonb;
begin
  if p_scope not in ('club', 'personal') then
    raise exception 'Invalid scope';
  end if;
  if p_kind not in ('artist', 'theme') then
    raise exception 'Invalid bracket kind';
  end if;
  if p_scope = 'club' then
    if not public.can_run_bracket(p_club) then
      raise exception 'Only an admin or the current picker can start a bracket';
    end if;
    if exists (select 1 from brackets where club_id = p_club and status = 'open' and scope = 'club') then
      raise exception 'A bracket is already live — close it first';
    end if;
  else
    -- Solo: any member, no live-bracket limit.
    if not public.is_club_member(p_club) then
      raise exception 'Not a club member';
    end if;
  end if;
  if p_size not in (16, 32, 64) then
    raise exception 'Bracket size must be 16, 32, or 64';
  end if;
  if jsonb_typeof(p_tracks) <> 'array' or jsonb_array_length(p_tracks) <> p_size then
    raise exception 'Expected exactly % tracks', p_size;
  end if;

  -- Theme shelf art: the top four seeds' artwork, frozen at creation.
  if p_kind = 'theme' then
    select array_agg(art order by ord) into v_theme_art
    from (
      select t2 ->> 'artwork_url' as art, ord
      from jsonb_array_elements(p_tracks) with ordinality as e(t2, ord)
      where coalesce(t2 ->> 'artwork_url', '') <> ''
      order by ord
      limit 4
    ) top4;
  end if;

  insert into brackets (club_id, artist_name, artist_spotify_id, artist_image_url, size, created_by, scope, owner_id, kind, theme_art)
  values (
    p_club, trim(p_artist_name), coalesce(p_artist_spotify_id, ''), p_artist_image_url, p_size, auth.uid(),
    p_scope, case when p_scope = 'personal' then auth.uid() end,
    p_kind, v_theme_art
  )
  returning * into v_bracket;

  v_order := public.bracket_seed_order(p_size);
  v_pos := array_fill(0, array[p_size]);
  for i in 1..p_size loop
    v_pos[v_order[i]] := i;
  end loop;

  for i in 1..p_size loop
    t := p_tracks -> (i - 1);
    if char_length(trim(coalesce(t ->> 'title', ''))) = 0 then
      raise exception 'Track % is missing a title', i;
    end if;
    insert into bracket_tracks
      (bracket_id, seed, position, title, album, artist, artwork_url, spotify_url, apple_url, preview_url, playcount)
    values (
      v_bracket.id, i, v_pos[i],
      trim(t ->> 'title'), coalesce(t ->> 'album', ''), coalesce(trim(t ->> 'artist'), ''),
      nullif(t ->> 'artwork_url', ''), nullif(t ->> 'spotify_url', ''),
      nullif(t ->> 'apple_url', ''), nullif(t ->> 'preview_url', ''),
      coalesce((t ->> 'playcount')::bigint, 0)
    );
  end loop;

  -- Solo runs are silent; only club brackets announce. artist_name carries the
  -- theme text for theme brackets — the copy reads the same either way.
  if p_scope = 'club' then
    perform public.publish_activity_event(
      p_club, 'bracket_started',
      jsonb_build_object('artist_name', v_bracket.artist_name, 'size', p_size, 'bracket_id', v_bracket.id)
    );
  end if;

  return v_bracket;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_club(p_name text, p_emoji text DEFAULT '🎵'::text)
 RETURNS clubs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club public.clubs;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into clubs (name, emoji, owner_id)
  values (trim(p_name), coalesce(nullif(p_emoji, ''), '🎵'), auth.uid())
  returning * into v_club;

  insert into club_members (club_id, profile_id, role)
  values (v_club.id, auth.uid(), 'owner');

  return v_club;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_convince_post(p_club uuid, p_artist_name text, p_artist_image text, p_artist_ref text, p_blurb text, p_tracks jsonb, p_targets uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_post uuid;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  if jsonb_array_length(coalesce(p_tracks, '[]'::jsonb)) <> 3 then
    raise exception 'Exactly 3 tracks are required';
  end if;

  insert into convince_posts (club_id, author_id, artist_name, artist_image_url, artist_ref, blurb)
  values (p_club, v_actor, p_artist_name, nullif(p_artist_image, ''), nullif(p_artist_ref, ''), p_blurb)
  returning id into v_post;

  insert into convince_tracks (post_id, position, title, artist, artwork_url, spotify_url, apple_url, norm_key)
  select
    v_post,
    ord::smallint,
    t->>'title',
    coalesce(t->>'artist', ''),
    nullif(t->>'artwork_url', ''),
    nullif(t->>'spotify_url', ''),
    nullif(t->>'apple_url', ''),
    coalesce(t->>'norm_key', '')
  from jsonb_array_elements(p_tracks) with ordinality as e(t, ord);

  insert into convince_targets (post_id, profile_id)
  select v_post, r
  from unnest(p_targets) as r
  where r <> v_actor
    and exists (select 1 from club_members m where m.club_id = p_club and m.profile_id = r)
  on conflict (post_id, profile_id) do nothing;

  -- Broadcast discovery event (social category — bell + hub, no push by default).
  insert into activity_events (club_id, actor_id, event_type, payload)
  values (
    p_club, v_actor, 'convince_post',
    jsonb_build_object(
      'post_id', v_post,
      'artist', p_artist_name,
      'target_count', coalesce(array_length(p_targets, 1), 0)
    )
  );

  -- One targeted event per aimed-at member (mentions category — direct push).
  insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
  select p_club, v_actor, t.profile_id, 'convince_target',
    jsonb_build_object('post_id', v_post, 'artist', p_artist_name)
  from convince_targets t
  where t.post_id = v_post;

  return v_post;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crown_champion(p_bracket uuid)
 RETURNS bracket_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bracket public.brackets;
  v_rounds int;
  v_champion uuid;
  v_entry public.bracket_entries;
  v_done int;
  v_total int;
begin
  select * into v_bracket from brackets where id = p_bracket;
  if not found then
    raise exception 'Bracket not found';
  end if;
  if not public.is_club_member(v_bracket.club_id) then
    raise exception 'Not a club member';
  end if;
  if v_bracket.scope = 'personal' and v_bracket.owner_id <> auth.uid() then
    raise exception 'This is a solo bracket';
  end if;
  if v_bracket.status <> 'open' then
    raise exception 'The bracket is closed';
  end if;

  v_rounds := floor(log(2, v_bracket.size))::int;
  if (select count(*) from bracket_picks where bracket_id = p_bracket and profile_id = auth.uid())
     <> v_bracket.size - 1 then
    raise exception 'Finish every matchup before crowning a champion';
  end if;

  select winner_track_id into v_champion
  from bracket_picks
  where bracket_id = p_bracket and profile_id = auth.uid() and round = v_rounds and slot = 1;

  update bracket_entries
  set completed_at = now(), champion_track_id = v_champion
  where bracket_id = p_bracket and profile_id = auth.uid() and completed_at is null
  returning * into v_entry;
  if not found then
    raise exception 'Your bracket is already locked';
  end if;

  if v_bracket.scope = 'personal' then
    update brackets set status = 'closed', closed_at = now() where id = p_bracket;
    return v_entry;
  end if;

  select count(*) filter (where e.completed_at is not null), count(*)
    into v_done, v_total
  from club_members cm
  left join bracket_entries e on e.bracket_id = p_bracket and e.profile_id = cm.profile_id
  where cm.club_id = v_bracket.club_id;

  perform public.publish_activity_event(
    v_bracket.club_id, 'bracket_champion',
    jsonb_build_object(
      'artist_name', v_bracket.artist_name, 'bracket_id', p_bracket,
      'done', v_done, 'total', v_total
    )
  );

  if v_done >= v_total then
    update brackets set status = 'closed', closed_at = now() where id = p_bracket;
    perform public.publish_activity_event(
      v_bracket.club_id, 'bracket_closed',
      jsonb_build_object('artist_name', v_bracket.artist_name, 'bracket_id', p_bracket)
    );
  end if;

  return v_entry;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cycle_club(p_cycle uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select club_id from cycles where id = p_cycle;
$function$
;

CREATE OR REPLACE FUNCTION public.cycle_studio_recap(p_cycle uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle public.cycles;
  v_from timestamptz;
  v_to timestamptz;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found or not public.is_club_member(v_cycle.club_id) then
    return null;
  end if;
  v_from := v_cycle.created_at;
  v_to := coalesce(v_cycle.closed_at, now());

  return jsonb_build_object(
    'showdown', (
      select jsonb_build_object(
        'theme', sd.theme_text,
        'podium', coalesce((
          select jsonb_agg(row_json order by rn)
          from (
            select row_number() over (
              order by
                coalesce((select sum(v.value) from showdown_votes v where v.submission_id = s.id), 0) desc,
                coalesce((select count(*) from showdown_votes v where v.submission_id = s.id and v.value = 1), 0) desc,
                s.created_at asc
            ) as rn,
            jsonb_build_object(
              'title', s.title, 'artist', s.artist, 'artwork_url', s.artwork_url,
              'submitter', p.display_name,
              'net', coalesce((select sum(v.value) from showdown_votes v where v.submission_id = s.id), 0)
            ) as row_json
            from showdown_submissions s
            join profiles p on p.id = s.profile_id
            where s.showdown_id = sd.id
          ) ranked
          where rn <= 3
        ), '[]'::jsonb)
      )
      from showdowns sd where sd.cycle_id = p_cycle
    ),
    'aux', coalesce((
      select jsonb_agg(jsonb_build_object(
        'theme', ab.theme_text,
        'a', pa.display_name, 'b', pb.display_name,
        'winner', pw.display_name,
        'a_votes', (select count(*) from aux_battle_votes v where v.battle_id = ab.id and v.choice = ab.member_a),
        'b_votes', (select count(*) from aux_battle_votes v where v.battle_id = ab.id and v.choice = ab.member_b)
      ) order by ab.created_at)
      from aux_battles ab
      join profiles pa on pa.id = ab.member_a
      join profiles pb on pb.id = ab.member_b
      left join profiles pw on pw.id = ab.winner_profile_id
      where ab.cycle_id = p_cycle
    ), '[]'::jsonb),
    'playlist', (
      select jsonb_build_object(
        'theme', pp.theme_text,
        'song_count', (select count(*) from perfect_playlist_songs s where s.playlist_id = pp.id),
        'contributor_count', (select count(distinct s.profile_id) from perfect_playlist_songs s where s.playlist_id = pp.id)
      )
      from perfect_playlists pp where pp.cycle_id = p_cycle
    ),
    'bingo', (
      select jsonb_build_object(
        'cards', (select count(*) from bingo_cards k where k.game_id = g.id),
        'standings', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', p.display_name, 'line_index', cl.line_index, 'self_certified', cl.self_certified
          ) order by cl.resolved_at)
          from bingo_claims cl
          join bingo_cards k on k.id = cl.card_id
          join profiles p on p.id = k.profile_id
          where k.game_id = g.id and cl.status = 'verified'
        ), '[]'::jsonb),
        'blackouts', coalesce((
          select jsonb_agg(p.display_name)
          from bingo_cards k
          join profiles p on p.id = k.profile_id
          where k.game_id = g.id
            and (select count(*) from bingo_boxes b where b.card_id = k.id and b.activated_at is not null) = 24
        ), '[]'::jsonb)
      )
      from bingo_games g where g.cycle_id = p_cycle
    ),
    'brackets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', br.id, 'artist_name', br.artist_name, 'size', br.size, 'closed_at', br.closed_at
      ) order by br.closed_at)
      from brackets br
      where br.club_id = v_cycle.club_id and br.status = 'closed'
        and br.scope = 'club'
        and br.closed_at between v_from and v_to
    ), '[]'::jsonb),
    'window', jsonb_build_object(
      'takes', coalesce((
        select jsonb_agg(jsonb_build_object('author', p.display_name, 'snippet', left(mt.body, 140)) order by mt.created_at desc)
        from (
          select * from musical_takes
          where club_id = v_cycle.club_id and created_at between v_from and v_to
          order by created_at desc limit 6
        ) mt
        join profiles p on p.id = mt.author_id
      ), '[]'::jsonb),
      'bars', coalesce((
        select jsonb_agg(jsonb_build_object(
          'author', p.display_name, 'snippet', left(bb.lyric, 140), 'title', bb.title
        ) order by bb.created_at desc)
        from (
          select * from best_bars
          where club_id = v_cycle.club_id and created_at between v_from and v_to
          order by created_at desc limit 6
        ) bb
        join profiles p on p.id = bb.author_id
      ), '[]'::jsonb),
      'share_count', (
        select count(*) from feed_posts
        where club_id = v_cycle.club_id and not is_album_suggestion
          and created_at between v_from and v_to
      ),
      'convince_conversions', (
        select count(*) from convince_targets t
        join convince_posts cp on cp.id = t.post_id
        where cp.club_id = v_cycle.club_id and t.verdict = 'converted'
          and cp.created_at between v_from and v_to
      )
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.deal_bingo_card(p_game uuid)
 RETURNS bingo_cards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game public.bingo_games;
  v_card public.bingo_cards;
begin
  select * into v_game from bingo_games where id = p_game;
  if not found then
    raise exception 'Game not found';
  end if;
  if not public.is_club_member(v_game.club_id) then
    raise exception 'Not a club member';
  end if;

  select * into v_card from bingo_cards
  where game_id = p_game and profile_id = auth.uid()
  order by card_number desc limit 1;
  if found then
    return v_card;
  end if;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;

  return public.bingo_deal_internal(p_game, 1);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_showdown_submission(p_showdown uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_votes integer;
begin
  select s.id, (select count(*) from showdown_votes v where v.submission_id = s.id)
    into v_id, v_votes
  from showdown_submissions s
  where s.showdown_id = p_showdown and s.profile_id = auth.uid();
  if v_id is null then
    return;
  end if;
  if v_votes > 0 then
    raise exception 'Your song is locked in — it already has votes.';
  end if;
  delete from showdown_submissions where id = v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_song_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_limit int;
  v_cycle_start timestamptz;
  v_count int;
begin
  if new.kind <> 'track' then
    return new;  -- only songs are capped
  end if;

  select song_limit_per_cycle into v_limit from clubs where id = new.club_id;
  if v_limit is null then
    return new;  -- unlimited
  end if;

  select created_at into v_cycle_start
  from cycles
  where club_id = new.club_id and status = 'open'
  limit 1;
  if v_cycle_start is null then
    return new;  -- no open cycle → cap dormant
  end if;

  select count(*) into v_count
  from feed_posts
  where club_id = new.club_id
    and author_id = new.author_id
    and kind = 'track'
    and created_at >= v_cycle_start;

  if v_count >= v_limit then
    raise exception 'You''ve hit this cycle''s limit of % song(s).', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_invite_code()
 RETURNS text
 LANGUAGE sql
AS $function$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1),
    ''
  )
  from generate_series(1, 8);
$function$
;

CREATE OR REPLACE FUNCTION public.get_album_summary(p_album uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club uuid;
  v_revealed boolean;
  v_submitted uuid[];
  v_mine boolean;
  v_avg numeric;
begin
  select c.club_id, c.revealed_at is not null
  into v_club, v_revealed
  from albums a
  join cycles c on c.id = a.cycle_id
  where a.id = p_album;
  if not found then
    raise exception 'Album not found';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;

  select coalesce(array_agg(profile_id), '{}')
  into v_submitted
  from ratings
  where album_id = p_album;

  v_mine := auth.uid() = any (v_submitted);

  if v_mine or v_revealed then
    select round(avg(score)::numeric, 1) into v_avg
    from ratings
    where album_id = p_album;
  end if;

  return json_build_object(
    'submitted', coalesce(to_json(v_submitted), '[]'::json),
    'count', coalesce(array_length(v_submitted, 1), 0),
    'avg_score', v_avg,
    'revealed', v_revealed,
    'mine_submitted', v_mine
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cycle_highlights(p_cycle uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club uuid;
  v_revealed timestamptz;
  v_result json;
begin
  select c.club_id, c.revealed_at into v_club, v_revealed
  from cycles c where c.id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;
  if v_revealed is null then
    raise exception 'Cycle not revealed yet';
  end if;

  with cyc as (
    select c.*, p.display_name as picker_name
    from cycles c
    left join profiles p on p.id = c.picker_id
    where c.id = p_cycle
  ),
  alb as (
    select * from albums where cycle_id = p_cycle
  ),
  album_track_nums as (
    select a.id as album_id,
      coalesce((t.val->>'trackNumber')::int, t.ord::int) as track_number,
      (t.val->>'trackName') as track_name
    from alb a,
      jsonb_array_elements(coalesce(a.tracks, '[]'::jsonb)) with ordinality as t(val, ord)
    where (t.val->>'trackName') is not null
  ),
  album_stats as (
    select a.id, a.slot, a.title, a.artist, a.artwork_url,
      round(avg(r.score)::numeric, 1) as avg_score,
      round(avg(r.initial_score)::numeric, 1) as avg_initial,
      round(avg(r.replayability)::numeric, 1) as avg_replayability,
      count(r.*) as rating_count,
      min(r.score) as min_score,
      max(r.score) as max_score
    from alb a
    left join ratings r on r.album_id = a.id
    group by a.id, a.slot, a.title, a.artist, a.artwork_url
  ),
  fav_votes as (
    select album_id, count(*) as votes
    from cycle_preferences
    where cycle_id = p_cycle
    group by album_id
  ),
  album_tracks as (
    select a.id as album_id, a.artist as album_artist, a.artwork_url,
      (t->>'trackName') as track_name
    from alb a, jsonb_array_elements(coalesce(a.tracks, '[]'::jsonb)) t
    where (t->>'trackName') is not null
  ),
  fav_pts as (
    select album_id, favorite_track as track_name, count(*) * 3 as pts
    from ratings
    where album_id in (select id from alb) and favorite_track is not null
    group by album_id, favorite_track
  ),
  least_pts as (
    select album_id, least_track as track_name, count(*) * -2 as pts
    from ratings
    where album_id in (select id from alb) and least_track is not null
    group by album_id, least_track
  ),
  note_pts as (
    select sn.album_id, sn.track_name,
      sum(
        (case when sn.thumb = 'up' then 1 when sn.thumb = 'down' then -1 else 0 end)
        + (case when sn.rating >= 8 then 1 else 0 end)
      ) as pts
    from song_notes sn
    join song_note_shares sh
      on sh.album_id = sn.album_id and sh.profile_id = sn.profile_id
    where sn.album_id in (select id from alb)
    group by sn.album_id, sn.track_name
  ),
  album_song_scores as (
    select at.album_id, at.album_artist, at.artwork_url, at.track_name,
      coalesce(f.pts, 0) + coalesce(l.pts, 0) + coalesce(n.pts, 0) as score
    from album_tracks at
    left join fav_pts f on f.album_id = at.album_id and f.track_name = at.track_name
    left join least_pts l on l.album_id = at.album_id and l.track_name = at.track_name
    left join note_pts n on n.album_id = at.album_id and n.track_name = at.track_name
  ),
  feed_songs as (
    select fp.id as post_id, fp.title, fp.artist,
      fp.metadata->>'spotify_uri' as spotify_uri,
      fp.metadata->>'artwork' as artwork_url,
      count(pr.*) filter (where pr.emoji in ('👍', '❤️', '🔥', '😂')) as score
    from feed_posts fp
    left join post_reactions pr on pr.post_id = fp.id
    where fp.club_id = (select club_id from cyc)
      and fp.kind = 'track'
      and fp.created_at >= (select created_at from cyc)
      and fp.created_at <= coalesce((select closed_at from cyc), now())
    group by fp.id, fp.title, fp.artist, fp.metadata
  ),
  song_ranking as (
    select json_build_object(
      'source', 'album', 'title', track_name, 'artist', album_artist,
      'album_id', album_id, 'artwork_url', artwork_url, 'score', score
    ) as obj, score
    from album_song_scores where score > 0
    union all
    select json_build_object(
      'source', 'feed', 'title', title, 'artist', artist, 'post_id', post_id,
      'spotify_uri', spotify_uri, 'artwork_url', artwork_url, 'score', score
    ) as obj, score
    from feed_songs where score > 0
  ),
  review_high as (
    select distinct on (r.album_id)
      r.album_id, a.title as album_title, r.profile_id, r.score, r.review, 'high' as kind
    from ratings r join alb a on a.id = r.album_id
    where r.review is not null and char_length(trim(r.review)) > 0
    order by r.album_id, r.score desc, char_length(r.review) desc
  ),
  review_low as (
    select distinct on (r.album_id)
      r.album_id, a.title as album_title, r.profile_id, r.score, r.review, 'low' as kind
    from ratings r join alb a on a.id = r.album_id
    where r.review is not null and char_length(trim(r.review)) > 0
    order by r.album_id, r.score asc, char_length(r.review) desc
  ),
  reviews as (
    select * from review_high
    union all
    select rl.* from review_low rl
    where not exists (
      select 1 from review_high rh
      where rh.album_id = rl.album_id and rh.profile_id = rl.profile_id
    )
  ),
  takes as (
    select r.album_id, a.title as album_title, a.slot, r.profile_id,
      r.score, r.one_sentence_take
    from ratings r join alb a on a.id = r.album_id
    where r.one_sentence_take is not null and char_length(trim(r.one_sentence_take)) > 0
  ),
  vibe_counts as (
    select tag, count(*) as n
    from (
      select unnest(sn.vibe_tags) as tag
      from song_notes sn
      join song_note_shares sh
        on sh.album_id = sn.album_id and sh.profile_id = sn.profile_id
      where sn.album_id in (select id from alb)
      union all
      select unnest(r.album_vibe_tags) as tag
      from ratings r
      where r.album_id in (select id from alb)
    ) t
    where tag is not null and char_length(trim(tag)) > 0
    group by tag
    order by n desc, tag
    limit 8
  ),
  fav_lyrics as (
    select sn.album_id, sn.track_name as context, sn.favorite_lyric as lyric, sn.profile_id
    from song_notes sn
    join song_note_shares sh
      on sh.album_id = sn.album_id and sh.profile_id = sn.profile_id
    where sn.album_id in (select id from alb)
      and sn.favorite_lyric is not null and char_length(trim(sn.favorite_lyric)) > 0
    union all
    select r.album_id, a.title as context, r.favorite_lyric as lyric, r.profile_id
    from ratings r join alb a on a.id = r.album_id
    where r.favorite_lyric is not null and char_length(trim(r.favorite_lyric)) > 0
  ),
  run_pick as (
    select album_id, best_run_start,
      count(*) as picks, round(avg(best_run_rating)::numeric, 1) as avg_rating
    from ratings
    where album_id in (select id from alb) and best_run_start is not null
    group by album_id, best_run_start
  ),
  best_run as (
    select distinct on (album_id) album_id, best_run_start, picks, avg_rating
    from run_pick
    order by album_id, picks desc, avg_rating desc nulls last
  ),
  saved as (
    select sn.album_id, sn.track_name, count(*) as saves
    from song_notes sn
    where sn.album_id in (select id from alb) and sn.saved_to_library
    group by sn.album_id, sn.track_name
    order by saves desc, sn.track_name
    limit 8
  ),
  -- ── head-to-head: each member's cycle pick + reasons ────────────────────────
  h2h as (
    select cp.profile_id, cp.album_id, a.title as album_title,
      cp.preference_reason, cp.other_album_merit
    from cycle_preferences cp
    join alb a on a.id = cp.album_id
    where cp.cycle_id = p_cycle
      and (cp.preference_reason is not null or cp.other_album_merit is not null)
  ),
  popular as (
    select fp.id as post_id, fp.kind, fp.title, fp.artist, fp.url,
      fp.metadata->>'artwork' as artwork_url,
      count(pr.*) filter (where pr.emoji in ('👍', '❤️', '🔥', '😂')) as reactions
    from feed_posts fp
    left join post_reactions pr on pr.post_id = fp.id
    where fp.club_id = (select club_id from cyc)
      and fp.created_at >= (select created_at from cyc)
      and fp.created_at <= coalesce((select closed_at from cyc), now())
    group by fp.id, fp.kind, fp.title, fp.artist, fp.url, fp.metadata
    having count(pr.*) filter (where pr.emoji in ('👍', '❤️', '🔥', '😂')) > 0
    order by reactions desc
    limit 3
  )
  select json_build_object(
    'cycle', (
      select json_build_object(
        'id', id, 'number', number, 'picker_id', picker_id, 'picker_name', picker_name,
        'meeting_at', meeting_at, 'closed_at', closed_at,
        'spotify_playlist_url', spotify_playlist_url
      ) from cyc
    ),
    'albums', coalesce((
      select json_agg(json_build_object(
        'album_id', s.id, 'slot', s.slot, 'title', s.title, 'artist', s.artist,
        'artwork_url', s.artwork_url, 'avg_score', s.avg_score, 'avg_initial', s.avg_initial,
        'avg_replayability', s.avg_replayability,
        'rating_count', s.rating_count, 'min_score', s.min_score, 'max_score', s.max_score,
        'favorite_votes', coalesce(fv.votes, 0)
      ) order by s.slot)
      from album_stats s left join fav_votes fv on fv.album_id = s.id
    ), '[]'::json),
    'winner_album_id', (
      select album_id from fav_votes
      where votes = (select max(votes) from fav_votes)
        and (select count(*) from fav_votes f2 where f2.votes = (select max(votes) from fav_votes)) = 1
      limit 1
    ),
    'top_songs', coalesce((
      select json_agg(obj order by score desc) from song_ranking
    ), '[]'::json),
    'reviews', coalesce((
      select json_agg(json_build_object(
        'album_id', rv.album_id, 'album_title', rv.album_title, 'kind', rv.kind,
        'profile_id', rv.profile_id, 'score', rv.score, 'review', rv.review,
        'display_name', p.display_name, 'email', p.email, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
      ))
      from reviews rv left join profiles p on p.id = rv.profile_id
    ), '[]'::json),
    'takes', coalesce((
      select json_agg(json_build_object(
        'album_id', tk.album_id, 'album_title', tk.album_title, 'profile_id', tk.profile_id,
        'score', tk.score, 'take', tk.one_sentence_take,
        'display_name', p.display_name, 'email', p.email, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
      ) order by tk.slot, tk.score desc)
      from takes tk left join profiles p on p.id = tk.profile_id
    ), '[]'::json),
    'cycle_vibe', coalesce((
      select json_agg(json_build_object('tag', tag, 'count', n) order by n desc, tag)
      from vibe_counts
    ), '[]'::json),
    'favorite_lyrics', coalesce((
      select json_agg(json_build_object(
        'album_id', fl.album_id, 'context', fl.context, 'lyric', fl.lyric,
        'display_name', p.display_name, 'email', p.email, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
      ))
      from fav_lyrics fl left join profiles p on p.id = fl.profile_id
    ), '[]'::json),
    'best_runs', coalesce((
      select json_agg(json_build_object(
        'album_id', br.album_id, 'album_title', a.title, 'start', br.best_run_start,
        'picks', br.picks, 'avg_rating', br.avg_rating,
        'tracks', coalesce((
          select json_agg(atn.track_name order by atn.track_number)
          from album_track_nums atn
          where atn.album_id = br.album_id
            and atn.track_number between br.best_run_start and br.best_run_start + 2
        ), '[]'::json)
      ) order by a.slot)
      from best_run br join alb a on a.id = br.album_id
    ), '[]'::json),
    'most_saved', coalesce((
      select json_agg(json_build_object(
        'album_id', sv.album_id, 'album_title', a.title, 'artwork_url', a.artwork_url,
        'track_name', sv.track_name, 'saves', sv.saves
      ) order by sv.saves desc, sv.track_name)
      from saved sv join alb a on a.id = sv.album_id
    ), '[]'::json),
    'head_to_head', coalesce((
      select json_agg(json_build_object(
        'profile_id', h.profile_id, 'album_id', h.album_id, 'album_title', h.album_title,
        'preference_reason', h.preference_reason, 'other_album_merit', h.other_album_merit,
        'display_name', p.display_name, 'email', p.email, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
      ))
      from h2h h left join profiles p on p.id = h.profile_id
    ), '[]'::json),
    'popular_shares', coalesce((
      select json_agg(json_build_object(
        'post_id', post_id, 'kind', kind, 'title', title, 'artist', artist,
        'url', url, 'artwork_url', artwork_url, 'reactions', reactions
      ) order by reactions desc)
      from popular
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_archive_cycle(p_club uuid)
 RETURNS cycles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle public.cycles;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;

  select * into v_cycle
  from cycles where club_id = p_club and kind = 'archive';
  if found then
    return v_cycle;
  end if;

  insert into cycles (club_id, number, picker_id, status, kind, revealed_at)
  values (
    p_club,
    0,
    (select owner_id from clubs where id = p_club),
    'closed',
    'archive',
    now()
  )
  returning * into v_cycle;

  return v_cycle;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_showdown_history(p_club uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows json;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;

  select coalesce(json_agg(row order by row.cycle_number desc), '[]'::json) into v_rows
  from (
    select
      c.id as cycle_id,
      c.number as cycle_number,
      sd.theme_text,
      w.title as winner_title,
      w.artist as winner_artist,
      w.artwork_url as winner_artwork,
      w.spotify_url as winner_spotify_url,
      w.apple_url as winner_apple_url,
      p.display_name as winner_submitter,
      p.avatar_color as winner_color,
      p.avatar_url as winner_avatar
    from showdowns sd
    join cycles c on c.id = sd.cycle_id
    left join showdown_submissions w on w.id = sd.winner_submission_id
    left join profiles p on p.id = w.profile_id
    where sd.club_id = p_club
      and c.revealed_at is not null
  ) row;

  return v_rows;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name, email, avatar_color)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    new.email,
    floor(random() * 7)::int
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_completed_bracket(p_bracket uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from bracket_entries
    where bracket_id = p_bracket and profile_id = auth.uid() and completed_at is not null
  );
$function$
;

CREATE OR REPLACE FUNCTION public.import_bracket_picks(p_bracket uuid, p_picks jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bracket public.brackets;
  v_rounds int;
  pk jsonb;
  v_round int;
  v_slot int;
  v_winner uuid;
begin
  select * into v_bracket from brackets where id = p_bracket;
  if not found then
    raise exception 'Bracket not found';
  end if;
  if not public.is_club_member(v_bracket.club_id) then
    raise exception 'Not a club member';
  end if;
  if v_bracket.scope = 'personal' and v_bracket.owner_id <> auth.uid() then
    raise exception 'This is a solo bracket';
  end if;
  if v_bracket.status <> 'open' then
    raise exception 'The bracket is closed';
  end if;
  if exists (select 1 from bracket_picks where bracket_id = p_bracket and profile_id = auth.uid()) then
    raise exception 'You already have picks here — imports need a fresh bracket';
  end if;
  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) <> v_bracket.size - 1 then
    raise exception 'Expected exactly % picks', v_bracket.size - 1;
  end if;

  v_rounds := floor(log(2, v_bracket.size))::int;

  insert into bracket_entries (bracket_id, profile_id)
  values (p_bracket, auth.uid())
  on conflict (bracket_id, profile_id) do nothing;

  for pk in
    select value from jsonb_array_elements(p_picks)
    order by (value ->> 'round')::int, (value ->> 'slot')::int
  loop
    v_round := (pk ->> 'round')::int;
    v_slot := (pk ->> 'slot')::int;
    v_winner := (pk ->> 'winner')::uuid;
    if v_round < 1 or v_round > v_rounds
       or v_slot < 1 or v_slot > v_bracket.size / (2 ^ v_round)::int then
      raise exception 'Invalid matchup %/%', v_round, v_slot;
    end if;
    if v_round = 1 then
      if not exists (
        select 1 from bracket_tracks
        where bracket_id = p_bracket and id = v_winner and position in (2 * v_slot - 1, 2 * v_slot)
      ) then
        raise exception 'Pick %/% is not in that matchup', v_round, v_slot;
      end if;
    else
      if not exists (
        select 1 from bracket_picks
        where bracket_id = p_bracket and profile_id = auth.uid()
          and round = v_round - 1 and slot in (2 * v_slot - 1, 2 * v_slot)
          and winner_track_id = v_winner
      ) then
        raise exception 'Pick %/% is not in that matchup', v_round, v_slot;
      end if;
    end if;
    insert into bracket_picks (bracket_id, profile_id, round, slot, winner_track_id)
    values (p_bracket, auth.uid(), v_round, v_slot, v_winner);
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_club_member(p_club uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from club_members
    where club_id = p_club and profile_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.join_club(p_code text)
 RETURNS clubs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club public.clubs;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_club from clubs where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'Invalid invite code';
  end if;

  insert into club_members (club_id, profile_id, role)
  values (v_club.id, auth.uid(), 'member')
  on conflict (club_id, profile_id) do nothing;

  return v_club;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_showdown(p_cycle uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sd public.showdowns;
  v_revealed boolean;
  v_club uuid;
  v_field integer;
  v_up integer;
  v_down integer;
  v_subs json;
begin
  select * into v_sd from showdowns where cycle_id = p_cycle;
  if not found then
    return null;
  end if;
  v_club := v_sd.club_id;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;

  select (revealed_at is not null) into v_revealed from cycles where id = p_cycle;
  select count(*) into v_field from showdown_submissions where showdown_id = v_sd.id;

  select
    coalesce(count(*) filter (where value = 1), 0),
    coalesce(count(*) filter (where value = -1), 0)
  into v_up, v_down
  from showdown_votes v
  join showdown_submissions s on s.id = v.submission_id
  where s.showdown_id = v_sd.id and v.profile_id = auth.uid();

  select coalesce(json_agg(row order by row.created_at), '[]'::json) into v_subs
  from (
    select
      s.id,
      s.title,
      s.artist,
      s.artwork_url,
      s.spotify_url,
      s.apple_url,
      s.preview_url,
      s.created_at,
      (s.profile_id = auth.uid()) as is_mine,
      (select v.value from showdown_votes v where v.submission_id = s.id and v.profile_id = auth.uid()) as my_vote,
      -- Author only after reveal (or if it's mine).
      case when v_revealed or s.profile_id = auth.uid() then p.display_name end as author_name,
      case when v_revealed or s.profile_id = auth.uid() then p.avatar_color end as author_color,
      case when v_revealed or s.profile_id = auth.uid() then p.avatar_url end as author_avatar,
      -- Net score only after reveal.
      case when v_revealed then (
        select coalesce(sum(v.value), 0) from showdown_votes v where v.submission_id = s.id
      ) end as net_score
    from showdown_submissions s
    join profiles p on p.id = s.profile_id
    where s.showdown_id = v_sd.id
  ) row;

  return json_build_object(
    'showdown_id', v_sd.id,
    'theme_text', v_sd.theme_text,
    'revealed', v_revealed,
    'submission_count', v_field,
    'downvote_unlocked', (v_field >= 4),
    'up_remaining', 2 - v_up,
    'down_remaining', 1 - v_down,
    'winner_submission_id', v_sd.winner_submission_id,
    'submissions', v_subs
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lock_initial_score()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.initial_score is not null
     and new.initial_score is distinct from old.initial_score then
    raise exception 'Your first-listen score is locked and cannot be changed.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_app_open()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into app_opens (profile_id, day)
  values (auth.uid(), current_date)
  on conflict (profile_id, day) do update
    set last_open_at = now(), opens = app_opens.opens + 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_activity_read(p_club uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  insert into activity_reads (club_id, profile_id, last_read_at)
  values (p_club, auth.uid(), now())
  on conflict (club_id, profile_id) do update set last_read_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_bingo_listened(p_box uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_box public.bingo_boxes;
  v_card public.bingo_cards;
  v_game public.bingo_games;
  v_gate_secs numeric;
begin
  select * into v_box from bingo_boxes where id = p_box;
  if not found then
    raise exception 'Box not found';
  end if;
  select * into v_card from bingo_cards where id = v_box.card_id;
  if v_card.profile_id <> auth.uid() then
    raise exception 'Not your card';
  end if;
  select * into v_game from bingo_games where id = v_card.game_id;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;
  if v_box.activated_at is not null then
    return;
  end if;
  if v_box.listen_started_at is null then
    raise exception 'Tap out and listen first';
  end if;

  v_gate_secs := greatest(coalesce(v_box.duration_ms / 1000.0, 90), 30);
  if now() < v_box.listen_started_at + make_interval(secs => v_gate_secs) then
    raise exception 'Still listening? The song is not over yet';
  end if;

  update bingo_boxes set activated_at = now() where id = p_box;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.member_studio_stats(p_club uuid, p_profile uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not public.is_club_member(p_club) then null else jsonb_build_object(
    'showdown_wins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cycle_number', c.number, 'title', ss.title, 'artist', ss.artist, 'theme', sd.theme_text
      ) order by c.number)
      from showdowns sd
      join cycles c on c.id = sd.cycle_id
      join showdown_submissions ss on ss.id = sd.winner_submission_id
      where sd.club_id = p_club and ss.profile_id = p_profile
    ), '[]'::jsonb),
    'aux_wins', coalesce((
      select jsonb_agg(jsonb_build_object('cycle_number', c.number, 'theme', ab.theme_text) order by c.number)
      from aux_battles ab
      join cycles c on c.id = ab.cycle_id
      where ab.club_id = p_club and ab.winner_profile_id = p_profile
    ), '[]'::jsonb),
    'bingo_crowns', coalesce((
      select jsonb_agg(jsonb_build_object('at', fc.resolved_at) order by fc.resolved_at)
      from (
        select distinct on (k.game_id) k.game_id, k.profile_id, cl.resolved_at
        from bingo_claims cl
        join bingo_cards k on k.id = cl.card_id
        join bingo_games g on g.id = k.game_id
        where g.club_id = p_club and cl.status = 'verified'
        order by k.game_id, cl.resolved_at asc
      ) fc
      where fc.profile_id = p_profile
    ), '[]'::jsonb),
    'blackouts', coalesce((
      select jsonb_agg(jsonb_build_object('at', bo.done_at) order by bo.done_at)
      from (
        select k.id, max(b.activated_at) as done_at
        from bingo_cards k
        join bingo_games g on g.id = k.game_id
        join bingo_boxes b on b.card_id = k.id
        where g.club_id = p_club and k.profile_id = p_profile and b.activated_at is not null
        group by k.id
        having count(*) = 24
      ) bo
    ), '[]'::jsonb),
    'champions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bracket_id', br.id, 'artist_name', br.artist_name, 'size', br.size,
        'closed_at', br.closed_at, 'champ_title', t.title,
        'champ_artwork_url', t.artwork_url, 'champ_seed', t.seed,
        'scope', br.scope, 'kind', br.kind, 'theme_art', br.theme_art
      ) order by e.completed_at desc)
      from bracket_entries e
      join brackets br on br.id = e.bracket_id
      join bracket_tracks t on t.id = e.champion_track_id
      where br.club_id = p_club and e.profile_id = p_profile and e.completed_at is not null
        and (br.scope = 'club' or br.status = 'closed')
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'brackets_finished', (
        select count(*) from bracket_entries e join brackets br on br.id = e.bracket_id
        where br.club_id = p_club and e.profile_id = p_profile and e.completed_at is not null
          and br.scope = 'club'
      ),
      'takes', (select count(*) from musical_takes where club_id = p_club and author_id = p_profile),
      'bars', (select count(*) from best_bars where club_id = p_club and author_id = p_profile),
      'boxes_lit', (
        select count(*) from bingo_boxes b
        join bingo_cards k on k.id = b.card_id
        join bingo_games g on g.id = k.game_id
        where g.club_id = p_club and k.profile_id = p_profile and b.activated_at is not null
      ),
      'bingos', (
        select count(*) from bingo_claims cl
        join bingo_cards k on k.id = cl.card_id
        join bingo_games g on g.id = k.game_id
        where g.club_id = p_club and k.profile_id = p_profile and cl.status = 'verified'
      ),
      'conversions', (
        select count(*) from convince_targets t
        join convince_posts cp on cp.id = t.post_id
        where cp.club_id = p_club and cp.author_id = p_profile and t.verdict = 'converted'
      )
    )
  ) end;
$function$
;

CREATE OR REPLACE FUNCTION public.my_announcement_quota(p_club uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_used int;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  select count(*) into v_used
  from activity_events
  where club_id = p_club
    and event_type = 'club_announcement'
    and created_at >= now() - interval '24 hours';
  return json_build_object('limit', 3, 'used', v_used);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.my_song_quota(p_club uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_limit int;
  v_cycle_start timestamptz;
  v_used int := 0;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;

  select song_limit_per_cycle into v_limit from clubs where id = p_club;

  select created_at into v_cycle_start
  from cycles
  where club_id = p_club and status = 'open'
  limit 1;

  if v_cycle_start is not null then
    select count(*) into v_used
    from feed_posts
    where club_id = p_club
      and author_id = auth.uid()
      and kind = 'track'
      and created_at >= v_cycle_start;
  end if;

  return json_build_object(
    'limit', v_limit,
    'used', v_used,
    'has_open_cycle', v_cycle_start is not null
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.my_unread_counts()
 RETURNS TABLE(club_id uuid, unread integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.club_id, count(*)::integer as unread
  from activity_events e
  join club_members m
    on m.club_id = e.club_id and m.profile_id = auth.uid()
  left join activity_reads r
    on r.club_id = e.club_id and r.profile_id = auth.uid()
  where (e.recipient_id is null or e.recipient_id = auth.uid())
    and e.actor_id is distinct from auth.uid()
    and e.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
  group by e.club_id;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_comment_mentions(p_club uuid, p_recipients uuid[], p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
  select p_club, auth.uid(), r, 'comment_mention', coalesce(p_payload, '{}'::jsonb)
  from unnest(p_recipients) as r
  where r <> auth.uid()
    and exists (
      select 1 from club_members m
      where m.club_id = p_club and m.profile_id = r
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_send_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_url text;
  v_secret text;
begin
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'send_push_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'send_push_secret';
    if v_url is null or v_secret is null then
      return new;  -- push not configured → no-op
    end if;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('event_id', new.id)
    );
  exception when others then
    -- swallow: never let push delivery break the inserting transaction
    null;
  end;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.participation_gaps(p_cycle uuid, p_member uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with unrated as (
    select count(*)::int as n
    from albums a
    where a.cycle_id = p_cycle
      and not exists (
        select 1 from ratings r where r.album_id = a.id and r.profile_id = p_member
      )
  ),
  sd as (select id from showdowns where cycle_id = p_cycle),
  needs_sub as (
    select exists (select 1 from sd)
       and not exists (
         select 1 from showdown_submissions s
         join sd on sd.id = s.showdown_id
         where s.profile_id = p_member
       ) as v
  ),
  needs_vote as (
    select exists (select 1 from sd)
       and exists (
         select 1 from showdown_submissions s
         join sd on sd.id = s.showdown_id
         where s.profile_id <> p_member
       )
       and not exists (
         select 1 from showdown_votes v
         join showdown_submissions s on s.id = v.submission_id
         join sd on sd.id = s.showdown_id
         where v.profile_id = p_member
       ) as v
  )
  select case
    when (select n from unrated) = 0
      and not (select v from needs_sub)
      and not (select v from needs_vote)
    then null
    else jsonb_build_object(
      'unrated', (select n from unrated),
      'needs_submission', (select v from needs_sub),
      'needs_votes', (select v from needs_vote)
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.post_announcement(p_club uuid, p_title text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := btrim(coalesce(p_body, ''));
  v_recent int;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Only owners and admins can post announcements';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'Announcement message cannot be empty';
  end if;
  if char_length(v_body) > 500 then
    raise exception 'Announcement message is too long (max 500 characters)';
  end if;
  if v_title is not null and char_length(v_title) > 80 then
    raise exception 'Announcement title is too long (max 80 characters)';
  end if;

  select count(*) into v_recent
  from activity_events
  where club_id = p_club
    and event_type = 'club_announcement'
    and created_at >= now() - interval '24 hours';
  if v_recent >= 3 then
    raise exception 'This club has hit its limit of 3 announcements per day.'
      using errcode = 'check_violation';
  end if;

  perform public.publish_activity_event(
    p_club, 'club_announcement',
    jsonb_build_object('title', v_title, 'body', v_body)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.publish_activity_event(p_club uuid, p_type text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into activity_events (club_id, actor_id, event_type, payload)
  values (p_club, auth.uid(), p_type, coalesce(p_payload, '{}'::jsonb));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_perfect_playlist_song(p_song uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_club uuid;
  v_status text;
begin
  select s.profile_id, c.club_id, c.status into v_owner, v_club, v_status
  from perfect_playlist_songs s
  join perfect_playlists pp on pp.id = s.playlist_id
  join cycles c on c.id = pp.cycle_id
  where s.id = p_song;
  if not found then
    return;
  end if;
  if v_status <> 'open' then
    raise exception 'The playlist is closed';
  end if;
  if v_owner <> auth.uid() and public.club_role(v_club) not in ('owner', 'admin') then
    raise exception 'You can only remove your own songs';
  end if;
  delete from perfect_playlist_songs where id = p_song;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_apple_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.request_bingo_card(p_game uuid)
 RETURNS bingo_cards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game public.bingo_games;
  v_card public.bingo_cards;
  v_count int;
begin
  select * into v_game from bingo_games where id = p_game;
  if not found then
    raise exception 'Game not found';
  end if;
  if not public.is_club_member(v_game.club_id) then
    raise exception 'Not a club member';
  end if;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;

  select count(*) into v_count from bingo_cards
  where game_id = p_game and profile_id = auth.uid();
  if v_count = 0 then
    raise exception 'Open the room to get your first card';
  end if;
  if v_count >= 3 then
    raise exception 'Three cards is the cycle limit — see you next cycle';
  end if;

  select * into v_card from bingo_cards
  where game_id = p_game and profile_id = auth.uid()
  order by card_number desc limit 1;
  if (select count(*) from bingo_boxes b where b.card_id = v_card.id and b.activated_at is not null) < 24 then
    raise exception 'Light every box on your current card first';
  end if;

  return public.bingo_deal_internal(p_game, v_count + 1);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_aux_battle(p_cycle uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle public.cycles;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'The cycle is closed';
  end if;
  if v_cycle.picker_id <> auth.uid()
     and public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Only the picker or an admin can reset the bracket';
  end if;

  update aux_battle_theme_ideas set used_cycle_id = null where used_cycle_id = p_cycle;
  delete from aux_battles where cycle_id = p_cycle;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_bingo_claim(p_claim uuid, p_approve boolean, p_challenges jsonb DEFAULT '[]'::jsonb)
 RETURNS bingo_claims
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_claim public.bingo_claims;
  v_card public.bingo_cards;
  v_game public.bingo_games;
  v_line int[];
  ch jsonb;
  v_pos int;
  v_rank int;
  v_claimer text;
  v_verified int;
  v_next smallint;
begin
  select * into v_claim from bingo_claims where id = p_claim;
  if not found then
    raise exception 'Claim not found';
  end if;
  select * into v_card from bingo_cards where id = v_claim.card_id;
  select * into v_game from bingo_games where id = v_card.game_id;
  if not public.is_club_member(v_game.club_id) then
    raise exception 'Not a club member';
  end if;
  if v_card.profile_id = auth.uid() then
    raise exception 'You cannot clear your own bingo — that is the whole point';
  end if;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'That claim is already resolved';
  end if;

  if p_approve then
    update bingo_claims
    set status = 'verified', resolved_by = auth.uid(), resolved_at = now()
    where id = p_claim
    returning * into v_claim;

    select count(*) into v_rank
    from bingo_claims c
    join bingo_cards k on k.id = c.card_id
    where k.game_id = v_game.id and c.status = 'verified';

    select display_name into v_claimer from profiles where id = v_card.profile_id;
    perform public.publish_activity_event(
      v_game.club_id, 'bingo_verified',
      jsonb_build_object('game_id', v_game.id, 'claimer_name', v_claimer, 'rank', v_rank)
    );

    select count(*) into v_verified
    from bingo_claims
    where card_id = v_card.id and status = 'verified'
      and line_index = any (v_card.qualifying_lines);
    if v_verified >= array_length(v_card.qualifying_lines, 1)
       and array_length(v_card.qualifying_lines, 1) < 12 then
      select l::smallint into v_next
      from generate_series(0, 11) as l
      where not (l::smallint = any (v_card.qualifying_lines))
        and exists (
          select 1 from unnest(public.bingo_line_positions(l)) as pos
          where pos <> 12
            and not exists (
              select 1 from bingo_boxes b
              where b.card_id = v_card.id and b.position = pos and b.activated_at is not null
            )
        )
      order by random()
      limit 1;
      if v_next is not null then
        update bingo_cards
        set qualifying_lines = qualifying_lines || v_next
        where id = v_card.id;
      end if;
    end if;

    return v_claim;
  end if;

  if jsonb_typeof(p_challenges) <> 'array' or jsonb_array_length(p_challenges) = 0 then
    raise exception 'Say which box fails and why';
  end if;
  v_line := public.bingo_line_positions(v_claim.line_index);
  for ch in select * from jsonb_array_elements(p_challenges) loop
    v_pos := (ch ->> 'position')::int;
    if v_pos is null or not (v_pos = any (v_line)) or v_pos = 12 then
      raise exception 'Challenged box % is not on the claimed line', v_pos;
    end if;
    if char_length(trim(coalesce(ch ->> 'reason', ''))) = 0 then
      raise exception 'Every challenge needs a reason';
    end if;
    insert into bingo_challenges (claim_id, position, challenger_id, reason)
    values (p_claim, v_pos, auth.uid(), trim(ch ->> 'reason'));
    update bingo_boxes
    set activated_at = null, listen_started_at = null
    where card_id = v_card.id and position = v_pos;
  end loop;

  update bingo_claims
  set status = 'rejected', resolved_by = auth.uid(), resolved_at = now()
  where id = p_claim
  returning * into v_claim;

  return v_claim;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_cycle(p_cycle uuid)
 RETURNS cycles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle public.cycles;
  v_was timestamptz;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  v_was := v_cycle.revealed_at;
  update cycles set revealed_at = coalesce(revealed_at, now())
  where id = p_cycle
  returning * into v_cycle;

  if v_was is null then
    perform public.publish_activity_event(
      v_cycle.club_id, 'ratings_revealed',
      jsonb_build_object('cycle_number', v_cycle.number)
    );
  end if;
  return v_cycle;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rotate_invite_code(p_club uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  update clubs set invite_code = public.generate_invite_code()
  where id = p_club
  returning invite_code into v_code;
  return v_code;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_bracket_pick(p_bracket uuid, p_round integer, p_slot integer, p_winner uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bracket public.brackets;
  v_rounds int;
  v_old uuid;
  r int;
begin
  select * into v_bracket from brackets where id = p_bracket;
  if not found then
    raise exception 'Bracket not found';
  end if;
  if not public.is_club_member(v_bracket.club_id) then
    raise exception 'Not a club member';
  end if;
  if v_bracket.scope = 'personal' and v_bracket.owner_id <> auth.uid() then
    raise exception 'This is a solo bracket';
  end if;
  if v_bracket.status <> 'open' then
    raise exception 'The bracket is closed';
  end if;
  if exists (
    select 1 from bracket_entries
    where bracket_id = p_bracket and profile_id = auth.uid() and completed_at is not null
  ) then
    raise exception 'Your bracket is locked — you already crowned a champion';
  end if;

  v_rounds := floor(log(2, v_bracket.size))::int;
  if p_round < 1 or p_round > v_rounds
     or p_slot < 1 or p_slot > v_bracket.size / (2 ^ p_round)::int then
    raise exception 'Invalid matchup';
  end if;

  if p_round = 1 then
    if not exists (
      select 1 from bracket_tracks
      where bracket_id = p_bracket and id = p_winner and position in (2 * p_slot - 1, 2 * p_slot)
    ) then
      raise exception 'That song is not in this matchup';
    end if;
  else
    if not exists (
      select 1 from bracket_picks
      where bracket_id = p_bracket and profile_id = auth.uid()
        and round = p_round - 1 and slot in (2 * p_slot - 1, 2 * p_slot)
        and winner_track_id = p_winner
    ) then
      raise exception 'That song is not in this matchup';
    end if;
  end if;

  insert into bracket_entries (bracket_id, profile_id)
  values (p_bracket, auth.uid())
  on conflict (bracket_id, profile_id) do nothing;

  select winner_track_id into v_old
  from bracket_picks
  where bracket_id = p_bracket and profile_id = auth.uid() and round = p_round and slot = p_slot;

  insert into bracket_picks (bracket_id, profile_id, round, slot, winner_track_id)
  values (p_bracket, auth.uid(), p_round, p_slot, p_winner)
  on conflict (bracket_id, profile_id, round, slot) do update set winner_track_id = excluded.winner_track_id;

  if v_old is not null and v_old <> p_winner then
    for r in (p_round + 1)..v_rounds loop
      delete from bracket_picks
      where bracket_id = p_bracket and profile_id = auth.uid()
        and round = r
        and slot = ((p_slot - 1) / (2 ^ (r - p_round))::int) + 1
        and winner_track_id = v_old;
    end loop;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_meeting_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record;
begin
  -- 72-hours-out: participation nudges to members with open gaps.
  for c in
    select id, club_id, number from cycles
    where status = 'open' and revealed_at is null and meeting_at is not null
      and meeting_at > now() and meeting_at <= now() + interval '72 hours'
      and participation_nudge_72h_sent_at is null
  loop
    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select c.club_id, null, m.profile_id, 'participation_nudge',
           public.participation_gaps(c.id, m.profile_id)
             || jsonb_build_object('cycle_number', c.number, 'window', '72h')
    from club_members m
    where m.club_id = c.club_id
      and not exists (
        select 1 from rsvps r
        where r.cycle_id = c.id and r.profile_id = m.profile_id and r.status = 'no'
      )
      and public.participation_gaps(c.id, m.profile_id) is not null;
    update cycles set participation_nudge_72h_sent_at = now() where id = c.id;
  end loop;

  -- 24-hours-out: gap members get the nudge; everyone else gets the generic ping.
  for c in
    select id, club_id, number from cycles
    where status = 'open' and revealed_at is null and meeting_at is not null
      and meeting_at > now() and meeting_at <= now() + interval '24 hours'
      and meeting_reminder_24h_sent_at is null
  loop
    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select c.club_id, null, m.profile_id, 'participation_nudge',
           public.participation_gaps(c.id, m.profile_id)
             || jsonb_build_object('cycle_number', c.number, 'window', '24h')
    from club_members m
    where m.club_id = c.club_id
      and not exists (
        select 1 from rsvps r
        where r.cycle_id = c.id and r.profile_id = m.profile_id and r.status = 'no'
      )
      and public.participation_gaps(c.id, m.profile_id) is not null;

    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select c.club_id, null, m.profile_id, 'meeting_reminder',
           jsonb_build_object('cycle_number', c.number, 'window', '24h')
    from club_members m
    where m.club_id = c.club_id
      and not exists (
        select 1 from rsvps r
        where r.cycle_id = c.id and r.profile_id = m.profile_id and r.status = 'no'
      )
      and public.participation_gaps(c.id, m.profile_id) is null;

    update cycles set meeting_reminder_24h_sent_at = now() where id = c.id;
  end loop;

  -- 1-hour-out: simple "meeting soon" ping to everyone not RSVP'd 'no'.
  for c in
    select id, club_id, number from cycles
    where status = 'open' and revealed_at is null and meeting_at is not null
      and meeting_at > now() and meeting_at <= now() + interval '1 hour'
      and meeting_reminder_1h_sent_at is null
  loop
    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select c.club_id, null, m.profile_id, 'meeting_reminder',
           jsonb_build_object('cycle_number', c.number, 'window', '1h')
    from club_members m
    where m.club_id = c.club_id
      and not exists (
        select 1 from rsvps r
        where r.cycle_id = c.id and r.profile_id = m.profile_id and r.status = 'no'
      );
    update cycles set meeting_reminder_1h_sent_at = now() where id = c.id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_bingo_playcount(p_box uuid, p_playcount bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  select k.profile_id into v_owner
  from bingo_boxes b join bingo_cards k on k.id = b.card_id
  where b.id = p_box;
  if not found then
    raise exception 'Box not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Not your card';
  end if;
  update bingo_boxes set lastfm_playcount = p_playcount where id = p_box;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_bingo_song(p_box uuid, p_title text, p_artist text, p_artwork_url text DEFAULT NULL::text, p_spotify_url text DEFAULT NULL::text, p_apple_url text DEFAULT NULL::text, p_spotify_id text DEFAULT NULL::text, p_duration_ms integer DEFAULT NULL::integer, p_lastfm_playcount bigint DEFAULT NULL::bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_box public.bingo_boxes;
  v_card public.bingo_cards;
  v_game public.bingo_games;
begin
  select * into v_box from bingo_boxes where id = p_box;
  if not found then
    raise exception 'Box not found';
  end if;
  select * into v_card from bingo_cards where id = v_box.card_id;
  if v_card.profile_id <> auth.uid() then
    raise exception 'Not your card';
  end if;
  select * into v_game from bingo_games where id = v_card.game_id;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;
  if public.bingo_box_locked(v_card.id, v_box.position) then
    raise exception 'That box is part of a claimed line';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'A song needs a title';
  end if;
  if exists (
    select 1 from bingo_boxes b
    where b.card_id = v_card.id and b.id <> p_box and b.title is not null
      and (
        (b.spotify_id is not null and p_spotify_id is not null and b.spotify_id = p_spotify_id)
        or (lower(trim(b.title)) = lower(trim(p_title)) and lower(trim(b.artist)) = lower(trim(coalesce(p_artist, ''))))
      )
  ) then
    raise exception 'That song is already on your card — one song per box';
  end if;

  update bingo_boxes
  set title = trim(p_title),
      artist = trim(coalesce(p_artist, '')),
      artwork_url = nullif(p_artwork_url, ''),
      spotify_url = nullif(p_spotify_url, ''),
      apple_url = nullif(p_apple_url, ''),
      spotify_id = nullif(p_spotify_id, ''),
      duration_ms = p_duration_ms,
      lastfm_playcount = p_lastfm_playcount,
      listen_started_at = null,
      activated_at = null
  where id = p_box;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_club_mute(p_club uuid, p_muted boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  update club_members
    set notifications_muted = coalesce(p_muted, false)
  where club_id = p_club and profile_id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_concert_review(p_concert uuid, p_rating integer, p_review text, p_mark_complete boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_root uuid;
  v_club uuid;
  v_count integer;
begin
  select coalesce(origin_concert_id, id), club_id
  into v_root, v_club
  from concerts where id = p_concert;
  if not found then
    raise exception 'Concert not found';
  end if;

  -- Caller must be able to manage the source concert (adder or admin), same as
  -- the concerts_update policy.
  if not (
    exists (select 1 from concerts c where c.id = p_concert and c.added_by = auth.uid())
    or public.club_role(v_club) in ('owner', 'admin')
  ) then
    raise exception 'Not allowed to review this concert';
  end if;

  update concerts set
    rating = p_rating,
    review = p_review,
    -- Marking complete sets the timestamp once; edits preserve the original.
    completed_at = case when p_mark_complete then coalesce(completed_at, now()) else completed_at end,
    updated_at = now()
  where (id = v_root or origin_concert_id = v_root)
    and (added_by = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_convince_verdict(p_post uuid, p_verdict text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_verdict is not null and p_verdict not in ('converted', 'not_for_me') then
    raise exception 'Invalid verdict';
  end if;
  update convince_targets
  set verdict = p_verdict
  where post_id = p_post and profile_id = auth.uid();
  if not found then
    raise exception 'You are not a target of this rec';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_showdown_theme(p_cycle uuid, p_text text, p_idea_id uuid DEFAULT NULL::uuid)
 RETURNS showdowns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle public.cycles;
  v_showdown public.showdowns;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'The cycle is closed';
  end if;
  if v_cycle.picker_id <> auth.uid()
     and public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Only the picker or an admin can set the theme';
  end if;
  if char_length(trim(coalesce(p_text, ''))) = 0 then
    raise exception 'Theme cannot be empty';
  end if;

  insert into showdowns (cycle_id, club_id, theme_text, theme_idea_id, created_by)
  values (p_cycle, v_cycle.club_id, trim(p_text), p_idea_id, auth.uid())
  on conflict (cycle_id) do update
    set theme_text = excluded.theme_text,
        theme_idea_id = excluded.theme_idea_id
  returning * into v_showdown;

  if p_idea_id is not null then
    update showdown_theme_ideas set used_cycle_id = p_cycle where id = p_idea_id;
  end if;

  perform public.publish_activity_event(
    v_cycle.club_id, 'showdown_started',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', p_cycle, 'theme', v_showdown.theme_text)
  );

  return v_showdown;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.showdown_norm(p_title text, p_artist text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select regexp_replace(
    lower(trim(coalesce(p_title, '')) || '|' || trim(coalesce(p_artist, ''))),
    '[^a-z0-9|]+', '', 'g'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.spin_aux_theme(p_club uuid)
 RETURNS aux_battle_theme_ideas
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_idea public.aux_battle_theme_ideas;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  select * into v_idea
  from aux_battle_theme_ideas
  where used_cycle_id is null and (club_id is null or club_id = p_club)
  order by random()
  limit 1;
  if not found then
    raise exception 'No theme ideas left to spin';
  end if;
  return v_idea;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.spin_showdown_theme(p_club uuid)
 RETURNS showdown_theme_ideas
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_idea public.showdown_theme_ideas;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  select * into v_idea
  from showdown_theme_ideas
  where used_cycle_id is null
    and (club_id is null or club_id = p_club)
  order by random()
  limit 1;
  if not found then
    raise exception 'No theme ideas left to spin';
  end if;
  return v_idea;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.spin_wheel(p_club uuid)
 RETURNS cycles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_picker uuid;
  v_cycle public.cycles;
  v_name text;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  if exists (select 1 from cycles where club_id = p_club and status = 'open') then
    raise exception 'A cycle is already open';
  end if;

  select pool into v_picker
  from public.wheel_pool(p_club) as pool
  order by random()
  limit 1;
  if v_picker is null then
    raise exception 'No eligible members to pick from';
  end if;

  insert into cycles (club_id, number, picker_id, status, start_date)
  values (
    p_club,
    (select coalesce(max(number), 0) + 1 from cycles where club_id = p_club),
    v_picker,
    'open',
    current_date
  )
  returning * into v_cycle;

  select display_name into v_name from profiles where id = v_picker;
  perform public.publish_activity_event(
    p_club, 'wheel_spun',
    jsonb_build_object('cycle_number', v_cycle.number, 'picker_id', v_picker, 'picker_name', v_name)
  );

  -- Targeted nudge to the winner (skipped for them in the broadcast push by the
  -- actor-exclusion, surfaced here as a personal "you're up").
  insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
  values (
    p_club, auth.uid(), v_picker, 'you_are_picker',
    jsonb_build_object('cycle_number', v_cycle.number)
  );

  return v_cycle;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.spotify_acquire(p_calls integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_state public.spotify_api_state;
  v_cap constant int := 200;
begin
  select * into v_state from spotify_api_state where id for update;
  if v_state.benched_until is not null and v_state.benched_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'benched', 'until', v_state.benched_until);
  end if;
  if v_state.window_start < now() - interval '1 hour' then
    update spotify_api_state set window_start = now(), window_calls = 0 where id;
    v_state.window_calls := 0;
    v_state.window_start := now();
  end if;
  if v_state.window_calls + p_calls > v_cap then
    return jsonb_build_object(
      'ok', false, 'reason', 'budget',
      'until', v_state.window_start + interval '1 hour'
    );
  end if;
  update spotify_api_state set window_calls = window_calls + p_calls where id;
  return jsonb_build_object('ok', true, 'remaining', v_cap - v_state.window_calls - p_calls);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.spotify_album_id_from_url(p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (regexp_match(p_url, 'album/([A-Za-z0-9]+)'))[1];
$function$
;

CREATE OR REPLACE FUNCTION public.spotify_bench(p_seconds integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update spotify_api_state
  set benched_until = greatest(
    coalesce(benched_until, now()),
    now() + make_interval(secs => least(greatest(p_seconds, 0), 86400))
  )
  where id;
$function$
;

CREATE OR REPLACE FUNCTION public.spotify_cache_get(p_keys text[])
 RETURNS SETOF spotify_track_cache
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from spotify_track_cache where key = any(p_keys);
$function$
;

CREATE OR REPLACE FUNCTION public.spotify_cache_put(p_rows jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into spotify_track_cache (key, miss, spotify_id, title, album, artwork_url, spotify_url)
  select
    r ->> 'key',
    coalesce((r ->> 'miss')::boolean, false),
    coalesce(r ->> 'spotify_id', ''),
    coalesce(r ->> 'title', ''),
    coalesce(r ->> 'album', ''),
    nullif(r ->> 'artwork_url', ''),
    nullif(r ->> 'spotify_url', '')
  from jsonb_array_elements(p_rows) as r
  where coalesce(r ->> 'key', '') <> ''
  on conflict (key) do update set
    miss = excluded.miss,
    spotify_id = excluded.spotify_id,
    title = excluded.title,
    album = excluded.album,
    artwork_url = excluded.artwork_url,
    spotify_url = excluded.spotify_url,
    resolved_at = now();
$function$
;

CREATE OR REPLACE FUNCTION public.start_aux_battle(p_cycle uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle public.cycles;
  v_members uuid[];
  v_n integer;
  v_pairs integer;
  v_idea_ids uuid[];
  v_idea_texts text[];
  v_all_texts text[];
  v_a uuid;
  v_b uuid;
  v_theme text;
  v_idea_id uuid;
  i integer;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'The cycle is closed';
  end if;
  if v_cycle.picker_id <> auth.uid()
     and public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Only the picker or an admin can start the Aux Battle';
  end if;
  if exists (select 1 from aux_battles where cycle_id = p_cycle) then
    raise exception 'The Aux Battle bracket has already been set';
  end if;

  -- Shuffle the whole roster.
  select array(select cm.profile_id from club_members cm where cm.club_id = v_cycle.club_id order by random())
    into v_members;
  v_n := coalesce(array_length(v_members, 1), 0);
  if v_n < 2 then
    raise exception 'Need at least 2 members for an Aux Battle';
  end if;
  v_pairs := v_n / 2; -- integer division; an odd member out gets a bye

  -- Distinct unused themes (club + global), shuffled.
  select array_agg(id order by rnd), array_agg(text order by rnd)
    into v_idea_ids, v_idea_texts
  from (
    select id, text, random() as rnd
    from aux_battle_theme_ideas
    where used_cycle_id is null and (club_id is null or club_id = v_cycle.club_id)
  ) q;

  -- Full pool of theme texts, for reuse once the unused set runs out.
  select array_agg(text) into v_all_texts
  from aux_battle_theme_ideas where club_id is null or club_id = v_cycle.club_id;
  if coalesce(array_length(v_all_texts, 1), 0) = 0 then
    v_all_texts := array['Best song'];
  end if;

  for i in 1..v_pairs loop
    v_a := v_members[2 * i - 1];
    v_b := v_members[2 * i];
    if i <= coalesce(array_length(v_idea_ids, 1), 0) then
      v_theme := v_idea_texts[i];
      v_idea_id := v_idea_ids[i];
    else
      v_theme := v_all_texts[1 + floor(random() * array_length(v_all_texts, 1))::int];
      v_idea_id := null;
    end if;

    insert into aux_battles (cycle_id, club_id, theme_text, theme_idea_id, member_a, member_b, created_by)
    values (p_cycle, v_cycle.club_id, v_theme, v_idea_id, v_a, v_b, auth.uid());

    if v_idea_id is not null then
      update aux_battle_theme_ideas set used_cycle_id = p_cycle where id = v_idea_id;
    end if;

    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select v_cycle.club_id, auth.uid(), m, 'aux_battle_picked',
      jsonb_build_object('cycle_number', v_cycle.number, 'theme', v_theme)
    from unnest(array[v_a, v_b]) as m;
  end loop;

  perform public.publish_activity_event(
    v_cycle.club_id, 'aux_battle_started',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', p_cycle, 'pairs', v_pairs)
  );

  return v_pairs;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_bingo_listen(p_box uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_box public.bingo_boxes;
  v_card public.bingo_cards;
  v_game public.bingo_games;
  v_listening int;
begin
  select * into v_box from bingo_boxes where id = p_box;
  if not found then
    raise exception 'Box not found';
  end if;
  select * into v_card from bingo_cards where id = v_box.card_id;
  if v_card.profile_id <> auth.uid() then
    raise exception 'Not your card';
  end if;
  select * into v_game from bingo_games where id = v_card.game_id;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;
  if v_box.title is null then
    raise exception 'Pick a song first';
  end if;
  if v_box.activated_at is not null then
    return; -- already lit
  end if;

  -- Re-tapping the same box just restarts its own timer; only OTHER boxes
  -- count against the cap.
  select count(*) into v_listening
  from bingo_boxes
  where card_id = v_card.id and id <> p_box
    and listen_started_at is not null and activated_at is null;
  if v_listening >= 3 then
    raise exception 'You already have 3 songs in the listening state — mark one listened first';
  end if;

  update bingo_boxes set listen_started_at = now() where id = p_box;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_perfect_playlist(p_cycle uuid, p_theme text, p_title text, p_artist text DEFAULT ''::text, p_artwork_url text DEFAULT NULL::text, p_spotify_url text DEFAULT NULL::text, p_apple_url text DEFAULT NULL::text)
 RETURNS perfect_playlists
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle public.cycles;
  v_playlist public.perfect_playlists;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'The cycle is closed';
  end if;
  if v_cycle.picker_id <> auth.uid()
     and public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Only the picker or an admin can start the playlist';
  end if;
  if char_length(trim(coalesce(p_theme, ''))) = 0 then
    raise exception 'Theme cannot be empty';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'A seed song is required';
  end if;
  if exists (select 1 from perfect_playlists where cycle_id = p_cycle) then
    raise exception 'The playlist has already been started';
  end if;

  insert into perfect_playlists (cycle_id, club_id, theme_text, created_by)
  values (p_cycle, v_cycle.club_id, trim(p_theme), auth.uid())
  returning * into v_playlist;

  insert into perfect_playlist_songs
    (playlist_id, profile_id, title, artist, artwork_url, spotify_url, apple_url, norm_key)
  values
    (v_playlist.id, auth.uid(), trim(p_title), coalesce(p_artist, ''),
     p_artwork_url, p_spotify_url, p_apple_url, public.showdown_norm(p_title, p_artist));

  perform public.publish_activity_event(
    v_cycle.club_id, 'perfect_playlist_started',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', p_cycle, 'theme', v_playlist.theme_text)
  );

  return v_playlist;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.streaming_disconnect(p_club uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.club_role(p_club) <> 'owner' then
    raise exception 'Only the owner can disconnect streaming';
  end if;
  delete from streaming_connections where club_id = p_club;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.streaming_status(p_club uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row streaming_connections;
  v_can_connect boolean;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;

  v_can_connect := public.club_role(p_club) = 'owner'
    and coalesce(
      (select can_use_personal_spotify from profiles where id = auth.uid()),
      false
    );

  select * into v_row from streaming_connections where club_id = p_club;
  if not found then
    -- No personal connection. can_connect true → owner may connect; false →
    -- the club is served automatically by the shared app account.
    return json_build_object('connected', false, 'can_connect', v_can_connect);
  end if;
  return json_build_object(
    'connected', true,
    'provider', v_row.provider,
    'display_name', v_row.display_name,
    'spotify_user_id', v_row.spotify_user_id,
    'status', v_row.status,
    'connected_by', v_row.connected_by,
    'can_connect', v_can_connect
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_aux_song(p_battle uuid, p_title text, p_artist text DEFAULT ''::text, p_artwork_url text DEFAULT NULL::text, p_spotify_url text DEFAULT NULL::text, p_apple_url text DEFAULT NULL::text)
 RETURNS aux_battle_songs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_battle public.aux_battles;
  v_status text;
  v_row public.aux_battle_songs;
begin
  select * into v_battle from aux_battles where id = p_battle;
  if not found then
    raise exception 'Battle not found';
  end if;
  if auth.uid() <> v_battle.member_a and auth.uid() <> v_battle.member_b then
    raise exception 'Only the two combatants can submit a song';
  end if;
  select status into v_status from cycles where id = v_battle.cycle_id;
  if v_status <> 'open' then
    raise exception 'The battle is closed';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'A song title is required';
  end if;
  -- Once both combatants have a song in, submissions are locked (this includes
  -- changing your own). The second submitter still gets through: only one row
  -- exists at that point.
  if (select count(*) from aux_battle_songs where battle_id = p_battle) >= 2 then
    raise exception 'Both songs are locked in — no more changes.';
  end if;

  insert into aux_battle_songs (battle_id, profile_id, title, artist, artwork_url, spotify_url, apple_url)
  values (p_battle, auth.uid(), trim(p_title), coalesce(p_artist, ''), p_artwork_url, p_spotify_url, p_apple_url)
  on conflict (battle_id, profile_id) do update
    set title = excluded.title, artist = excluded.artist, artwork_url = excluded.artwork_url,
        spotify_url = excluded.spotify_url, apple_url = excluded.apple_url
  returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_showdown_song(p_showdown uuid, p_title text, p_artist text, p_artwork_url text DEFAULT NULL::text, p_spotify_url text DEFAULT NULL::text, p_apple_url text DEFAULT NULL::text)
 RETURNS showdown_submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club uuid;
  v_status text;
  v_norm text;
  v_existing_id uuid;
  v_votes integer;
  v_row public.showdown_submissions;
begin
  select c.club_id, c.status into v_club, v_status
  from showdowns sd join cycles c on c.id = sd.cycle_id
  where sd.id = p_showdown;
  if not found then
    raise exception 'Showdown not found';
  end if;
  if not public.is_club_member(v_club) then
    raise exception 'Not a club member';
  end if;
  if v_status <> 'open' then
    raise exception 'Submissions are closed';
  end if;

  v_norm := public.showdown_norm(p_title, p_artist);

  -- Duplicate held by someone else? Friendly rejection (leaks that the song is
  -- taken, not who took it — accepted tradeoff for the no-duplicates rule).
  if exists (
    select 1 from showdown_submissions s
    where s.showdown_id = p_showdown and s.norm_key = v_norm and s.profile_id <> auth.uid()
  ) then
    raise exception 'That song is already in the running — pick another.';
  end if;

  select s.id, (select count(*) from showdown_votes v where v.submission_id = s.id)
    into v_existing_id, v_votes
  from showdown_submissions s
  where s.showdown_id = p_showdown and s.profile_id = auth.uid();

  if v_existing_id is not null then
    if v_votes > 0 then
      raise exception 'Your song is locked in — it already has votes.';
    end if;
    update showdown_submissions
    set title = trim(p_title), artist = coalesce(p_artist, ''),
        artwork_url = p_artwork_url, spotify_url = p_spotify_url, apple_url = p_apple_url,
        norm_key = v_norm
    where id = v_existing_id
    returning * into v_row;
  else
    insert into showdown_submissions
      (showdown_id, profile_id, title, artist, artwork_url, spotify_url, apple_url, norm_key)
    values
      (p_showdown, auth.uid(), trim(p_title), coalesce(p_artist, ''), p_artwork_url, p_spotify_url, p_apple_url, v_norm)
    returning * into v_row;
  end if;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_profile_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.wheel_pool(p_club uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_excl integer;
begin
  if not public.is_club_member(p_club) then
    raise exception 'Not a club member';
  end if;
  foreach v_excl in array array[3, 1, 0] loop
    return query
      select cm.profile_id
      from club_members cm
      where cm.club_id = p_club
        and cm.profile_id not in (
          select c.picker_id from cycles c
          where c.club_id = p_club
          order by c.number desc
          limit v_excl
        );
    if found then
      return;
    end if;
  end loop;
end;
$function$
;


-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER activity_events_push AFTER INSERT ON public.activity_events FOR EACH ROW EXECUTE FUNCTION notify_send_push();

CREATE TRIGGER album_impressions_lock_initial BEFORE UPDATE ON public.album_impressions FOR EACH ROW EXECUTE FUNCTION lock_initial_score();

CREATE TRIGGER albums_apple_match AFTER INSERT ON public.albums FOR EACH ROW EXECUTE FUNCTION request_apple_match();

CREATE TRIGGER albums_apple_match_repick AFTER UPDATE ON public.albums FOR EACH ROW WHEN ((new.title IS DISTINCT FROM old.title)) EXECUTE FUNCTION request_apple_match();

CREATE TRIGGER aux_battle_songs_apple_match AFTER INSERT ON public.aux_battle_songs FOR EACH ROW EXECUTE FUNCTION request_apple_match();

CREATE TRIGGER best_bars_apple_match AFTER INSERT ON public.best_bars FOR EACH ROW EXECUTE FUNCTION request_apple_match();

CREATE TRIGGER bingo_boxes_apple_match AFTER UPDATE ON public.bingo_boxes FOR EACH ROW WHEN (((new.title IS NOT NULL) AND (new.title IS DISTINCT FROM old.title))) EXECUTE FUNCTION request_apple_match();

CREATE TRIGGER bracket_tracks_apple_match AFTER INSERT ON public.bracket_tracks FOR EACH ROW EXECUTE FUNCTION request_apple_match();

CREATE TRIGGER convince_tracks_apple_match AFTER INSERT ON public.convince_tracks FOR EACH ROW EXECUTE FUNCTION request_apple_match();

CREATE TRIGGER feed_posts_apple_match AFTER INSERT ON public.feed_posts FOR EACH ROW WHEN ((new.kind = ANY (ARRAY['track'::text, 'album'::text]))) EXECUTE FUNCTION request_apple_match();

CREATE TRIGGER feed_posts_song_limit BEFORE INSERT ON public.feed_posts FOR EACH ROW EXECUTE FUNCTION enforce_song_limit();

CREATE TRIGGER perfect_playlist_songs_apple_match AFTER INSERT ON public.perfect_playlist_songs FOR EACH ROW EXECUTE FUNCTION request_apple_match();

CREATE TRIGGER showdown_submissions_apple_match AFTER INSERT ON public.showdown_submissions FOR EACH ROW EXECUTE FUNCTION request_apple_match();
