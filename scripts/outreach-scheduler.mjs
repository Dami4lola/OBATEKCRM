// Runs the outreach scheduler on this laptop (OUTREACH_PLAN.md §11).
//   npm run outreach:scheduler   (with `npm run dev` running in another terminal)
// Every 5 minutes it calls the tick route, which starts due runs, writes
// drafts and pulls opens/replies from Instantly. It ticks once at start, so
// a run that came due while the laptop slept fires on wake.

const INTERVAL_MS = 5 * 60_000
// A tick drafts a few emails with Claude; give it time
const TIMEOUT_MS = 4 * 60_000

const secret = process.env.CRON_SECRET
if (!secret) {
  console.error('CRON_SECRET is not set. Add it to .env.local (any long random string) and restart.')
  process.exit(1)
}
const appUrl = (process.env.OUTREACH_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
const tickUrl = `${appUrl}/api/outreach/cron/tick`

function describe(summary) {
  const parts = []
  for (const run of summary.started ?? []) {
    parts.push(run.error ? `run ${run.runId} failed: ${run.error}` : `started run: ${run.drafts} to draft, ${run.blocked} blocked`)
  }
  if (typeof summary.drafting === 'object') {
    if (summary.drafting.drafted) parts.push(`${summary.drafting.drafted} drafted`)
    if (summary.drafting.stopped) parts.push(`drafting stopped: ${summary.drafting.stopped}`)
  } else if (summary.drafting) parts.push(summary.drafting)
  if (typeof summary.stats === 'object') {
    const s = summary.stats
    if (s.checked) parts.push(`${s.checked} checked, ${s.updated} updated`)
    if (s.newReplies?.length) parts.push(`${s.newReplies.length} new repl${s.newReplies.length === 1 ? 'y' : 'ies'}`)
    if (s.suppressed) parts.push(`${s.suppressed} added to do-not-contact`)
    if (s.paused) parts.push(s.paused)
    for (const e of s.errors ?? []) parts.push(`stats: ${e}`)
  } else if (summary.stats) parts.push(summary.stats)
  for (const key of ['startError', 'draftError', 'statsError']) if (summary[key]) parts.push(`${key}: ${summary[key]}`)
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
