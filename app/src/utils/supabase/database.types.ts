export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string | null
          club_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          recipient_id: string | null
        }
        Insert: {
          actor_id?: string | null
          club_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          recipient_id?: string | null
        }
        Update: {
          actor_id?: string | null
          club_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          recipient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_reads: {
        Row: {
          club_id: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          club_id: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          club_id?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_reads_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      album_impressions: {
        Row: {
          album_id: string
          created_at: string
          initial_review: string | null
          initial_score: number | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          album_id: string
          created_at?: string
          initial_review?: string | null
          initial_score?: number | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          album_id?: string
          created_at?: string
          initial_review?: string | null
          initial_score?: number | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_impressions_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_impressions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          apple_url: string | null
          artist: string
          artwork_url: string | null
          claimed_by: string | null
          created_at: string
          cycle_id: string
          id: string
          itunes_collection_id: number | null
          set_by: string
          slot: number | null
          spotify_album_id: string | null
          spotify_url: string | null
          title: string
          tracks: Json | null
          year: number | null
        }
        Insert: {
          apple_url?: string | null
          artist?: string
          artwork_url?: string | null
          claimed_by?: string | null
          created_at?: string
          cycle_id: string
          id?: string
          itunes_collection_id?: number | null
          set_by: string
          slot?: number | null
          spotify_album_id?: string | null
          spotify_url?: string | null
          title: string
          tracks?: Json | null
          year?: number | null
        }
        Update: {
          apple_url?: string | null
          artist?: string
          artwork_url?: string | null
          claimed_by?: string | null
          created_at?: string
          cycle_id?: string
          id?: string
          itunes_collection_id?: number | null
          set_by?: string
          slot?: number | null
          spotify_album_id?: string | null
          spotify_url?: string | null
          title?: string
          tracks?: Json | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "albums_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "albums_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "albums_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_favorite_tracks: {
        Row: {
          added_at: string
          artist: string | null
          club_id: string
          cycle_id: string | null
          id: string
          source: string | null
          spotify_uri: string | null
          title: string
        }
        Insert: {
          added_at?: string
          artist?: string | null
          club_id: string
          cycle_id?: string | null
          id?: string
          source?: string | null
          spotify_uri?: string | null
          title: string
        }
        Update: {
          added_at?: string
          artist?: string | null
          club_id?: string
          cycle_id?: string | null
          id?: string
          source?: string | null
          spotify_uri?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_favorite_tracks_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_favorite_tracks_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_members: {
        Row: {
          club_id: string
          id: string
          joined_at: string
          notifications_muted: boolean
          profile_id: string
          role: string
        }
        Insert: {
          club_id: string
          id?: string
          joined_at?: string
          notifications_muted?: boolean
          profile_id: string
          role?: string
        }
        Update: {
          club_id?: string
          id?: string
          joined_at?: string
          notifications_muted?: boolean
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          emoji: string
          id: string
          invite_code: string
          leaderboard_weights: Json
          meeting_timezone: string | null
          name: string
          owner_id: string
          song_limit_per_cycle: number | null
          spotify_favorites_playlist_id: string | null
          spotify_favorites_playlist_url: string | null
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          invite_code?: string
          leaderboard_weights?: Json
          meeting_timezone?: string | null
          name: string
          owner_id: string
          song_limit_per_cycle?: number | null
          spotify_favorites_playlist_id?: string | null
          spotify_favorites_playlist_url?: string | null
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          invite_code?: string
          leaderboard_weights?: Json
          meeting_timezone?: string | null
          name?: string
          owner_id?: string
          song_limit_per_cycle?: number | null
          spotify_favorites_playlist_id?: string | null
          spotify_favorites_playlist_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clubs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      concert_comments: {
        Row: {
          author_id: string
          concert_id: string
          created_at: string
          id: string
          text: string
        }
        Insert: {
          author_id: string
          concert_id: string
          created_at?: string
          id?: string
          text: string
        }
        Update: {
          author_id?: string
          concert_id?: string
          created_at?: string
          id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "concert_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concert_comments_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      concert_interest: {
        Row: {
          concert_id: string
          created_at: string
          id: string
          profile_id: string
          status: string
        }
        Insert: {
          concert_id: string
          created_at?: string
          id?: string
          profile_id: string
          status?: string
        }
        Update: {
          concert_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "concert_interest_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concert_interest_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      concerts: {
        Row: {
          added_by: string
          artist: string
          club_id: string
          completed_at: string | null
          concert_date: string | null
          concert_time: string | null
          created_at: string
          id: string
          note: string | null
          origin_concert_id: string | null
          price: string | null
          rating: number | null
          review: string | null
          ticket_url: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          added_by: string
          artist: string
          club_id: string
          completed_at?: string | null
          concert_date?: string | null
          concert_time?: string | null
          created_at?: string
          id?: string
          note?: string | null
          origin_concert_id?: string | null
          price?: string | null
          rating?: number | null
          review?: string | null
          ticket_url?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          added_by?: string
          artist?: string
          club_id?: string
          completed_at?: string | null
          concert_date?: string | null
          concert_time?: string | null
          created_at?: string
          id?: string
          note?: string | null
          origin_concert_id?: string | null
          price?: string | null
          rating?: number | null
          review?: string | null
          ticket_url?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concerts_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concerts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concerts_origin_concert_id_fkey"
            columns: ["origin_concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_guests: {
        Row: {
          added_by: string
          created_at: string
          cycle_id: string
          id: string
          name: string
          status: string
        }
        Insert: {
          added_by: string
          created_at?: string
          cycle_id: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          added_by?: string
          created_at?: string
          cycle_id?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_guests_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_guests_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_preferences: {
        Row: {
          album_id: string
          created_at: string
          cycle_id: string
          id: string
          other_album_merit: string | null
          preference_reason: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          album_id: string
          created_at?: string
          cycle_id: string
          id?: string
          other_album_merit?: string | null
          preference_reason?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          album_id?: string
          created_at?: string
          cycle_id?: string
          id?: string
          other_album_merit?: string | null
          preference_reason?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_preferences_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_preferences_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cycles: {
        Row: {
          closed_at: string | null
          club_id: string
          created_at: string
          id: string
          kind: string
          meeting_at: string | null
          meeting_date: string | null
          meeting_reminder_1h_sent_at: string | null
          meeting_reminder_24h_sent_at: string | null
          meeting_time_location: string | null
          meeting_url: string | null
          number: number
          participation_nudge_72h_sent_at: string | null
          picker_id: string
          revealed_at: string | null
          spotify_highlights_playlist_id: string | null
          spotify_highlights_playlist_url: string | null
          spotify_playlist_id: string | null
          spotify_playlist_url: string | null
          start_date: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          club_id: string
          created_at?: string
          id?: string
          kind?: string
          meeting_at?: string | null
          meeting_date?: string | null
          meeting_reminder_1h_sent_at?: string | null
          meeting_reminder_24h_sent_at?: string | null
          meeting_time_location?: string | null
          meeting_url?: string | null
          number: number
          participation_nudge_72h_sent_at?: string | null
          picker_id: string
          revealed_at?: string | null
          spotify_highlights_playlist_id?: string | null
          spotify_highlights_playlist_url?: string | null
          spotify_playlist_id?: string | null
          spotify_playlist_url?: string | null
          start_date?: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          club_id?: string
          created_at?: string
          id?: string
          kind?: string
          meeting_at?: string | null
          meeting_date?: string | null
          meeting_reminder_1h_sent_at?: string | null
          meeting_reminder_24h_sent_at?: string | null
          meeting_time_location?: string | null
          meeting_url?: string | null
          number?: number
          participation_nudge_72h_sent_at?: string | null
          picker_id?: string
          revealed_at?: string | null
          spotify_highlights_playlist_id?: string | null
          spotify_highlights_playlist_url?: string | null
          spotify_playlist_id?: string | null
          spotify_playlist_url?: string | null
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycles_picker_id_fkey"
            columns: ["picker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          artist: string
          author_id: string
          club_id: string
          created_at: string
          id: string
          is_album_suggestion: boolean
          kind: string
          metadata: Json | null
          note: string | null
          origin_post_id: string | null
          platform: string
          playlist_synced_at: string | null
          title: string
          url: string | null
        }
        Insert: {
          artist?: string
          author_id: string
          club_id: string
          created_at?: string
          id?: string
          is_album_suggestion?: boolean
          kind?: string
          metadata?: Json | null
          note?: string | null
          origin_post_id?: string | null
          platform?: string
          playlist_synced_at?: string | null
          title: string
          url?: string | null
        }
        Update: {
          artist?: string
          author_id?: string
          club_id?: string
          created_at?: string
          id?: string
          is_album_suggestion?: boolean
          kind?: string
          metadata?: Json | null
          note?: string | null
          origin_post_id?: string | null
          platform?: string
          playlist_synced_at?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_origin_post_id_fkey"
            columns: ["origin_post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_posts: {
        Row: {
          author_id: string
          created_at: string
          cycle_id: string
          id: string
          text: string
        }
        Insert: {
          author_id: string
          created_at?: string
          cycle_id: string
          id?: string
          text: string
        }
        Update: {
          author_id?: string
          created_at?: string
          cycle_id?: string
          id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_posts_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_time_options: {
        Row: {
          created_at: string
          cycle_id: string
          id: string
          proposed_by: string
          slot_at: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          id?: string
          proposed_by: string
          slot_at: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          id?: string
          proposed_by?: string
          slot_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_time_options_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_time_options_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_time_votes: {
        Row: {
          created_at: string
          option_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_time_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "meeting_time_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_time_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          announcements: boolean
          lifecycle: boolean
          mentions: boolean
          profile_id: string
          social: boolean
          updated_at: string
        }
        Insert: {
          announcements?: boolean
          lifecycle?: boolean
          mentions?: boolean
          profile_id: string
          social?: boolean
          updated_at?: string
        }
        Update: {
          announcements?: boolean
          lifecycle?: boolean
          mentions?: boolean
          profile_id?: string
          social?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          created_at: string
          id: string
          post_id: string
          text: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          post_id: string
          text: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          post_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_tracks: {
        Row: {
          album_name: string
          artist_name: string
          artwork_url: string | null
          caption: string | null
          profile_id: string
          slot: string
          spotify_uri: string | null
          spotify_url: string | null
          track_name: string
          updated_at: string
        }
        Insert: {
          album_name?: string
          artist_name?: string
          artwork_url?: string | null
          caption?: string | null
          profile_id: string
          slot: string
          spotify_uri?: string | null
          spotify_url?: string | null
          track_name: string
          updated_at?: string
        }
        Update: {
          album_name?: string
          artist_name?: string
          artwork_url?: string | null
          caption?: string | null
          profile_id?: string
          slot?: string
          spotify_uri?: string | null
          spotify_url?: string | null
          track_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_tracks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_album_url: string | null
          avatar_color: number
          avatar_label: string | null
          avatar_url: string | null
          can_use_personal_spotify: boolean
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          avatar_album_url?: string | null
          avatar_color?: number
          avatar_label?: string | null
          avatar_url?: string | null
          can_use_personal_spotify?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          avatar_album_url?: string | null
          avatar_color?: number
          avatar_label?: string | null
          avatar_url?: string | null
          can_use_personal_spotify?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          platform: string
          profile_id: string
          token: string
          updated_at: string
        }
        Insert: {
          platform: string
          profile_id: string
          token: string
          updated_at?: string
        }
        Update: {
          platform?: string
          profile_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          album_id: string
          album_vibe_tags: string[]
          best_moment: string | null
          best_run_rating: number | null
          best_run_start: number | null
          created_at: string
          favorite_lyric: string | null
          favorite_reason: string | null
          favorite_track: string | null
          id: string
          initial_score: number | null
          least_reason: string | null
          least_track: string | null
          one_sentence_take: string | null
          profile_id: string
          replayability: number | null
          review: string | null
          score: number
          updated_at: string
        }
        Insert: {
          album_id: string
          album_vibe_tags?: string[]
          best_moment?: string | null
          best_run_rating?: number | null
          best_run_start?: number | null
          created_at?: string
          favorite_lyric?: string | null
          favorite_reason?: string | null
          favorite_track?: string | null
          id?: string
          initial_score?: number | null
          least_reason?: string | null
          least_track?: string | null
          one_sentence_take?: string | null
          profile_id: string
          replayability?: number | null
          review?: string | null
          score: number
          updated_at?: string
        }
        Update: {
          album_id?: string
          album_vibe_tags?: string[]
          best_moment?: string | null
          best_run_rating?: number | null
          best_run_start?: number | null
          created_at?: string
          favorite_lyric?: string | null
          favorite_reason?: string | null
          favorite_track?: string | null
          id?: string
          initial_score?: number | null
          least_reason?: string | null
          least_track?: string | null
          one_sentence_take?: string | null
          profile_id?: string
          replayability?: number | null
          review?: string | null
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvps: {
        Row: {
          cycle_id: string
          id: string
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cycle_id: string
          id?: string
          profile_id: string
          status: string
          updated_at?: string
        }
        Update: {
          cycle_id?: string
          id?: string
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvps_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      showdown_submissions: {
        Row: {
          apple_url: string | null
          artist: string
          artwork_url: string | null
          created_at: string
          id: string
          norm_key: string
          profile_id: string
          showdown_id: string
          spotify_url: string | null
          title: string
        }
        Insert: {
          apple_url?: string | null
          artist?: string
          artwork_url?: string | null
          created_at?: string
          id?: string
          norm_key: string
          profile_id: string
          showdown_id: string
          spotify_url?: string | null
          title: string
        }
        Update: {
          apple_url?: string | null
          artist?: string
          artwork_url?: string | null
          created_at?: string
          id?: string
          norm_key?: string
          profile_id?: string
          showdown_id?: string
          spotify_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "showdown_submissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showdown_submissions_showdown_id_fkey"
            columns: ["showdown_id"]
            isOneToOne: false
            referencedRelation: "showdowns"
            referencedColumns: ["id"]
          },
        ]
      }
      showdown_theme_ideas: {
        Row: {
          club_id: string | null
          created_at: string
          created_by: string | null
          id: string
          text: string
          used_cycle_id: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          text: string
          used_cycle_id?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          text?: string
          used_cycle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "showdown_theme_ideas_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showdown_theme_ideas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showdown_theme_ideas_used_cycle_id_fkey"
            columns: ["used_cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      showdown_votes: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          submission_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          submission_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          submission_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "showdown_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showdown_votes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "showdown_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      showdowns: {
        Row: {
          club_id: string
          created_at: string
          created_by: string
          cycle_id: string
          id: string
          theme_idea_id: string | null
          theme_text: string
          winner_submission_id: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by: string
          cycle_id: string
          id?: string
          theme_idea_id?: string | null
          theme_text: string
          winner_submission_id?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string
          cycle_id?: string
          id?: string
          theme_idea_id?: string | null
          theme_text?: string
          winner_submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "showdowns_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showdowns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showdowns_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: true
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showdowns_theme_idea_id_fkey"
            columns: ["theme_idea_id"]
            isOneToOne: false
            referencedRelation: "showdown_theme_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showdowns_winner_fk"
            columns: ["winner_submission_id"]
            isOneToOne: false
            referencedRelation: "showdown_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      song_note_reactions: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          song_note_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          song_note_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          song_note_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_note_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_note_reactions_song_note_id_fkey"
            columns: ["song_note_id"]
            isOneToOne: false
            referencedRelation: "song_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      song_note_shares: {
        Row: {
          album_id: string
          created_at: string
          mode: string
          profile_id: string
        }
        Insert: {
          album_id: string
          created_at?: string
          mode?: string
          profile_id: string
        }
        Update: {
          album_id?: string
          created_at?: string
          mode?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_note_shares_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_note_shares_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      song_notes: {
        Row: {
          album_id: string
          comment: string | null
          created_at: string
          favorite_lyric: string | null
          id: string
          initial_thoughts: string | null
          profile_id: string
          rating: number | null
          reminds_me_of: string | null
          saved_to_library: boolean
          thumb: string | null
          track_name: string
          track_number: number
          updated_at: string
          vibe_tags: string[]
        }
        Insert: {
          album_id: string
          comment?: string | null
          created_at?: string
          favorite_lyric?: string | null
          id?: string
          initial_thoughts?: string | null
          profile_id: string
          rating?: number | null
          reminds_me_of?: string | null
          saved_to_library?: boolean
          thumb?: string | null
          track_name: string
          track_number: number
          updated_at?: string
          vibe_tags?: string[]
        }
        Update: {
          album_id?: string
          comment?: string | null
          created_at?: string
          favorite_lyric?: string | null
          id?: string
          initial_thoughts?: string | null
          profile_id?: string
          rating?: number | null
          reminds_me_of?: string | null
          saved_to_library?: boolean
          thumb?: string | null
          track_name?: string
          track_number?: number
          updated_at?: string
          vibe_tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "song_notes_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      streaming_connections: {
        Row: {
          access_token: string
          club_id: string
          connected_by: string | null
          created_at: string
          display_name: string | null
          expires_at: string
          provider: string
          refresh_token: string
          scope: string | null
          spotify_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          access_token: string
          club_id: string
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          expires_at: string
          provider?: string
          refresh_token: string
          scope?: string | null
          spotify_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          club_id?: string
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string
          provider?: string
          refresh_token?: string
          scope?: string | null
          spotify_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaming_connections_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streaming_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_canonical: boolean
          name: string
          name_key: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_canonical?: boolean
          name: string
          name_key?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_canonical?: boolean
          name?: string
          name_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vibe_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_archive_album: {
        Args: {
          p_apple_url?: string
          p_artist?: string
          p_artwork_url?: string
          p_club: string
          p_spotify_url?: string
          p_title: string
          p_tracks?: Json
          p_year?: number
        }
        Returns: {
          apple_url: string | null
          artist: string
          artwork_url: string | null
          claimed_by: string | null
          created_at: string
          cycle_id: string
          id: string
          itunes_collection_id: number | null
          set_by: string
          slot: number | null
          spotify_album_id: string | null
          spotify_url: string | null
          title: string
          tracks: Json | null
          year: number | null
        }
        SetofOptions: {
          from: "*"
          to: "albums"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      album_has_ratings: { Args: { p_album: string }; Returns: boolean }
      cast_showdown_vote: {
        Args: { p_submission: string; p_value: number }
        Returns: undefined
      }
      claim_archive_album: {
        Args: { p_album: string; p_profile?: string }
        Returns: {
          apple_url: string | null
          artist: string
          artwork_url: string | null
          claimed_by: string | null
          created_at: string
          cycle_id: string
          id: string
          itunes_collection_id: number | null
          set_by: string
          slot: number | null
          spotify_album_id: string | null
          spotify_url: string | null
          title: string
          tracks: Json | null
          year: number | null
        }
        SetofOptions: {
          from: "*"
          to: "albums"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_cycle: {
        Args: { p_cycle: string }
        Returns: {
          closed_at: string | null
          club_id: string
          created_at: string
          id: string
          kind: string
          meeting_at: string | null
          meeting_date: string | null
          meeting_reminder_1h_sent_at: string | null
          meeting_reminder_24h_sent_at: string | null
          meeting_time_location: string | null
          meeting_url: string | null
          number: number
          participation_nudge_72h_sent_at: string | null
          picker_id: string
          revealed_at: string | null
          spotify_highlights_playlist_id: string | null
          spotify_highlights_playlist_url: string | null
          spotify_playlist_id: string | null
          spotify_playlist_url: string | null
          start_date: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "cycles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      club_leaderboard: { Args: { p_club: string }; Returns: Json }
      club_role: { Args: { p_club: string }; Returns: string }
      create_club: {
        Args: { p_emoji?: string; p_name: string }
        Returns: {
          created_at: string
          emoji: string
          id: string
          invite_code: string
          leaderboard_weights: Json
          meeting_timezone: string | null
          name: string
          owner_id: string
          song_limit_per_cycle: number | null
          spotify_favorites_playlist_id: string | null
          spotify_favorites_playlist_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cycle_club: { Args: { p_cycle: string }; Returns: string }
      delete_showdown_submission: {
        Args: { p_showdown: string }
        Returns: undefined
      }
      generate_invite_code: { Args: never; Returns: string }
      get_album_summary: { Args: { p_album: string }; Returns: Json }
      get_cycle_highlights: { Args: { p_cycle: string }; Returns: Json }
      get_or_create_archive_cycle: {
        Args: { p_club: string }
        Returns: {
          closed_at: string | null
          club_id: string
          created_at: string
          id: string
          kind: string
          meeting_at: string | null
          meeting_date: string | null
          meeting_reminder_1h_sent_at: string | null
          meeting_reminder_24h_sent_at: string | null
          meeting_time_location: string | null
          meeting_url: string | null
          number: number
          participation_nudge_72h_sent_at: string | null
          picker_id: string
          revealed_at: string | null
          spotify_highlights_playlist_id: string | null
          spotify_highlights_playlist_url: string | null
          spotify_playlist_id: string | null
          spotify_playlist_url: string | null
          start_date: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "cycles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_showdown_history: { Args: { p_club: string }; Returns: Json }
      is_club_member: { Args: { p_club: string }; Returns: boolean }
      join_club: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          emoji: string
          id: string
          invite_code: string
          leaderboard_weights: Json
          meeting_timezone: string | null
          name: string
          owner_id: string
          song_limit_per_cycle: number | null
          spotify_favorites_playlist_id: string | null
          spotify_favorites_playlist_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_showdown: { Args: { p_cycle: string }; Returns: Json }
      mark_activity_read: { Args: { p_club: string }; Returns: undefined }
      my_announcement_quota: { Args: { p_club: string }; Returns: Json }
      my_song_quota: { Args: { p_club: string }; Returns: Json }
      notify_comment_mentions: {
        Args: { p_club: string; p_payload?: Json; p_recipients: string[] }
        Returns: undefined
      }
      participation_gaps: {
        Args: { p_cycle: string; p_member: string }
        Returns: Json
      }
      post_announcement: {
        Args: { p_body: string; p_club: string; p_title: string }
        Returns: undefined
      }
      publish_activity_event: {
        Args: { p_club: string; p_payload?: Json; p_type: string }
        Returns: undefined
      }
      reveal_cycle: {
        Args: { p_cycle: string }
        Returns: {
          closed_at: string | null
          club_id: string
          created_at: string
          id: string
          kind: string
          meeting_at: string | null
          meeting_date: string | null
          meeting_reminder_1h_sent_at: string | null
          meeting_reminder_24h_sent_at: string | null
          meeting_time_location: string | null
          meeting_url: string | null
          number: number
          participation_nudge_72h_sent_at: string | null
          picker_id: string
          revealed_at: string | null
          spotify_highlights_playlist_id: string | null
          spotify_highlights_playlist_url: string | null
          spotify_playlist_id: string | null
          spotify_playlist_url: string | null
          start_date: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "cycles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rotate_invite_code: { Args: { p_club: string }; Returns: string }
      send_meeting_reminders: { Args: never; Returns: undefined }
      set_club_mute: {
        Args: { p_club: string; p_muted: boolean }
        Returns: undefined
      }
      set_concert_review: {
        Args: {
          p_concert: string
          p_mark_complete: boolean
          p_rating: number
          p_review: string
        }
        Returns: number
      }
      set_showdown_theme: {
        Args: { p_cycle: string; p_idea_id?: string; p_text: string }
        Returns: {
          club_id: string
          created_at: string
          created_by: string
          cycle_id: string
          id: string
          theme_idea_id: string | null
          theme_text: string
          winner_submission_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "showdowns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      showdown_norm: {
        Args: { p_artist: string; p_title: string }
        Returns: string
      }
      spin_showdown_theme: {
        Args: { p_club: string }
        Returns: {
          club_id: string | null
          created_at: string
          created_by: string | null
          id: string
          text: string
          used_cycle_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "showdown_theme_ideas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      spin_wheel: {
        Args: { p_club: string }
        Returns: {
          closed_at: string | null
          club_id: string
          created_at: string
          id: string
          kind: string
          meeting_at: string | null
          meeting_date: string | null
          meeting_reminder_1h_sent_at: string | null
          meeting_reminder_24h_sent_at: string | null
          meeting_time_location: string | null
          meeting_url: string | null
          number: number
          participation_nudge_72h_sent_at: string | null
          picker_id: string
          revealed_at: string | null
          spotify_highlights_playlist_id: string | null
          spotify_highlights_playlist_url: string | null
          spotify_playlist_id: string | null
          spotify_playlist_url: string | null
          start_date: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "cycles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      spotify_album_id_from_url: { Args: { p_url: string }; Returns: string }
      streaming_disconnect: { Args: { p_club: string }; Returns: undefined }
      streaming_status: { Args: { p_club: string }; Returns: Json }
      submit_showdown_song: {
        Args: {
          p_apple_url?: string
          p_artist: string
          p_artwork_url?: string
          p_showdown: string
          p_spotify_url?: string
          p_title: string
        }
        Returns: {
          apple_url: string | null
          artist: string
          artwork_url: string | null
          created_at: string
          id: string
          norm_key: string
          profile_id: string
          showdown_id: string
          spotify_url: string | null
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "showdown_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wheel_pool: { Args: { p_club: string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
