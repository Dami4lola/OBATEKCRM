export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  value?: number;
  stage: LeadStage;
  source?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StageConfig {
  id: LeadStage;
  label: string;
  color: string;
}

export const STAGES: StageConfig[] = [
  { id: 'new', label: 'New Lead', color: 'stage-new' },
  { id: 'contacted', label: 'Contacted', color: 'stage-contacted' },
  { id: 'qualified', label: 'Qualified', color: 'stage-qualified' },
  { id: 'proposal', label: 'Proposal', color: 'stage-proposal' },
  { id: 'won', label: 'Won', color: 'stage-won' },
  { id: 'lost', label: 'Lost', color: 'stage-lost' },
];
