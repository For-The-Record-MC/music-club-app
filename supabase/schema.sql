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
  slot integer NOT NULL,
  title text NOT NULL,
  artist text NOT NULL DEFAULT ''::text,
  year integer,
  artwork_url text,
  itunes_collection_id bigint,
  apple_url text,
  spotify_url text,
  tracks jsonb,
  set_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
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
  joined_at timestamp with time zone NOT NULL DEFAULT now()
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
  spotify_favorites_playlist_url text
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
  origin_concert_id uuid
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
  spotify_highlights_playlist_url text
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
  can_use_personal_spotify boolean NOT NULL DEFAULT false
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
  created_at timestamp with time zone NOT NULL DEFAULT now()
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

CREATE TABLE song_note_shares (
  album_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
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

ALTER TABLE albums ADD CONSTRAINT albums_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;

ALTER TABLE albums ADD CONSTRAINT albums_cycle_id_slot_key UNIQUE (cycle_id, slot);

ALTER TABLE albums ADD CONSTRAINT albums_pkey PRIMARY KEY (id);

ALTER TABLE albums ADD CONSTRAINT albums_set_by_fkey FOREIGN KEY (set_by) REFERENCES profiles(id);

ALTER TABLE albums ADD CONSTRAINT albums_slot_check CHECK ((slot = ANY (ARRAY[1, 2])));

ALTER TABLE albums ADD CONSTRAINT albums_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 200)));

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

ALTER TABLE song_note_shares ADD CONSTRAINT song_note_shares_album_id_fkey FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;

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

CREATE INDEX albums_cycle_idx ON public.albums USING btree (cycle_id);

CREATE INDEX club_favorite_tracks_club_idx ON public.club_favorite_tracks USING btree (club_id, added_at DESC);

CREATE UNIQUE INDEX club_favorite_tracks_uri_idx ON public.club_favorite_tracks USING btree (club_id, spotify_uri) WHERE (spotify_uri IS NOT NULL);

CREATE INDEX club_members_club_idx ON public.club_members USING btree (club_id);

CREATE UNIQUE INDEX club_members_one_owner_idx ON public.club_members USING btree (club_id) WHERE (role = 'owner'::text);

CREATE INDEX club_members_profile_idx ON public.club_members USING btree (profile_id);

CREATE INDEX concert_comments_concert_idx ON public.concert_comments USING btree (concert_id, created_at);

CREATE INDEX concert_interest_concert_idx ON public.concert_interest USING btree (concert_id);

CREATE INDEX concerts_club_idx ON public.concerts USING btree (club_id, concert_date);

CREATE INDEX concerts_origin_idx ON public.concerts USING btree (origin_concert_id);

CREATE INDEX cycle_guests_cycle_idx ON public.cycle_guests USING btree (cycle_id);

CREATE INDEX cycle_preferences_cycle_idx ON public.cycle_preferences USING btree (cycle_id);

CREATE INDEX cycles_club_idx ON public.cycles USING btree (club_id);

CREATE UNIQUE INDEX cycles_one_open_idx ON public.cycles USING btree (club_id) WHERE (status = 'open'::text);

CREATE INDEX feed_posts_club_idx ON public.feed_posts USING btree (club_id, created_at DESC);

CREATE INDEX feed_posts_origin_idx ON public.feed_posts USING btree (origin_post_id);

CREATE INDEX feed_posts_suggestion_idx ON public.feed_posts USING btree (club_id) WHERE is_album_suggestion;

CREATE INDEX meeting_posts_cycle_idx ON public.meeting_posts USING btree (cycle_id, created_at);

CREATE INDEX post_comments_post_idx ON public.post_comments USING btree (post_id, created_at);

CREATE INDEX post_reactions_post_idx ON public.post_reactions USING btree (post_id);

CREATE INDEX ratings_album_idx ON public.ratings USING btree (album_id);

CREATE INDEX rsvps_cycle_idx ON public.rsvps USING btree (cycle_id);

CREATE INDEX showdown_submissions_showdown_idx ON public.showdown_submissions USING btree (showdown_id);

CREATE INDEX showdown_theme_ideas_club_idx ON public.showdown_theme_ideas USING btree (club_id);

CREATE INDEX showdown_votes_submission_idx ON public.showdown_votes USING btree (submission_id);

CREATE INDEX showdowns_club_idx ON public.showdowns USING btree (club_id);

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

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ratings_delete ON ratings AS PERMISSIVE FOR DELETE TO authenticated
  USING (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = ratings.album_id) AND (c.status = 'open'::text) AND (c.revealed_at IS NULL))))));

CREATE POLICY ratings_insert ON ratings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = ratings.album_id) AND (c.status = 'open'::text) AND (c.revealed_at IS NULL) AND is_club_member(c.club_id))))));

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
  WHERE ((a.id = ratings.album_id) AND (c.status = 'open'::text) AND (c.revealed_at IS NULL) AND is_club_member(c.club_id))))));

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
  WHERE ((s.album_id = song_notes.album_id) AND (s.profile_id = song_notes.profile_id) AND is_club_member(c.club_id))))));

CREATE POLICY song_notes_update ON song_notes AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((profile_id = auth.uid()))
  WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (albums a
     JOIN cycles c ON ((c.id = a.cycle_id)))
  WHERE ((a.id = song_notes.album_id) AND is_club_member(c.club_id))))));

ALTER TABLE streaming_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE vibe_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY vibe_tags_insert ON vibe_tags AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((created_by = auth.uid()) AND (is_canonical = false)));

CREATE POLICY vibe_tags_select ON vibe_tags AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);


-- =====================================================
-- FUNCTIONS & PROCEDURES
-- =====================================================

CREATE OR REPLACE FUNCTION public.album_has_ratings(p_album uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from ratings where album_id = p_album);
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
        -- albums chosen: every album this member set in the club
        (select count(*)::int from albums a
           join cycles c on c.id = a.cycle_id
          where c.club_id = p_club and a.set_by = cm.profile_id) as albums_chosen,
        -- avg rating received on their picks — REVEALED cycles only (the seal)
        (select round(avg(rt.score)::numeric, 1) from ratings rt
           join albums a on a.id = rt.album_id
           join cycles c on c.id = a.cycle_id
          where c.club_id = p_club and a.set_by = cm.profile_id
            and c.revealed_at is not null) as avg_rating_received,
        -- ratings they submitted in the club
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
        'display_name', p.display_name, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
      ))
      from reviews rv left join profiles p on p.id = rv.profile_id
    ), '[]'::json),
    'takes', coalesce((
      select json_agg(json_build_object(
        'album_id', tk.album_id, 'album_title', tk.album_title, 'profile_id', tk.profile_id,
        'score', tk.score, 'take', tk.one_sentence_take,
        'display_name', p.display_name, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
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
        'display_name', p.display_name, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
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
        'display_name', p.display_name, 'avatar_color', p.avatar_color, 'avatar_url', p.avatar_url
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

  return v_cycle;
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

CREATE TRIGGER album_impressions_lock_initial BEFORE UPDATE ON public.album_impressions FOR EACH ROW EXECUTE FUNCTION lock_initial_score();

CREATE TRIGGER feed_posts_song_limit BEFORE INSERT ON public.feed_posts FOR EACH ROW EXECUTE FUNCTION enforce_song_limit();
