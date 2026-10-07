'use client'

import { format } from 'date-fns'
import { Building2, CalendarDays, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getRoleLabel } from '@/lib/validations/meeting'
import type { MeetingWithLead } from '@/types/database'

interface MeetingTileProps {
  meeting: MeetingWithLead
  onClick?: () => void
}

export function MeetingTile({ meeting, onClick }: MeetingTileProps) {
  const summary = meeting.outcome || meeting.notes

  return (
    <Card
      className="cursor-pointer gap-0 py-0 transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="space-y-1">
          <div className="font-medium text-sm leading-snug line-clamp-2">
            {meeting.title}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            <span>{format(new Date(meeting.meeting_date), 'PPp')}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs">
            <User className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{meeting.attendee_name}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            <span className="truncate">
              {meeting.leads?.company_name || 'No company'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={
              meeting.attendee_role === 'decision_maker' ? 'default' : 'secondary'
            }
          >
            {getRoleLabel(meeting.attendee_role)}
          </Badge>
          {meeting.field_of_work && (
            <Badge variant="outline">{meeting.field_of_work}</Badge>
          )}
        </div>

        {summary && (
          <p className="text-xs text-muted-foreground line-clamp-2 border-t pt-2">
            {summary}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
