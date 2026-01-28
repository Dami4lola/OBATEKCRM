import { Lead, LeadStage, StageConfig } from '@/types/lead';
import { LeadCard } from './LeadCard';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface PipelineColumnProps {
  stage: StageConfig;
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
  onDropLead: (leadId: string, stage: LeadStage) => void;
}

export function PipelineColumn({
  stage,
  leads,
  onLeadClick,
  onDropLead,
}: PipelineColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  const totalValue = leads.reduce((sum, lead) => sum + (lead.value || 0), 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const leadId = e.dataTransfer.getData('leadId');
    if (leadId) {
      onDropLead(leadId, stage.id);
    }
  };

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('leadId', leadId);
    setDraggedLeadId(leadId);
  };

  const handleDragEnd = () => {
    setDraggedLeadId(null);
  };

  const stageColors: Record<LeadStage, string> = {
    new: 'bg-stage-new',
    contacted: 'bg-stage-contacted',
    qualified: 'bg-stage-qualified',
    proposal: 'bg-stage-proposal',
    won: 'bg-stage-won',
    lost: 'bg-stage-lost',
  };

  return (
    <div
      className={cn(
        'pipeline-column bg-secondary/50',
        isDragOver && 'pipeline-column-drop'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <div className={cn('stage-indicator', stageColors[stage.id])} />
          <h3 className="font-semibold text-foreground">{stage.label}</h3>
          <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {leads.length}
          </span>
        </div>
      </div>

      {/* Value Summary */}
      {totalValue > 0 && (
        <div className="text-sm text-muted-foreground mb-3 px-1">
          {formatCurrency(totalValue)}
        </div>
      )}

      {/* Lead Cards */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {leads.map((lead) => (
          <div
            key={lead.id}
            draggable
            onDragStart={(e) => handleDragStart(e, lead.id)}
            onDragEnd={handleDragEnd}
            className="drag-card"
          >
            <LeadCard
              lead={lead}
              onClick={() => onLeadClick(lead)}
              isDragging={draggedLeadId === lead.id}
            />
          </div>
        ))}

        {leads.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-8">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}
