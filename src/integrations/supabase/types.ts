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
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_costs: {
        Row: {
          created_at: string
          credits: number
          description: string | null
          operation: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits: number
          description?: string | null
          operation: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits?: number
          description?: string | null
          operation?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tokens_used: number | null
          tool_calls: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tokens_used?: number | null
          tool_calls?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tokens_used?: number | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_rate_limit_configs: {
        Row: {
          burst_max: number
          burst_window_ms: number
          created_at: string
          fallback_max: number
          fallback_window_ms: number
          id: string
          note: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          burst_max?: number
          burst_window_ms?: number
          created_at?: string
          fallback_max?: number
          fallback_window_ms?: number
          id?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          burst_max?: number
          burst_window_ms?: number
          created_at?: string
          fallback_max?: number
          fallback_window_ms?: number
          id?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_status_events: {
        Row: {
          code: string | null
          created_at: string
          id: string
          latency_ms: number
          ok: boolean
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          latency_ms?: number
          ok: boolean
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          latency_ms?: number
          ok?: boolean
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_status_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          created_at: string
          credits: number
          id: string
          operation: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits: number
          id?: string
          operation: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          operation?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      alarm_configs: {
        Row: {
          area: string
          auto_clear: boolean
          category: Database["public"]["Enums"]["alarm_category"]
          created_at: string
          deadband: number | null
          delay_ms: number
          description: string
          equipment_type: string
          high_high_limit: number | null
          high_limit: number | null
          id: string
          location: string
          low_limit: number | null
          low_low_limit: number | null
          notify_on_ack: boolean
          notify_on_clear: boolean
          notify_on_trigger: boolean
          project_id: string
          require_acknowledgment: boolean
          severity: Database["public"]["Enums"]["alarm_severity"]
          suppressible: boolean
          tag_name: string
          updated_at: string
        }
        Insert: {
          area?: string
          auto_clear?: boolean
          category?: Database["public"]["Enums"]["alarm_category"]
          created_at?: string
          deadband?: number | null
          delay_ms?: number
          description?: string
          equipment_type?: string
          high_high_limit?: number | null
          high_limit?: number | null
          id?: string
          location?: string
          low_limit?: number | null
          low_low_limit?: number | null
          notify_on_ack?: boolean
          notify_on_clear?: boolean
          notify_on_trigger?: boolean
          project_id: string
          require_acknowledgment?: boolean
          severity?: Database["public"]["Enums"]["alarm_severity"]
          suppressible?: boolean
          tag_name: string
          updated_at?: string
        }
        Update: {
          area?: string
          auto_clear?: boolean
          category?: Database["public"]["Enums"]["alarm_category"]
          created_at?: string
          deadband?: number | null
          delay_ms?: number
          description?: string
          equipment_type?: string
          high_high_limit?: number | null
          high_limit?: number | null
          id?: string
          location?: string
          low_limit?: number | null
          low_low_limit?: number | null
          notify_on_ack?: boolean
          notify_on_clear?: boolean
          notify_on_trigger?: boolean
          project_id?: string
          require_acknowledgment?: boolean
          severity?: Database["public"]["Enums"]["alarm_severity"]
          suppressible?: boolean
          tag_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alarm_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      alarm_history: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alarm_config_id: string | null
          area: string
          category: Database["public"]["Enums"]["alarm_category"]
          cleared_at: string | null
          cleared_by: string | null
          description: string
          equipment_type: string
          id: string
          location: string
          message: string | null
          operator_note: string | null
          project_id: string
          setpoint: number | null
          severity: Database["public"]["Enums"]["alarm_severity"]
          state: Database["public"]["Enums"]["alarm_state"]
          tag_name: string
          triggered_at: string
          value: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alarm_config_id?: string | null
          area?: string
          category?: Database["public"]["Enums"]["alarm_category"]
          cleared_at?: string | null
          cleared_by?: string | null
          description?: string
          equipment_type?: string
          id?: string
          location?: string
          message?: string | null
          operator_note?: string | null
          project_id: string
          setpoint?: number | null
          severity?: Database["public"]["Enums"]["alarm_severity"]
          state?: Database["public"]["Enums"]["alarm_state"]
          tag_name: string
          triggered_at?: string
          value?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alarm_config_id?: string | null
          area?: string
          category?: Database["public"]["Enums"]["alarm_category"]
          cleared_at?: string | null
          cleared_by?: string | null
          description?: string
          equipment_type?: string
          id?: string
          location?: string
          message?: string | null
          operator_note?: string | null
          project_id?: string
          setpoint?: number | null
          severity?: Database["public"]["Enums"]["alarm_severity"]
          state?: Database["public"]["Enums"]["alarm_state"]
          tag_name?: string
          triggered_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alarm_history_alarm_config_id_fkey"
            columns: ["alarm_config_id"]
            isOneToOne: false
            referencedRelation: "alarm_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alarm_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          scopes: string[]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          scopes?: string[]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          scopes?: string[]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          chain_hash: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
          previous_hash: string | null
          resource_id: string | null
          resource_type: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          chain_hash?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          previous_hash?: string | null
          resource_id?: string | null
          resource_type: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          chain_hash?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          previous_hash?: string | null
          resource_id?: string | null
          resource_type?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          stripe_event_id: string | null
          stripe_invoice_id: string | null
          tenant_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          stripe_event_id?: string | null
          stripe_invoice_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          stripe_event_id?: string | null
          stripe_invoice_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_categories: {
        Row: {
          id: string
          name: Json
          slug: string
        }
        Insert: {
          id?: string
          name?: Json
          slug: string
        }
        Update: {
          id?: string
          name?: Json
          slug?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string | null
          category_id: string | null
          content: Json
          cover_image: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          seo_metadata: Json | null
          slug: string
          status: string
          title: Json
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          content?: Json
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          seo_metadata?: Json | null
          slug: string
          status?: string
          title?: Json
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          content?: Json
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          seo_metadata?: Json | null
          slug?: string
          status?: string
          title?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      calculations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          inputs: Json
          project_id: string
          results: Json
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          inputs?: Json
          project_id: string
          results?: Json
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          inputs?: Json
          project_id?: string
          results?: Json
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_component_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_component_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_component_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_components: {
        Row: {
          category_id: string
          certifications: string[] | null
          commercial_name: string | null
          created_at: string
          datasheet_url: string | null
          description: string | null
          discontinued: boolean
          embedding: string | null
          etim_class: string | null
          id: string
          image_urls: string[] | null
          keywords: unknown
          list_price_brl: number | null
          manufacturer_id: string
          part_number: string
          rated_current_a: number | null
          rated_voltage_v: number | null
          specs: Json
          updated_at: string
        }
        Insert: {
          category_id: string
          certifications?: string[] | null
          commercial_name?: string | null
          created_at?: string
          datasheet_url?: string | null
          description?: string | null
          discontinued?: boolean
          embedding?: string | null
          etim_class?: string | null
          id?: string
          image_urls?: string[] | null
          keywords?: unknown
          list_price_brl?: number | null
          manufacturer_id: string
          part_number: string
          rated_current_a?: number | null
          rated_voltage_v?: number | null
          specs?: Json
          updated_at?: string
        }
        Update: {
          category_id?: string
          certifications?: string[] | null
          commercial_name?: string | null
          created_at?: string
          datasheet_url?: string | null
          description?: string | null
          discontinued?: boolean
          embedding?: string | null
          etim_class?: string | null
          id?: string
          image_urls?: string[] | null
          keywords?: unknown
          list_price_brl?: number | null
          manufacturer_id?: string
          part_number?: string
          rated_current_a?: number | null
          rated_voltage_v?: number | null
          specs?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_components_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_component_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_components_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "catalog_manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_manufacturers: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          website?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string
          cnpj: string
          contact_name: string
          created_at: string
          created_by: string
          email: string
          id: string
          logo_url: string | null
          name: string
          notes: string
          phone: string
          sector: string
          sla_pct: number
          status: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          updated_at: string
          website: string
        }
        Insert: {
          address?: string
          cnpj?: string
          contact_name?: string
          created_at?: string
          created_by: string
          email?: string
          id?: string
          logo_url?: string | null
          name: string
          notes?: string
          phone?: string
          sector?: string
          sla_pct?: number
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          updated_at?: string
          website?: string
        }
        Update: {
          address?: string
          cnpj?: string
          contact_name?: string
          created_at?: string
          created_by?: string
          email?: string
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string
          phone?: string
          sector?: string
          sla_pct?: number
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id?: string
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_id: string | null
          resource_id: string
          resource_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          resource_id: string
          resource_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          resource_id?: string
          resource_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      diagrams: {
        Row: {
          canvas_data: Json
          created_at: string
          id: string
          name: string
          project_id: string
          updated_at: string
          version: number
        }
        Insert: {
          canvas_data?: Json
          created_at?: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          canvas_data?: Json
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "diagrams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      electrical_components: {
        Row: {
          category: string
          created_at: string
          datasheet_url: string | null
          id: string
          manufacturer: string
          model: string
          specifications: Json
          symbol_svg: string | null
        }
        Insert: {
          category: string
          created_at?: string
          datasheet_url?: string | null
          id?: string
          manufacturer: string
          model: string
          specifications?: Json
          symbol_svg?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          datasheet_url?: string | null
          id?: string
          manufacturer?: string
          model?: string
          specifications?: Json
          symbol_svg?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          tenant_ids: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          tenant_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          tenant_ids?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      file_versions: {
        Row: {
          created_at: string
          created_by: string
          file_id: string
          id: string
          storage_path: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          file_id: string
          id?: string
          storage_path: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          file_id?: string
          id?: string
          storage_path?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_versions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          name: string
          project_id: string
          size_bytes: number | null
          storage_path: string
          tenant_id: string
          updated_at: string
          uploaded_by: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          project_id: string
          size_bytes?: number | null
          storage_path: string
          tenant_id: string
          updated_at?: string
          uploaded_by: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          project_id?: string
          size_bytes?: number | null
          storage_path?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      function_block_instances: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          pin_bindings: Json
          project_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          pin_bindings?: Json
          project_id: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          pin_bindings?: Json
          project_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "function_block_instances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_name: string | null
          invited_sector: string | null
          role: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_name?: string | null
          invited_sector?: string | null
          role?: string
          tenant_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_name?: string | null
          invited_sector?: string | null
          role?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          pdf_url: string | null
          status: string
          stripe_invoice_id: string | null
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          pdf_url?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          pdf_url?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_alerts: {
        Row: {
          created_at: string | null
          device_id: string | null
          id: string
          is_resolved: boolean | null
          level: Database["public"]["Enums"]["alert_level"]
          message: string
          timestamp: string
          value: number | null
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          is_resolved?: boolean | null
          level: Database["public"]["Enums"]["alert_level"]
          message: string
          timestamp?: string
          value?: number | null
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          is_resolved?: boolean | null
          level?: Database["public"]["Enums"]["alert_level"]
          message?: string
          timestamp?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "iot_alerts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "iot_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_command_log: {
        Row: {
          acked_at: string | null
          command: string
          command_id: string
          delivered_at: string | null
          executed_at: string | null
          expires_at: string | null
          fail_safe_on_timeout: boolean
          id: string
          metadata: Json
          payload: Json
          requested_at: string
          requested_by: string | null
          result_message: string | null
          state: Database["public"]["Enums"]["iot_command_state"]
          target_device: string
          tenant_id: string
          watchdog_timeout_ms: number
        }
        Insert: {
          acked_at?: string | null
          command: string
          command_id: string
          delivered_at?: string | null
          executed_at?: string | null
          expires_at?: string | null
          fail_safe_on_timeout?: boolean
          id?: string
          metadata?: Json
          payload?: Json
          requested_at?: string
          requested_by?: string | null
          result_message?: string | null
          state?: Database["public"]["Enums"]["iot_command_state"]
          target_device: string
          tenant_id: string
          watchdog_timeout_ms?: number
        }
        Update: {
          acked_at?: string | null
          command?: string
          command_id?: string
          delivered_at?: string | null
          executed_at?: string | null
          expires_at?: string | null
          fail_safe_on_timeout?: boolean
          id?: string
          metadata?: Json
          payload?: Json
          requested_at?: string
          requested_by?: string | null
          result_message?: string | null
          state?: Database["public"]["Enums"]["iot_command_state"]
          target_device?: string
          tenant_id?: string
          watchdog_timeout_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "iot_command_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_devices: {
        Row: {
          created_at: string | null
          device_external_id: string
          id: string
          kind: Database["public"]["Enums"]["sensor_kind"] | null
          metadata: Json | null
          name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          device_external_id: string
          id?: string
          kind?: Database["public"]["Enums"]["sensor_kind"] | null
          metadata?: Json | null
          name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          device_external_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["sensor_kind"] | null
          metadata?: Json | null
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iot_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_readings: {
        Row: {
          created_at: string | null
          device_id: string | null
          id: string
          ingested_at: string
          message_id: string | null
          quality: string
          seq: number | null
          timestamp: string
          ttl_ms: number
          value: number
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          ingested_at?: string
          message_id?: string | null
          quality?: string
          seq?: number | null
          timestamp?: string
          ttl_ms?: number
          value: number
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          ingested_at?: string
          message_id?: string | null
          quality?: string
          seq?: number | null
          timestamp?: string
          ttl_ms?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "iot_readings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "iot_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_text: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          chunk_text: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          chunk_text?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          source_id: string | null
          source_type: string
          tenant_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          source_id?: string | null
          source_type: string
          tenant_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          source_id?: string | null
          source_type?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_webhook_processed: {
        Row: {
          payment_id: string
          processed_at: string
        }
        Insert: {
          payment_id: string
          processed_at?: string
        }
        Update: {
          payment_id?: string
          processed_at?: string
        }
        Relationships: []
      }
      normative_chunks: {
        Row: {
          category: string
          chunk_text: string
          chunk_vector: string | null
          created_at: string
          document_id: string
          id: string
          metadata: Json | null
        }
        Insert: {
          category: string
          chunk_text: string
          chunk_vector?: string | null
          created_at?: string
          document_id: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          category?: string
          chunk_text?: string
          chunk_vector?: string | null
          created_at?: string
          document_id?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "normative_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "normative_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      normative_documents: {
        Row: {
          code: string
          created_at: string
          id: string
          section: string | null
          source_type: string
          title: string
          version: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          section?: string | null
          source_type: string
          title: string
          version?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          section?: string | null
          source_type?: string
          title?: string
          version?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          read_at: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          features: Json | null
          id: string
          max_ai_tokens_month: number
          max_projects: number
          max_storage_mb: number
          max_users: number
          plan: string
        }
        Insert: {
          features?: Json | null
          id?: string
          max_ai_tokens_month?: number
          max_projects?: number
          max_storage_mb?: number
          max_users?: number
          plan: string
        }
        Update: {
          features?: Json | null
          id?: string
          max_ai_tokens_month?: number
          max_projects?: number
          max_storage_mb?: number
          max_users?: number
          plan?: string
        }
        Relationships: []
      }
      plant_telemetry: {
        Row: {
          last_updated: string | null
          tag_id: string
          value: number | null
        }
        Insert: {
          last_updated?: string | null
          tag_id: string
          value?: number | null
        }
        Update: {
          last_updated?: string | null
          tag_id?: string
          value?: number | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          locale: string
          preferences: Json | null
          role: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          locale?: string
          preferences?: Json | null
          role?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          locale?: string
          preferences?: Json | null
          role?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_bom_items: {
        Row: {
          component_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          manufacturer: string | null
          notes: string | null
          part_number: string | null
          project_id: string
          quantity: number
          reference: string | null
          source: string
          unit: string
          unit_price_brl: number | null
          updated_at: string
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          manufacturer?: string | null
          notes?: string | null
          part_number?: string | null
          project_id: string
          quantity?: number
          reference?: string | null
          source?: string
          unit?: string
          unit_price_brl?: number | null
          updated_at?: string
        }
        Update: {
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          manufacturer?: string | null
          notes?: string | null
          part_number?: string | null
          project_id?: string
          quantity?: number
          reference?: string | null
          source?: string
          unit?: string
          unit_price_brl?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_bom_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "catalog_components"
            referencedColumns: ["id"]
          },
        ]
      }
      project_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_folders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          snapshot: Json
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string
          description: string | null
          folder_id: string | null
          id: string
          metadata: Json | null
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          folder_id?: string | null
          id?: string
          metadata?: Json | null
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          folder_id?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_logs: {
        Row: {
          channel: string
          created_at: string
          id: string
          level: string
          message: string
          tag: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          tag?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          tag?: string
          user_id?: string
        }
        Relationships: []
      }
      simulation_tags: {
        Row: {
          created_at: string
          current_value: Json
          data_type: Database["public"]["Enums"]["simulation_tag_data_type"]
          id: string
          initial_value: Json
          last_updated: string
          project_id: string
          quality: string
          tag_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_value?: Json
          data_type: Database["public"]["Enums"]["simulation_tag_data_type"]
          id?: string
          initial_value?: Json
          last_updated?: string
          project_id: string
          quality?: string
          tag_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_value?: Json
          data_type?: Database["public"]["Enums"]["simulation_tag_data_type"]
          id?: string
          initial_value?: Json
          last_updated?: string
          project_id?: string
          quality?: string
          tag_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulation_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      simulations: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          name: string
          parameters: Json
          project_id: string
          results: Json
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          name: string
          parameters?: Json
          project_id: string
          results?: Json
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          name?: string
          parameters?: Json
          project_id?: string
          results?: Json
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string | null
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type?: string | null
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string | null
          processed_at?: string
        }
        Relationships: []
      }
      subscription_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          new_plan_type: Database["public"]["Enums"]["subscription_plan"] | null
          new_status: Database["public"]["Enums"]["subscription_status"] | null
          old_plan_type: Database["public"]["Enums"]["subscription_plan"] | null
          old_status: Database["public"]["Enums"]["subscription_status"] | null
          reason: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_plan_type?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          new_status?: Database["public"]["Enums"]["subscription_status"] | null
          old_plan_type?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          old_status?: Database["public"]["Enums"]["subscription_status"] | null
          reason?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_plan_type?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          new_status?: Database["public"]["Enums"]["subscription_status"] | null
          old_plan_type?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          old_status?: Database["public"]["Enums"]["subscription_status"] | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string
          status: string
          stripe_subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_templates: {
        Row: {
          category: Database["public"]["Enums"]["template_category"]
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_builtin: boolean
          name: string
          template_data: Json
          tenant_id: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["template_category"]
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_builtin?: boolean
          name: string
          template_data?: Json
          tenant_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["template_category"]
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_builtin?: boolean
          name?: string
          template_data?: Json
          tenant_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_samples: {
        Row: {
          id: number
          project_id: string
          quality: string
          sampled_at: string
          tag_name: string
          value: number
        }
        Insert: {
          id?: never
          project_id: string
          quality?: string
          sampled_at?: string
          tag_name: string
          value: number
        }
        Update: {
          id?: never
          project_id?: string
          quality?: string
          sampled_at?: string
          tag_name?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "tag_samples_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_samples_2026_04: {
        Row: {
          id: number
          project_id: string
          quality: string
          sampled_at: string
          tag_name: string
          value: number
        }
        Insert: {
          id?: never
          project_id: string
          quality?: string
          sampled_at?: string
          tag_name: string
          value: number
        }
        Update: {
          id?: never
          project_id?: string
          quality?: string
          sampled_at?: string
          tag_name?: string
          value?: number
        }
        Relationships: []
      }
      tag_samples_2026_05: {
        Row: {
          id: number
          project_id: string
          quality: string
          sampled_at: string
          tag_name: string
          value: number
        }
        Insert: {
          id?: never
          project_id: string
          quality?: string
          sampled_at?: string
          tag_name: string
          value: number
        }
        Update: {
          id?: never
          project_id?: string
          quality?: string
          sampled_at?: string
          tag_name?: string
          value?: number
        }
        Relationships: []
      }
      tenant_memberships: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string | null
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          created_at: string
          key: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          key?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          plan: string
          settings: Json | null
          slug: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          plan?: string
          settings?: Json | null
          slug: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          plan?: string
          settings?: Json | null
          slug?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trend_configs: {
        Row: {
          chart_type: string
          color_map: Json
          created_at: string
          description: string | null
          id: string
          name: string
          period_seconds: number
          project_id: string
          sample_rate_ms: number
          tags: string[]
          updated_at: string
        }
        Insert: {
          chart_type?: string
          color_map?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          period_seconds?: number
          project_id: string
          sample_rate_ms?: number
          tags?: string[]
          updated_at?: string
        }
        Update: {
          chart_type?: string
          color_map?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          period_seconds?: number
          project_id?: string
          sample_rate_ms?: number
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_records: {
        Row: {
          ai_tokens_used: number
          created_at: string
          id: string
          period: string
          simulations_run: number
          storage_used_mb: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_tokens_used?: number
          created_at?: string
          id?: string
          period: string
          simulations_run?: number
          storage_used_mb?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_tokens_used?: number
          created_at?: string
          id?: string
          period?: string
          simulations_run?: number
          storage_used_mb?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_function_block_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          pins: Json
          structured_text: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          pins?: Json
          structured_text?: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          pins?: Json
          structured_text?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_function_block_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          id: string
          plan_type: Database["public"]["Enums"]["subscription_plan"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string
          id?: string
          plan_type?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          id?: string
          plan_type?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voltai_feedback_votes: {
        Row: {
          corrected_components: Json | null
          correction_notes: string | null
          created_at: string
          id: string
          learning_log_id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          corrected_components?: Json | null
          correction_notes?: string | null
          created_at?: string
          id?: string
          learning_log_id: string
          user_id: string
          vote_type: string
        }
        Update: {
          corrected_components?: Json | null
          correction_notes?: string | null
          created_at?: string
          id?: string
          learning_log_id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "voltai_feedback_votes_learning_log_id_fkey"
            columns: ["learning_log_id"]
            isOneToOne: false
            referencedRelation: "voltai_learning_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      voltai_learning_logs: {
        Row: {
          corrections_applied: string[] | null
          created_at: string
          generation_id: string
          generation_time_ms: number | null
          id: string
          is_synthetic: boolean
          is_training_eligible: boolean
          overall_quality_score: number | null
          project_data: Json | null
          prompt: string
          prompt_complexity_score: number | null
          quality_completeness_score: number | null
          quality_compliance_score: number | null
          quality_layout_score: number | null
          quality_optimization_score: number | null
          repair_attempts: number
          system_data: Json
          tokens_used: number | null
          updated_at: string
          user_id: string
          validation_issues: Json | null
        }
        Insert: {
          corrections_applied?: string[] | null
          created_at?: string
          generation_id: string
          generation_time_ms?: number | null
          id?: string
          is_synthetic?: boolean
          is_training_eligible?: boolean
          overall_quality_score?: number | null
          project_data?: Json | null
          prompt: string
          prompt_complexity_score?: number | null
          quality_completeness_score?: number | null
          quality_compliance_score?: number | null
          quality_layout_score?: number | null
          quality_optimization_score?: number | null
          repair_attempts?: number
          system_data?: Json
          tokens_used?: number | null
          updated_at?: string
          user_id: string
          validation_issues?: Json | null
        }
        Update: {
          corrections_applied?: string[] | null
          created_at?: string
          generation_id?: string
          generation_time_ms?: number | null
          id?: string
          is_synthetic?: boolean
          is_training_eligible?: boolean
          overall_quality_score?: number | null
          project_data?: Json | null
          prompt?: string
          prompt_complexity_score?: number | null
          quality_completeness_score?: number | null
          quality_compliance_score?: number | null
          quality_layout_score?: number | null
          quality_optimization_score?: number | null
          repair_attempts?: number
          system_data?: Json
          tokens_used?: number | null
          updated_at?: string
          user_id?: string
          validation_issues?: Json | null
        }
        Relationships: []
      }
      voltai_training_scenarios: {
        Row: {
          category: string
          complexity_level: number
          created_at: string
          expected_components: string[] | null
          expected_wires: string[] | null
          generation_count: number
          id: string
          is_active: boolean
          prompt_template: string
          success_rate: number | null
          validation_rules: Json | null
        }
        Insert: {
          category: string
          complexity_level: number
          created_at?: string
          expected_components?: string[] | null
          expected_wires?: string[] | null
          generation_count?: number
          id?: string
          is_active?: boolean
          prompt_template: string
          success_rate?: number | null
          validation_rules?: Json | null
        }
        Update: {
          category?: string
          complexity_level?: number
          created_at?: string
          expected_components?: string[] | null
          expected_wires?: string[] | null
          generation_count?: number
          id?: string
          is_active?: boolean
          prompt_template?: string
          success_rate?: number | null
          validation_rules?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: Json }
      batch_insert_alarm_history: {
        Args: { p_alarms: Json; p_project_id: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alarm_config_id: string | null
          area: string
          category: Database["public"]["Enums"]["alarm_category"]
          cleared_at: string | null
          cleared_by: string | null
          description: string
          equipment_type: string
          id: string
          location: string
          message: string | null
          operator_note: string | null
          project_id: string
          setpoint: number | null
          severity: Database["public"]["Enums"]["alarm_severity"]
          state: Database["public"]["Enums"]["alarm_state"]
          tag_name: string
          triggered_at: string
          value: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "alarm_history"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      batch_insert_tag_samples: {
        Args: { p_project_id: string; p_samples: Json }
        Returns: undefined
      }
      batch_update_simulation_tags: {
        Args: { p_project_id: string; p_updates: Json }
        Returns: {
          created_at: string
          current_value: Json
          data_type: Database["public"]["Enums"]["simulation_tag_data_type"]
          id: string
          initial_value: Json
          last_updated: string
          project_id: string
          quality: string
          tag_name: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "simulation_tags"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      bootstrap_personal_tenant_if_missing: { Args: never; Returns: string }
      change_tenant_plan: { Args: { p_plan: string }; Returns: Json }
      check_ai_quota: {
        Args: never
        Returns: {
          allowed: boolean
          max_tokens: number
          plan: string
          tenant_id: string
          used: number
        }[]
      }
      check_ai_quota_for_user: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          max_tokens: number
          plan: string
          tenant_id: string
          used: number
        }[]
      }
      consume_ai_credits: { Args: { p_operation: string }; Returns: Json }
      consume_ai_credits_for_user: {
        Args: { p_operation: string; p_user_id: string }
        Returns: Json
      }
      create_monthly_tag_samples_partition: {
        Args: { target_month?: string }
        Returns: undefined
      }
      generate_bom_from_canvas: {
        Args: { p_project_id: string }
        Returns: {
          items_added: number
        }[]
      }
      generate_bom_from_canvas_for_user: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: {
          items_added: number
        }[]
      }
      get_ai_credits_remaining: {
        Args: never
        Returns: {
          max_credits: number
          plan: string
          remaining: number
          unlimited: boolean
          used: number
        }[]
      }
      get_ai_credits_remaining_for_user: {
        Args: { p_user_id: string }
        Returns: {
          max_credits: number
          plan: string
          remaining: number
          unlimited: boolean
          used: number
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      increment_ai_tokens: { Args: { p_tokens: number }; Returns: undefined }
      increment_ai_tokens_for_user: {
        Args: { p_tokens: number; p_user_id: string }
        Returns: undefined
      }
      increment_usage: {
        Args: { p_increment?: number; p_metric: string; p_project_id: string }
        Returns: undefined
      }
      ingest_iot_reading: {
        Args: {
          p_api_key: string
          p_device_external_id: string
          p_message_id?: string
          p_quality?: string
          p_ttl_ms?: number
          p_value: number
        }
        Returns: Json
      }
      iot_acknowledge_alert: { Args: { p_alert_id: string }; Returns: Json }
      iot_enqueue_command: {
        Args: {
          p_command: string
          p_device_external_id: string
          p_payload?: Json
          p_watchdog_ms?: number
        }
        Returns: Json
      }
      is_platform_admin: { Args: never; Returns: boolean }
      search_catalog_components: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding?: string
          query_text?: string
        }
        Returns: {
          category_name: string
          commercial_name: string
          id: string
          manufacturer_name: string
          part_number: string
          similarity: number
          specs: Json
        }[]
      }
      search_normative_chunks: {
        Args: {
          filter_category?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          chunk_text: string
          document_id: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      tenant_has_feature: { Args: { p_feature: string }; Returns: boolean }
    }
    Enums: {
      alarm_category: "process" | "equipment" | "safety" | "communication"
      alarm_severity: "critical" | "high" | "medium" | "low" | "info"
      alarm_state: "active" | "acknowledged" | "cleared" | "suppressed"
      alert_level: "critical" | "warning" | "info"
      client_status: "active" | "prospect" | "inactive"
      iot_command_state:
        | "PENDING"
        | "DELIVERED"
        | "ACKED"
        | "EXECUTED"
        | "FAILED"
        | "TIMED_OUT"
      sensor_kind: "temperature" | "pressure" | "current" | "vibration" | "flow"
      simulation_tag_data_type: "BOOL" | "INT" | "REAL"
      subscription_plan: "FREE" | "PRO" | "INDUSTRIAL"
      subscription_status: "active" | "canceled" | "expired" | "trialing"
      template_category:
        | "conveyor"
        | "pumping"
        | "exhaust"
        | "panel"
        | "hvac"
        | "tank_farm"
        | "custom"
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
    Enums: {
      alarm_category: ["process", "equipment", "safety", "communication"],
      alarm_severity: ["critical", "high", "medium", "low", "info"],
      alarm_state: ["active", "acknowledged", "cleared", "suppressed"],
      alert_level: ["critical", "warning", "info"],
      client_status: ["active", "prospect", "inactive"],
      iot_command_state: [
        "PENDING",
        "DELIVERED",
        "ACKED",
        "EXECUTED",
        "FAILED",
        "TIMED_OUT",
      ],
      sensor_kind: ["temperature", "pressure", "current", "vibration", "flow"],
      simulation_tag_data_type: ["BOOL", "INT", "REAL"],
      subscription_plan: ["FREE", "PRO", "INDUSTRIAL"],
      subscription_status: ["active", "canceled", "expired", "trialing"],
      template_category: [
        "conveyor",
        "pumping",
        "exhaust",
        "panel",
        "hvac",
        "tank_farm",
        "custom",
      ],
    },
  },
} as const
