import { toast } from 'sonner'
import { parseAudit, primaryHook } from '@/lib/outreach/audit-findings'
import type { OutreachHook } from '@/types/database'
import type { Row } from './false-data'
import { sampleDraft } from './sample-copy'
import { newId, rowsOf } from './store'

// Answers the app's /api/outreach/* requests in the browser, so the demo has
// no server and calls nothing outside itself.

const TURNED_OFF: Record<string, string> = {
  '/api/outreach/source': 'Searching for leads is turned off in the demo.',
  '/api/outreach/software/search': 'Searching for leads is turned off in the demo.',
  '/api/outreach/licenses/import': 'Importing state lists is turned off in the demo.',
  '/api/outreach/audit': 'Site checks are turned off in the demo.',
  '/api/outreach/signals/pull': 'Pulling job posts is turned off in the demo.',
  '/api/outreach/send': 'Sending is turned off in the demo.',
  '/api/outreach/send/test': 'Sending is turned off in the demo.',
}

const SAMPLE_DRAFT_NOTE = 'Sample draft. The real app writes this with Claude.'

const NOTHING_NEW = { checked: 0, updated: 0, newReplies: [], suppressed: 0, paused: null, errors: [] }

const NOTE_GAP_MS = 4000

const redrafts = new Map<unknown, number>()
let lastNoteAt = 0

// Once per batch, not once per draft
function noteSampleDraft() {
  if (Date.now() - lastNoteAt > NOTE_GAP_MS) toast.info(SAMPLE_DRAFT_NOTE)
  lastNoteAt = Date.now()
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function saveRule(feedback: Row, email: Row, lead: Row) {
  rowsOf('copy_feedback').push({
    id: newId(),
    note: feedback.note,
    vertical: feedback.onlyVertical ? lead.vertical : null,
    active: !!feedback.remember,
    email_id: email.id,
    created_by: null,
    created_at: new Date().toISOString(),
  })
}

function prepare({ emailId, feedback }: { emailId?: string; feedback?: Row }): Response {
  const email = rowsOf('outreach_emails').find((row) => row.id === emailId)
  const lead = rowsOf('leads').find((row) => row.id === email?.lead_id)
  if (!email || !lead) return json({ error: 'Email not found' }, 404)

  const audit = parseAudit(lead.audit as never)
  const hasJobPost = rowsOf('lead_signals').some((s) => s.lead_id === lead.id && s.kind === 'job_post' && s.fit === 'fit')
  const hook: OutreachHook = hasJobPost ? 'job_post' : audit ? primaryHook(audit, lead.vertical as string) : 'generic'

  const variant = redrafts.get(email.id) ?? 0
  redrafts.set(email.id, variant + 1)
  const draft = sampleDraft(lead, hook, rowsOf('outreach_settings'), variant)
  const now = new Date().toISOString()
  Object.assign(email, {
    audit: audit ?? {},
    primary_hook: hook,
    opener: draft.opener,
    linkedin_draft: draft.linkedin,
    steps: draft.steps,
    draft_steps: draft.steps,
    template_key: draft.templateKey,
    model: 'claude',
    author: 'claude',
    drafted_at: now,
  })
  if (feedback) saveRule(feedback, email, lead)
  for (const run of rowsOf('outreach_runs')) {
    if (run.id === email.run_id && run.status === 'preparing') run.status = 'awaiting_review'
  }

  noteSampleDraft()
  return json({ email: structuredClone(email), lead: structuredClone(lead), problems: [] })
}

async function answer(path: string, init?: RequestInit): Promise<Response> {
  if (path === '/api/outreach/stats/sync') return json(NOTHING_NEW)
  if (path === '/api/outreach/prepare') return prepare(JSON.parse(String(init?.body ?? '{}')))
  return json({ error: TURNED_OFF[path] ?? 'This is turned off in the demo.' }, 403)
}

let installed = false

export function installFakeApi() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const { pathname } = new URL(url, window.location.href)
    const path = pathname.replace(/\/$/, '')
    return path.startsWith('/api/') ? answer(path, init) : realFetch(input, init)
  }
}
