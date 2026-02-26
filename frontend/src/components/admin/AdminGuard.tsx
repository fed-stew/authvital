import { Outlet, Navigate } from 'react-router-dom';
import { useAdmin } from '@/contexts/AdminContext';

// =============================================================================
// ROUTE GUARD COMPONENT
// =============================================================================

/**
 * AdminGuard - Protects admin routes by checking authentication.
 * 
 * - If not authenticated, redirects to /admin/login
 * - If loading, shows spinner
 * - If authenticated, renders children (Outlet)
 */
function AdminGuard() {
  const { isLoading, isAuthenticated, mustChangePassword } = useAdmin();

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  // Redirect to change password if required
  if (mustChangePassword) {
    return <Navigate to="/admin/change-password" replace />;
  }

  // Render protected content
  return <Outlet />;
}

export { AdminGuard };
