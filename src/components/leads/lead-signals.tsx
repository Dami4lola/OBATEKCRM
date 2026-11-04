'use client'

import { ExternalLink } from 'lucide-react'
import { useLeadSignals } from '@/lib/queries/signals'
import { parseHiringTeam } from '@/lib/outreach/job-signals'
import type { Lead } from '@/types/database'

// The job posts behind a lead (OUTREACH_PLAN.md §3), and who's hiring
export function LeadSignals({ lead }: { lead: Lead }) {
  const { data: signals } = useLeadSignals(lead.id)
  const fits = (signals ?? []).filter((s) => s.fit === 'fit')
  if (fits.length === 0) return null

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Buying signals</h4>
      {fits.map((signal) => {
        const team = parseHiringTeam(signal.hiring_team)
        return (
          <div key={signal.id} className="space-y-1 rounded-md border p-3 text-sm">
            {signal.kind === 'technology' ? (
              <p>
                Uses <span className="font-medium">{signal.matched_term}</span>
                <span className="text-muted-foreground"> · seen in their job posts</span>
              </p>
            ) : (
              <p>
                Hiring: <span className="font-medium">{signal.job_title}</span>
                {signal.posted_at && <span className="text-muted-foreground"> · posted {signal.posted_at}</span>}
              </p>
            )}
            {signal.kind === 'job_post' && signal.fit_reason && (
              <p className="text-xs text-muted-foreground">{signal.fit_reason}</p>
            )}
            {team.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Hiring team:{' '}
                {team.map((person, i) => (
                  <span key={`${person.name}-${i}`}>
                    {i > 0 && ', '}
                    {person.linkedin_url ? (
                      <a href={person.linkedin_url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                        {person.name}
                      </a>
                    ) : (
                      person.name
                    )}
                    {person.role && ` (${person.role})`}
                  </span>
                ))}
              </p>
            )}
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {signal.job_url && (
                <a href={signal.job_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                  Job post <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <span>Source: TheirStack</span>
            </div>
          </div>
        )
      })}
      {!lead.email && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          No owner email yet. Run the site check, or look them up in Lusha and add it by hand.
        </p>
      )}
    </div>
  )
}
