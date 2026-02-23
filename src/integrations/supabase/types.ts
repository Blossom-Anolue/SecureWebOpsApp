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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          organization_id: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_primary: boolean | null
          is_verified: boolean | null
          organization_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean | null
          is_verified?: boolean | null
          organization_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean | null
          is_verified?: boolean | null
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          critical_alerts: boolean | null
          email_notifications: boolean | null
          id: string
          updated_at: string
          user_id: string
          weekly_summary: boolean | null
        }
        Insert: {
          critical_alerts?: boolean | null
          email_notifications?: boolean | null
          id?: string
          updated_at?: string
          user_id: string
          weekly_summary?: boolean | null
        }
        Update: {
          critical_alerts?: boolean | null
          email_notifications?: boolean | null
          id?: string
          updated_at?: string
          user_id?: string
          weekly_summary?: boolean | null
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          invited_email: string | null
          joined_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_email?: string | null
          joined_at?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_email?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      phishing_checks: {
        Row: {
          check_type: Database["public"]["Enums"]["phishing_check_type"]
          checked_at: string
          content: string
          id: string
          risk_level: Database["public"]["Enums"]["phishing_risk_level"]
          sender_email: string | null
          subject: string | null
          user_id: string
          verdict: string
        }
        Insert: {
          check_type: Database["public"]["Enums"]["phishing_check_type"]
          checked_at?: string
          content: string
          id?: string
          risk_level: Database["public"]["Enums"]["phishing_risk_level"]
          sender_email?: string | null
          subject?: string | null
          user_id: string
          verdict: string
        }
        Update: {
          check_type?: Database["public"]["Enums"]["phishing_check_type"]
          checked_at?: string
          content?: string
          id?: string
          risk_level?: Database["public"]["Enums"]["phishing_risk_level"]
          sender_email?: string | null
          subject?: string | null
          user_id?: string
          verdict?: string
        }
        Relationships: []
      }
      phishing_red_flags: {
        Row: {
          check_id: string
          description: string
          id: string
          severity: Database["public"]["Enums"]["severity_level"]
          title: string
          user_id: string
        }
        Insert: {
          check_id: string
          description: string
          id?: string
          severity: Database["public"]["Enums"]["severity_level"]
          title: string
          user_id: string
        }
        Update: {
          check_id?: string
          description?: string
          id?: string
          severity?: Database["public"]["Enums"]["severity_level"]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phishing_red_flags_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "phishing_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_name: string | null
          created_at: string
          id: string
          industry: string | null
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          id: string
          industry?: string | null
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scan_issues: {
        Row: {
          business_impact: string
          category: string
          created_at: string
          description: string
          id: string
          is_resolved: boolean | null
          owasp_category: string | null
          recommendation: string
          scan_id: string
          severity: Database["public"]["Enums"]["severity_level"]
          technical_details: string | null
          title: string
          user_id: string
        }
        Insert: {
          business_impact: string
          category: string
          created_at?: string
          description: string
          id?: string
          is_resolved?: boolean | null
          owasp_category?: string | null
          recommendation: string
          scan_id: string
          severity: Database["public"]["Enums"]["severity_level"]
          technical_details?: string | null
          title: string
          user_id: string
        }
        Update: {
          business_impact?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          is_resolved?: boolean | null
          owasp_category?: string | null
          recommendation?: string
          scan_id?: string
          severity?: Database["public"]["Enums"]["severity_level"]
          technical_details?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_issues_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_schedules: {
        Row: {
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          domain_id: string
          frequency: string
          id: string
          is_active: boolean
          last_run_at: string | null
          next_run_at: string
          organization_id: string | null
          scan_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          domain_id: string
          frequency: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at: string
          organization_id?: string | null
          scan_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          domain_id?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string
          organization_id?: string | null
          scan_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_schedules_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          completed_at: string | null
          critical_count: number | null
          domain: string
          domain_id: string
          high_count: number | null
          id: string
          low_count: number | null
          medium_count: number | null
          organization_id: string | null
          scan_type: Database["public"]["Enums"]["scan_type"]
          score: number | null
          started_at: string
          status: Database["public"]["Enums"]["scan_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          critical_count?: number | null
          domain: string
          domain_id: string
          high_count?: number | null
          id?: string
          low_count?: number | null
          medium_count?: number | null
          organization_id?: string | null
          scan_type?: Database["public"]["Enums"]["scan_type"]
          score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["scan_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          critical_count?: number | null
          domain?: string
          domain_id?: string
          high_count?: number | null
          id?: string
          low_count?: number | null
          medium_count?: number | null
          organization_id?: string | null
          scan_type?: Database["public"]["Enums"]["scan_type"]
          score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["scan_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scans_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      security_scores: {
        Row: {
          id: string
          recorded_at: string
          score: number
          user_id: string
        }
        Insert: {
          id?: string
          recorded_at?: string
          score: number
          user_id: string
        }
        Update: {
          id?: string
          recorded_at?: string
          score?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_ids: { Args: { _user_id: string }; Returns: string[] }
      has_org_role: {
        Args: {
          _org_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "member" | "viewer"
      phishing_check_type: "email" | "link"
      phishing_risk_level: "high" | "medium" | "low"
      scan_status: "pending" | "running" | "completed" | "failed"
      scan_type: "quick" | "full"
      severity_level: "critical" | "high" | "medium" | "low"
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
      app_role: ["owner", "admin", "member", "viewer"],
      phishing_check_type: ["email", "link"],
      phishing_risk_level: ["high", "medium", "low"],
      scan_status: ["pending", "running", "completed", "failed"],
      scan_type: ["quick", "full"],
      severity_level: ["critical", "high", "medium", "low"],
    },
  },
} as const
