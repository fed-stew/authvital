import { useState, useEffect } from 'react';
import { tenantApi } from '@/lib/api';

export interface TenantAccessState {
  isLoading: boolean;
  hasAccess: boolean;
  error: {
    status: number;
    message: string;
  } | null;
  tenant: {
    id: string;
    name: string;
  } | null;
}

/**
 * Hook to verify user has access to a tenant
 * Used by TenantLayout to show proper error states
 */
export function useTenantAccess(tenantId: string | undefined): TenantAccessState {
  const [state, setState] = useState<TenantAccessState>({
    isLoading: true,
    hasAccess: false,
    error: null,
    tenant: null,
  });

  useEffect(() => {
    if (!tenantId) {
      setState({
        isLoading: false,
        hasAccess: false,
        error: { status: 400, message: 'No tenant ID provided' },
        tenant: null,
      });
      return;
    }

    const checkAccess = async () => {
      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        // Use the overview endpoint to verify access
        // This will return 403 if no access, 404 if not found
        const overview = await tenantApi.getOverview(tenantId);

        setState({
          isLoading: false,
          hasAccess: true,
          error: null,
          tenant: { id: tenantId, name: overview.tenantName || 'Organization' },
        });
      } catch (err: any) {
        const status = err?.response?.status || err?.status || 500;
        let message = 'An error occurred';

        if (status === 403) {
          message = 'You do not have access to this organization';
        } else if (status === 404) {
          message = 'Organization not found';
        } else if (status === 401) {
          message = 'Please log in to continue';
        } else {
          message = err?.message || 'Failed to load organization';
        }

        setState({
          isLoading: false,
          hasAccess: false,
          error: { status, message },
          tenant: null,
        });
      }
    };

    checkAccess();
  }, [tenantId]);

  return state;
}
