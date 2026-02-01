'use client'

import { Draggable } from '@hello-pangea/dnd'
import { DollarSign, Building2, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { Lead } from '@/types/database'

interface LeadCardProps {
  lead: Lead
  index: number
  onClick?: () => void
}

export function LeadCard({ lead, index, onClick }: LeadCardProps) {
  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
        >
          <Card
            className={`cursor-pointer transition-shadow hover:shadow-md ${
              snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''
            }`}
          >
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div className="font-medium text-sm truncate flex-1">
                  {lead.contact_name}
                </div>
              </div>

              {lead.company_name && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  <span className="truncate">{lead.company_name}</span>
                </div>
              )}

              {lead.email && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span className="truncate">{lead.email}</span>
                </div>
              )}

              {lead.value && (
                <div className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-500">
                  <DollarSign className="h-3 w-3" />
                  <span>{Number(lead.value).toLocaleString()}</span>
                  <span className="truncate">{lead.payment_terms}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </Draggable>
  )
}
