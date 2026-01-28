import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function PendingApproval() {
  const { user, signOut, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-warning/10 rounded-full">
              <Clock className="h-12 w-12 text-warning" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center">Pending Approval</CardTitle>
          <CardDescription className="text-center">
            Your account is awaiting administrator approval
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            You've successfully verified your email <strong>{user?.email}</strong>, but an administrator needs to approve your account before you can access the dashboard.
          </p>
          <p className="text-sm text-muted-foreground text-center">
            Please contact your administrator for access.
          </p>
          <div className="flex flex-col gap-2 pt-4">
            <Button onClick={handleCheckStatus} variant="outline" disabled={checking}>
              <RefreshCw className={`mr-2 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              Check approval status
            </Button>
            <Button onClick={handleSignOut} variant="ghost">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
