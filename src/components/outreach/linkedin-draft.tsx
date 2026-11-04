'use client'

import { toast } from 'sonner'
import { Copy, ExternalLink, Radar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLeadSignals } from '@/lib/queries/signals'
import { parseHiringTeam } from '@/lib/outreach/job-signals'
import { externalUrl } from '@/lib/utils'
import type { Lead, OutreachEmail } from '@/types/database'

// The job post behind a signal draft, and its LinkedIn note (§3, §8).
// LinkedIn stays manual: copy the note, open the profile, send it there.
export function SignalDraftExtras({ email, lead }: { email: OutreachEmail; lead: Lead }) {
  const { data: signals } = useLeadSignals(lead.id)
  const signal = (signals ?? []).find((s) => s.fit === 'fit')
  if (!signal && !email.linkedin_draft) return null

  const person = signal ? parseHiringTeam(signal.hiring_team).find((p) => p.linkedin_url) : undefined
  const profile = person?.linkedin_url ?? externalUrl(lead.linkedin_url)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email.linkedin_draft ?? '')
      toast.success('LinkedIn note copied')
    } catch {
      toast.error('Could not copy; select the text instead')
    }
  }

  return (
    <div className="space-y-2">
      {signal && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">
            <Radar className="h-3 w-3" />
            Signal: hiring {signal.job_title}
          </Badge>
          {signal.job_url && (
            <a
              href={signal.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline"
            >
              Job post <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
      {email.linkedin_draft && (
        <div className="space-y-1 rounded border p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">LinkedIn note ({email.linkedin_draft.length}/300)</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCopy}>
                <Copy className="mr-1 h-3 w-3" />
                Copy
              </Button>
              {profile && (
                <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                  <a href={profile} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    {person ? person.name : 'LinkedIn'}
                  </a>
                </Button>
              )}
            </div>
          </div>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{email.linkedin_draft}</p>
        </div>
      )}
    </div>
  )
}
