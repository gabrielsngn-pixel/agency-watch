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
  public: {
    Tables: {
      agency_activities: {
        Row: {
          activity_date: string
          activity_type: Database["public"]["Enums"]["agency_activity_type"]
          activity_type_detail: string | null
          agency_id: string
          agency_name: string
          attachment_name: string | null
          attachment_url: string | null
          base_origin: string | null
          c_level_support_needed: boolean
          created_at: string
          id: string
          interaction_result: string | null
          interaction_result_detail: string | null
          new_status: Database["public"]["Enums"]["negotiation_status"] | null
          next_step_date: string | null
          next_steps: string | null
          notes: string | null
          previous_status:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          registered_by_email: string | null
          registered_by_name: string | null
          registered_by_user_id: string | null
          source: string
          status_changed: boolean
          summary: string
          updated_at: string
        }
        Insert: {
          activity_date?: string
          activity_type: Database["public"]["Enums"]["agency_activity_type"]
          activity_type_detail?: string | null
          agency_id: string
          agency_name: string
          attachment_name?: string | null
          attachment_url?: string | null
          base_origin?: string | null
          c_level_support_needed?: boolean
          created_at?: string
          id?: string
          interaction_result?: string | null
          interaction_result_detail?: string | null
          new_status?: Database["public"]["Enums"]["negotiation_status"] | null
          next_step_date?: string | null
          next_steps?: string | null
          notes?: string | null
          previous_status?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          registered_by_email?: string | null
          registered_by_name?: string | null
          registered_by_user_id?: string | null
          source?: string
          status_changed?: boolean
          summary: string
          updated_at?: string
        }
        Update: {
          activity_date?: string
          activity_type?: Database["public"]["Enums"]["agency_activity_type"]
          activity_type_detail?: string | null
          agency_id?: string
          agency_name?: string
          attachment_name?: string | null
          attachment_url?: string | null
          base_origin?: string | null
          c_level_support_needed?: boolean
          created_at?: string
          id?: string
          interaction_result?: string | null
          interaction_result_detail?: string | null
          new_status?: Database["public"]["Enums"]["negotiation_status"] | null
          next_step_date?: string | null
          next_steps?: string | null
          notes?: string | null
          previous_status?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          registered_by_email?: string | null
          registered_by_name?: string | null
          registered_by_user_id?: string | null
          source?: string
          status_changed?: boolean
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_activities_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_audit_events: {
        Row: {
          activity_id: string | null
          actor_email: string | null
          actor_name: string | null
          actor_user_id: string | null
          agency_id: string
          created_at: string
          event_data: Json
          event_type: string
          file_id: string | null
          id: string
          new_status: Database["public"]["Enums"]["negotiation_status"] | null
          occurred_at: string
          previous_status:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          source: string
        }
        Insert: {
          activity_id?: string | null
          actor_email?: string | null
          actor_name?: string | null
          actor_user_id?: string | null
          agency_id: string
          created_at?: string
          event_data?: Json
          event_type: string
          file_id?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["negotiation_status"] | null
          occurred_at?: string
          previous_status?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          source?: string
        }
        Update: {
          activity_id?: string | null
          actor_email?: string | null
          actor_name?: string | null
          actor_user_id?: string | null
          agency_id?: string
          created_at?: string
          event_data?: Json
          event_type?: string
          file_id?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["negotiation_status"] | null
          occurred_at?: string
          previous_status?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_audit_events_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "agency_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_audit_events_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_audit_events_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "agency_files"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_change_log: {
        Row: {
          agency_id: string
          agency_name: string
          change_source: string
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          consultant_id: string | null
          field_name: string
          id: string
          is_stage_change: boolean
          new_status: Database["public"]["Enums"]["negotiation_status"] | null
          new_value: string | null
          old_value: string | null
          previous_status:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          slack_user_id: string | null
        }
        Insert: {
          agency_id: string
          agency_name: string
          change_source?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          consultant_id?: string | null
          field_name: string
          id?: string
          is_stage_change?: boolean
          new_status?: Database["public"]["Enums"]["negotiation_status"] | null
          new_value?: string | null
          old_value?: string | null
          previous_status?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          slack_user_id?: string | null
        }
        Update: {
          agency_id?: string
          agency_name?: string
          change_source?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          consultant_id?: string | null
          field_name?: string
          id?: string
          is_stage_change?: boolean
          new_status?: Database["public"]["Enums"]["negotiation_status"] | null
          new_value?: string | null
          old_value?: string | null
          previous_status?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          slack_user_id?: string | null
        }
        Relationships: []
      }
      agency_files: {
        Row: {
          activity_id: string | null
          agency_id: string
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          processing_status: Database["public"]["Enums"]["agency_file_processing_status"]
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          uploaded_by_email: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          activity_id?: string | null
          agency_id: string
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          processing_status?: Database["public"]["Enums"]["agency_file_processing_status"]
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_email?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          activity_id?: string | null
          agency_id?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          processing_status?: Database["public"]["Enums"]["agency_file_processing_status"]
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_email?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_files_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "agency_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_files_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_interactions: {
        Row: {
          agency_id: string
          c_level_support_needed: boolean | null
          contract_stock: number | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          current_offer: string | null
          feedback: string | null
          id: string
          interaction_date: string
          interaction_type: string | null
          next_steps: string | null
          source: Database["public"]["Enums"]["update_source"]
          status_after: Database["public"]["Enums"]["negotiation_status"] | null
          status_before:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
        }
        Insert: {
          agency_id: string
          c_level_support_needed?: boolean | null
          contract_stock?: number | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          current_offer?: string | null
          feedback?: string | null
          id?: string
          interaction_date?: string
          interaction_type?: string | null
          next_steps?: string | null
          source?: Database["public"]["Enums"]["update_source"]
          status_after?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          status_before?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
        }
        Update: {
          agency_id?: string
          c_level_support_needed?: boolean | null
          contract_stock?: number | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          current_offer?: string | null
          feedback?: string | null
          id?: string
          interaction_date?: string
          interaction_type?: string | null
          next_steps?: string | null
          source?: Database["public"]["Enums"]["update_source"]
          status_after?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          status_before?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_interactions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_sessions: {
        Row: {
          agency_id: string | null
          consultant_id: string | null
          created_at: string
          current_flow: string | null
          current_step: string
          expires_at: string
          id: string
          last_message_at: string
          phone: string
          session_data: Json
          status: Database["public"]["Enums"]["bot_session_status"]
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          consultant_id?: string | null
          created_at?: string
          current_flow?: string | null
          current_step?: string
          expires_at?: string
          id?: string
          last_message_at?: string
          phone: string
          session_data?: Json
          status?: Database["public"]["Enums"]["bot_session_status"]
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          consultant_id?: string | null
          created_at?: string
          current_flow?: string | null
          current_step?: string
          expires_at?: string
          id?: string
          last_message_at?: string
          phone?: string
          session_data?: Json
          status?: Database["public"]["Enums"]["bot_session_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_sessions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_sessions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_base_uploads: {
        Row: {
          activity_id: string
          agency_id: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          source: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          activity_id: string
          agency_id: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          source?: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          activity_id?: string
          agency_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          source?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_base_uploads_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "agency_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_base_uploads_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_import_history: {
        Row: {
          agency_name: string | null
          created_at: string
          id: string
          invalid_rows: number
          notes: string | null
          original_filename: string
          original_format: string | null
          standardized_file_path: string | null
          total_rows: number
          user_email: string | null
          user_id: string
          valid_rows: number
        }
        Insert: {
          agency_name?: string | null
          created_at?: string
          id?: string
          invalid_rows?: number
          notes?: string | null
          original_filename: string
          original_format?: string | null
          standardized_file_path?: string | null
          total_rows?: number
          user_email?: string | null
          user_id: string
          valid_rows?: number
        }
        Update: {
          agency_name?: string | null
          created_at?: string
          id?: string
          invalid_rows?: number
          notes?: string | null
          original_filename?: string
          original_format?: string | null
          standardized_file_path?: string | null
          total_rows?: number
          user_email?: string | null
          user_id?: string
          valid_rows?: number
        }
        Relationships: []
      }
      consultants: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          regional: string | null
          slack_user_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          regional?: string | null
          slack_user_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          regional?: string | null
          slack_user_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      google_form_submissions: {
        Row: {
          activity_id: string | null
          agency_id: string | null
          attempt_count: number
          created_at: string
          error_code: string | null
          id: string
          payload: Json
          payload_hash: string
          processed_at: string | null
          processing_status: string
          response_timestamp: string | null
          row_number: number
          sheet_name: string
          spreadsheet_id: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          agency_id?: string | null
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          id?: string
          payload?: Json
          payload_hash: string
          processed_at?: string | null
          processing_status?: string
          response_timestamp?: string | null
          row_number: number
          sheet_name: string
          spreadsheet_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          agency_id?: string | null
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          id?: string
          payload?: Json
          payload_hash?: string
          processed_at?: string | null
          processing_status?: string
          response_timestamp?: string | null
          row_number?: number
          sheet_name?: string
          spreadsheet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_form_submissions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "agency_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_form_submissions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_mappings: {
        Row: {
          agency_id: string
          created_at: string
          hubspot_company_id: string | null
          hubspot_contact_id: string | null
          id: string
          last_synced_at: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          hubspot_company_id?: string | null
          hubspot_contact_id?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          hubspot_company_id?: string | null
          hubspot_contact_id?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_mappings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_stage_snapshots: {
        Row: {
          agency_id: string
          agency_name: string
          c_level_support_needed: boolean
          consultant_id: string | null
          contract_stock: number
          created_at: string
          id: string
          regional_director: string | null
          snapshot_date: string
          status: Database["public"]["Enums"]["negotiation_status"]
          week_end: string
          week_start: string
        }
        Insert: {
          agency_id: string
          agency_name: string
          c_level_support_needed?: boolean
          consultant_id?: string | null
          contract_stock?: number
          created_at?: string
          id?: string
          regional_director?: string | null
          snapshot_date?: string
          status: Database["public"]["Enums"]["negotiation_status"]
          week_end: string
          week_start: string
        }
        Update: {
          agency_id?: string
          agency_name?: string
          c_level_support_needed?: boolean
          consultant_id?: string | null
          contract_stock?: number
          created_at?: string
          id?: string
          regional_director?: string | null
          snapshot_date?: string
          status?: Database["public"]["Enums"]["negotiation_status"]
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      real_estate_agencies: {
        Row: {
          c_level_support_needed: boolean
          city: string
          consultant_id: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_role: string | null
          contract_stock: number
          created_at: string
          created_by: string | null
          current_guarantor: string | null
          current_offer: string | null
          feedback: string | null
          guarantor_type: Database["public"]["Enums"]["guarantor_type"] | null
          id: string
          last_interaction_date: string | null
          main_contact: string | null
          name: string
          negotiation_status: Database["public"]["Enums"]["negotiation_status"]
          next_step_date: string | null
          next_steps: string | null
          perceived_potential: string | null
          regional_director: string | null
          registration_incomplete: boolean
          state: string | null
          total_interactions: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          c_level_support_needed?: boolean
          city: string
          consultant_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          contract_stock?: number
          created_at?: string
          created_by?: string | null
          current_guarantor?: string | null
          current_offer?: string | null
          feedback?: string | null
          guarantor_type?: Database["public"]["Enums"]["guarantor_type"] | null
          id?: string
          last_interaction_date?: string | null
          main_contact?: string | null
          name: string
          negotiation_status?: Database["public"]["Enums"]["negotiation_status"]
          next_step_date?: string | null
          next_steps?: string | null
          perceived_potential?: string | null
          regional_director?: string | null
          registration_incomplete?: boolean
          state?: string | null
          total_interactions?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          c_level_support_needed?: boolean
          city?: string
          consultant_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          contract_stock?: number
          created_at?: string
          created_by?: string | null
          current_guarantor?: string | null
          current_offer?: string | null
          feedback?: string | null
          guarantor_type?: Database["public"]["Enums"]["guarantor_type"] | null
          id?: string
          last_interaction_date?: string | null
          main_contact?: string | null
          name?: string
          negotiation_status?: Database["public"]["Enums"]["negotiation_status"]
          next_step_date?: string | null
          next_steps?: string | null
          perceived_potential?: string | null
          regional_director?: string | null
          registration_incomplete?: boolean
          state?: string | null
          total_interactions?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_agencies_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_events: {
        Row: {
          channel_id: string | null
          consultant_id: string | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          response: Json | null
          slack_team_id: string | null
          slack_user_id: string | null
          status: string
        }
        Insert: {
          channel_id?: string | null
          consultant_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          response?: Json | null
          slack_team_id?: string | null
          slack_user_id?: string | null
          status?: string
        }
        Update: {
          channel_id?: string | null
          consultant_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response?: Json | null
          slack_team_id?: string | null
          slack_user_id?: string | null
          status?: string
        }
        Relationships: []
      }
      slack_notifications: {
        Row: {
          agency_id: string | null
          channel_id: string | null
          consultant_id: string | null
          created_at: string
          id: string
          message_ts: string | null
          notification_type: string
          payload: Json | null
          slack_user_id: string | null
        }
        Insert: {
          agency_id?: string | null
          channel_id?: string | null
          consultant_id?: string | null
          created_at?: string
          id?: string
          message_ts?: string | null
          notification_type: string
          payload?: Json | null
          slack_user_id?: string | null
        }
        Update: {
          agency_id?: string | null
          channel_id?: string | null
          consultant_id?: string | null
          created_at?: string
          id?: string
          message_ts?: string | null
          notification_type?: string
          payload?: Json | null
          slack_user_id?: string | null
        }
        Relationships: []
      }
      slack_sessions: {
        Row: {
          agency_id: string | null
          consultant_id: string | null
          created_at: string
          current_flow: string | null
          current_step: string
          expires_at: string
          id: string
          session_data: Json
          slack_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          consultant_id?: string | null
          created_at?: string
          current_flow?: string | null
          current_step?: string
          expires_at?: string
          id?: string
          session_data?: Json
          slack_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          consultant_id?: string | null
          created_at?: string
          current_flow?: string | null
          current_step?: string
          expires_at?: string
          id?: string
          session_data?: Json
          slack_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          agency_id: string | null
          consultant_id: string | null
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          error_message: string | null
          flow: string | null
          id: string
          message_body: string | null
          parsed_intent: string | null
          phone: string
          raw_payload: Json | null
          status: string
        }
        Insert: {
          agency_id?: string | null
          consultant_id?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          flow?: string | null
          id?: string
          message_body?: string | null
          parsed_intent?: string | null
          phone: string
          raw_payload?: Json | null
          status?: string
        }
        Update: {
          agency_id?: string | null
          consultant_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          flow?: string | null
          id?: string
          message_body?: string | null
          parsed_intent?: string | null
          phone?: string
          raw_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_stale_bot_sessions: { Args: never; Returns: number }
      generate_kanban_snapshot: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      agency_activity_type:
        | "call"
        | "whatsapp"
        | "email"
        | "meeting"
        | "in_person_visit"
        | "proposal_sent"
        | "client_base_received"
        | "training"
        | "follow_up"
        | "c_level_support"
        | "internal_note"
        | "cadastro_update"
        | "other"
      agency_file_processing_status:
        | "pending"
        | "processing"
        | "processed"
        | "failed"
      app_role: "admin" | "manager" | "consultant"
      bot_session_status: "active" | "completed" | "abandoned"
      guarantor_type:
        | "Garantia Propria"
        | "Concorrente"
        | "Seguradora"
        | "Outro"
      message_direction: "inbound" | "outbound"
      negotiation_status:
        | "Pipeline de Prospecção"
        | "Conversas iniciadas"
        | "Reunião agendada"
        | "Aguardando base"
        | "Stand by"
        | "Sem interesse"
        | "Proposta enviada"
        | "Em negociação"
        | "Convertida"
      update_source: "web" | "whatsapp" | "import"
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
  public: {
    Enums: {
      agency_activity_type: [
        "call",
        "whatsapp",
        "email",
        "meeting",
        "in_person_visit",
        "proposal_sent",
        "client_base_received",
        "training",
        "follow_up",
        "c_level_support",
        "internal_note",
        "cadastro_update",
        "other",
      ],
      agency_file_processing_status: [
        "pending",
        "processing",
        "processed",
        "failed",
      ],
      app_role: ["admin", "manager", "consultant"],
      bot_session_status: ["active", "completed", "abandoned"],
      guarantor_type: [
        "Garantia Propria",
        "Concorrente",
        "Seguradora",
        "Outro",
      ],
      message_direction: ["inbound", "outbound"],
      negotiation_status: [
        "Pipeline de Prospecção",
        "Conversas iniciadas",
        "Reunião agendada",
        "Aguardando base",
        "Stand by",
        "Sem interesse",
        "Proposta enviada",
        "Em negociação",
        "Convertida",
      ],
      update_source: ["web", "whatsapp", "import"],
    },
  },
} as const
