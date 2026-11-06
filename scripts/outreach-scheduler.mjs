// Runs the outreach scheduler on this laptop (OUTREACH_PLAN.md §11).
//   npm run outreach:scheduler   (with `npm run dev` running in another terminal)
// Every 5 minutes it calls the tick route, which starts due runs, writes
// drafts, reads replies and bounces from the mailbox, and sends what's due.
// It ticks once at start, so anything that came due while the laptop slept
// goes on wake.

const INTERVAL_MS = 5 * 60_000
// A tick drafts a few emails with Claude and sends a few; give it time
const TIMEOUT_MS = 4 * 60_000

const secret = process.env.CRON_SECRET
if (!secret) {
  console.error('CRON_SECRET is not set. Add it to .env.local (any long random string) and restart.')
  process.exit(1)
}
const appUrl = (process.env.OUTREACH_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
const tickUrl = `${appUrl}/api/outreach/cron/tick`

function describeRuns(summary) {
  return (summary.started ?? []).map((run) =>
    run.error ? `run ${run.runId} failed: ${run.error}` : `started run: ${run.drafts} to draft, ${run.blocked} blocked`
  )
}

function describeDrafting({ drafting }) {
  if (typeof drafting !== 'object') return drafting ? [drafting] : []
  const parts = []
  if (drafting.drafted) parts.push(`${drafting.drafted} drafted`)
  if (drafting.stopped) parts.push(`drafting stopped: ${drafting.stopped}`)
  return parts
}

function describeInbox({ inbox }) {
  if (typeof inbox !== 'object') return []
  const parts = []
  if (inbox.newReplies?.length) parts.push(`${inbox.newReplies.length} new repl${inbox.newReplies.length === 1 ? 'y' : 'ies'}`)
  if (inbox.suppressed) parts.push(`${inbox.suppressed} added to do-not-contact`)
  if (inbox.paused) parts.push(inbox.paused)
  for (const e of inbox.errors ?? []) parts.push(`inbox: ${e}`)
  return parts
}

function describeSending({ sending: s }) {
  if (typeof s !== 'object') return []
  const parts = []
  const sent = [
    s.sent && `${s.sent} first email${s.sent === 1 ? '' : 's'}`,
    s.followUps && `${s.followUps} follow-up${s.followUps === 1 ? '' : 's'}`,
    s.seeds && `${s.seeds} seed cop${s.seeds === 1 ? 'y' : 'ies'}`,
  ].filter(Boolean)
  if (sent.length) parts.push(`sent ${sent.join(', ')}`)
  if (s.blocked) parts.push(`${s.blocked} blocked`)
  if (s.failed) parts.push(`${s.failed} failed`)
  if (s.stopped) parts.push(`${s.stopped} sequence${s.stopped === 1 ? '' : 's'} stopped`)
  if (s.paused) parts.push(s.paused)
  if (s.skipped && s.skipped !== 'Nothing due') parts.push(`not sending: ${s.skipped}`)
  for (const e of s.errors ?? []) parts.push(`sending: ${e}`)
  return parts
}

function describeErrors(summary) {
  return ['startError', 'signalError', 'signalRunError', 'draftError', 'mailboxError', 'inboxError', 'sendError']
    .filter((key) => summary[key])
    .map((key) => `${key}: ${summary[key]}`)
}

function describe(summary) {
  const parts = [
    ...describeRuns(summary),
    ...describeDrafting(summary),
    ...describeInbox(summary),
    ...describeSending(summary),
    ...describeErrors(summary),
  ]
  return parts.length ? parts.join(' · ') : 'nothing to do'
}

async function tick() {
  const time = new Date().toLocaleTimeString()
  try {
    const response = await fetch(tickUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      console.error(`[${time}] tick failed (${response.status}): ${body.error ?? 'no detail'}`)
      if (response.status === 401) console.error('  CRON_SECRET in .env.local must match the one the app started with. Restart npm run dev after changing it.')
      return
    }
    console.log(`[${time}] ${describe(body)}`)
  } catch (error) {
    console.error(`[${time}] could not reach ${tickUrl}: ${error.message}. Is npm run dev running?`)
  }
}

// Wait for each tick to finish before scheduling the next, so they never overlap
async function loop() {
  await tick()
  setTimeout(loop, INTERVAL_MS)
}

console.log(`Outreach scheduler: ticking ${tickUrl} every ${INTERVAL_MS / 60_000} minutes. Ctrl+C to stop.`)
loop()
