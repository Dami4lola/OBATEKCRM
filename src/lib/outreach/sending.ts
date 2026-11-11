import type { OutreachEmail } from '@/types/database'

// What /api/outreach/send returns for one approved email. The scheduler
// sends queued emails from the mailbox (send-queue.ts, OUTREACH_PLAN.md §11).
export interface SendEmailResult {
  email: OutreachEmail
  outcome: 'queued' | 'blocked' | 'failed'
  message: string | null
}
