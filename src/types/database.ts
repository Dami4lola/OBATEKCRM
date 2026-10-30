export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Outreach unions, shared across Row/Insert/Update below
export type EmailSource = 'website' | 'lusha' | 'manual' | 'referral' | 'other'
export type LeadSource = 'places' | 'lusha' | 'import' | 'manual' | 'referral' | 'other'
export type TaskKind = 'general' | 'call'
export type OutreachRunStatus =
  | 'scheduled'
  | 'preparing'
  | 'awaiting_review'
  | 'sending'
  | 'completed'
  | 'failed'
  | 'cancelled'
export type OutreachMode = 'manual' | 'auto'
export type OutreachEmailStatus = 'blocked' | 'draft' | 'approved' | 'queued' | 'sent' | 'failed' | 'skipped'
export type SequenceState = 'active' | 'finished' | 'stopped'
export type OutreachMessageKind = 'outreach' | 'seed' | 'test'
export type SeedPlacement = 'inbox' | 'promotions' | 'spam' | 'missing'
export type MailboxStatus = 'connected' | 'needs_reconnect'
export type OutreachHook =
  | 'no_site'
  | 'no_booking'
  | 'request_only'
  | 'not_mobile'
  | 'slow'
  | 'outdated'
  | 'seo_local'
  | 'generic'
export type OutreachAuthor = 'human' | 'claude' | 'claude_edited'
export type ReplyClass =
  | 'interested'
  | 'not_now'
  | 'wrong_person'
  | 'unsubscribe'
  | 'out_of_office'
  | 'other'
