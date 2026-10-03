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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      event_locations: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          country_code: string
          created_at: string
          created_by_user_id: string | null
          group_id: string
          id: string
          location: unknown
          name: string
          postal_code: string | null
          provider_place_id: string | null
          state_region: string | null
          updated_at: string
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by_user_id?: string | null
          group_id: string
          id?: string
          location?: unknown
          name: string
          postal_code?: string | null
          provider_place_id?: string | null
          state_region?: string | null
          updated_at?: string
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by_user_id?: string | null
          group_id?: string
          id?: string
          location?: unknown
          name?: string
          postal_code?: string | null
          provider_place_id?: string | null
          state_region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_locations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participation: {
        Row: {
          created_at: string
          event_id: string
          id: string
          member_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          member_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          member_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participation_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participation_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          default_activity_end_time: string | null
          default_activity_start_time: string | null
          default_ready_to_depart_time: string | null
          default_required_arrival_time: string | null
          group_id: string
          id: string
          location_id: string | null
          name: string
          recurrence_rule: string
          series_end_date: string | null
          series_start_date: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          default_activity_end_time?: string | null
          default_activity_start_time?: string | null
          default_ready_to_depart_time?: string | null
          default_required_arrival_time?: string | null
          group_id: string
          id?: string
          location_id?: string | null
          name: string
          recurrence_rule: string
          series_end_date?: string | null
          series_start_date: string
          status?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          default_activity_end_time?: string | null
          default_activity_start_time?: string | null
          default_ready_to_depart_time?: string | null
          default_required_arrival_time?: string | null
          group_id?: string
          id?: string
          location_id?: string | null
          name?: string
          recurrence_rule?: string
          series_end_date?: string | null
          series_start_date?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_series_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "event_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          activity_ends_at: string | null
          activity_starts_at: string | null
          created_at: string
          created_by_user_id: string | null
          event_series_id: string | null
          group_id: string
          id: string
          location_id: string | null
          name: string
          ready_to_depart_at: string | null
          required_arrival_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activity_ends_at?: string | null
          activity_starts_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          event_series_id?: string | null
          group_id: string
          id?: string
          location_id?: string | null
          name: string
          ready_to_depart_at?: string | null
          required_arrival_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activity_ends_at?: string | null
          activity_starts_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          event_series_id?: string | null
          group_id?: string
          id?: string
          location_id?: string | null
          name?: string
          ready_to_depart_at?: string | null
          required_arrival_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_event_series_id_fkey"
            columns: ["event_series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "event_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      group_admins: {
        Row: {
          created_at: string
          group_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_admins_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invitation_redemptions: {
        Row: {
          group_membership_id: string | null
          household_id: string
          id: string
          invitation_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          group_membership_id?: string | null
          household_id: string
          id?: string
          invitation_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          group_membership_id?: string | null
          household_id?: string
          id?: string
          invitation_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invitation_redemptions_group_membership_id_fkey"
            columns: ["group_membership_id"]
            isOneToOne: false
            referencedRelation: "group_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitation_redemptions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitation_redemptions_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "group_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invitations: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          expires_at: string | null
          group_id: string
          id: string
          invite_type: string
          invited_email: string | null
          max_uses: number | null
          status: string
          token_hash: string
          updated_at: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          group_id: string
          id?: string
          invite_type: string
          invited_email?: string | null
          max_uses?: number | null
          status?: string
          token_hash: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          group_id?: string
          id?: string
          invite_type?: string
          invited_email?: string | null
          max_uses?: number | null
          status?: string
          token_hash?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_memberships: {
        Row: {
          created_at: string
          group_id: string
          household_id: string
          id: string
          joined_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          household_id: string
          id?: string
          joined_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          household_id?: string
          id?: string
          joined_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          description: string | null
          group_type: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          group_type: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          group_type?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_access: {
        Row: {
          created_at: string
          household_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_access_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          first_name: string
          household_id: string
          id: string
          last_name: string | null
          linked_user_id: string | null
          member_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name: string
          household_id: string
          id?: string
          last_name?: string | null
          linked_user_id?: string | null
          member_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string
          household_id?: string
          id?: string
          last_name?: string | null
          linked_user_id?: string | null
          member_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          onboarding_completed_at: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          onboarding_completed_at?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed_at?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ride_participation: {
        Row: {
          anchor_earliest_at: string | null
          anchor_latest_at: string | null
          available_seats: number | null
          created_at: string
          event_id: string
          household_location_id: string
          id: string
          leg: string
          max_detour_minutes: number | null
          member_id: string
          mode: string
          updated_at: string
        }
        Insert: {
          anchor_earliest_at?: string | null
          anchor_latest_at?: string | null
          available_seats?: number | null
          created_at?: string
          event_id: string
          household_location_id: string
          id?: string
          leg: string
          max_detour_minutes?: number | null
          member_id: string
          mode: string
          updated_at?: string
        }
        Update: {
          anchor_earliest_at?: string | null
          anchor_latest_at?: string | null
          available_seats?: number | null
          created_at?: string
          event_id?: string
          household_location_id?: string
          id?: string
          leg?: string
          max_detour_minutes?: number | null
          member_id?: string
          mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_participation_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_participation_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_group: {
        Args: {
          p_description?: string
          p_group_type: string
          p_household_id: string
          p_name: string
        }
        Returns: string
      }
      create_group_invitation: {
        Args: {
          p_expires_at?: string
          p_group_id: string
          p_invite_type: string
          p_invited_email?: string
          p_max_uses?: number
          p_token_hash: string
        }
        Returns: string
      }
      create_household: { Args: { p_display_name?: string }; Returns: string }
      redeem_group_invitation: {
        Args: { p_household_id: string; p_token_hash: string }
        Returns: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
