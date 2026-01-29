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
          notes?: string | null
          position_index?: number
          created_at?: string
          updated_at?: string
        }
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
      }
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
