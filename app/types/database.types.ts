export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      clubs: {
        Row: {
          acronym: string | null
          archived_at: string | null
          city: string | null
          created_at: string
          department: string
          id: string
          myffbad_club_id: string | null
          name: string
          priority: number
          source: string
        }
        Insert: {
          acronym?: string | null
          archived_at?: string | null
          city?: string | null
          created_at?: string
          department?: string
          id?: string
          myffbad_club_id?: string | null
          name: string
          priority?: number
          source?: string
        }
        Update: {
          acronym?: string | null
          archived_at?: string | null
          city?: string | null
          created_at?: string
          department?: string
          id?: string
          myffbad_club_id?: string | null
          name?: string
          priority?: number
          source?: string
        }
        Relationships: []
      }
      match_breaks: {
        Row: {
          ends_at_seconds: number | null
          idx: number
          match_id: string
          starts_at_seconds: number
        }
        Insert: {
          ends_at_seconds?: number | null
          idx: number
          match_id: string
          starts_at_seconds: number
        }
        Update: {
          ends_at_seconds?: number | null
          idx?: number
          match_id?: string
          starts_at_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_breaks_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          match_id: string
          player_id: string
          side: number | null
          slot: number
        }
        Insert: {
          match_id: string
          player_id: string
          side?: number | null
          slot: number
        }
        Update: {
          match_id?: string
          player_id?: string
          side?: number | null
          slot?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      match_set_starts: {
        Row: {
          match_id: string
          server_slot: number | null
          set_number: number
          side1_right_court_slot: number | null
          side2_right_court_slot: number | null
        }
        Insert: {
          match_id: string
          server_slot?: number | null
          set_number: number
          side1_right_court_slot?: number | null
          side2_right_court_slot?: number | null
        }
        Update: {
          match_id?: string
          server_slot?: number | null
          set_number?: number
          side1_right_court_slot?: number | null
          side2_right_court_slot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_game_starts_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_types: {
        Row: {
          created_at: string
          id: string
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      matches: {
        Row: {
          best_of: number
          created_at: string
          created_by: string | null
          format: string
          id: string
          imported_at: string | null
          initial_server_side: number | null
          match_type_id: string | null
          played_on: string | null
          player_info_fields: string[]
          points_cap: number
          points_to_win: number
          side1_right_court_slot: number | null
          side2_right_court_slot: number | null
          tagging_status: string
          title: string
          updated_at: string
          venue: string | null
          visibility: string
          win_by: number
          youtube_channel_id: string | null
          youtube_duration_seconds: number | null
          youtube_published_at: string | null
          youtube_thumbnail_url: string | null
          youtube_title: string | null
          youtube_video_id: string | null
        }
        Insert: {
          best_of?: number
          created_at?: string
          created_by?: string | null
          format?: string
          id?: string
          imported_at?: string | null
          initial_server_side?: number | null
          match_type_id?: string | null
          played_on?: string | null
          player_info_fields?: string[]
          points_cap?: number
          points_to_win?: number
          side1_right_court_slot?: number | null
          side2_right_court_slot?: number | null
          tagging_status?: string
          title: string
          updated_at?: string
          venue?: string | null
          visibility?: string
          win_by?: number
          youtube_channel_id?: string | null
          youtube_duration_seconds?: number | null
          youtube_published_at?: string | null
          youtube_thumbnail_url?: string | null
          youtube_title?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          best_of?: number
          created_at?: string
          created_by?: string | null
          format?: string
          id?: string
          imported_at?: string | null
          initial_server_side?: number | null
          match_type_id?: string | null
          played_on?: string | null
          player_info_fields?: string[]
          points_cap?: number
          points_to_win?: number
          side1_right_court_slot?: number | null
          side2_right_court_slot?: number | null
          tagging_status?: string
          title?: string
          updated_at?: string
          venue?: string | null
          visibility?: string
          win_by?: number
          youtube_channel_id?: string | null
          youtube_duration_seconds?: number | null
          youtube_published_at?: string | null
          youtube_thumbnail_url?: string | null
          youtube_title?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_match_type_id_fkey"
            columns: ["match_type_id"]
            isOneToOne: false
            referencedRelation: "match_types"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          category: string | null
          club: string | null
          club_id: string | null
          cpph: number | null
          created_at: string
          ffbad_license: string | null
          first_name: string
          id: string
          last_name: string
          myffbad_person_id: string | null
          notes: string | null
          rank_doubles: string | null
          rank_mixed: string | null
          rank_singles: string | null
        }
        Insert: {
          category?: string | null
          club?: string | null
          club_id?: string | null
          cpph?: number | null
          created_at?: string
          ffbad_license?: string | null
          first_name: string
          id?: string
          last_name: string
          myffbad_person_id?: string | null
          notes?: string | null
          rank_doubles?: string | null
          rank_mixed?: string | null
          rank_singles?: string | null
        }
        Update: {
          category?: string | null
          club?: string | null
          club_id?: string | null
          cpph?: number | null
          created_at?: string
          ffbad_license?: string | null
          first_name?: string
          id?: string
          last_name?: string
          myffbad_person_id?: string | null
          notes?: string | null
          rank_doubles?: string | null
          rank_mixed?: string | null
          rank_singles?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      rallies: {
        Row: {
          created_at: string
          ended_at_seconds: number
          id: string
          idx: number
          is_highlight: boolean
          is_let: boolean
          match_id: string
          scored_by_player_id: string | null
          winner_side: number | null
        }
        Insert: {
          created_at?: string
          ended_at_seconds: number
          id?: string
          idx: number
          is_highlight?: boolean
          is_let?: boolean
          match_id: string
          scored_by_player_id?: string | null
          winner_side?: number | null
        }
        Update: {
          created_at?: string
          ended_at_seconds?: number
          id?: string
          idx?: number
          is_highlight?: boolean
          is_let?: boolean
          match_id?: string
          scored_by_player_id?: string | null
          winner_side?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rallies_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rallies_scored_by_player_id_fkey"
            columns: ["scored_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      match_is_visible: { Args: { p_match_id: string }; Returns: boolean }
      save_match_rallies: {
        Args: { p_match_id: string; p_rallies: Json }
        Returns: undefined
      }
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

