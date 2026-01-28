import { useState, useCallback, useMemo, useEffect } from 'react';
import { Lead, LeadStage, Activity, Task, LeadFilters, TaskStatus } from '@/types/lead';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const defaultFilters: LeadFilters = {
  search: '',
  stages: [],
  dateRange: {},
  valueRange: {},
};

export function useLeads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState<LeadFilters>(defaultFilters);
  const [loading, setLoading] = useState(true);

  // Fetch all data on mount
  useEffect(() => {
    if (user) {
      fetchLeads();
      fetchActivities();
      fetchTasks();
    }
  }, [user]);

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch leads');
      console.error(error);
    } else {
      setLeads(data.map(transformLead));
    }
    setLoading(false);
  };

  const fetchActivities = async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setActivities(data.map(transformActivity));
    }
  };

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true });

    if (error) {
      console.error(error);
    } else {
      setTasks(data.map(transformTask));
    }
  };

  // Transform database rows to app types
  const transformLead = (row: Record<string, unknown>): Lead => ({
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    phone: row.phone as string | undefined,
    company: row.company as string | undefined,
    value: row.value as number | undefined,
    stage: row.stage as LeadStage,
    source: row.source as string | undefined,
    notes: row.notes as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });

  const transformActivity = (row: Record<string, unknown>): Activity => ({
    id: row.id as string,
    leadId: row.lead_id as string,
    type: row.type as Activity['type'],
    title: row.title as string,
    description: row.description as string | undefined,
    createdAt: new Date(row.created_at as string),
  });

  const transformTask = (row: Record<string, unknown>): Task => ({
    id: row.id as string,
    leadId: row.lead_id as string,
    title: row.title as string,
    description: row.description as string | undefined,
    dueDate: new Date(row.due_date as string),
    status: row.status as TaskStatus,
    createdAt: new Date(row.created_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
  });

  // Filter leads based on current filters
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          lead.name.toLowerCase().includes(searchLower) ||
          lead.email.toLowerCase().includes(searchLower) ||
          lead.company?.toLowerCase().includes(searchLower) ||
          lead.source?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      if (filters.stages.length > 0 && !filters.stages.includes(lead.stage)) {
        return false;
      }

      if (filters.dateRange.from && new Date(lead.createdAt) < filters.dateRange.from) {
        return false;
      }
      if (filters.dateRange.to && new Date(lead.createdAt) > filters.dateRange.to) {
        return false;
      }

      if (filters.valueRange.min !== undefined && (lead.value || 0) < filters.valueRange.min) {
        return false;
      }
      if (filters.valueRange.max !== undefined && (lead.value || 0) > filters.valueRange.max) {
        return false;
      }

      return true;
    });
  }, [leads, filters]);

  const moveLeadToStage = useCallback(async (leadId: string, newStage: LeadStage) => {
    const { error } = await supabase
      .from('leads')
      .update({ stage: newStage })
      .eq('id', leadId);

    if (error) {
      toast.error('Failed to update lead stage');
    } else {
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId
            ? { ...lead, stage: newStage, updatedAt: new Date() }
            : lead
        )
      );
    }
  }, []);

  const addLead = useCallback(async (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => {
    const { data, error } = await supabase
      .from('leads')
      .insert({
        user_id: user?.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone || null,
        company: lead.company || null,
        value: lead.value || null,
        stage: lead.stage,
        source: lead.source || null,
        notes: lead.notes || null,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add lead');
      return null;
    } else {
      const newLead = transformLead(data);
      setLeads((prev) => [newLead, ...prev]);
      toast.success('Lead added successfully');
      return newLead;
    }
  }, [user]);

  const addLeads = useCallback(async (newLeads: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[]) => {
    const leadsToInsert = newLeads.map((lead) => ({
      user_id: user?.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone || null,
      company: lead.company || null,
      value: lead.value || null,
      stage: lead.stage,
      source: lead.source || null,
      notes: lead.notes || null,
    }));

    const { data, error } = await supabase
      .from('leads')
      .insert(leadsToInsert)
      .select();

    if (error) {
      toast.error('Failed to import leads');
      return [];
    } else {
      const insertedLeads = data.map(transformLead);
      setLeads((prev) => [...insertedLeads, ...prev]);
      toast.success(`${insertedLeads.length} leads imported successfully`);
      return insertedLeads;
    }
  }, [user]);

  const updateLead = useCallback(async (leadId: string, updates: Partial<Lead>) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.company !== undefined) dbUpdates.company = updates.company;
    if (updates.value !== undefined) dbUpdates.value = updates.value;
    if (updates.stage !== undefined) dbUpdates.stage = updates.stage;
    if (updates.source !== undefined) dbUpdates.source = updates.source;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

    const { error } = await supabase
      .from('leads')
      .update(dbUpdates)
      .eq('id', leadId);

    if (error) {
      toast.error('Failed to update lead');
    } else {
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId
            ? { ...lead, ...updates, updatedAt: new Date() }
            : lead
        )
      );
      toast.success('Lead updated successfully');
    }
  }, []);

  const deleteLead = useCallback(async (leadId: string) => {
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId);

    if (error) {
      toast.error('Failed to delete lead');
    } else {
      setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
      setActivities((prev) => prev.filter((a) => a.leadId !== leadId));
      setTasks((prev) => prev.filter((t) => t.leadId !== leadId));
      toast.success('Lead deleted successfully');
    }
  }, []);

  const getLeadsByStage = useCallback(
    (stage: LeadStage) => filteredLeads.filter((lead) => lead.stage === stage),
    [filteredLeads]
  );

  // Activity functions
  const addActivity = useCallback(async (activity: Omit<Activity, 'id' | 'createdAt'>) => {
    const { data, error } = await supabase
      .from('activities')
      .insert({
        user_id: user?.id,
        lead_id: activity.leadId,
        type: activity.type,
        title: activity.title,
        description: activity.description || null,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add activity');
      return null;
    } else {
      const newActivity = transformActivity(data);
      setActivities((prev) => [newActivity, ...prev]);
      return newActivity;
    }
  }, [user]);

  const getActivitiesForLead = useCallback(
    (leadId: string) =>
      activities
        .filter((a) => a.leadId === leadId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [activities]
  );

  // Task functions
  const addTask = useCallback(async (task: Omit<Task, 'id' | 'createdAt' | 'status'>) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: user?.id,
        lead_id: task.leadId,
        title: task.title,
        description: task.description || null,
        due_date: task.dueDate.toISOString(),
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add task');
      return null;
    } else {
      const newTask = transformTask(data);
      setTasks((prev) => [newTask, ...prev]);
      toast.success('Task added successfully');
      return newTask;
    }
  }, [user]);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate.toISOString();
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt.toISOString();

    const { error } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', taskId);

    if (error) {
      toast.error('Failed to update task');
    } else {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, ...updates } : task
        )
      );
    }
  }, []);

  const completeTask = useCallback(async (taskId: string, leadId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      await updateTask(taskId, { status: 'completed', completedAt: new Date() });
      await addActivity({
        leadId,
        type: 'task_completed',
        title: `Completed: ${task.title}`,
      });
      toast.success('Task completed');
    }
  }, [tasks, updateTask, addActivity]);

  const deleteTask = useCallback(async (taskId: string) => {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      toast.error('Failed to delete task');
    } else {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
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
    loading,
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
