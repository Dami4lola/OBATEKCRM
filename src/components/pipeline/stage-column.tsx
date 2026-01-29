'use client'

import { Droppable } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LeadCard } from './lead-card'
import type { Stage, Lead } from '@/types/database'

interface StageColumnProps {
  stage: Stage
  leads: Lead[]
  onAddLead: (stageId: string) => void
  onLeadClick: (lead: Lead) => void
}

export function StageColumn({
  stage,
  leads,
  onAddLead,
  onLeadClick,
}: StageColumnProps) {
  const totalValue = leads.reduce(
    (sum, lead) => sum + (Number(lead.value) || 0),
    0
  )

  return (
    <div className="flex flex-col h-full w-72 flex-shrink-0">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: stage.color || '#6366f1' }}
          />
          <h3 className="font-semibold text-sm">{stage.name}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {leads.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onAddLead(stage.id)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Value summary */}
      {totalValue > 0 && (
        <div className="text-xs text-muted-foreground mb-2 px-1">
          ${totalValue.toLocaleString()}
        </div>
      )}

      {/* Droppable area */}
      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 rounded-lg p-2 space-y-2 overflow-y-auto transition-colors ${
              snapshot.isDraggingOver
                ? 'bg-primary/5 ring-2 ring-primary/20'
                : 'bg-gray-50 dark:bg-gray-900/50'
            }`}
          >
            {leads.map((lead, index) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                index={index}
                onClick={() => onLeadClick(lead)}
              />
            ))}
            {provided.placeholder}

            {leads.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No leads yet
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}
