// Everything Instantly-specific lives here (OUTREACH_PLAN.md §11).
// API v2: https://developer.instantly.ai/api-reference

const INSTANTLY_API = 'https://api.instantly.ai/api/v2'
const TIMEOUT_MS = 15_000

export class InstantlyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Instantly rejected the API key. Check INSTANTLY_API_KEY and its scopes (leads:create, leads:read, emails:read).',
  402: 'Your Instantly workspace has no active paid plan.',
  404: 'Instantly campaign not found. Check the IDs in instantly_campaigns.',
  429: 'Instantly rate limit reached. Wait a minute and send the rest.',
}

async function instantlyRequest<T>(
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${INSTANTLY_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof data?.message === 'string' ? data.message : `HTTP ${response.status}`
    throw new InstantlyError(STATUS_MESSAGES[response.status] ?? `Instantly: ${detail}`, response.status)
  }
  return data as T
}

// Engagement fields from a lead (GET/list), as Instantly documents them
export interface InstantlyLeadStats {
  id: string
  email?: string | null
  email_open_count?: number | null
  email_reply_count?: number | null
  // 1 active, 2 paused, 3 completed, -1 bounced, -2 unsubscribed, -3 skipped
  status?: number | null
  // 0 out of office, 1 interested, 2 meeting booked, 3 meeting completed,
  // 4 won, -1 not interested, -2 wrong person, -3 lost, -4 no show
  lt_interest_status?: number | null
  timestamp_last_open?: string | null
  timestamp_last_reply?: string | null
}

interface Page<T> {
  items?: T[]
  next_starting_after?: string | null
}

const LIST_PAGE_SIZE = 100

// Stats for our leads, 100 ids per request (needs leads:read)
export async function listInstantlyLeads(apiKey: string, ids: string[]): Promise<InstantlyLeadStats[]> {
  const leads: InstantlyLeadStats[] = []
  for (let i = 0; i < ids.length; i += LIST_PAGE_SIZE) {
    const batch = ids.slice(i, i + LIST_PAGE_SIZE)
    let startingAfter: string | undefined
    // A batch fits in one page; the cursor is followed in case Instantly
    // returns fewer per page than asked
    for (let pages = 0; pages < 10; pages++) {
      const page = await instantlyRequest<Page<InstantlyLeadStats>>(apiKey, 'POST', '/leads/list', {
        ids: batch,
        limit: LIST_PAGE_SIZE,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })
      leads.push(...(page.items ?? []))
      if (!page.next_starting_after || (page.items ?? []).length === 0) break
      startingAfter = page.next_starting_after
    }
  }
  return leads
}

export interface InstantlyReply {
  subject: string | null
  text: string
  isAutoReply: boolean
}

interface InstantlyEmail {
  subject?: string | null
  body?: { text?: string | null; html?: string | null } | null
  is_auto_reply?: number | null
}

// The latest reply from this address, if any (needs emails:read)
export async function latestReply(apiKey: string, email: string): Promise<InstantlyReply | null> {
  const query = new URLSearchParams({ lead: email, email_type: 'received', limit: '1', sort_order: 'desc' })
  const page = await instantlyRequest<Page<InstantlyEmail>>(apiKey, 'GET', `/emails?${query}`)
  const reply = page.items?.[0]
  if (!reply) return null
  const text = reply.body?.text || (reply.body?.html ?? '').replace(/<[^>]*>/g, ' ')
  return { subject: reply.subject ?? null, text, isAutoReply: reply.is_auto_reply === 1 }
}
