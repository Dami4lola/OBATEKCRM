import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ActivityType } from '@/types/lead';
import { Phone, Mail, FileText, Calendar, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddActivityFormProps {
  onAdd: (activity: { type: ActivityType; title: string; description?: string }) => void;
}

const activityTypes: { id: ActivityType; label: string; icon: typeof Phone }[] = [
  { id: 'call', label: 'Call', icon: Phone },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'note', label: 'Note', icon: FileText },
  { id: 'meeting', label: 'Meeting', icon: Calendar },
];

export function AddActivityForm({ onAdd }: AddActivityFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<ActivityType>('note');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAdd({
      type,
      title: title.trim(),
      description: description.trim() || undefined,
    });

    setTitle('');
    setDescription('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="w-full"
      >
        <Plus className="w-4 h-4 mr-2" />
        Log Activity
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-secondary/50 rounded-lg">
      <div className="flex gap-2">
        {activityTypes.map((actType) => {
          const Icon = actType.icon;
          return (
            <Button
              key={actType.id}
              type="button"
              variant={type === actType.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType(actType.id)}
              className="flex-1"
            >
              <Icon className="w-3.5 h-3.5 mr-1.5" />
              {actType.label}
            </Button>
          );
        })}
      </div>

      <Input
        placeholder="Activity title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <Textarea
        placeholder="Add details (optional)..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(false)}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" className="flex-1" disabled={!title.trim()}>
          Add Activity
        </Button>
      </div>
    </form>
  );
}
