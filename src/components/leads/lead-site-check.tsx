'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Loader2, ScanSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuditLead, useOutreachSettings } from '@/lib/queries/outreach'
import { describeCompanySize, estimateCompanySize } from '@/lib/outreach/company-size'
import {
  auditFindings,
  HOOK_LABELS,
  parseAudit,
  primaryHook,
  type SiteAudit,
} from '@/lib/outreach/audit-findings'
import type { Lead } from '@/types/database'

// The sheet's lead prop is a snapshot, so keep the latest result locally
export function LeadSiteCheck({ lead }: { lead: Lead }) {
  const [latest, setLatest] = useState<SiteAudit | null>(null)
  const auditLead = useAuditLead()
  const { data: settings } = useOutreachSettings()
  const audit = latest ?? parseAudit(lead.audit)
  const smallMax = settings?.small_business_max_staff ?? 50
  const size = estimateCompanySize({
    staffSize: lead.staff_size,
    reviewCount: lead.google_review_count,
    signals: audit?.size_signals,
    smallMax,
  })

  const handleCheck = async () => {
    try {
      const result = await auditLead.mutateAsync({
        leadId: lead.id,
        checkReviews: !!lead.google_place_id,
      })
      if (result.audit) setLatest(result.audit)
      toast.success('Site checked')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to check the site')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Site check</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCheck}
          disabled={auditLead.isPending}
          className="h-7 px-2"
        >
          {auditLead.isPending ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <ScanSearch className="h-3 w-3 mr-1" />
          )}
          {audit ? 'Check again' : 'Check site'}
        </Button>
      </div>

      {auditLead.isPending && (
        <p className="text-xs text-muted-foreground">
          Reading the site and running a speed test; this can take up to a minute.
        </p>
      )}

      {audit ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{HOOK_LABELS[primaryHook(audit)]}</Badge>
            <span className="text-xs text-muted-foreground">
              checked {formatDistanceToNow(new Date(audit.audited_at), { addSuffix: true })}
            </span>
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {auditFindings(audit).map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
            <li>Size: {describeCompanySize(size, smallMax)}</li>
          </ul>
          {audit.slow_callback_reviews && audit.slow_callback_reviews.length > 0 && (
            <div className="space-y-1">
              {audit.slow_callback_reviews.map((snippet) => (
                <blockquote
                  key={snippet}
                  className="border-l-2 pl-2 text-xs italic text-muted-foreground"
                >
                  {snippet}
                </blockquote>
              ))}
            </div>
          )}
          {audit.errors.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Some checks didn&apos;t finish: {audit.errors.join('; ')}
            </p>
          )}
        </div>
      ) : (
        !auditLead.isPending && (
          <p className="text-sm text-muted-foreground">Not checked yet.</p>
        )
      )}
    </div>
  )
}
