import type { Lead } from '@/types/database'

export type GatherWarningCode =
  | 'no_email'
  | 'suppressed'
  | 'casl'
  | 'no_country'
  | 'cooldown'
  | 'duplicate_email'
  | 'no_website'
  | 'low_score'

export interface GatherWarning {
  code: GatherWarningCode
  message: string
  // Blocking warnings stop the lead being emailed in this run
  blocking: boolean
}

export interface ComplianceContext {
  suppressedEmails: Set<string> // lowercased
  suppressedDomains: Set<string> // lowercased
  lastSentAt: Map<string, Date> // lead id -> most recent outreach send
  cooldownDays: number
  now: Date
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  return at === -1 ? null : email.slice(at + 1).trim().toLowerCase() || null
}

export function checkLead(lead: Lead, ctx: ComplianceContext): GatherWarning[] {
  const warnings: GatherWarning[] = []
  const email = lead.email?.trim().toLowerCase()

  if (!email) {
    warnings.push({ code: 'no_email', message: 'No email address', blocking: true })
  } else {
    const domain = emailDomain(email)
    if (ctx.suppressedEmails.has(email) || (domain && ctx.suppressedDomains.has(domain))) {
      warnings.push({ code: 'suppressed', message: 'On the do-not-contact list', blocking: true })
    }
  }

  // CASL: Canadian addresses may only be emailed when the business published
  // the address itself. Without a country we can't tell, so block until set.
  if (email && lead.email_source !== 'website') {
    if (lead.country === 'CA') {
      warnings.push({
        code: 'casl',
        message: 'Canadian email not from their website (CASL)',
        blocking: true,
      })
    } else if (!lead.country) {
      warnings.push({
        code: 'no_country',
        message: 'Country not set, needed for the CASL check',
        blocking: true,
      })
    }
  }

  const lastSent = ctx.lastSentAt.get(lead.id)
  if (lastSent) {
    const cooldownEnds = new Date(lastSent.getTime() + ctx.cooldownDays * 86_400_000)
    if (cooldownEnds > ctx.now) {
      warnings.push({
        code: 'cooldown',
        message: `Already emailed in the last ${ctx.cooldownDays} days`,
        blocking: true,
      })
    }
  }

  if (!lead.website) {
    warnings.push({
      code: 'no_website',
      message: 'No website; the email will use the no-site angle',
      blocking: false,
    })
  }

  return warnings
}

// Checks every lead; when two leads share an email only the first is kept
export function checkLeads(
  leads: Lead[],
  ctx: ComplianceContext
): Map<string, GatherWarning[]> {
  const results = new Map<string, GatherWarning[]>()
  const seenEmails = new Set<string>()

  for (const lead of leads) {
    const warnings = checkLead(lead, ctx)
    const email = lead.email?.trim().toLowerCase()
    if (email) {
      if (seenEmails.has(email)) {
        warnings.push({
          code: 'duplicate_email',
          message: 'Same email as another lead in this run',
          blocking: true,
        })
      }
      seenEmails.add(email)
    }
    results.set(lead.id, warnings)
  }

  return results
}

export function blockedReason(warnings: GatherWarning[]): string | null {
  const blocking = warnings.filter((w) => w.blocking)
  return blocking.length > 0 ? blocking.map((w) => w.message).join('; ') : null
}