export type SuppressionReason = 'unsubscribe' | 'hard_bounce' | 'spam_complaint' | 'manual'

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
          job_title: string | null
          website: string | null
          city: string | null
          region: string | null
          country: string | null
          vertical: string | null
          staff_size: number | null
          linkedin_url: string | null
          email_source: EmailSource | null
          lead_source: LeadSource | null
          google_place_id: string | null
          google_rating: number | null
          google_review_count: number | null
          owner_name: string | null
          signals: Json
          audit: Json | null
          audited_at: string | null
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
          job_title?: string | null
          website?: string | null
          city?: string | null
          region?: string | null
          country?: string | null
          vertical?: string | null
          staff_size?: number | null
          linkedin_url?: string | null
          email_source?: EmailSource | null
          lead_source?: LeadSource | null
          google_place_id?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          owner_name?: string | null
          signals?: Json
          audit?: Json | null
          audited_at?: string | null
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
          job_title?: string | null
          website?: string | null
          city?: string | null
          region?: string | null
          country?: string | null
          vertical?: string | null
          staff_size?: number | null
          linkedin_url?: string | null
          email_source?: EmailSource | null
          lead_source?: LeadSource | null
          google_place_id?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          owner_name?: string | null
          signals?: Json
          audit?: Json | null
          audited_at?: string | null
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
          meta: Json
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          type: 'note' | 'call' | 'email' | 'meeting'
          title: string
          description?: string | null
          meta?: Json
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          type?: 'note' | 'call' | 'email' | 'meeting'
          title?: string
          description?: string | null
          meta?: Json
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
      meetings: {
        Row: {
          id: string
          lead_id: string
          meeting_date: string
          title: string
          attendee_name: string
          attendee_role: 'employee' | 'decision_maker'
          field_of_work: string | null
          notes: string | null
          outcome: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          meeting_date: string
          title: string
          attendee_name: string
          attendee_role: 'employee' | 'decision_maker'
          field_of_work?: string | null
          notes?: string | null
          outcome?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          meeting_date?: string
          title?: string
          attendee_name?: string
          attendee_role?: 'employee' | 'decision_maker'
          field_of_work?: string | null
          notes?: string | null
          outcome?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'meetings_lead_id_fkey'
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
          kind: TaskKind
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
          kind?: TaskKind
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
          kind?: TaskKind
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
      outreach_runs: {
        Row: {
          id: string
          status: OutreachRunStatus
          mode: OutreachMode
          scheduled_for: string
          started_at: string | null
          finished_at: string | null
          created_by: string | null
          summary: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          status?: OutreachRunStatus
          mode?: OutreachMode
          scheduled_for?: string
          started_at?: string | null
          finished_at?: string | null
          created_by?: string | null
          summary?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          status?: OutreachRunStatus
          mode?: OutreachMode
          scheduled_for?: string
          started_at?: string | null
          finished_at?: string | null
          created_by?: string | null
          summary?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'outreach_runs_created_by_fkey'
            columns: ['created_by']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      outreach_emails: {
        Row: {
          id: string
          lead_id: string
          run_id: string | null
          status: OutreachEmailStatus
          blocked_reason: string | null
          audit: Json
          primary_hook: OutreachHook | null
          steps: Json
          opener: string | null
          template_key: string | null
          draft_steps: Json | null
          drafted_at: string | null
          last_error: string | null
          author: OutreachAuthor | null
          model: string | null
          instantly_campaign_id: string | null
          instantly_lead_id: string | null
          approved_at: string | null
          sent_at: string | null
          opened_at: string | null
          open_count: number
          replied_at: string | null
          reply_class: ReplyClass | null
          bounced_at: string | null
          unsubscribed_at: string | null
          is_example: boolean
          stats_synced_at: string | null
          queued_at: string | null
          sequence_state: SequenceState | null
          next_step: number | null
          next_step_at: string | null
          stopped_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          run_id?: string | null
          status?: OutreachEmailStatus
          blocked_reason?: string | null
          audit?: Json
          primary_hook?: OutreachHook | null
          steps?: Json
          opener?: string | null
          template_key?: string | null
          draft_steps?: Json | null
          drafted_at?: string | null
          last_error?: string | null
          author?: OutreachAuthor | null
          model?: string | null
          instantly_campaign_id?: string | null
          instantly_lead_id?: string | null
          approved_at?: string | null
          sent_at?: string | null
          opened_at?: string | null
          open_count?: number
          replied_at?: string | null
          reply_class?: ReplyClass | null
          bounced_at?: string | null
          unsubscribed_at?: string | null
          is_example?: boolean
          stats_synced_at?: string | null
          queued_at?: string | null
          sequence_state?: SequenceState | null
          next_step?: number | null
          next_step_at?: string | null
          stopped_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          run_id?: string | null
          status?: OutreachEmailStatus
          blocked_reason?: string | null
          audit?: Json
          primary_hook?: OutreachHook | null
          steps?: Json
          opener?: string | null
          template_key?: string | null
          draft_steps?: Json | null
          drafted_at?: string | null
          last_error?: string | null
          author?: OutreachAuthor | null
          model?: string | null
          instantly_campaign_id?: string | null
          instantly_lead_id?: string | null
          approved_at?: string | null
          sent_at?: string | null
          opened_at?: string | null
          open_count?: number
          replied_at?: string | null
          reply_class?: ReplyClass | null
          bounced_at?: string | null
          unsubscribed_at?: string | null
          is_example?: boolean
          stats_synced_at?: string | null
          queued_at?: string | null
          sequence_state?: SequenceState | null
          next_step?: number | null
          next_step_at?: string | null
          stopped_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'outreach_emails_lead_id_fkey'
            columns: ['lead_id']
            referencedRelation: 'leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'outreach_emails_run_id_fkey'
            columns: ['run_id']
            referencedRelation: 'outreach_runs'
            referencedColumns: ['id']
          }
        ]
      }
      outreach_messages: {
        Row: {
          id: string
          email_id: string | null
          kind: OutreachMessageKind
          step: number | null
          to_address: string
          subject: string | null
          graph_message_id: string | null
          internet_message_id: string | null
          conversation_id: string | null
          sent_at: string
          placement: SeedPlacement | null
          placement_checked_at: string | null
        }
        Insert: {
          id?: string
          email_id?: string | null
          kind?: OutreachMessageKind
          step?: number | null
          to_address: string
          subject?: string | null
          graph_message_id?: string | null
          internet_message_id?: string | null
          conversation_id?: string | null
          sent_at?: string
          placement?: SeedPlacement | null
          placement_checked_at?: string | null
        }
        Update: {
          id?: string
          email_id?: string | null
          kind?: OutreachMessageKind
          step?: number | null
          to_address?: string
          subject?: string | null
          graph_message_id?: string | null
          internet_message_id?: string | null
          conversation_id?: string | null
          sent_at?: string
          placement?: SeedPlacement | null
          placement_checked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'outreach_messages_email_id_fkey'
            columns: ['email_id']
            referencedRelation: 'outreach_emails'
            referencedColumns: ['id']
          }
        ]
      }
      suppression_list: {
        Row: {
          id: string
          email: string | null
          domain: string | null
          reason: SuppressionReason
          added_at: string
        }
        Insert: {
          id?: string
          email?: string | null
          domain?: string | null
          reason: SuppressionReason
          added_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          domain?: string | null
          reason?: SuppressionReason
          added_at?: string
        }
        Relationships: []
      }
      dismissed_leads: {
        Row: {
          id: string
          google_place_id: string | null
          website_host: string | null
          phone_digits: string | null
          company_name: string | null
          reason: string | null
          dismissed_by: string | null
          dismissed_at: string
        }
        Insert: {
          id?: string
          google_place_id?: string | null
          website_host?: string | null
          phone_digits?: string | null
          company_name?: string | null
          reason?: string | null
          dismissed_by?: string | null
          dismissed_at?: string
        }
        Update: {
          id?: string
          google_place_id?: string | null
          website_host?: string | null
          phone_digits?: string | null
          company_name?: string | null
          reason?: string | null
          dismissed_by?: string | null
          dismissed_at?: string
        }
        Relationships: []
      }
      copy_feedback: {
        Row: {
          id: string
          note: string
          vertical: string | null
          active: boolean
          email_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          note: string
          vertical?: string | null
          active?: boolean
          email_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          note?: string
          vertical?: string | null
          active?: boolean
          email_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          user_id: string
          role: 'owner' | 'member'
          created_at: string
        }
        Insert: {
          user_id: string
          role?: 'owner' | 'member'
          created_at?: string
        }
        Update: {
          user_id?: string
          role?: 'owner' | 'member'
          created_at?: string
        }
        Relationships: []
      }
      outreach_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
        }
        Relationships: []
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
      is_team_member: {
        Args: Record<string, never>
        Returns: boolean
      }
      outreach_mailbox_status: {
        Args: Record<string, never>
        Returns: {
          address: string
          status: MailboxStatus
          connected_at: string
          inbox_checked_at: string | null
        }[]
      }
      get_outreach_mailbox_secret: {
        Args: Record<string, never>
        Returns: {
          address: string
          refresh_token_enc: string
          status: MailboxStatus
          inbox_checked_at: string | null
        }[]
      }
      connect_outreach_mailbox: {
        Args: { p_address: string; p_refresh_token_enc: string }
        Returns: undefined
      }
      update_outreach_mailbox: {
        Args: { p_refresh_token_enc?: string; p_status?: MailboxStatus; p_inbox_checked_at?: string }
        Returns: undefined
      }
      disconnect_outreach_mailbox: {
        Args: Record<string, never>
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

export type Meeting = Database['public']['Tables']['meetings']['Row']
export type MeetingInsert = Database['public']['Tables']['meetings']['Insert']
export type MeetingUpdate = Database['public']['Tables']['meetings']['Update']
export type MeetingRole = Meeting['attendee_role']
export type MeetingWithLead = Meeting & {
  leads: Pick<Lead, 'id' | 'contact_name' | 'company_name' | 'stage_id'> | null
}

export type OutreachRun = Database['public']['Tables']['outreach_runs']['Row']
export type OutreachRunInsert = Database['public']['Tables']['outreach_runs']['Insert']
export type OutreachRunUpdate = Database['public']['Tables']['outreach_runs']['Update']
export type OutreachEmail = Database['public']['Tables']['outreach_emails']['Row']
export type OutreachEmailInsert = Database['public']['Tables']['outreach_emails']['Insert']
export type OutreachEmailUpdate = Database['public']['Tables']['outreach_emails']['Update']
export type OutreachMessage = Database['public']['Tables']['outreach_messages']['Row']
export type OutreachMessageInsert = Database['public']['Tables']['outreach_messages']['Insert']
export type OutreachMessageUpdate = Database['public']['Tables']['outreach_messages']['Update']
export type Suppression = Database['public']['Tables']['suppression_list']['Row']
export type SuppressionInsert = Database['public']['Tables']['suppression_list']['Insert']
export type OutreachSetting = Database['public']['Tables']['outreach_settings']['Row']
export type DismissedLeadInsert = Database['public']['Tables']['dismissed_leads']['Insert']
export type CopyFeedback = Database['public']['Tables']['copy_feedback']['Row']
export type CopyFeedbackInsert = Database['public']['Tables']['copy_feedback']['Insert']

// Shape of each entry in outreach_emails.steps
export interface OutreachEmailStep {
  step: 1 | 2 | 3
  subject: string
  body: string
}
