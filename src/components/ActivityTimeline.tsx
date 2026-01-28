import { Activity, ActivityType } from '@/types/lead';
import { Phone, Mail, FileText, Calendar, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityTimelineProps {
  activities: Activity[];
}

const activityConfig: Record<ActivityType, { icon: typeof Phone; color: string; bgColor: string }> = {
  call: { icon: Phone, color: 'text-stage-new', bgColor: 'bg-stage-new/10' },
  email: { icon: Mail, color: 'text-stage-contacted', bgColor: 'bg-stage-contacted/10' },
  note: { icon: FileText, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  meeting: { icon: Calendar, color: 'text-stage-qualified', bgColor: 'bg-stage-qualified/10' },
  task_completed: { icon: CheckCircle2, color: 'text-success', bgColor: 'bg-success/10' },
};

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const formatDate = (date: Date) => {
    const now = new Date();
    const activityDate = new Date(date);
    const diffDays = Math.floor((now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${activityDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${activityDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return activityDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  if (activities.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No activities yet. Add a call, email, or note to get started.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity, index) => {
        const config = activityConfig[activity.type];
        const Icon = config.icon;

        return (
          <div key={activity.id} className="flex gap-3 relative">
            {/* Timeline line */}
            {index < activities.length - 1 && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
            )}

            {/* Icon */}
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', config.bgColor)}>
              <Icon className={cn('w-4 h-4', config.color)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-4">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-foreground text-sm">{activity.title}</h4>
                <span className="text-xs text-muted-foreground shrink-0">{formatDate(activity.createdAt)}</span>
              </div>
              {activity.description && (
                <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
