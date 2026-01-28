import { Task, Lead } from '@/types/lead';
import { TaskList } from './TaskList';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, AlertCircle } from 'lucide-react';

interface TasksSidebarProps {
  tasks: Task[];
  leads: Lead[];
  onComplete: (taskId: string, leadId: string) => void;
  onDelete: (taskId: string) => void;
  pendingCount: number;
  overdueCount: number;
}

export function TasksSidebar({
  tasks,
  leads,
  onComplete,
  onDelete,
  pendingCount,
  overdueCount,
}: TasksSidebarProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <CheckSquare className="w-4 h-4" />
          Tasks
          {pendingCount > 0 && (
            <Badge
              variant={overdueCount > 0 ? 'destructive' : 'secondary'}
              className="ml-1"
            >
              {overdueCount > 0 && <AlertCircle className="w-3 h-3 mr-1" />}
              {pendingCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5" />
            All Tasks
            {overdueCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {overdueCount} overdue
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          <TaskList
            tasks={tasks}
            leads={leads}
            showLeadName
            onComplete={onComplete}
            onDelete={onDelete}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
