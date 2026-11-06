'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { allRows, type ResultsData } from '@/lib/outreach/results'
import type { Lead, OutreachEmail } from '@/types/database'

type EmailRow = Pick<
  OutreachEmail,
  'lead_id' | 'sent_at' | 'replied_at' | 'reply_class' | 'bounced_at' | 'unsubscribed_at' | 'primary_hook'
> & { leads: unknown }

type CallRow = { lead_id: string; created_at: string; leads: unknown }

// Everything ever sent, not just the chosen dates: a lead's first contact can
// sit before them. Changing the dates then needs no new reads.
export function useResultsData() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['results'],
    queryFn: async (): Promise<ResultsData> => {
      const [emails, calls, meetings, seedCopies] = await Promise.all([
        allRows<EmailRow>((from, to) =>
          supabase
            .from('outreach_emails')
            .select('lead_id, sent_at, replied_at, reply_class, bounced_at, unsubscribed_at, primary_hook, leads(vertical, email)')
            .not('sent_at', 'is', null)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: EmailRow[] | null; error: unknown }>
        ),
        allRows<CallRow>((from, to) =>
          supabase
            .from('activities')
            .select('lead_id, created_at, leads(email)')
            .eq('type', 'call')
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: CallRow[] | null; error: unknown }>
        ),
        allRows<ResultsData['meetings'][number]>((from, to) =>
          supabase.from('meetings').select('lead_id, meeting_date').order('id', { ascending: true }).range(from, to)
        ),
        allRows<ResultsData['seedCopies'][number]>((from, to) =>
          supabase
            .from('outreach_messages')
            .select('sent_at, placement')
            .eq('kind', 'seed')
            .order('id', { ascending: true })
            .range(from, to)
        ),
      ])

      return {
        emails: emails.map(({ leads, ...email }) => {
          const lead = leads as Pick<Lead, 'vertical' | 'email'> | null
          return { ...email, sent_at: email.sent_at!, vertical: lead?.vertical ?? null, address: lead?.email ?? null }
        }),
        calls: calls.map(({ leads, ...call }) => ({
          ...call,
          address: (leads as Pick<Lead, 'email'> | null)?.email ?? null,
        })),
        meetings,
        seedCopies,
      }
    },
  })
}
