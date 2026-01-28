import { Button } from '@/components/ui/button';
import { Plus, Upload, TrendingUp, Users, DollarSign, Trophy, LogOut } from 'lucide-react';
import { TasksSidebar } from './TasksSidebar';
import { Task, Lead } from '@/types/lead';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface DashboardHeaderProps {
  stats: {
    total: number;
    filtered: number;
    totalValue: number;
    wonValue: number;
    pendingTasks: number;
    overdueTasks: number;
    byStage: {
      new: number;
      contacted: number;
      qualified: number;
      proposal: number;
      won: number;
      lost: number;
    };
  };
  onAddLead: () => void;
  onImport: () => void;
  allTasks: Task[];
  allLeads: Lead[];
  onCompleteTask: (taskId: string, leadId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

export function DashboardHeader({
  stats,
  onAddLead,
  onImport,
  allTasks,
  allLeads,
  onCompleteTask,
  onDeleteTask,
}: DashboardHeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const userInitials = user?.email?.substring(0, 2).toUpperCase() || 'U';

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const conversionRate = stats.total > 0 
    ? Math.round((stats.byStage.won / stats.total) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lead Pipeline</h1>
          <p className="text-muted-foreground">Track and manage your sales leads</p>
        </div>
        <div className="flex items-center gap-3">
          <TasksSidebar
            tasks={allTasks}
            leads={allLeads}
            onComplete={onCompleteTask}
            onDelete={onDeleteTask}
            pendingCount={stats.pendingTasks}
            overdueCount={stats.overdueTasks}
          />
          <Button variant="outline" onClick={onImport}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button onClick={onAddLead}>
            <Plus className="w-4 h-4 mr-2" />
            Add Lead
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Leads</p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-warning/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pipeline Value</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalValue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success/10 rounded-lg">
              <Trophy className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Won Deals</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.wonValue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-stage-contacted/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-stage-contacted" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Conversion Rate</p>
              <p className="text-2xl font-bold text-foreground">{conversionRate}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
