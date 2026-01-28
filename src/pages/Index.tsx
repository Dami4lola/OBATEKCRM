import { useState } from 'react';
import { useLeads } from '@/hooks/useLeads';
import { Lead, STAGES } from '@/types/lead';
import { DashboardHeader } from '@/components/DashboardHeader';
import { PipelineColumn } from '@/components/PipelineColumn';
import { LeadDetailsSheet } from '@/components/LeadDetailsSheet';
import { ImportModal } from '@/components/ImportModal';
import { AddLeadModal } from '@/components/AddLeadModal';
import { SearchFilterBar } from '@/components/SearchFilterBar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const Index = () => {
  const {
    leads,
    allLeads,
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
    addActivity,
    getActivitiesForLead,
    // Tasks
    addTask,
    completeTask,
    deleteTask,
    getTasksForLead,
    getAllPendingTasks,
  } = useLeads();

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailsOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6 max-w-[1600px]">
        <DashboardHeader
          stats={stats}
          onAddLead={() => setAddLeadOpen(true)}
          onImport={() => setImportOpen(true)}
          allTasks={getAllPendingTasks()}
          allLeads={allLeads}
          onCompleteTask={completeTask}
          onDeleteTask={deleteTask}
        />

        {/* Search & Filters */}
        <div className="mt-6">
          <SearchFilterBar
            filters={filters}
            onFiltersChange={setFilters}
            totalCount={stats.total}
            filteredCount={stats.filtered}
          />
        </div>

        {/* Pipeline */}
        <div className="mt-6">
          <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4 min-w-max">
              {STAGES.map((stage) => (
                <div key={stage.id} className="w-[300px] shrink-0">
                  <PipelineColumn
                    stage={stage}
                    leads={getLeadsByStage(stage.id)}
                    onLeadClick={handleLeadClick}
                    onDropLead={moveLeadToStage}
                  />
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>

      {/* Modals */}
      <LeadDetailsSheet
        lead={selectedLead}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onUpdate={updateLead}
        onDelete={deleteLead}
        activities={selectedLead ? getActivitiesForLead(selectedLead.id) : []}
        onAddActivity={addActivity}
        tasks={selectedLead ? getTasksForLead(selectedLead.id) : []}
        onAddTask={addTask}
        onCompleteTask={completeTask}
        onDeleteTask={deleteTask}
      />

      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={addLeads}
      />

      <AddLeadModal
        open={addLeadOpen}
        onOpenChange={setAddLeadOpen}
        onAdd={addLead}
      />
    </div>
  );
};

export default Index;
