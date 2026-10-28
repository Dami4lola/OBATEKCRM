'use client'

import { cn } from '@/lib/utils'
import { describeScore, type LeadScore } from '@/lib/outreach/scoring'

interface ScoreBadgeProps {
  score: LeadScore
  threshold: number
  className?: string
}

// Hover shows the points behind the number
export function ScoreBadge({ score, threshold, className }: ScoreBadgeProps) {
  const qualified = score.score >= threshold

  return (
    <span
      title={describeScore(score)}
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium tabular-nums',
        qualified
          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
          : 'bg-muted text-muted-foreground',
        className
      )}
    >
      {score.score}
      <span className="font-normal opacity-60">/{score.max}</span>
      {!score.painChecked && <span className="ml-0.5 opacity-60">?</span>}
    </span>
  )
}
