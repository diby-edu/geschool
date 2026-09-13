/**
 * Types de la base de donnees.
 *
 * FICHIER GENERE — ne pas editer a la main.
 * Regeneration :  pnpm db:types
 *
 * Volontairement versionne : la CI doit pouvoir typer le projet sans acces a
 * la base.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      absence_justifications: {
        Row: {
          id: string
          school_id: string
          student_id: string
          covers_from: string
          covers_to: string
          reason: string
          document_id: string | null
          submitted_by: string | null
          status: Database['public']['Enums']["justification_status"]
          decided_by: string | null
          decided_at: string | null
          decision_comment: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          student_id: string
          covers_from: string
          covers_to: string
          reason: string
          document_id?: string | null
          submitted_by?: string | null
          status?: Database['public']['Enums']["justification_status"]
          decided_by?: string | null
          decided_at?: string | null
          decision_comment?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          student_id?: string
          covers_from?: string
          covers_to?: string
          reason?: string
          document_id?: string | null
          submitted_by?: string | null
          status?: Database['public']['Enums']["justification_status"]
          decided_by?: string | null
          decided_at?: string | null
          decision_comment?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      academic_periods: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          name: string
          sequence: number
          kind: Database['public']['Enums']["academic_period_kind"]
          starts_on: string
          ends_on: string
          is_grading_period: boolean
          weight: number
          status: Database['public']['Enums']["academic_period_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          name: string
          sequence: number
          kind?: Database['public']['Enums']["academic_period_kind"]
          starts_on: string
          ends_on: string
          is_grading_period?: boolean
          weight?: number
          status?: Database['public']['Enums']["academic_period_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          name?: string
          sequence?: number
          kind?: Database['public']['Enums']["academic_period_kind"]
          starts_on?: string
          ends_on?: string
          is_grading_period?: boolean
          weight?: number
          status?: Database['public']['Enums']["academic_period_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      academic_years: {
        Row: {
          id: string
          school_id: string
          name: string
          starts_on: string
          ends_on: string
          status: Database['public']['Enums']["academic_year_status"]
          is_current: boolean
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          name: string
          starts_on: string
          ends_on: string
          status?: Database['public']['Enums']["academic_year_status"]
          is_current?: boolean
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          name?: string
          starts_on?: string
          ends_on?: string
          status?: Database['public']['Enums']["academic_year_status"]
          is_current?: boolean
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      access_events: {
        Row: {
          id: string
          school_id: string
          user_id: string
          event_type: Database['public']['Enums']["access_event_type"]
          actor_id: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          user_id: string
          event_type: Database['public']['Enums']["access_event_type"]
          actor_id?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string
          event_type?: Database['public']['Enums']["access_event_type"]
          actor_id?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      account_access: {
        Row: {
          id: string
          school_id: string
          user_id: string
          subject_kind: Database['public']['Enums']["account_subject_kind"]
          login_kind: Database['public']['Enums']["login_kind"]
          login_identifier: string
          account_status: Database['public']['Enums']["account_status"]
          activation_status: Database['public']['Enums']["activation_status"]
          must_change_password: boolean
          activated_at: string | null
          last_password_change_at: string | null
          last_reset_at: string | null
          reset_count: number
          delivery_count: number
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          school_id: string
          user_id: string
          subject_kind: Database['public']['Enums']["account_subject_kind"]
          login_kind: Database['public']['Enums']["login_kind"]
          login_identifier: string
          account_status?: Database['public']['Enums']["account_status"]
          activation_status?: Database['public']['Enums']["activation_status"]
          must_change_password?: boolean
          activated_at?: string | null
          last_password_change_at?: string | null
          last_reset_at?: string | null
          reset_count?: number
          delivery_count?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string
          subject_kind?: Database['public']['Enums']["account_subject_kind"]
          login_kind?: Database['public']['Enums']["login_kind"]
          login_identifier?: string
          account_status?: Database['public']['Enums']["account_status"]
          activation_status?: Database['public']['Enums']["activation_status"]
          must_change_password?: boolean
          activated_at?: string | null
          last_password_change_at?: string | null
          last_reset_at?: string | null
          reset_count?: number
          delivery_count?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          id: string
          school_id: string
          title: string
          body: string
          audience: Json
          status: Database['public']['Enums']["announcement_status"]
          published_at: string | null
          expires_at: string | null
          author_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          title: string
          body: string
          audience?: Json
          status?: Database['public']['Enums']["announcement_status"]
          published_at?: string | null
          expires_at?: string | null
          author_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          title?: string
          body?: string
          audience?: Json
          status?: Database['public']['Enums']["announcement_status"]
          published_at?: string | null
          expires_at?: string | null
          author_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          reference: string
          applicant: Json
          requested_level_id: string | null
          status: Database['public']['Enums']["application_status"]
          reviewed_by: string | null
          reviewed_at: string | null
          decision_comment: string | null
          enrolled_student_id: string | null
          client_operation_id: string | null
          source: Database['public']['Enums']["write_source"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          reference: string
          applicant?: Json
          requested_level_id?: string | null
          status?: Database['public']['Enums']["application_status"]
          reviewed_by?: string | null
          reviewed_at?: string | null
          decision_comment?: string | null
          enrolled_student_id?: string | null
          client_operation_id?: string | null
          source?: Database['public']['Enums']["write_source"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          reference?: string
          applicant?: Json
          requested_level_id?: string | null
          status?: Database['public']['Enums']["application_status"]
          reviewed_by?: string | null
          reviewed_at?: string | null
          decision_comment?: string | null
          enrolled_student_id?: string | null
          client_operation_id?: string | null
          source?: Database['public']['Enums']["write_source"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      assessment_types: {
        Row: {
          id: string
          school_id: string
          code: string
          name: string
          default_coefficient: number
          counts_in_average: boolean
          sequence: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          code: string
          name: string
          default_coefficient?: number
          counts_in_average?: boolean
          sequence?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          code?: string
          name?: string
          default_coefficient?: number
          counts_in_average?: boolean
          sequence?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      assessments: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          academic_period_id: string
          subject_id: string
          class_id: string | null
          group_id: string | null
          teacher_id: string | null
          assessment_type_id: string
          title: string
          assessment_date: string
          grading_scale_id: string
          max_score: number
          coefficient: number
          is_eliminatory: boolean
          eliminatory_threshold: number | null
          status: Database['public']['Enums']["assessment_status"]
          published_at: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          academic_period_id: string
          subject_id: string
          class_id?: string | null
          group_id?: string | null
          teacher_id?: string | null
          assessment_type_id: string
          title: string
          assessment_date?: string
          grading_scale_id: string
          max_score: number
          coefficient?: number
          is_eliminatory?: boolean
          eliminatory_threshold?: number | null
          status?: Database['public']['Enums']["assessment_status"]
          published_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          academic_period_id?: string
          subject_id?: string
          class_id?: string | null
          group_id?: string | null
          teacher_id?: string | null
          assessment_type_id?: string
          title?: string
          assessment_date?: string
          grading_scale_id?: string
          max_score?: number
          coefficient?: number
          is_eliminatory?: boolean
          eliminatory_threshold?: number | null
          status?: Database['public']['Enums']["assessment_status"]
          published_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          id: string
          school_id: string
          register_id: string
          student_id: string
          status: Database['public']['Enums']["attendance_status"]
          minutes_late: number
          comment: string | null
          recorded_by: string | null
          recorded_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          register_id: string
          student_id: string
          status?: Database['public']['Enums']["attendance_status"]
          minutes_late?: number
          comment?: string | null
          recorded_by?: string | null
          recorded_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          register_id?: string
          student_id?: string
          status?: Database['public']['Enums']["attendance_status"]
          minutes_late?: number
          comment?: string | null
          recorded_by?: string | null
          recorded_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_registers: {
        Row: {
          id: string
          school_id: string
          session_occurrence_id: string
          taken_by: string | null
          taken_at: string
          status: Database['public']['Enums']["attendance_register_status"]
          validated_by: string | null
          validated_at: string | null
          client_operation_id: string | null
          source: Database['public']['Enums']["write_source"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          session_occurrence_id: string
          taken_by?: string | null
          taken_at?: string
          status?: Database['public']['Enums']["attendance_register_status"]
          validated_by?: string | null
          validated_at?: string | null
          client_operation_id?: string | null
          source?: Database['public']['Enums']["write_source"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          session_occurrence_id?: string
          taken_by?: string | null
          taken_at?: string
          status?: Database['public']['Enums']["attendance_register_status"]
          validated_by?: string | null
          validated_at?: string | null
          client_operation_id?: string | null
          source?: Database['public']['Enums']["write_source"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          school_id: string | null
          actor_user_id: string | null
          actor_is_platform_admin: boolean
          actor_role: string | null
          action: string
          module: string
          entity_type: string | null
          entity_id: string | null
          before: Json | null
          after: Json | null
          ip: string | null
          user_agent: string | null
          request_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id?: string | null
          actor_user_id?: string | null
          actor_is_platform_admin?: boolean
          actor_role?: string | null
          action: string
          module: string
          entity_type?: string | null
          entity_id?: string | null
          before?: Json | null
          after?: Json | null
          ip?: string | null
          user_agent?: string | null
          request_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string | null
          actor_user_id?: string | null
          actor_is_platform_admin?: boolean
          actor_role?: string | null
          action?: string
          module?: string
          entity_type?: string | null
          entity_id?: string | null
          before?: Json | null
          after?: Json | null
          ip?: string | null
          user_agent?: string | null
          request_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      class_council_decisions: {
        Row: {
          id: string
          school_id: string
          council_id: string
          student_id: string
          decision: Database['public']['Enums']["council_decision"]
          distinction: Database['public']['Enums']["council_distinction"]
          comment: string | null
          decided_by: string | null
          decided_at: string | null
        }
        Insert: {
          id?: string
          school_id: string
          council_id: string
          student_id: string
          decision?: Database['public']['Enums']["council_decision"]
          distinction?: Database['public']['Enums']["council_distinction"]
          comment?: string | null
          decided_by?: string | null
          decided_at?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          council_id?: string
          student_id?: string
          decision?: Database['public']['Enums']["council_decision"]
          distinction?: Database['public']['Enums']["council_distinction"]
          comment?: string | null
          decided_by?: string | null
          decided_at?: string | null
        }
        Relationships: []
      }
      class_councils: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          academic_period_id: string
          class_id: string
          scheduled_at: string | null
          held_at: string | null
          chaired_by: string | null
          status: Database['public']['Enums']["council_status"]
          minutes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          academic_period_id: string
          class_id: string
          scheduled_at?: string | null
          held_at?: string | null
          chaired_by?: string | null
          status?: Database['public']['Enums']["council_status"]
          minutes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          academic_period_id?: string
          class_id?: string
          scheduled_at?: string | null
          held_at?: string | null
          chaired_by?: string | null
          status?: Database['public']['Enums']["council_status"]
          minutes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          level_id: string
          code: string
          name: string
          capacity: number
          head_teacher_id: string | null
          main_room_id: string | null
          status: Database['public']['Enums']["class_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          level_id: string
          code: string
          name: string
          capacity?: number
          head_teacher_id?: string | null
          main_room_id?: string | null
          status?: Database['public']['Enums']["class_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          level_id?: string
          code?: string
          name?: string
          capacity?: number
          head_teacher_id?: string | null
          main_room_id?: string | null
          status?: Database['public']['Enums']["class_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      credential_deliveries: {
        Row: {
          id: string
          school_id: string
          user_id: string
          batch_id: string | null
          reason: Database['public']['Enums']["delivery_reason"]
          channel: Database['public']['Enums']["delivery_channel"]
          recipient: string
          status: Database['public']['Enums']["delivery_status"]
          attempts: number
          max_attempts: number
          last_attempt_at: string | null
          next_attempt_at: string
          error_code: string | null
          error_message: string | null
          provider: string | null
          provider_message_id: string | null
          sent_at: string | null
          delivered_at: string | null
          idempotency_key: string
          requested_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          user_id: string
          batch_id?: string | null
          reason?: Database['public']['Enums']["delivery_reason"]
          channel?: Database['public']['Enums']["delivery_channel"]
          recipient: string
          status?: Database['public']['Enums']["delivery_status"]
          attempts?: number
          max_attempts?: number
          last_attempt_at?: string | null
          next_attempt_at?: string
          error_code?: string | null
          error_message?: string | null
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          idempotency_key: string
          requested_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string
          batch_id?: string | null
          reason?: Database['public']['Enums']["delivery_reason"]
          channel?: Database['public']['Enums']["delivery_channel"]
          recipient?: string
          status?: Database['public']['Enums']["delivery_status"]
          attempts?: number
          max_attempts?: number
          last_attempt_at?: string | null
          next_attempt_at?: string
          error_code?: string | null
          error_message?: string | null
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          idempotency_key?: string
          requested_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      credential_delivery_batches: {
        Row: {
          id: string
          school_id: string
          requested_by: string | null
          total: number
          sent: number
          failed: number
          status: Database['public']['Enums']["delivery_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          requested_by?: string | null
          total?: number
          sent?: number
          failed?: number
          status?: Database['public']['Enums']["delivery_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          requested_by?: string | null
          total?: number
          sent?: number
          failed?: number
          status?: Database['public']['Enums']["delivery_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cycles: {
        Row: {
          id: string
          school_id: string
          code: string
          name: string
          sequence: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          code: string
          name: string
          sequence?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          code?: string
          name?: string
          sequence?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_categories: {
        Row: {
          id: string
          school_id: string
          code: string
          name: string
          applies_to: Database['public']['Enums']["document_owner_type"] | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          code: string
          name: string
          applies_to?: Database['public']['Enums']["document_owner_type"] | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          code?: string
          name?: string
          applies_to?: Database['public']['Enums']["document_owner_type"] | null
          created_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          school_id: string
          category_id: string | null
          owner_type: Database['public']['Enums']["document_owner_type"]
          owner_id: string | null
          name: string
          storage_path: string
          mime_type: string
          size_bytes: number
          checksum: string | null
          visibility: Database['public']['Enums']["document_visibility"]
          uploaded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          category_id?: string | null
          owner_type: Database['public']['Enums']["document_owner_type"]
          owner_id?: string | null
          name: string
          storage_path: string
          mime_type: string
          size_bytes?: number
          checksum?: string | null
          visibility?: Database['public']['Enums']["document_visibility"]
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          category_id?: string | null
          owner_type?: Database['public']['Enums']["document_owner_type"]
          owner_id?: string | null
          name?: string
          storage_path?: string
          mime_type?: string
          size_bytes?: number
          checksum?: string | null
          visibility?: Database['public']['Enums']["document_visibility"]
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      grades: {
        Row: {
          id: string
          school_id: string
          assessment_id: string
          student_id: string
          score: number | null
          letter: string | null
          is_absent: boolean
          is_excused: boolean
          is_excluded_from_average: boolean
          comment: string | null
          entered_by: string | null
          entered_at: string
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          assessment_id: string
          student_id: string
          score?: number | null
          letter?: string | null
          is_absent?: boolean
          is_excused?: boolean
          is_excluded_from_average?: boolean
          comment?: string | null
          entered_by?: string | null
          entered_at?: string
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          assessment_id?: string
          student_id?: string
          score?: number | null
          letter?: string | null
          is_absent?: boolean
          is_excused?: boolean
          is_excluded_from_average?: boolean
          comment?: string | null
          entered_by?: string | null
          entered_at?: string
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      grading_scale_bands: {
        Row: {
          id: string
          school_id: string
          scale_id: string
          label: string
          min_value: number
          max_value: number
          numeric_equivalent: number | null
          sequence: number
        }
        Insert: {
          id?: string
          school_id: string
          scale_id: string
          label: string
          min_value: number
          max_value: number
          numeric_equivalent?: number | null
          sequence?: number
        }
        Update: {
          id?: string
          school_id?: string
          scale_id?: string
          label?: string
          min_value?: number
          max_value?: number
          numeric_equivalent?: number | null
          sequence?: number
        }
        Relationships: []
      }
      grading_scales: {
        Row: {
          id: string
          school_id: string
          code: string
          name: string
          kind: Database['public']['Enums']["grading_scale_kind"]
          min_score: number
          max_score: number
          decimals: number
          rounding: Database['public']['Enums']["rounding_mode"]
          passing_score: number
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          code: string
          name: string
          kind?: Database['public']['Enums']["grading_scale_kind"]
          min_score?: number
          max_score?: number
          decimals?: number
          rounding?: Database['public']['Enums']["rounding_mode"]
          passing_score?: number
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          code?: string
          name?: string
          kind?: Database['public']['Enums']["grading_scale_kind"]
          min_score?: number
          max_score?: number
          decimals?: number
          rounding?: Database['public']['Enums']["rounding_mode"]
          passing_score?: number
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_classes: {
        Row: {
          school_id: string
          group_id: string
          class_id: string
        }
        Insert: {
          school_id: string
          group_id: string
          class_id: string
        }
        Update: {
          school_id?: string
          group_id?: string
          class_id?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          code: string
          name: string
          kind: Database['public']['Enums']["group_kind"]
          subject_id: string | null
          max_size: number | null
          status: Database['public']['Enums']["group_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          code: string
          name: string
          kind?: Database['public']['Enums']["group_kind"]
          subject_id?: string | null
          max_size?: number | null
          status?: Database['public']['Enums']["group_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          code?: string
          name?: string
          kind?: Database['public']['Enums']["group_kind"]
          subject_id?: string | null
          max_size?: number | null
          status?: Database['public']['Enums']["group_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      guardians: {
        Row: {
          id: string
          school_id: string
          user_id: string | null
          first_name: string
          last_name: string
          gender: Database['public']['Enums']["gender"] | null
          phone_e164: string
          phone_display: string | null
          secondary_phone_e164: string | null
          email: string | null
          address: string | null
          profession: string | null
          status: Database['public']['Enums']["guardian_status"]
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          school_id: string
          user_id?: string | null
          first_name: string
          last_name: string
          gender?: Database['public']['Enums']["gender"] | null
          phone_e164: string
          phone_display?: string | null
          secondary_phone_e164?: string | null
          email?: string | null
          address?: string | null
          profession?: string | null
          status?: Database['public']['Enums']["guardian_status"]
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string | null
          first_name?: string
          last_name?: string
          gender?: Database['public']['Enums']["gender"] | null
          phone_e164?: string
          phone_display?: string | null
          secondary_phone_e164?: string | null
          email?: string | null
          address?: string | null
          profession?: string | null
          status?: Database['public']['Enums']["guardian_status"]
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      level_subjects: {
        Row: {
          id: string
          school_id: string
          level_id: string
          subject_id: string
          coefficient: number
          weekly_minutes: number
          is_mandatory: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          level_id: string
          subject_id: string
          coefficient?: number
          weekly_minutes?: number
          is_mandatory?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          level_id?: string
          subject_id?: string
          coefficient?: number
          weekly_minutes?: number
          is_mandatory?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      levels: {
        Row: {
          id: string
          school_id: string
          cycle_id: string
          code: string
          name: string
          sequence: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          cycle_id: string
          code: string
          name: string
          sequence?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          cycle_id?: string
          code?: string
          name?: string
          sequence?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      matricule_counters: {
        Row: {
          school_id: string
          academic_year_id: string
          next_seq: number
        }
        Insert: {
          school_id: string
          academic_year_id: string
          next_seq?: number
        }
        Update: {
          school_id?: string
          academic_year_id?: string
          next_seq?: number
        }
        Relationships: []
      }
      membership_roles: {
        Row: {
          membership_id: string
          role_id: string
          granted_at: string
          granted_by: string | null
        }
        Insert: {
          membership_id: string
          role_id: string
          granted_at?: string
          granted_by?: string | null
        }
        Update: {
          membership_id?: string
          role_id?: string
          granted_at?: string
          granted_by?: string | null
        }
        Relationships: []
      }
      membership_scope_grants: {
        Row: {
          id: string
          membership_id: string
          permission_id: string | null
          scope_type: Database['public']['Enums']["scope_type"]
          scope_id: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          membership_id: string
          permission_id?: string | null
          scope_type: Database['public']['Enums']["scope_type"]
          scope_id?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          membership_id?: string
          permission_id?: string | null
          scope_type?: Database['public']['Enums']["scope_type"]
          scope_id?: string | null
          created_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          id: string
          school_id: string
          user_id: string
          notification_type: string
          channels: ("IN_APP" | "PUSH" | "EMAIL" | "SMS" | "WHATSAPP")[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          user_id: string
          notification_type: string
          channels?: ("IN_APP" | "PUSH" | "EMAIL" | "SMS" | "WHATSAPP")[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string
          notification_type?: string
          channels?: ("IN_APP" | "PUSH" | "EMAIL" | "SMS" | "WHATSAPP")[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          school_id: string
          user_id: string
          type: string
          title: string
          body: string
          data: Json
          entity_type: string | null
          entity_id: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          user_id: string
          type: string
          title: string
          body?: string
          data?: Json
          entity_type?: string | null
          entity_id?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string
          type?: string
          title?: string
          body?: string
          data?: Json
          entity_type?: string | null
          entity_id?: string | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          school_id: string
          subscription_id: string | null
          amount: number
          currency: string
          method: Database['public']['Enums']["payment_method"]
          provider: string | null
          provider_reference: string | null
          status: Database['public']['Enums']["payment_status"]
          paid_at: string | null
          recorded_by: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          subscription_id?: string | null
          amount: number
          currency?: string
          method?: Database['public']['Enums']["payment_method"]
          provider?: string | null
          provider_reference?: string | null
          status?: Database['public']['Enums']["payment_status"]
          paid_at?: string | null
          recorded_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          subscription_id?: string | null
          amount?: number
          currency?: string
          method?: Database['public']['Enums']["payment_method"]
          provider?: string | null
          provider_reference?: string | null
          status?: Database['public']['Enums']["payment_status"]
          paid_at?: string | null
          recorded_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          id: string
          code: string
          module: string
          action: string
          description: string
          is_platform_only: boolean
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          module: string
          action: string
          description?: string
          is_platform_only?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          module?: string
          action?: string
          description?: string
          is_platform_only?: boolean
          created_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          code: string
          name: string
          description: string
          price_amount: number
          currency: string
          billing_period: Database['public']['Enums']["billing_period"]
          limits: Json
          features: Json
          is_public: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string
          price_amount?: number
          currency?: string
          billing_period?: Database['public']['Enums']["billing_period"]
          limits?: Json
          features?: Json
          is_public?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string
          price_amount?: number
          currency?: string
          billing_period?: Database['public']['Enums']["billing_period"]
          limits?: Json
          features?: Json
          is_public?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          user_id: string
          is_active: boolean
          granted_by: string | null
          granted_at: string
          revoked_at: string | null
          note: string | null
        }
        Insert: {
          user_id: string
          is_active?: boolean
          granted_by?: string | null
          granted_at?: string
          revoked_at?: string | null
          note?: string | null
        }
        Update: {
          user_id?: string
          is_active?: boolean
          granted_by?: string | null
          granted_at?: string
          revoked_at?: string | null
          note?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          school_id: string
          user_id: string
          endpoint: string
          keys: Json
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          user_id: string
          endpoint: string
          keys?: Json
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string
          endpoint?: string
          keys?: Json
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      report_card_items: {
        Row: {
          id: string
          school_id: string
          report_card_id: string
          subject_id: string | null
          subject_name_snapshot: string
          teacher_name_snapshot: string | null
          coefficient: number
          average: number | null
          weighted_points: number | null
          class_average: number | null
          class_min: number | null
          class_max: number | null
          rank: number | null
          appreciation: string | null
          sequence: number
        }
        Insert: {
          id?: string
          school_id: string
          report_card_id: string
          subject_id?: string | null
          subject_name_snapshot: string
          teacher_name_snapshot?: string | null
          coefficient?: number
          average?: number | null
          weighted_points?: number | null
          class_average?: number | null
          class_min?: number | null
          class_max?: number | null
          rank?: number | null
          appreciation?: string | null
          sequence?: number
        }
        Update: {
          id?: string
          school_id?: string
          report_card_id?: string
          subject_id?: string | null
          subject_name_snapshot?: string
          teacher_name_snapshot?: string | null
          coefficient?: number
          average?: number | null
          weighted_points?: number | null
          class_average?: number | null
          class_min?: number | null
          class_max?: number | null
          rank?: number | null
          appreciation?: string | null
          sequence?: number
        }
        Relationships: []
      }
      report_card_templates: {
        Row: {
          id: string
          school_id: string
          name: string
          layout: Json
          includes: Json
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          name: string
          layout?: Json
          includes?: Json
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          name?: string
          layout?: Json
          includes?: Json
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_cards: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          academic_period_id: string
          student_id: string
          class_id: string
          template_id: string | null
          status: Database['public']['Enums']["report_card_status"]
          general_average: number | null
          rank: number | null
          class_size: number | null
          class_average: number | null
          decision: Database['public']['Enums']["council_decision"] | null
          distinction: Database['public']['Enums']["council_distinction"]
          head_teacher_comment: string | null
          council_comment: string | null
          absences_count: number
          lateness_count: number
          pdf_document_id: string | null
          generated_at: string | null
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          academic_period_id: string
          student_id: string
          class_id: string
          template_id?: string | null
          status?: Database['public']['Enums']["report_card_status"]
          general_average?: number | null
          rank?: number | null
          class_size?: number | null
          class_average?: number | null
          decision?: Database['public']['Enums']["council_decision"] | null
          distinction?: Database['public']['Enums']["council_distinction"]
          head_teacher_comment?: string | null
          council_comment?: string | null
          absences_count?: number
          lateness_count?: number
          pdf_document_id?: string | null
          generated_at?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          academic_period_id?: string
          student_id?: string
          class_id?: string
          template_id?: string | null
          status?: Database['public']['Enums']["report_card_status"]
          general_average?: number | null
          rank?: number | null
          class_size?: number | null
          class_average?: number | null
          decision?: Database['public']['Enums']["council_decision"] | null
          distinction?: Database['public']['Enums']["council_distinction"]
          head_teacher_comment?: string | null
          council_comment?: string | null
          absences_count?: number
          lateness_count?: number
          pdf_document_id?: string | null
          generated_at?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          role_id: string
          permission_id: string
          default_scope: Database['public']['Enums']["scope_type"]
        }
        Insert: {
          role_id: string
          permission_id: string
          default_scope?: Database['public']['Enums']["scope_type"]
        }
        Update: {
          role_id?: string
          permission_id?: string
          default_scope?: Database['public']['Enums']["scope_type"]
        }
        Relationships: []
      }
      roles: {
        Row: {
          id: string
          school_id: string | null
          code: string
          name: string
          description: string
          is_system: boolean
          level: Database['public']['Enums']["role_level"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id?: string | null
          code: string
          name: string
          description?: string
          is_system?: boolean
          level?: Database['public']['Enums']["role_level"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string | null
          code?: string
          name?: string
          description?: string
          is_system?: boolean
          level?: Database['public']['Enums']["role_level"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      room_availability: {
        Row: {
          id: string
          school_id: string
          room_id: string
          academic_year_id: string
          day_of_week: number
          starts_at: string
          ends_at: string
          kind: Database['public']['Enums']["availability_kind"]
          reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          room_id: string
          academic_year_id: string
          day_of_week: number
          starts_at: string
          ends_at: string
          kind?: Database['public']['Enums']["availability_kind"]
          reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          room_id?: string
          academic_year_id?: string
          day_of_week?: number
          starts_at?: string
          ends_at?: string
          kind?: Database['public']['Enums']["availability_kind"]
          reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      room_features: {
        Row: {
          id: string
          school_id: string
          code: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          code: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          code?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      room_room_features: {
        Row: {
          school_id: string
          room_id: string
          feature_id: string
        }
        Insert: {
          school_id: string
          room_id: string
          feature_id: string
        }
        Update: {
          school_id?: string
          room_id?: string
          feature_id?: string
        }
        Relationships: []
      }
      room_types: {
        Row: {
          id: string
          school_id: string
          code: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          code: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          code?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          id: string
          school_id: string
          room_type_id: string | null
          code: string
          name: string
          capacity: number
          building: string | null
          floor: string | null
          is_accessible: boolean
          is_active: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          room_type_id?: string | null
          code: string
          name: string
          capacity?: number
          building?: string | null
          floor?: string | null
          is_accessible?: boolean
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          room_type_id?: string | null
          code?: string
          name?: string
          capacity?: number
          building?: string | null
          floor?: string | null
          is_accessible?: boolean
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_configurations: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          name: string
          working_days: number[]
          day_starts_at: string
          day_ends_at: string
          default_session_minutes: number
          slot_granularity_minutes: number
          allow_multi_slot_sessions: boolean
          solver_options: Json
          is_default: boolean
          status: Database['public']['Enums']["schedule_config_status"]
          created_at: string
          updated_at: string
          cycle_id: string | null
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          name: string
          working_days?: number[]
          day_starts_at?: string
          day_ends_at?: string
          default_session_minutes?: number
          slot_granularity_minutes?: number
          allow_multi_slot_sessions?: boolean
          solver_options?: Json
          is_default?: boolean
          status?: Database['public']['Enums']["schedule_config_status"]
          created_at?: string
          updated_at?: string
          cycle_id?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          name?: string
          working_days?: number[]
          day_starts_at?: string
          day_ends_at?: string
          default_session_minutes?: number
          slot_granularity_minutes?: number
          allow_multi_slot_sessions?: boolean
          solver_options?: Json
          is_default?: boolean
          status?: Database['public']['Enums']["schedule_config_status"]
          created_at?: string
          updated_at?: string
          cycle_id?: string | null
        }
        Relationships: []
      }
      schedule_conflicts: {
        Row: {
          id: string
          school_id: string
          schedule_version_id: string
          session_id: string | null
          conflict_type: string
          severity: Database['public']['Enums']["conflict_severity"]
          title: string
          description: string
          involved: Json
          suggested_resolution: string | null
          status: Database['public']['Enums']["conflict_status"]
          detected_at: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          id?: string
          school_id: string
          schedule_version_id: string
          session_id?: string | null
          conflict_type: string
          severity?: Database['public']['Enums']["conflict_severity"]
          title: string
          description: string
          involved?: Json
          suggested_resolution?: string | null
          status?: Database['public']['Enums']["conflict_status"]
          detected_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          schedule_version_id?: string
          session_id?: string | null
          conflict_type?: string
          severity?: Database['public']['Enums']["conflict_severity"]
          title?: string
          description?: string
          involved?: Json
          suggested_resolution?: string | null
          status?: Database['public']['Enums']["conflict_status"]
          detected_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: []
      }
      schedule_constraints: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          constraint_code: string
          severity: Database['public']['Enums']["constraint_severity"]
          weight: number
          is_enabled: boolean
          scope_type: Database['public']['Enums']["constraint_scope_type"]
          scope_id: string | null
          parameters: Json
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          constraint_code: string
          severity?: Database['public']['Enums']["constraint_severity"]
          weight?: number
          is_enabled?: boolean
          scope_type?: Database['public']['Enums']["constraint_scope_type"]
          scope_id?: string | null
          parameters?: Json
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          constraint_code?: string
          severity?: Database['public']['Enums']["constraint_severity"]
          weight?: number
          is_enabled?: boolean
          scope_type?: Database['public']['Enums']["constraint_scope_type"]
          scope_id?: string | null
          parameters?: Json
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      schedule_generation_jobs: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          schedule_version_id: string | null
          requested_by: string | null
          status: Database['public']['Enums']["generation_job_status"]
          options: Json
          current_step: string | null
          solver_status: Database['public']['Enums']["solver_status"] | null
          score: number | null
          hard_satisfied: boolean | null
          soft_ratio: number | null
          sessions_count: number | null
          variables_count: number | null
          constraints_count: number | null
          duration_ms: number | null
          diagnostics: Json
          error: Json | null
          idempotency_key: string | null
          queued_at: string
          started_at: string | null
          finished_at: string | null
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          schedule_version_id?: string | null
          requested_by?: string | null
          status?: Database['public']['Enums']["generation_job_status"]
          options?: Json
          current_step?: string | null
          solver_status?: Database['public']['Enums']["solver_status"] | null
          score?: number | null
          hard_satisfied?: boolean | null
          soft_ratio?: number | null
          sessions_count?: number | null
          variables_count?: number | null
          constraints_count?: number | null
          duration_ms?: number | null
          diagnostics?: Json
          error?: Json | null
          idempotency_key?: string | null
          queued_at?: string
          started_at?: string | null
          finished_at?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          schedule_version_id?: string | null
          requested_by?: string | null
          status?: Database['public']['Enums']["generation_job_status"]
          options?: Json
          current_step?: string | null
          solver_status?: Database['public']['Enums']["solver_status"] | null
          score?: number | null
          hard_satisfied?: boolean | null
          soft_ratio?: number | null
          sessions_count?: number | null
          variables_count?: number | null
          constraints_count?: number | null
          duration_ms?: number | null
          diagnostics?: Json
          error?: Json | null
          idempotency_key?: string | null
          queued_at?: string
          started_at?: string | null
          finished_at?: string | null
        }
        Relationships: []
      }
      schedule_session_rooms: {
        Row: {
          school_id: string
          session_id: string
          room_id: string
          is_primary: boolean
        }
        Insert: {
          school_id: string
          session_id: string
          room_id: string
          is_primary?: boolean
        }
        Update: {
          school_id?: string
          session_id?: string
          room_id?: string
          is_primary?: boolean
        }
        Relationships: []
      }
      schedule_session_targets: {
        Row: {
          id: string
          school_id: string
          session_id: string
          target_type: Database['public']['Enums']["session_target_type"]
          class_id: string | null
          group_id: string | null
        }
        Insert: {
          id?: string
          school_id: string
          session_id: string
          target_type: Database['public']['Enums']["session_target_type"]
          class_id?: string | null
          group_id?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          session_id?: string
          target_type?: Database['public']['Enums']["session_target_type"]
          class_id?: string | null
          group_id?: string | null
        }
        Relationships: []
      }
      schedule_session_teachers: {
        Row: {
          school_id: string
          session_id: string
          teacher_id: string
          role: Database['public']['Enums']["teacher_role"]
        }
        Insert: {
          school_id: string
          session_id: string
          teacher_id: string
          role?: Database['public']['Enums']["teacher_role"]
        }
        Update: {
          school_id?: string
          session_id?: string
          teacher_id?: string
          role?: Database['public']['Enums']["teacher_role"]
        }
        Relationships: []
      }
      schedule_sessions: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          schedule_version_id: string
          teaching_requirement_id: string | null
          subject_id: string
          day_of_week: number
          start_slot_id: string
          end_slot_id: string
          starts_at: string
          ends_at: string
          duration_minutes: number
          is_locked: boolean
          status: Database['public']['Enums']["schedule_session_status"]
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          schedule_version_id: string
          teaching_requirement_id?: string | null
          subject_id: string
          day_of_week: number
          start_slot_id: string
          end_slot_id: string
          starts_at: string
          ends_at: string
          duration_minutes: number
          is_locked?: boolean
          status?: Database['public']['Enums']["schedule_session_status"]
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          schedule_version_id?: string
          teaching_requirement_id?: string | null
          subject_id?: string
          day_of_week?: number
          start_slot_id?: string
          end_slot_id?: string
          starts_at?: string
          ends_at?: string
          duration_minutes?: number
          is_locked?: boolean
          status?: Database['public']['Enums']["schedule_session_status"]
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_versions: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          number: number
          name: string
          status: Database['public']['Enums']["schedule_version_status"]
          source: Database['public']['Enums']["schedule_version_source"]
          generation_job_id: string | null
          effective_from: string | null
          published_at: string | null
          published_by: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          number: number
          name: string
          status?: Database['public']['Enums']["schedule_version_status"]
          source?: Database['public']['Enums']["schedule_version_source"]
          generation_job_id?: string | null
          effective_from?: string | null
          published_at?: string | null
          published_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          number?: number
          name?: string
          status?: Database['public']['Enums']["schedule_version_status"]
          source?: Database['public']['Enums']["schedule_version_source"]
          generation_job_id?: string | null
          effective_from?: string | null
          published_at?: string | null
          published_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      school_branding_templates: {
        Row: {
          id: string
          school_id: string
          kind: Database['public']['Enums']["branding_template_kind"]
          name: string
          layout: Json
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          kind: Database['public']['Enums']["branding_template_kind"]
          name: string
          layout?: Json
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          kind?: Database['public']['Enums']["branding_template_kind"]
          name?: string
          layout?: Json
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_calendar_events: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          kind: Database['public']['Enums']["calendar_event_kind"]
          name: string
          starts_on: string
          ends_on: string
          blocks_schedule: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          kind: Database['public']['Enums']["calendar_event_kind"]
          name: string
          starts_on: string
          ends_on: string
          blocks_schedule?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          kind?: Database['public']['Enums']["calendar_event_kind"]
          name?: string
          starts_on?: string
          ends_on?: string
          blocks_schedule?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_features: {
        Row: {
          school_id: string
          feature_code: string
          is_enabled: boolean
          override_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          school_id: string
          feature_code: string
          is_enabled?: boolean
          override_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          school_id?: string
          feature_code?: string
          is_enabled?: boolean
          override_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_memberships: {
        Row: {
          id: string
          school_id: string
          user_id: string
          status: Database['public']['Enums']["membership_status"]
          job_title: string | null
          joined_at: string
          disabled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          user_id: string
          status?: Database['public']['Enums']["membership_status"]
          job_title?: string | null
          joined_at?: string
          disabled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string
          status?: Database['public']['Enums']["membership_status"]
          job_title?: string | null
          joined_at?: string
          disabled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_settings: {
        Row: {
          school_id: string
          namespace: Database['public']['Enums']["settings_namespace"]
          settings: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          school_id: string
          namespace: Database['public']['Enums']["settings_namespace"]
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          school_id?: string
          namespace?: Database['public']['Enums']["settings_namespace"]
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      schools: {
        Row: {
          id: string
          slug: string
          name: string
          short_name: string | null
          school_type: Database['public']['Enums']["school_type"]
          status: Database['public']['Enums']["school_status"]
          logo_url: string | null
          favicon_url: string | null
          primary_color: string | null
          secondary_color: string | null
          address: string | null
          city: string | null
          region: string | null
          country_code: string
          phone_e164: string | null
          email: string | null
          website: string | null
          director_name: string | null
          registration_number: string | null
          currency: string
          locale: string
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          short_name?: string | null
          school_type?: Database['public']['Enums']["school_type"]
          status?: Database['public']['Enums']["school_status"]
          logo_url?: string | null
          favicon_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          address?: string | null
          city?: string | null
          region?: string | null
          country_code?: string
          phone_e164?: string | null
          email?: string | null
          website?: string | null
          director_name?: string | null
          registration_number?: string | null
          currency?: string
          locale?: string
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          short_name?: string | null
          school_type?: Database['public']['Enums']["school_type"]
          status?: Database['public']['Enums']["school_status"]
          logo_url?: string | null
          favicon_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          address?: string | null
          city?: string | null
          region?: string | null
          country_code?: string
          phone_e164?: string | null
          email?: string | null
          website?: string | null
          director_name?: string | null
          registration_number?: string | null
          currency?: string
          locale?: string
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_occurrences: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          schedule_session_id: string
          occurs_on: string
          starts_at: string
          ends_at: string
          status: Database['public']['Enums']["occurrence_status"]
          override_room_id: string | null
          override_teacher_id: string | null
          override_starts_at: string | null
          override_ends_at: string | null
          cancellation_reason: string | null
          generated_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          schedule_session_id: string
          occurs_on: string
          starts_at: string
          ends_at: string
          status?: Database['public']['Enums']["occurrence_status"]
          override_room_id?: string | null
          override_teacher_id?: string | null
          override_starts_at?: string | null
          override_ends_at?: string | null
          cancellation_reason?: string | null
          generated_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          schedule_session_id?: string
          occurs_on?: string
          starts_at?: string
          ends_at?: string
          status?: Database['public']['Enums']["occurrence_status"]
          override_room_id?: string | null
          override_teacher_id?: string | null
          override_starts_at?: string | null
          override_ends_at?: string | null
          cancellation_reason?: string | null
          generated_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_enrollments: {
        Row: {
          id: string
          school_id: string
          student_id: string
          academic_year_id: string
          class_id: string
          enrolled_on: string
          is_repeating: boolean
          status: Database['public']['Enums']["enrollment_status"]
          left_on: string | null
          left_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          student_id: string
          academic_year_id: string
          class_id: string
          enrolled_on?: string
          is_repeating?: boolean
          status?: Database['public']['Enums']["enrollment_status"]
          left_on?: string | null
          left_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          student_id?: string
          academic_year_id?: string
          class_id?: string
          enrolled_on?: string
          is_repeating?: boolean
          status?: Database['public']['Enums']["enrollment_status"]
          left_on?: string | null
          left_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_groups: {
        Row: {
          id: string
          school_id: string
          student_id: string
          group_id: string
          academic_year_id: string
          joined_at: string
          left_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          student_id: string
          group_id: string
          academic_year_id: string
          joined_at?: string
          left_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          student_id?: string
          group_id?: string
          academic_year_id?: string
          joined_at?: string
          left_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      student_guardians: {
        Row: {
          id: string
          school_id: string
          student_id: string
          guardian_id: string
          relationship: Database['public']['Enums']["guardian_relationship"]
          is_legal_guardian: boolean
          is_primary_contact: boolean
          can_pick_up: boolean
          receives_notifications: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          student_id: string
          guardian_id: string
          relationship: Database['public']['Enums']["guardian_relationship"]
          is_legal_guardian?: boolean
          is_primary_contact?: boolean
          can_pick_up?: boolean
          receives_notifications?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          student_id?: string
          guardian_id?: string
          relationship?: Database['public']['Enums']["guardian_relationship"]
          is_legal_guardian?: boolean
          is_primary_contact?: boolean
          can_pick_up?: boolean
          receives_notifications?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_transfers: {
        Row: {
          id: string
          school_id: string
          student_id: string
          academic_year_id: string
          from_class_id: string | null
          to_class_id: string | null
          effective_on: string
          reason: string | null
          decided_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          student_id: string
          academic_year_id: string
          from_class_id?: string | null
          to_class_id?: string | null
          effective_on?: string
          reason?: string | null
          decided_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          student_id?: string
          academic_year_id?: string
          from_class_id?: string | null
          to_class_id?: string | null
          effective_on?: string
          reason?: string | null
          decided_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          id: string
          school_id: string
          user_id: string | null
          matricule: string
          first_name: string
          last_name: string
          middle_names: string | null
          gender: Database['public']['Enums']["gender"] | null
          birth_date: string | null
          birth_place: string | null
          nationality: string | null
          photo_url: string | null
          address: string | null
          phone_e164: string | null
          email: string | null
          status: Database['public']['Enums']["student_status"]
          notes: string | null
          medical_notes: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          school_id: string
          user_id?: string | null
          matricule: string
          first_name: string
          last_name: string
          middle_names?: string | null
          gender?: Database['public']['Enums']["gender"] | null
          birth_date?: string | null
          birth_place?: string | null
          nationality?: string | null
          photo_url?: string | null
          address?: string | null
          phone_e164?: string | null
          email?: string | null
          status?: Database['public']['Enums']["student_status"]
          notes?: string | null
          medical_notes?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string | null
          matricule?: string
          first_name?: string
          last_name?: string
          middle_names?: string | null
          gender?: Database['public']['Enums']["gender"] | null
          birth_date?: string | null
          birth_place?: string | null
          nationality?: string | null
          photo_url?: string | null
          address?: string | null
          phone_e164?: string | null
          email?: string | null
          status?: Database['public']['Enums']["student_status"]
          notes?: string | null
          medical_notes?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      subjects: {
        Row: {
          id: string
          school_id: string
          code: string
          name: string
          short_name: string | null
          description: string
          category: string | null
          color: string | null
          default_coefficient: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          code: string
          name: string
          short_name?: string | null
          description?: string
          category?: string | null
          color?: string | null
          default_coefficient?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          code?: string
          name?: string
          short_name?: string | null
          description?: string
          category?: string | null
          color?: string | null
          default_coefficient?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_items: {
        Row: {
          id: string
          school_id: string
          subscription_id: string
          metric: Database['public']['Enums']["usage_metric"]
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          school_id: string
          subscription_id: string
          metric: Database['public']['Enums']["usage_metric"]
          quantity?: number
          unit_price?: number
        }
        Update: {
          id?: string
          school_id?: string
          subscription_id?: string
          metric?: Database['public']['Enums']["usage_metric"]
          quantity?: number
          unit_price?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          school_id: string
          plan_id: string
          status: Database['public']['Enums']["subscription_status"]
          started_at: string
          current_period_start: string | null
          current_period_end: string | null
          trial_ends_at: string | null
          cancel_at: string | null
          cancelled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          plan_id: string
          status?: Database['public']['Enums']["subscription_status"]
          started_at?: string
          current_period_start?: string | null
          current_period_end?: string | null
          trial_ends_at?: string | null
          cancel_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          plan_id?: string
          status?: Database['public']['Enums']["subscription_status"]
          started_at?: string
          current_period_start?: string | null
          current_period_end?: string | null
          trial_ends_at?: string | null
          cancel_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_operations: {
        Row: {
          id: string
          school_id: string
          user_id: string
          client_operation_id: string
          operation_type: string
          payload: Json
          status: Database['public']['Enums']["sync_operation_status"]
          result: Json | null
          error: Json | null
          received_at: string
          applied_at: string | null
        }
        Insert: {
          id?: string
          school_id: string
          user_id: string
          client_operation_id: string
          operation_type: string
          payload?: Json
          status?: Database['public']['Enums']["sync_operation_status"]
          result?: Json | null
          error?: Json | null
          received_at?: string
          applied_at?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string
          client_operation_id?: string
          operation_type?: string
          payload?: Json
          status?: Database['public']['Enums']["sync_operation_status"]
          result?: Json | null
          error?: Json | null
          received_at?: string
          applied_at?: string | null
        }
        Relationships: []
      }
      teacher_availability: {
        Row: {
          id: string
          school_id: string
          teacher_id: string
          academic_year_id: string
          day_of_week: number
          starts_at: string
          ends_at: string
          kind: Database['public']['Enums']["availability_kind"]
          reason: string | null
          valid_from: string | null
          valid_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          teacher_id: string
          academic_year_id: string
          day_of_week: number
          starts_at: string
          ends_at: string
          kind?: Database['public']['Enums']["availability_kind"]
          reason?: string | null
          valid_from?: string | null
          valid_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          teacher_id?: string
          academic_year_id?: string
          day_of_week?: number
          starts_at?: string
          ends_at?: string
          kind?: Database['public']['Enums']["availability_kind"]
          reason?: string | null
          valid_from?: string | null
          valid_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      teacher_subjects: {
        Row: {
          school_id: string
          teacher_id: string
          subject_id: string
          is_primary: boolean
          created_at: string
        }
        Insert: {
          school_id: string
          teacher_id: string
          subject_id: string
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          school_id?: string
          teacher_id?: string
          subject_id?: string
          is_primary?: boolean
          created_at?: string
        }
        Relationships: []
      }
      teachers: {
        Row: {
          id: string
          school_id: string
          user_id: string | null
          staff_number: string
          first_name: string
          last_name: string
          gender: Database['public']['Enums']["gender"] | null
          birth_date: string | null
          phone_e164: string | null
          email: string | null
          address: string | null
          photo_url: string | null
          hire_date: string | null
          employment_type: Database['public']['Enums']["employment_type"]
          specialty: string | null
          status: Database['public']['Enums']["teacher_status"]
          weekly_minutes_min: number | null
          weekly_minutes_max: number | null
          notes: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          school_id: string
          user_id?: string | null
          staff_number: string
          first_name: string
          last_name: string
          gender?: Database['public']['Enums']["gender"] | null
          birth_date?: string | null
          phone_e164?: string | null
          email?: string | null
          address?: string | null
          photo_url?: string | null
          hire_date?: string | null
          employment_type?: Database['public']['Enums']["employment_type"]
          specialty?: string | null
          status?: Database['public']['Enums']["teacher_status"]
          weekly_minutes_min?: number | null
          weekly_minutes_max?: number | null
          notes?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          user_id?: string | null
          staff_number?: string
          first_name?: string
          last_name?: string
          gender?: Database['public']['Enums']["gender"] | null
          birth_date?: string | null
          phone_e164?: string | null
          email?: string | null
          address?: string | null
          photo_url?: string | null
          hire_date?: string | null
          employment_type?: Database['public']['Enums']["employment_type"]
          specialty?: string | null
          status?: Database['public']['Enums']["teacher_status"]
          weekly_minutes_min?: number | null
          weekly_minutes_max?: number | null
          notes?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      teaching_assignments: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          teacher_id: string
          subject_id: string
          class_id: string | null
          group_id: string | null
          weekly_minutes: number
          academic_period_id: string | null
          status: Database['public']['Enums']["assignment_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          teacher_id: string
          subject_id: string
          class_id?: string | null
          group_id?: string | null
          weekly_minutes?: number
          academic_period_id?: string | null
          status?: Database['public']['Enums']["assignment_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          teacher_id?: string
          subject_id?: string
          class_id?: string | null
          group_id?: string | null
          weekly_minutes?: number
          academic_period_id?: string | null
          status?: Database['public']['Enums']["assignment_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      teaching_requirement_targets: {
        Row: {
          id: string
          school_id: string
          requirement_id: string
          target_type: Database['public']['Enums']["requirement_target_type"]
          class_id: string | null
          group_id: string | null
        }
        Insert: {
          id?: string
          school_id: string
          requirement_id: string
          target_type: Database['public']['Enums']["requirement_target_type"]
          class_id?: string | null
          group_id?: string | null
        }
        Update: {
          id?: string
          school_id?: string
          requirement_id?: string
          target_type?: Database['public']['Enums']["requirement_target_type"]
          class_id?: string | null
          group_id?: string | null
        }
        Relationships: []
      }
      teaching_requirement_teachers: {
        Row: {
          school_id: string
          requirement_id: string
          teacher_id: string
          role: Database['public']['Enums']["teacher_role"]
        }
        Insert: {
          school_id: string
          requirement_id: string
          teacher_id: string
          role?: Database['public']['Enums']["teacher_role"]
        }
        Update: {
          school_id?: string
          requirement_id?: string
          teacher_id?: string
          role?: Database['public']['Enums']["teacher_role"]
        }
        Relationships: []
      }
      teaching_requirements: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          subject_id: string
          teaching_assignment_id: string | null
          weekly_minutes: number
          sessions_count: number
          session_duration_minutes: number | null
          allowed_durations: number[] | null
          room_requirement_mode: Database['public']['Enums']["room_requirement_mode"]
          required_room_id: string | null
          required_room_type_id: string | null
          preferred_room_id: string | null
          min_capacity: number | null
          required_features: string[]
          priority: number
          status: Database['public']['Enums']["requirement_status"]
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          subject_id: string
          teaching_assignment_id?: string | null
          weekly_minutes: number
          sessions_count?: number
          session_duration_minutes?: number | null
          allowed_durations?: number[] | null
          room_requirement_mode?: Database['public']['Enums']["room_requirement_mode"]
          required_room_id?: string | null
          required_room_type_id?: string | null
          preferred_room_id?: string | null
          min_capacity?: number | null
          required_features?: string[]
          priority?: number
          status?: Database['public']['Enums']["requirement_status"]
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          subject_id?: string
          teaching_assignment_id?: string | null
          weekly_minutes?: number
          sessions_count?: number
          session_duration_minutes?: number | null
          allowed_durations?: number[] | null
          room_requirement_mode?: Database['public']['Enums']["room_requirement_mode"]
          required_room_id?: string | null
          required_room_type_id?: string | null
          preferred_room_id?: string | null
          min_capacity?: number | null
          required_features?: string[]
          priority?: number
          status?: Database['public']['Enums']["requirement_status"]
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      time_slots: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          schedule_configuration_id: string
          day_of_week: number
          position: number
          starts_at: string
          ends_at: string
          kind: Database['public']['Enums']["time_slot_kind"]
          label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          academic_year_id: string
          schedule_configuration_id: string
          day_of_week: number
          position: number
          starts_at: string
          ends_at: string
          kind?: Database['public']['Enums']["time_slot_kind"]
          label?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          academic_year_id?: string
          schedule_configuration_id?: string
          day_of_week?: number
          position?: number
          starts_at?: string
          ends_at?: string
          kind?: Database['public']['Enums']["time_slot_kind"]
          label?: string | null
          created_at?: string
        }
        Relationships: []
      }
      usage_records: {
        Row: {
          id: string
          school_id: string
          metric: Database['public']['Enums']["usage_metric"]
          value: number
          recorded_for: string
          source: string | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          metric: Database['public']['Enums']["usage_metric"]
          value?: number
          recorded_for?: string
          source?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          metric?: Database['public']['Enums']["usage_metric"]
          value?: number
          recorded_for?: string
          source?: string | null
          created_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          auth_email: string
          contact_email: string | null
          phone_e164: string | null
          first_name: string
          last_name: string
          display_name: string | null
          avatar_url: string | null
          locale: string
          status: Database['public']['Enums']["account_status"]
          last_login_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          auth_email: string
          contact_email?: string | null
          phone_e164?: string | null
          first_name?: string
          last_name?: string
          display_name?: string | null
          avatar_url?: string | null
          locale?: string
          status?: Database['public']['Enums']["account_status"]
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_email?: string
          contact_email?: string | null
          phone_e164?: string | null
          first_name?: string
          last_name?: string
          display_name?: string | null
          avatar_url?: string | null
          locale?: string
          status?: Database['public']['Enums']["account_status"]
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_lateness_records: {
        Row: {
          id: string | null
          school_id: string | null
          register_id: string | null
          student_id: string | null
          minutes_late: number | null
          comment: string | null
          recorded_by: string | null
          recorded_at: string | null
        }
        Relationships: []
      }
    }
    Functions: Record<string, never>
    Enums: {
      academic_period_kind: "TERM" | "SEMESTER" | "QUARTER"
      academic_period_status: "OPEN" | "GRADING" | "LOCKED" | "PUBLISHED"
      academic_year_status: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED"
      access_event_type: "ACCOUNT_CREATED" | "CREDENTIALS_QUEUED" | "CREDENTIALS_SENT" | "CREDENTIALS_DELIVERED" | "CREDENTIALS_FAILED" | "ACCOUNT_ACTIVATED" | "PASSWORD_CHANGED" | "PASSWORD_RESET" | "ACCOUNT_SUSPENDED" | "ACCOUNT_REACTIVATED" | "PHONE_CHANGED"
      account_status: "CREATED" | "ACTIVE" | "SUSPENDED" | "DISABLED"
      account_subject_kind: "STAFF" | "TEACHER" | "GUARDIAN" | "STUDENT"
      activation_status: "NOT_ACTIVATED" | "ACTIVATED"
      announcement_status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
      application_status: "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "ENROLLED" | "CANCELLED"
      assessment_status: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED"
      assignment_status: "DRAFT" | "ACTIVE" | "ENDED"
      attendance_register_status: "OPEN" | "SUBMITTED" | "VALIDATED"
      attendance_status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED"
      availability_kind: "AVAILABLE" | "UNAVAILABLE" | "PREFERRED" | "AVOID"
      billing_period: "MONTHLY" | "QUARTERLY" | "YEARLY" | "ONE_TIME"
      branding_template_kind: "REPORT_CARD" | "CERTIFICATE" | "LIST" | "SCHEDULE" | "TRANSCRIPT" | "BADGE"
      calendar_event_kind: "HOLIDAY" | "VACATION" | "PUBLIC_HOLIDAY" | "EXAM" | "EVENT" | "CLOSURE"
      class_status: "ACTIVE" | "ARCHIVED"
      conflict_severity: "HARD" | "WARNING" | "INFO"
      conflict_status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "IGNORED"
      constraint_scope_type: "SCHOOL" | "LEVEL" | "CLASS" | "GROUP" | "SUBJECT" | "TEACHER" | "ROOM" | "TASKS"
      constraint_severity: "HARD" | "SOFT"
      council_decision: "PROMOTED" | "REPEAT" | "CONDITIONAL" | "EXCLUDED" | "PENDING"
      council_distinction: "CONGRATULATIONS" | "ENCOURAGEMENTS" | "HONOUR_ROLL" | "WARNING_WORK" | "WARNING_CONDUCT" | "NONE"
      council_status: "PLANNED" | "HELD" | "CLOSED"
      delivery_channel: "SMS" | "WHATSAPP" | "EMAIL" | "PRINT"
      delivery_reason: "INITIAL" | "RESET" | "RESEND"
      delivery_status: "PENDING" | "PROCESSING" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED"
      document_owner_type: "STUDENT" | "GUARDIAN" | "TEACHER" | "CLASS" | "SCHOOL"
      document_visibility: "PRIVATE" | "SCHOOL" | "OWNER" | "GUARDIANS"
      employment_type: "PERMANENT" | "CONTRACT" | "HOURLY" | "INTERN" | "OTHER"
      enrollment_status: "ENROLLED" | "TRANSFERRED_OUT" | "WITHDRAWN" | "COMPLETED"
      gender: "M" | "F" | "OTHER"
      generation_job_status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"
      grading_scale_kind: "NUMERIC" | "LETTER"
      group_kind: "LANGUAGE" | "OPTION" | "ACTIVITY" | "PEDAGOGICAL" | "SUPPORT" | "OTHER"
      group_status: "ACTIVE" | "ARCHIVED"
      guardian_relationship: "FATHER" | "MOTHER" | "TUTOR" | "LEGAL_GUARDIAN" | "SIBLING" | "OTHER"
      guardian_status: "ACTIVE" | "INACTIVE"
      justification_status: "PENDING" | "APPROVED" | "REJECTED"
      login_kind: "EMAIL" | "PHONE" | "MATRICULE"
      membership_status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED"
      notification_channel: "IN_APP" | "PUSH" | "EMAIL" | "SMS" | "WHATSAPP"
      occurrence_status: "SCHEDULED" | "CANCELLED" | "MOVED" | "REPLACED" | "DONE"
      payment_method: "MOBILE_MONEY" | "BANK_TRANSFER" | "CASH" | "CARD" | "OTHER"
      payment_status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED"
      report_card_status: "DRAFT" | "GENERATED" | "VALIDATED" | "PUBLISHED"
      requirement_status: "DRAFT" | "ACTIVE" | "SATISFIED" | "IGNORED"
      requirement_target_type: "CLASS" | "GROUP"
      role_level: "PLATFORM" | "SCHOOL"
      room_requirement_mode: "NONE" | "PREFERRED" | "REQUIRED_ROOM" | "REQUIRED_TYPE"
      rounding_mode: "NONE" | "HALF_UP" | "NEAREST_HALF" | "NEAREST_QUARTER" | "FLOOR" | "CEIL"
      schedule_config_status: "DRAFT" | "ACTIVE" | "ARCHIVED"
      schedule_session_status: "PLANNED" | "CONFIRMED" | "SUSPENDED"
      schedule_version_source: "MANUAL" | "GENERATED"
      schedule_version_status: "DRAFT" | "VALIDATED" | "PUBLISHED" | "ARCHIVED"
      school_status: "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED"
      school_type: "PRIMARY" | "SECONDARY" | "HIGH_SCHOOL" | "TECHNICAL" | "MIXED" | "OTHER"
      scope_type: "GLOBAL" | "SCHOOL" | "CYCLE" | "LEVEL" | "CLASS" | "GROUP" | "SUBJECT" | "CHILDREN" | "SELF"
      session_target_type: "CLASS" | "GROUP"
      settings_namespace: "academic" | "grading" | "attendance" | "schedule" | "reporting" | "notifications" | "access"
      solver_status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "TIME_LIMIT" | "UNKNOWN"
      student_status: "ACTIVE" | "TRANSFERRED" | "GRADUATED" | "DROPPED" | "SUSPENDED" | "ARCHIVED"
      subscription_status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED"
      sync_operation_status: "RECEIVED" | "APPLIED" | "REJECTED" | "CONFLICT"
      teacher_role: "LEAD" | "ASSISTANT"
      teacher_status: "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "LEFT"
      time_slot_kind: "TEACHING" | "BREAK" | "LUNCH"
      usage_metric: "STUDENTS" | "USERS" | "STORAGE_MB" | "SMS_SENT" | "SCHEDULE_GENERATIONS"
      write_source: "ONLINE" | "OFFLINE_SYNC" | "IMPORT" | "SYSTEM"
    }
    CompositeTypes: Record<string, never>
  }
}

// --- Raccourcis pratiques ---------------------------------------------------

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
