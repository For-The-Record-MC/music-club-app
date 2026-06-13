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
        }
        Insert: {
          actor_id?: string | null
          club_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          club_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
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
      albums: {
        Row: {
          apple_url: string | null
          artist: string
          artwork_url: string | null
          created_at: string
          cycle_id: string
          id: string
          itunes_collection_id: number | null
          set_by: string
          slot: number
          spotify_url: string | null
          title: string
          tracks: Json | null
          year: number | null
        }
        Insert: {
          apple_url?: string | null
          artist?: string
          artwork_url?: string | null
          created_at?: string
          cycle_id: string
          id?: string
          itunes_collection_id?: number | null
          set_by: string
          slot: number
          spotify_url?: string | null
          title: string
          tracks?: Json | null
          year?: number | null
        }
        Update: {
          apple_url?: string | null
          artist?: string
          artwork_url?: string | null
          created_at?: string
          cycle_id?: string
          id?: string
          itunes_collection_id?: number | null
          set_by?: string
          slot?: number
          spotify_url?: string | null
          title?: string
          tracks?: Json | null
          year?: number | null
        }
        Relationships: [
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
      club_members: {
        Row: {
          club_id: string
          id: string
          joined_at: string
          profile_id: string
          role: string
        }
        Insert: {
          club_id: string
          id?: string
          joined_at?: string
          profile_id: string
          role?: string
        }
        Update: {
          club_id?: string
          id?: string
          joined_at?: string
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
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          invite_code?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          invite_code?: string
          name?: string
          owner_id?: string
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
      concert_interest: {
        Row: {
          concert_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          concert_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          concert_id?: string
          created_at?: string
          id?: string
          profile_id?: string
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
          concert_date: string | null
          created_at: string
          id: string
          note: string | null
          price: string | null
          ticket_url: string | null
          venue: string | null
        }
        Insert: {
          added_by: string
          artist: string
          club_id: string
          concert_date?: string | null
          created_at?: string
          id?: string
          note?: string | null
          price?: string | null
          ticket_url?: string | null
          venue?: string | null
        }
        Update: {
          added_by?: string
          artist?: string
          club_id?: string
          concert_date?: string | null
          created_at?: string
          id?: string
          note?: string | null
          price?: string | null
          ticket_url?: string | null
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
          profile_id: string
          updated_at: string
        }
        Insert: {
          album_id: string
          created_at?: string
          cycle_id: string
          id?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          album_id?: string
          created_at?: string
          cycle_id?: string
          id?: string
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
          meeting_at: string | null
          meeting_date: string | null
          meeting_time_location: string | null
          meeting_url: string | null
          number: number
          picker_id: string
          revealed_at: string | null
          start_date: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          club_id: string
          created_at?: string
          id?: string
          meeting_at?: string | null
          meeting_date?: string | null
          meeting_time_location?: string | null
          meeting_url?: string | null
          number: number
          picker_id: string
          revealed_at?: string | null
          start_date?: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          club_id?: string
          created_at?: string
          id?: string
          meeting_at?: string | null
          meeting_date?: string | null
          meeting_time_location?: string | null
          meeting_url?: string | null
          number?: number
          picker_id?: string
          revealed_at?: string | null
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
          platform: string
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
          platform?: string
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
          platform?: string
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
      profiles: {
        Row: {
          avatar_color: number
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          avatar_color?: number
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          avatar_color?: number
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          album_id: string
          created_at: string
          favorite_reason: string | null
          favorite_track: string | null
          id: string
          least_reason: string | null
          least_track: string | null
          profile_id: string
          review: string | null
          score: number
          updated_at: string
        }
        Insert: {
          album_id: string
          created_at?: string
          favorite_reason?: string | null
          favorite_track?: string | null
          id?: string
          least_reason?: string | null
          least_track?: string | null
          profile_id: string
          review?: string | null
          score: number
          updated_at?: string
        }
        Update: {
          album_id?: string
          created_at?: string
          favorite_reason?: string | null
          favorite_track?: string | null
          id?: string
          least_reason?: string | null
          least_track?: string | null
          profile_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      close_cycle: {
        Args: { p_cycle: string }
        Returns: {
          closed_at: string | null
          club_id: string
          created_at: string
          id: string
          meeting_at: string | null
          meeting_date: string | null
          meeting_time_location: string | null
          meeting_url: string | null
          number: number
          picker_id: string
          revealed_at: string | null
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
      club_role: { Args: { p_club: string }; Returns: string }
      create_club: {
        Args: { p_emoji?: string; p_name: string }
        Returns: {
          created_at: string
          emoji: string
          id: string
          invite_code: string
          name: string
          owner_id: string
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_invite_code: { Args: never; Returns: string }
      get_album_summary: { Args: { p_album: string }; Returns: Json }
      is_club_member: { Args: { p_club: string }; Returns: boolean }
      join_club: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          emoji: string
          id: string
          invite_code: string
          name: string
          owner_id: string
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_activity_read: { Args: { p_club: string }; Returns: undefined }
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
          meeting_at: string | null
          meeting_date: string | null
          meeting_time_location: string | null
          meeting_url: string | null
          number: number
          picker_id: string
          revealed_at: string | null
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
      spin_wheel: {
        Args: { p_club: string }
        Returns: {
          closed_at: string | null
          club_id: string
          created_at: string
          id: string
          meeting_at: string | null
          meeting_date: string | null
          meeting_time_location: string | null
          meeting_url: string | null
          number: number
          picker_id: string
          revealed_at: string | null
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
