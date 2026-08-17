import { Outlet, useParams, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { TenantSidebar } from './TenantSidebar';
import { TenantHeader } from './TenantHeader';
import { TenantAccessError } from './TenantAccessError';
import { TenantProvider, useTenant } from '@/contexts/TenantContext';

/**
 * TenantLayoutInner - Renders the portal chrome once tenant access is resolved.
 * Reads the shared TenantContext rather than fetching on its own.
 */
function TenantLayoutInner() {
  const { isLoading, hasAccess, error, tenantSlug } = useTenant();
  const { tenantId: routeTenantId } = useParams<{ tenantId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Canonicalize the URL to the tenant SLUG. The route is often entered with
  // the tenant UUID (deep-links build the URL from the JWT `tenant_id` claim).
  // Once we know the human-readable slug, rewrite the URL in place so the
  // address bar and every downstream link use the slug. The backend
  // TenantIdentifierGuard accepts either, so this is purely cosmetic/UX and
  // loop-safe (after the rewrite the param already equals the slug).
  useEffect(() => {
    if (!tenantSlug || !hasAccess) return;
    if (routeTenantId === tenantSlug) return;
    const segments = location.pathname.split('/');
    // segments = ['', 'tenant', '<id-or-slug>', ...rest]
    if (segments[1] !== 'tenant' || segments[2] === tenantSlug) return;
    segments[2] = tenantSlug;
    navigate(segments.join('/') + location.search, { replace: true });
  }, [tenantSlug, hasAccess, routeTenantId, location.pathname, location.search, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !hasAccess) {
    return (
      <TenantAccessError
        status={error?.status || 403}
        message={error?.message || 'You do not have access to this organization'}
      />
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <TenantSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TenantHeader />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * TenantLayout - Main layout wrapper for tenant management pages.
 * Establishes the TenantProvider (single source of tenant name + stats) and
 * delegates rendering of loading/error/chrome to TenantLayoutInner.
 */
export function TenantLayout() {
  const { tenantId } = useParams<{ tenantId: string }>();

  if (!tenantId) {
    return <Navigate to="/" replace />;
  }

  return (
    <TenantProvider tenantId={tenantId}>
      <TenantLayoutInner />
    </TenantProvider>
  );
}
