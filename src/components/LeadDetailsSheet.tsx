import { Lead, STAGES, LeadStage, Activity, Task, ActivityType } from '@/types/lead';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  Mail,
  Phone,
  DollarSign,
  Calendar,
  Trash2,
  Save,
  Clock,
  CheckSquare,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ActivityTimeline } from './ActivityTimeline';
import { AddActivityForm } from './AddActivityForm';
import { TaskList } from './TaskList';
import { AddTaskForm } from './AddTaskForm';

interface LeadDetailsSheetProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (leadId: string, updates: Partial<Lead>) => void;
  onDelete: (leadId: string) => void;
  activities: Activity[];
  onAddActivity: (activity: { leadId: string; type: ActivityType; title: string; description?: string }) => void;
  tasks: Task[];
  onAddTask: (task: { leadId: string; title: string; description?: string; dueDate: Date }) => void;
  onCompleteTask: (taskId: string, leadId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

export function LeadDetailsSheet({
  lead,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  activities,
  onAddActivity,
  tasks,
  onAddTask,
  onCompleteTask,
  onDeleteTask,
}: LeadDetailsSheetProps) {
  const [editedLead, setEditedLead] = useState<Lead | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (lead) {
      setEditedLead({ ...lead });
      setHasChanges(false);
    }
  }, [lead]);

  if (!lead || !editedLead) return null;

  const handleChange = (field: keyof Lead, value: any) => {
    setEditedLead((prev) => prev ? { ...prev, [field]: value } : null);
    setHasChanges(true);
  };

  const handleSave = () => {
    if (editedLead) {
      onUpdate(lead.id, editedLead);
      setHasChanges(false);
    }
  };

  const handleDelete = () => {
    onDelete(lead.id);
    onOpenChange(false);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(date));
  };

  const stageColors: Record<LeadStage, string> = {
    new: 'bg-stage-new',
    contacted: 'bg-stage-contacted',
    qualified: 'bg-stage-qualified',
    proposal: 'bg-stage-proposal',
    won: 'bg-stage-won',
    lost: 'bg-stage-lost',
  };

  const pendingTasks = tasks.filter((t) => t.status !== 'completed');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl">{lead.name}</SheetTitle>
            <Badge variant="outline" className="flex items-center gap-1.5">
              <div className={cn('w-2 h-2 rounded-full', stageColors[lead.stage])} />
              {STAGES.find((s) => s.id === lead.stage)?.label}
            </Badge>
          </div>
        </SheetHeader>

        <Tabs defaultValue="details" className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1.5">
              <CheckSquare className="w-3.5 h-3.5" />
              Tasks
              {pendingTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {pendingTasks.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="space-y-6 mt-4">
            {/* Quick Info */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                Created {formatDate(lead.createdAt)}
              </div>
            </div>

            {/* Stage Selector */}
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select
                value={editedLead.stage}
                onValueChange={(value) => handleChange('stage', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full', stageColors[stage.id])} />
                        {stage.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contact Info */}
            <div className="space-y-4">
              <h3 className="font-medium text-foreground">Contact Information</h3>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  Email
                </Label>
                <Input
                  value={editedLead.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  Phone
                </Label>
                <Input
                  value={editedLead.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="Add phone number"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  Company
                </Label>
                <Input
                  value={editedLead.company || ''}
                  onChange={(e) => handleChange('company', e.target.value)}
                  placeholder="Add company"
                />
              </div>
            </div>

            {/* Deal Info */}
            <div className="space-y-4">
              <h3 className="font-medium text-foreground">Deal Information</h3>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  Value
                </Label>
                <Input
                  type="number"
                  value={editedLead.value || ''}
                  onChange={(e) => handleChange('value', parseFloat(e.target.value) || undefined)}
                  placeholder="Deal value"
                />
              </div>

              <div className="space-y-2">
                <Label>Source</Label>
                <Input
                  value={editedLead.source || ''}
                  onChange={(e) => handleChange('source', e.target.value)}
                  placeholder="Lead source"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editedLead.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Add notes about this lead..."
                rows={4}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={!hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-4 mt-4">
            <AddActivityForm
              onAdd={(activity) =>
                onAddActivity({
                  ...activity,
                  leadId: lead.id,
                })
              }
            />
            <ActivityTimeline activities={activities} />
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4 mt-4">
            <AddTaskForm
              onAdd={(task) =>
                onAddTask({
                  ...task,
                  leadId: lead.id,
                })
              }
            />
            <TaskList
              tasks={tasks}
              onComplete={onCompleteTask}
              onDelete={onDeleteTask}
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
