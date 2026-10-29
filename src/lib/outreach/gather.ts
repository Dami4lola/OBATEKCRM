import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Lead, OutreachEmailInsert, Stage } from '@/types/database'
import { fetchLastSentAt, fetchLeadsInStage, fetchSuppressions, findStageByName } from './adapters/obatek-crm'
import { blockedReason, checkLeads, type GatherWarning } from './compliance'
import { scoreLead, type LeadScore } from './scoring'
import type { OutreachSettings } from './settings'

// Every lead in the source stage with its compliance warnings and score.
// The pop-up's Gather step and scheduled runs both use this, so they pick
// the same leads.

type Crm = SupabaseClient<Database>

export interface GatherRow {
  lead: Lead
  warnings: GatherWarning[]
  blocked: boolean
  score: LeadScore
  // Starts unticked; can still be ticked by hand
  belowThreshold: boolean
}

export async function gatherLeads(
  crm: Crm,
  settings: OutreachSettings,
  now = new Date()
): Promise<{ stage: Stage; rows: GatherRow[] }> {
  const stage = await findStageByName(crm, settings.source_stage_name)
  if (!stage) {
    throw new Error(
      `No pipeline stage named "${settings.source_stage_name}". Rename a stage or change source_stage_name in outreach settings.`
    )
  }

  const leads = await fetchLeadsInStage(crm, stage.id)
  const [suppressions, lastSentAt] = await Promise.all([
    fetchSuppressions(crm),
    fetchLastSentAt(crm, leads.map((l) => l.id)),
  ])
  const warnings = checkLeads(leads, {
    suppressedEmails: suppressions.emails,
    suppressedDomains: suppressions.domains,
    lastSentAt,
    cooldownDays: settings.resequence_cooldown_days,
    now,
  })

  const rows = leads.map((lead) => {
    const leadWarnings = warnings.get(lead.id) || []
    const score = scoreLead(lead, settings.score_weights, settings.target_verticals)
    // Only judge leads that have been checked for pain signals
    const belowThreshold = score.painChecked && score.score < settings.score_threshold
    if (belowThreshold) {
      leadWarnings.push({
        code: 'low_score',
        message: `Score ${score.score}, below ${settings.score_threshold}`,
        blocking: false,
      })
    }
    return {
      lead,
      warnings: leadWarnings,
      blocked: leadWarnings.some((w) => w.blocking),
      score,
      belowThreshold,
    }
  })

  return { stage, rows }
}

// The email rows a run starts with: a draft per chosen lead, and a record
// of each blocked one
export function runEmailRows(
  runId: string,
  rows: GatherRow[],
  isChosen: (row: GatherRow) => boolean
): OutreachEmailInsert[] {
  return rows
    .filter((row) => row.blocked || isChosen(row))
    .map((row) => ({
      lead_id: row.lead.id,
      run_id: runId,
      status: row.blocked ? 'blocked' : 'draft',
      blocked_reason: row.blocked ? blockedReason(row.warnings) : null,
    }))
}

// A scheduled run takes what the pop-up would have ticked: everything not
// blocked, unticked when it was scheduled, or below the score threshold
export function scheduledRunChoice(excludedLeadIds: string[]) {
  const excluded = new Set(excludedLeadIds)
  return (row: GatherRow) => !row.blocked && !row.belowThreshold && !excluded.has(row.lead.id)
}
