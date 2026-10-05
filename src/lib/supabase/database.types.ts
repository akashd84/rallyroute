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
          archived_at: string | null
          city: string | null
          country_code: string
          created_at: string
          created_by_user_id: string | null
          geocoding_attribution: string | null
          group_id: string
          id: string
          location: unknown
          name: string
          postal_code: string | null
          provider_place_id: string | null
          revision: number
          state_region: string | null
          updated_at: string
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          archived_at?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by_user_id?: string | null
          geocoding_attribution?: string | null
          group_id: string
          id?: string
          location?: unknown
          name: string
          postal_code?: string | null
          provider_place_id?: string | null
          revision?: number
          state_region?: string | null
          updated_at?: string
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          archived_at?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by_user_id?: string | null
          geocoding_attribution?: string | null
          group_id?: string
          id?: string
          location?: unknown
          name?: string
          postal_code?: string | null
          provider_place_id?: string | null
          revision?: number
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
          disabled_at: string | null
          event_id: string
          id: string
          member_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          event_id: string
          id?: string
          member_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
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
          departure_next_day: boolean
          group_id: string
          id: string
          location_id: string | null
          name: string
          predecessor_series_id: string | null
          recurrence_rule: string
          recurrence_spec: Json | null
          request_id: string | null
          revision: number
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
          departure_next_day?: boolean
          group_id: string
          id?: string
          location_id?: string | null
          name: string
          predecessor_series_id?: string | null
          recurrence_rule: string
          recurrence_spec?: Json | null
          request_id?: string | null
          revision?: number
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
          departure_next_day?: boolean
          group_id?: string
          id?: string
          location_id?: string | null
          name?: string
          predecessor_series_id?: string | null
          recurrence_rule?: string
          recurrence_spec?: Json | null
          request_id?: string | null
          revision?: number
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
          {
            foreignKeyName: "event_series_predecessor_series_id_fkey"
            columns: ["predecessor_series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
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
          is_exception: boolean
          location_id: string | null
          name: string
          original_local_date: string | null
          ready_to_depart_at: string | null
          request_id: string | null
          required_arrival_at: string | null
          revision: number
          status: string
          timezone: string
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
          is_exception?: boolean
          location_id?: string | null
          name: string
          original_local_date?: string | null
          ready_to_depart_at?: string | null
          request_id?: string | null
          required_arrival_at?: string | null
          revision?: number
          status?: string
          timezone?: string
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
          is_exception?: boolean
          location_id?: string | null
          name?: string
          original_local_date?: string | null
          ready_to_depart_at?: string | null
          request_id?: string | null
          required_arrival_at?: string | null
          revision?: number
          status?: string
          timezone?: string
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
      household_invitation_redemptions: {
        Row: {
          household_id: string
          invitation_id: string
          participant_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          household_id: string
          invitation_id: string
          participant_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          household_id?: string
          invitation_id?: string
          participant_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invitation_redemptions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invitation_redemptions_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "household_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invitation_redemptions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invitations: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by_user_id: string
          expires_at: string
          household_id: string
          id: string
          invited_email: string
          participant_id: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by_user_id: string
          expires_at?: string
          household_id: string
          id?: string
          invited_email: string
          participant_id?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          expires_at?: string
          household_id?: string
          id?: string
          invited_email?: string
          participant_id?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invitations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invitations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          archived_at: string | null
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
          archived_at?: string | null
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
          archived_at?: string | null
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
          archived_at: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
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
          disabled_at: string | null
          event_id: string
          household_location_id: string | null
          id: string
          leg: string
          max_detour_minutes: number | null
          member_id: string
          mode: string
          needs_reconfirmation: boolean
          updated_at: string
        }
        Insert: {
          anchor_earliest_at?: string | null
          anchor_latest_at?: string | null
          available_seats?: number | null
          created_at?: string
          disabled_at?: string | null
          event_id: string
          household_location_id?: string | null
          id?: string
          leg: string
          max_detour_minutes?: number | null
          member_id: string
          mode: string
          needs_reconfirmation?: boolean
          updated_at?: string
        }
        Update: {
          anchor_earliest_at?: string | null
          anchor_latest_at?: string | null
          available_seats?: number | null
          created_at?: string
          disabled_at?: string | null
          event_id?: string
          household_location_id?: string | null
          id?: string
          leg?: string
          max_detour_minutes?: number | null
          member_id?: string
          mode?: string
          needs_reconfirmation?: boolean
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
      accept_household_invitation: {
        Args: {
          p_first_name: string
          p_last_name: string
          p_token_hash: string
        }
        Returns: string
      }
      accept_invitation: {
        Args: {
          p_first_name?: string
          p_household_id?: string
          p_kind: string
          p_last_name?: string
          p_token_hash: string
        }
        Returns: Json
      }
      archive_household_participant: {
        Args: { p_household_id: string; p_member_id: string }
        Returns: undefined
      }
      authorize_location_geocoding: {
        Args: {
          p_kind: string
          p_location_id?: string
          p_parent_id: string
          p_revision?: number
        }
        Returns: boolean
      }
      complete_household_onboarding: {
        Args: {
          p_first_name: string
          p_household_id: string
          p_last_name: string
        }
        Returns: string
      }
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
      create_group_once: {
        Args: {
          p_description?: string
          p_group_type: string
          p_household_id: string
          p_name: string
          p_request_id: string
        }
        Returns: string
      }
      create_household: { Args: { p_display_name?: string }; Returns: string }
      create_household_invitation: {
        Args: {
          p_email: string
          p_household_id: string
          p_participant_id?: string
          p_token_hash: string
        }
        Returns: string
      }
      demote_household_owner: {
        Args: { p_household_id: string }
        Returns: undefined
      }
      event_workflow: {
        Args: { p_command: string; p_data: Json }
        Returns: string
      }
      household_location_list: {
        Args: { p_household_id: string }
        Returns: Json
      }
      inspect_invitation: {
        Args: { p_kind: string; p_token_hash: string }
        Returns: Json
      }
      leave_household: { Args: { p_household_id: string }; Returns: undefined }
      match_candidates: {
        Args: {
          p_after?: string
          p_event_id: string
          p_household_id: string
          p_keys?: string[]
          p_leg: string
          p_limit?: number
          p_max_distance: number
          p_user_id: string
        }
        Returns: {
          candidate: Json
          pair_key: string
        }[]
      }
      onboard_household: {
        Args: {
          p_display_name: string
          p_first_name: string
          p_last_name: string
          p_request_id: string
        }
        Returns: string
      }
      preview_group_invitation: {
        Args: { p_token_hash: string }
        Returns: {
          description: string
          group_id: string
          group_type: string
          name: string
        }[]
      }
      promote_household_member: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: undefined
      }
      provider_budget_acquire: {
        Args: {
          p_concurrency?: number
          p_hour_limit?: number
          p_lease_seconds?: number
          p_minute_limit?: number
          p_provider: string
          p_subject: string
          p_token?: string
        }
        Returns: Json
      }
      provider_budget_release: { Args: { p_token: string }; Returns: undefined }
      redeem_group_invitation: {
        Args: { p_household_id: string; p_token_hash: string }
        Returns: string
      }
      remove_household_member: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: undefined
      }
      revoke_group_invitation: {
        Args: { p_group_id: string; p_invitation_id: string }
        Returns: undefined
      }
      revoke_household_invitation: {
        Args: { p_household_id: string; p_invitation_id: string }
        Returns: undefined
      }
      route_candidate_inputs: {
        Args: {
          p_driver_ride_id: string
          p_event_id: string
          p_max_pickup_distance_meters: number
          p_rider_ride_id: string
          p_user_id: string
        }
        Returns: {
          driver_available_seats: number
          driver_latitude: number
          driver_longitude: number
          driver_max_detour_minutes: number
          event_id: string
          event_latitude: number
          event_longitude: number
          household_distance_meters: number
          leg: string
          rider_latitude: number
          rider_longitude: number
        }[]
      }
      routing_cache_get: { Args: { p_cache_key: string }; Returns: Json }
      routing_cache_put: {
        Args: { p_cache_key: string; p_provider: string; p_result: Json }
        Returns: undefined
      }
      routing_request_claim: {
        Args: { p_cache_key: string; p_lease_seconds: number; p_token: string }
        Returns: Json
      }
      routing_request_finish: {
        Args: { p_cache_key: string; p_result: Json; p_token: string }
        Returns: boolean
      }
      series_workflow: { Args: { p_data: Json }; Returns: string }
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
