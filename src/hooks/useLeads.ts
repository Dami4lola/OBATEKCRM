import { useState, useCallback } from 'react';
import { Lead, LeadStage } from '@/types/lead';

// Sample data for demonstration
const initialLeads: Lead[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    email: 'sarah@techcorp.com',
    phone: '+1 555-0101',
    company: 'TechCorp Inc.',
    value: 15000,
    stage: 'new',
    source: 'Website',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  },
  {
    id: '2',
    name: 'Michael Chen',
    email: 'mchen@innovate.io',
    company: 'Innovate.io',
    value: 25000,
    stage: 'contacted',
    source: 'Referral',
    createdAt: new Date('2024-01-12'),
    updatedAt: new Date('2024-01-14'),
  },
  {
    id: '3',
    name: 'Emily Davis',
    email: 'emily.d@startup.co',
    phone: '+1 555-0103',
    company: 'Startup Co',
    value: 8000,
    stage: 'qualified',
    source: 'LinkedIn',
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-13'),
  },
  {
    id: '4',
    name: 'James Wilson',
    email: 'jwilson@enterprise.com',
    company: 'Enterprise LLC',
    value: 50000,
    stage: 'proposal',
    source: 'Cold Email',
    createdAt: new Date('2024-01-08'),
    updatedAt: new Date('2024-01-12'),
  },
  {
    id: '5',
    name: 'Lisa Anderson',
    email: 'lisa@globaltech.com',
    phone: '+1 555-0105',
    company: 'GlobalTech',
    value: 35000,
    stage: 'won',
    source: 'Conference',
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-11'),
  },
  {
    id: '6',
    name: 'Robert Taylor',
    email: 'rtaylor@smallbiz.com',
    company: 'SmallBiz Solutions',
    value: 5000,
    stage: 'new',
    source: 'Website',
    createdAt: new Date('2024-01-14'),
    updatedAt: new Date('2024-01-14'),
  },
];

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);

  const moveLeadToStage = useCallback((leadId: string, newStage: LeadStage) => {
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId
          ? { ...lead, stage: newStage, updatedAt: new Date() }
          : lead
      )
    );
  }, []);

  const addLead = useCallback((lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newLead: Lead = {
      ...lead,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setLeads((prev) => [newLead, ...prev]);
    return newLead;
  }, []);

  const addLeads = useCallback((newLeads: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[]) => {
    const leadsToAdd: Lead[] = newLeads.map((lead) => ({
      ...lead,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setLeads((prev) => [...leadsToAdd, ...prev]);
    return leadsToAdd;
  }, []);

  const updateLead = useCallback((leadId: string, updates: Partial<Lead>) => {
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId
          ? { ...lead, ...updates, updatedAt: new Date() }
          : lead
      )
    );
  }, []);

  const deleteLead = useCallback((leadId: string) => {
    setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
  }, []);

  const getLeadsByStage = useCallback(
    (stage: LeadStage) => leads.filter((lead) => lead.stage === stage),
    [leads]
  );

  const stats = {
    total: leads.length,
    totalValue: leads.reduce((sum, lead) => sum + (lead.value || 0), 0),
    byStage: {
      new: leads.filter((l) => l.stage === 'new').length,
      contacted: leads.filter((l) => l.stage === 'contacted').length,
      qualified: leads.filter((l) => l.stage === 'qualified').length,
      proposal: leads.filter((l) => l.stage === 'proposal').length,
      won: leads.filter((l) => l.stage === 'won').length,
      lost: leads.filter((l) => l.stage === 'lost').length,
    },
    wonValue: leads
      .filter((l) => l.stage === 'won')
      .reduce((sum, lead) => sum + (lead.value || 0), 0),
  };

  return {
    leads,
    stats,
    moveLeadToStage,
    addLead,
    addLeads,
    updateLead,
    deleteLead,
    getLeadsByStage,
  };
}
