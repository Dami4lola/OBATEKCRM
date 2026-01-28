import { Lead, STAGES } from '@/types/lead';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Mail, Phone, DollarSign, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
  isDragging?: boolean;
}

export function LeadCard({ lead, onClick, isDragging }: LeadCardProps) {
  const stageConfig = STAGES.find((s) => s.id === lead.stage);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Card
      className={cn(
        'p-4 cursor-pointer transition-all duration-200 hover:shadow-card-hover group bg-card',
        isDragging && 'shadow-elevated rotate-2 scale-105 opacity-90'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground mt-1">
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-foreground truncate">{lead.name}</h3>
            {lead.value && (
              <Badge variant="secondary" className="shrink-0 font-medium">
                <DollarSign className="w-3 h-3 mr-0.5" />
                {formatCurrency(lead.value)}
              </Badge>
            )}
          </div>

          {lead.company && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1.5">
              <Building2 className="w-3.5 h-3.5" />
              <span className="truncate">{lead.company}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1.5">
            <Mail className="w-3.5 h-3.5" />
            <span className="truncate">{lead.email}</span>
          </div>

          {lead.phone && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="w-3.5 h-3.5" />
              <span>{lead.phone}</span>
            </div>
          )}

          {lead.source && (
            <div className="mt-3 pt-3 border-t border-border">
              <Badge variant="outline" className="text-xs">
                {lead.source}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
