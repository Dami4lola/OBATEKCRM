// Runs the outreach scheduler (OUTREACH_PLAN.md §11). It calls the tick
// route, which starts due runs, writes drafts, reads replies and bounces
// from the mailbox, and sends what's due.
//   node outreach-scheduler.mjs          loop: tick now, then every 5 minutes
//                                        (npm run outreach:scheduler, next to npm run dev)
//   node outreach-scheduler.mjs --once   one tick, then exit 0 on success or 1
//                                        on failure (Railway cron, every 5 minutes)
// Looping, it ticks once at start, so anything that came due while the
// laptop slept goes on wake.

const INTERVAL_MS = 5 * 60_000
// A tick drafts a few emails with Claude and sends a few; give it time
const TIMEOUT_MS = 4 * 60_000

const once = process.argv.includes('--once')

const secret = process.env.CRON_SECRET
if (!secret) {
  console.error('CRON_SECRET is not set. Add it to .env.local (any long random string), or to the service variables on Railway, and restart.')
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

// Railway's private network can take a few seconds to come up in a new
// cron container, so a single run retries connection failures briefly
const CONNECT_RETRIES = 5
const CONNECT_RETRY_MS = 3000

// True when the tick route answered OK
async function tick() {
  const time = new Date().toLocaleTimeString()
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(tickUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        console.error(`[${time}] tick failed (${response.status}): ${body.error ?? 'no detail'}`)
        if (response.status === 401) console.error('  CRON_SECRET must match the one the app started with. Restart the app after changing it.')
        return false
      }
      console.log(`[${time}] ${describe(body)}`)
      return true
    } catch (error) {
      const cause = error.cause?.code ?? error.cause?.message
      if (once && attempt < CONNECT_RETRIES && error.name !== 'TimeoutError') {
        await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS))
        continue
      }
      console.error(
        `[${time}] could not reach ${tickUrl}: ${error.message}${cause ? ` (${cause})` : ''}. ` +
          'ENOTFOUND or EAI_AGAIN: the host name is wrong or the private network is not ready. ' +
          'ECONNREFUSED: the port is wrong. Check OUTREACH_APP_URL and that the app is running.'
      )
      return false
    }
  }
}

// Wait for each tick to finish before scheduling the next, so they never overlap
async function loop() {
  await tick()
  setTimeout(loop, INTERVAL_MS)
}

if (once) {
  tick().then((ok) => process.exit(ok ? 0 : 1))
} else {
  console.log(`Outreach scheduler: ticking ${tickUrl} every ${INTERVAL_MS / 60_000} minutes. Ctrl+C to stop.`)
  loop()
}
