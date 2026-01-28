import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireApproval?: boolean;
  requireAdmin?: boolean;
}

export function ProtectedRoute({
  children,
  requireApproval = true,
  requireAdmin = false
}: ProtectedRouteProps) {
  const { user, loading, isApproved, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  if (requireApproval && !isApproved) {
    return <Navigate to="/pending-approval" replace />;
  }

  return <>{children}</>;
}
