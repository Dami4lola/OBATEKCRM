'use client'

import { useState, useMemo } from 'react'
import { DragDropContext, type DropResult } from '@hello-pangea/dnd'
import { toast } from 'sonner'
import { useStages } from '@/lib/queries/stages'
import { useLeads, useMoveLead } from '@/lib/queries/leads'
import { StageColumn } from './stage-column'
import { LeadFormDialog } from '@/components/leads/lead-form-dialog'
import { LeadSheet } from '@/components/leads/lead-sheet'
import type { Lead } from '@/types/database'

const DEFAULT_PIPELINE_ID = '00000000-0000-0000-0000-000000000001'

export function PipelineBoard() {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)
  const [isLeadSheetOpen, setIsLeadSheetOpen] = useState(false)

  const { data: stages = [], isLoading: stagesLoading } = useStages(DEFAULT_PIPELINE_ID)
  const { data: leads = [], isLoading: leadsLoading } = useLeads()
  const moveLead = useMoveLead()

  // Group leads by stage
  const leadsByStage = useMemo(() => {
    const grouped: Record<string, Lead[]> = {}
    stages.forEach((stage) => {
      grouped[stage.id] = leads
        .filter((lead) => lead.stage_id === stage.id)
        .sort((a, b) => a.position_index - b.position_index)
    })
    return grouped
  }, [stages, leads])

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result

    // Dropped outside any droppable
    if (!destination) return

    // Dropped in the same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return
    }

    try {
      await moveLead.mutateAsync({
        leadId: draggableId,
        newStageId: destination.droppableId,
        newPosition: destination.index,
      })
    } catch {
      toast.error('Failed to move lead')
    }
  }

  const handleAddLead = (stageId: string) => {
    setSelectedStageId(stageId)
    setIsAddLeadOpen(true)
  }

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead)
    setIsLeadSheetOpen(true)
  }

  if (stagesLoading || leadsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading pipeline...</div>
      </div>
    )
  }

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 h-[calc(100vh-12rem)] overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              leads={leadsByStage[stage.id] || []}
              onAddLead={handleAddLead}
              onLeadClick={handleLeadClick}
            />
          ))}
        </div>
      </DragDropContext>

      <LeadFormDialog
        open={isAddLeadOpen}
        onOpenChange={setIsAddLeadOpen}
        stageId={selectedStageId}
      />

      <LeadSheet
        lead={selectedLead}
        open={isLeadSheetOpen}
        onOpenChange={setIsLeadSheetOpen}
      />
    </>
  )
}
