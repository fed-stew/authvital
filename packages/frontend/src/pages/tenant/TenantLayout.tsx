import { Outlet, useParams, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { TenantSidebar } from './TenantSidebar';
import { TenantHeader } from './TenantHeader';
import { TenantAccessError } from './TenantAccessError';
import { useTenantAccess } from '@/hooks/useTenantAccess';

/**
 * TenantLayout - Main layout wrapper for tenant management pages
 * Verifies user has access to the tenant and shows appropriate error states
 */
export function TenantLayout() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isLoading, hasAccess, error } = useTenantAccess(tenantId);

  // Show loading state while checking access
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show error page if no access
  if (error || !hasAccess) {
    return (
      <TenantAccessError
        status={error?.status || 403}
        message={error?.message || 'You do not have access to this organization'}
      />
    );
  }

  // Redirect if no tenant ID (shouldn't happen)
  if (!tenantId) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen bg-background">
      <TenantSidebar tenantId={tenantId} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TenantHeader tenantId={tenantId} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
