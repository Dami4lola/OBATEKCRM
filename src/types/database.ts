export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          created_at?: string
        }
        Relationships: []
      }
      pipelines: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          id: string
          pipeline_id: string
          name: string
          color: string
          order_index: number
          created_at: string
        }
        Insert: {
          id?: string
          pipeline_id: string
          name: string
          color?: string
          order_index?: number
          created_at?: string
        }
        Update: {
          id?: string
          pipeline_id?: string
          name?: string
          color?: string
          order_index?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'stages_pipeline_id_fkey'
            columns: ['pipeline_id']
            referencedRelation: 'pipelines'
            referencedColumns: ['id']
          }
        ]
      }
      leads: {
        Row: {
          id: string
          stage_id: string
          company_name: string | null
          contact_name: string
          email: string | null
          phone: string | null
          value: number | null
          payment_terms: 'one_time' | 'monthly' | 'hourly' | null
          notes: string | null
          position_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          stage_id: string
          company_name?: string | null
          contact_name: string
          email?: string | null
          phone?: string | null
          value?: number | null
          payment_terms?: 'one_time' | 'monthly' | 'hourly' | null
          notes?: string | null
          position_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          stage_id?: string
          company_name?: string | null
          contact_name?: string
          email?: string | null
          phone?: string | null
          value?: number | null
          payment_terms?: 'one_time' | 'monthly' | 'hourly' | null
          notes?: string | null
          position_index?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'leads_stage_id_fkey'
            columns: ['stage_id']
            referencedRelation: 'stages'
            referencedColumns: ['id']
          }
        ]
      }
      activities: {
        Row: {
          id: string
          lead_id: string
          type: 'note' | 'call' | 'email' | 'meeting'
          title: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          type: 'note' | 'call' | 'email' | 'meeting'
          title: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          type?: 'note' | 'call' | 'email' | 'meeting'
          title?: string
          description?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'activities_lead_id_fkey'
            columns: ['lead_id']
            referencedRelation: 'leads'
            referencedColumns: ['id']
          }
        ]
      }
      tasks: {
        Row: {
          id: string
          lead_id: string
          title: string
          description: string | null
          due_date: string
          status: 'pending' | 'completed'
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          title: string
          description?: string | null
          due_date: string
          status?: 'pending' | 'completed'
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          title?: string
          description?: string | null
          due_date?: string
          status?: 'pending' | 'completed'
          completed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_lead_id_fkey'
            columns: ['lead_id']
            referencedRelation: 'leads'
            referencedColumns: ['id']
          }
        ]
      }
      email_accounts: {
        Row: {
          id: string
          user_id: string
          provider: 'outlook'
          email_address: string
          access_token: string
          refresh_token: string
          token_expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: 'outlook'
          email_address: string
          access_token: string
          refresh_token: string
          token_expires_at: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: 'outlook'
          email_address?: string
          access_token?: string
          refresh_token?: string
          token_expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'email_accounts_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      email_logs: {
        Row: {
          id: string
          email_account_id: string
          lead_id: string
          subject: string
          body: string
          sent_at: string
          status: 'sent' | 'failed' | 'bounced'
          error_message: string | null
        }
        Insert: {
          id?: string
          email_account_id: string
          lead_id: string
          subject: string
          body: string
          sent_at?: string
          status?: 'sent' | 'failed' | 'bounced'
          error_message?: string | null
        }
        Update: {
          id?: string
          email_account_id?: string
          lead_id?: string
          subject?: string
          body?: string
          sent_at?: string
          status?: 'sent' | 'failed' | 'bounced'
          error_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'email_logs_email_account_id_fkey'
            columns: ['email_account_id']
            referencedRelation: 'email_accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'email_logs_lead_id_fkey'
            columns: ['lead_id']
            referencedRelation: 'leads'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      move_lead: {
        Args: {
          p_lead_id: string
          p_new_stage_id: string
          p_new_position: number
        }
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

// Helper types
export type Pipeline = Database['public']['Tables']['pipelines']['Row']
export type Stage = Database['public']['Tables']['stages']['Row']
export type Lead = Database['public']['Tables']['leads']['Row']
export type Activity = Database['public']['Tables']['activities']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']

export type LeadInsert = Database['public']['Tables']['leads']['Insert']
export type LeadUpdate = Database['public']['Tables']['leads']['Update']
export type ActivityInsert = Database['public']['Tables']['activities']['Insert']
export type TaskInsert = Database['public']['Tables']['tasks']['Insert']
export type TaskUpdate = Database['public']['Tables']['tasks']['Update']

export type EmailAccount = Database['public']['Tables']['email_accounts']['Row']
export type EmailAccountInsert = Database['public']['Tables']['email_accounts']['Insert']
export type EmailAccountUpdate = Database['public']['Tables']['email_accounts']['Update']
export type EmailLog = Database['public']['Tables']['email_logs']['Row']
export type EmailLogInsert = Database['public']['Tables']['email_logs']['Insert']
