import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key holding the tenant-scoping policy for an integration endpoint.
 */
export const M2M_TENANT_KEY = 'm2m:tenant';

/**
 * How an integration endpoint resolves + enforces the tenant an M2M client acts on.
 *
 * - `direct`   → tenantId comes from a request field (query or body); access is
 *                asserted against the client's tenant grants.
 * - `cross`    → the endpoint spans all tenants; only clients trusted for all
 *                tenants may call it.
 * - `agnostic` → the endpoint has no tenant dimension at all.
 * - `record`   → the tenant is derived from a DB record; enforcement happens in
 *                the service layer, not the guard.
 */
export type M2mTenantPolicy =
  | { mode: 'direct'; source: 'query' | 'body'; field: string }
  | { mode: 'cross' }
  | { mode: 'agnostic' }
  | { mode: 'record' };

/**
 * Resolve the tenant from a request field and assert client access to it.
 */
export const M2mTenantFrom = (source: 'query' | 'body', field = 'tenantId') =>
  SetMetadata(M2M_TENANT_KEY, {
    mode: 'direct',
    source,
    field,
  } as M2mTenantPolicy);

/**
 * Endpoint spans all tenants; requires a globally-trusted M2M client.
 */
export const M2mCrossTenant = () =>
  SetMetadata(M2M_TENANT_KEY, { mode: 'cross' } as M2mTenantPolicy);

/**
 * Endpoint has no tenant dimension.
 */
export const M2mTenantAgnostic = () =>
  SetMetadata(M2M_TENANT_KEY, { mode: 'agnostic' } as M2mTenantPolicy);

/**
 * Tenant is derived from a DB record; enforcement is deferred to the service layer.
 */
export const M2mTenantFromRecord = () =>
  SetMetadata(M2M_TENANT_KEY, { mode: 'record' } as M2mTenantPolicy);
