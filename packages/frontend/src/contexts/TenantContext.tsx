import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { tenantApi } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

export interface TenantOverviewStats {
  memberCount: number;
  pendingInvites: number;
  appCount: number;
}

export interface TenantAccessError {
  status: number;
  message: string;
}

export interface TenantContextValue {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  stats: TenantOverviewStats | null;
  isLoading: boolean;
  hasAccess: boolean;
  error: TenantAccessError | null;
  /** The caller's effective tenant permissions (owner is fully expanded). */
  permissions: string[];
  /** True if the caller holds the owner role. */
  isOwner: boolean;
  /** Permission check with `namespace:*` wildcard support. */
  can: (permission: string) => boolean;
  /** Re-fetch the tenant overview (e.g. after inviting a member). */
  refresh: () => Promise<void>;
}

/** Mirror of the backend wildcard matcher, kept intentionally tiny. */
function permissionMatches(pattern: string, action: string): boolean {
  if (pattern === action) return true;
  if (pattern.endsWith(':*')) return action.startsWith(pattern.slice(0, -1));
  return false;
}

// =============================================================================
// CONTEXT
// =============================================================================

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * Access the current tenant's shared state. Must be rendered inside a
 * <TenantProvider>. This is the single source of truth for the tenant portal -
 * the overview (name + stats) is fetched exactly once here instead of by every
 * page that happens to need the tenant name.
 */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used within a <TenantProvider>');
  }
  return ctx;
}

const ACCESS_ERROR_MESSAGES: Record<number, string> = {
  401: 'Please log in to continue',
  403: 'You do not have access to this organization',
  404: 'Organization not found',
};

// =============================================================================
// PROVIDER
// =============================================================================

interface TenantProviderProps {
  tenantId: string;
  children: ReactNode;
}

/**
 * TenantProvider - Fetches and shares the tenant overview for the whole portal.
 *
 * Doubles as the access check: a 403/404 from the overview endpoint means the
 * user can't see this org, which TenantLayout renders as an error page.
 */
export function TenantProvider({ tenantId, children }: TenantProviderProps) {
  const [tenantName, setTenantName] = useState('Organization');
  const [tenantSlug, setTenantSlug] = useState('');
  const [stats, setStats] = useState<TenantOverviewStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState<TenantAccessError | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const loadTokenRef = useRef(0);

  // Reset per-tenant identity synchronously when the target tenant changes.
  // Effects run child-first, so clearing the slug in an effect is too late —
  // TenantLayout's canonicalization effect would still see the previous
  // tenant's slug and rewrite the URL backwards, re-fetching the old org.
  // This render-time adjustment guarantees children see a cleared slug.
  const [slugResetForTenant, setSlugResetForTenant] = useState(tenantId);
  if (slugResetForTenant !== tenantId) {
    setSlugResetForTenant(tenantId);
    setTenantSlug('');
  }

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const overview = await tenantApi.getOverview(tenantId);
      if (token !== loadTokenRef.current) return; // a newer load started; drop this response
      setTenantName(overview.tenantName || 'Organization');
      setTenantSlug(overview.tenantSlug || '');
      setStats({
        memberCount: overview.memberCount ?? 0,
        pendingInvites: overview.pendingInvites ?? 0,
        appCount: overview.appCount ?? 0,
      });
      setPermissions(overview.permissions ?? []);
      setIsOwner(overview.isOwner ?? false);
      setHasAccess(true);
    } catch (err: any) {
      if (token !== loadTokenRef.current) return;
      const status = err?.response?.status || err?.status || 500;
      setHasAccess(false);
      setError({
        status,
        message:
          ACCESS_ERROR_MESSAGES[status] ||
          err?.message ||
          'Failed to load organization',
      });
    } finally {
      if (token === loadTokenRef.current) setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    // Slug reset now happens synchronously during render (see above), so this
    // effect only needs to kick off the overview fetch for the new tenant.
    load();
  }, [load]);

  const can = useCallback(
    (permission: string) =>
      isOwner || permissions.some((p) => permissionMatches(p, permission)),
    [isOwner, permissions],
  );

  return (
    <TenantContext.Provider
      value={{
        tenantId,
        tenantSlug,
        tenantName,
        stats,
        isLoading,
        hasAccess,
        error,
        permissions,
        isOwner,
        can,
        refresh: load,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}
