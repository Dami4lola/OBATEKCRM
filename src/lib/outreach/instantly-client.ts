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
  401: 'Instantly rejected the API key. Check INSTANTLY_API_KEY and that it has the leads:create scope.',
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

export interface NewInstantlyLead {
  campaign: string
  email: string
  first_name?: string | null
  company_name?: string | null
  website?: string | null
  phone?: string | null
  // Flat values only (no objects or arrays)
  custom_variables: Record<string, string>
}

interface InstantlyLead {
  id?: string
  campaign?: string | null
}

// Adds the lead to the campaign; Instantly sends the sequence on its own
// schedule. Never adds someone already anywhere in the workspace.
export async function createInstantlyLead(
  apiKey: string,
  lead: NewInstantlyLead
): Promise<{ id: string }> {
  const created = await instantlyRequest<InstantlyLead>(apiKey, 'POST', '/leads', {
    ...lead,
    skip_if_in_workspace: true,
  })
  // Instantly doesn't document what a skipped lead returns; no id means
  // nothing was added
  if (!created.id) {
    throw new InstantlyError('Instantly skipped this lead: the email is already in your Instantly workspace.', 409)
  }
  return { id: created.id }
}
