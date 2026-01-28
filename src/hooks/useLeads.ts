import { useState, useCallback, useMemo } from 'react';
import { Lead, LeadStage, Activity, Task, LeadFilters, ActivityType, TaskStatus } from '@/types/lead';

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

const initialActivities: Activity[] = [
  {
    id: 'a1',
    leadId: '1',
    type: 'email',
    title: 'Sent introduction email',
    description: 'Introduced our services and requested a call',
    createdAt: new Date('2024-01-15T10:30:00'),
  },
  {
    id: 'a2',
    leadId: '2',
    type: 'call',
    title: 'Discovery call completed',
    description: 'Discussed their needs, interested in premium plan',
    createdAt: new Date('2024-01-14T14:00:00'),
  },
  {
    id: 'a3',
    leadId: '3',
    type: 'meeting',
    title: 'Product demo scheduled',
    description: 'Demo meeting for next week',
    createdAt: new Date('2024-01-13T09:00:00'),
  },
];

const initialTasks: Task[] = [
  {
    id: 't1',
    leadId: '1',
    title: 'Follow up on introduction email',
    description: 'Check if they received the email and schedule a call',
    dueDate: new Date('2024-01-17'),
    status: 'pending',
    createdAt: new Date('2024-01-15'),
  },
  {
    id: 't2',
    leadId: '2',
    title: 'Send proposal document',
    description: 'Prepare and send the custom proposal',
    dueDate: new Date('2024-01-16'),
    status: 'pending',
    createdAt: new Date('2024-01-14'),
  },
  {
    id: 't3',
    leadId: '4',
    title: 'Contract review meeting',
    description: 'Review contract terms with legal',
    dueDate: new Date('2024-01-15'),
    status: 'overdue',
    createdAt: new Date('2024-01-10'),
  },
];

const defaultFilters: LeadFilters = {
  search: '',
  stages: [],
  dateRange: {},
  valueRange: {},
};

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [filters, setFilters] = useState<LeadFilters>(defaultFilters);

  // Filter leads based on current filters
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          lead.name.toLowerCase().includes(searchLower) ||
          lead.email.toLowerCase().includes(searchLower) ||
          lead.company?.toLowerCase().includes(searchLower) ||
          lead.source?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Stage filter
      if (filters.stages.length > 0 && !filters.stages.includes(lead.stage)) {
        return false;
      }

      // Date range filter
      if (filters.dateRange.from && new Date(lead.createdAt) < filters.dateRange.from) {
        return false;
      }
      if (filters.dateRange.to && new Date(lead.createdAt) > filters.dateRange.to) {
        return false;
      }

      // Value range filter
      if (filters.valueRange.min !== undefined && (lead.value || 0) < filters.valueRange.min) {
        return false;
      }
      if (filters.valueRange.max !== undefined && (lead.value || 0) > filters.valueRange.max) {
        return false;
      }

      return true;
    });
  }, [leads, filters]);

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
    // Also delete related activities and tasks
    setActivities((prev) => prev.filter((a) => a.leadId !== leadId));
    setTasks((prev) => prev.filter((t) => t.leadId !== leadId));
  }, []);

  const getLeadsByStage = useCallback(
    (stage: LeadStage) => filteredLeads.filter((lead) => lead.stage === stage),
    [filteredLeads]
  );

  // Activity functions
  const addActivity = useCallback((activity: Omit<Activity, 'id' | 'createdAt'>) => {
    const newActivity: Activity = {
      ...activity,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    setActivities((prev) => [newActivity, ...prev]);
    return newActivity;
  }, []);

  const getActivitiesForLead = useCallback(
    (leadId: string) =>
      activities
        .filter((a) => a.leadId === leadId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [activities]
  );

  // Task functions
  const addTask = useCallback((task: Omit<Task, 'id' | 'createdAt' | 'status'>) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: new Date(),
    };
    setTasks((prev) => [newTask, ...prev]);
    return newTask;
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, ...updates } : task
      )
    );
  }, []);

  const completeTask = useCallback((taskId: string, leadId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      updateTask(taskId, { status: 'completed', completedAt: new Date() });
      // Add activity for task completion
      addActivity({
        leadId,
        type: 'task_completed',
        title: `Completed: ${task.title}`,
      });
    }
  }, [tasks, updateTask, addActivity]);

  const deleteTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const getTasksForLead = useCallback(
    (leadId: string) =>
      tasks
        .filter((t) => t.leadId === leadId)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [tasks]
  );

  const getAllPendingTasks = useCallback(() => {
    const now = new Date();
    return tasks
      .filter((t) => t.status !== 'completed')
      .map((t) => ({
        ...t,
        status: (new Date(t.dueDate) < now && t.status === 'pending' ? 'overdue' : t.status) as TaskStatus,
      }))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [tasks]);

  const stats = useMemo(() => ({
    total: leads.length,
    filtered: filteredLeads.length,
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
    pendingTasks: tasks.filter((t) => t.status !== 'completed').length,
    overdueTasks: tasks.filter((t) => {
      const now = new Date();
      return t.status !== 'completed' && new Date(t.dueDate) < now;
    }).length,
  }), [leads, filteredLeads, tasks]);

  return {
    leads: filteredLeads,
    allLeads: leads,
    stats,
    filters,
    setFilters,
    moveLeadToStage,
    addLead,
    addLeads,
    updateLead,
    deleteLead,
    getLeadsByStage,
    // Activities
    activities,
    addActivity,
    getActivitiesForLead,
    // Tasks
    tasks,
    addTask,
    updateTask,
    completeTask,
    deleteTask,
    getTasksForLead,
    getAllPendingTasks,
  };
}
