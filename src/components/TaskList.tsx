import { Task, Lead } from '@/types/lead';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, Trash2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskListProps {
  tasks: Task[];
  leads?: Lead[];
  showLeadName?: boolean;
  onComplete: (taskId: string, leadId: string) => void;
  onDelete: (taskId: string) => void;
}

export function TaskList({ tasks, leads, showLeadName = false, onComplete, onDelete }: TaskListProps) {
  const formatDate = (date: Date) => {
    const now = new Date();
    const taskDate = new Date(date);
    const diffDays = Math.floor((taskDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`;
    } else if (diffDays === 0) {
      return 'Due today';
    } else if (diffDays === 1) {
      return 'Due tomorrow';
    } else if (diffDays < 7) {
      return `Due in ${diffDays} days`;
    } else {
      return `Due ${taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
  };

  const getLeadName = (leadId: string) => {
    return leads?.find((l) => l.id === leadId)?.name || 'Unknown';
  };

  if (tasks.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No tasks yet. Create a follow-up task to stay on track.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const isOverdue = task.status === 'overdue' || (task.status === 'pending' && new Date(task.dueDate) < new Date());
        const isCompleted = task.status === 'completed';

        return (
          <div
            key={task.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border border-border bg-card transition-colors',
              isOverdue && !isCompleted && 'border-destructive/50 bg-destructive/5',
              isCompleted && 'opacity-60'
            )}
          >
            <Checkbox
              checked={isCompleted}
              onCheckedChange={() => !isCompleted && onComplete(task.id, task.leadId)}
              className="mt-0.5"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className={cn('font-medium text-sm', isCompleted && 'line-through text-muted-foreground')}>
                  {task.title}
                </h4>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(task.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              {task.description && (
                <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
              )}

              <div className="flex items-center gap-3 mt-2">
                <div className={cn(
                  'flex items-center gap-1 text-xs',
                  isOverdue && !isCompleted ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  {isOverdue && !isCompleted ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : (
                    <Calendar className="w-3 h-3" />
                  )}
                  {formatDate(task.dueDate)}
                </div>

                {showLeadName && (
                  <span className="text-xs text-muted-foreground">
                    • {getLeadName(task.leadId)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
