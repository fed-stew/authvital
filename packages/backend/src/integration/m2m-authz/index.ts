/**
 * M2M Authorization Barrel Export
 *
 * Deny-by-default authorization primitives for machine-to-machine clients:
 * - IntegrationScope / ALL_INTEGRATION_SCOPES: canonical integration scopes
 * - M2mTenantAuthService: per-tenant access checks for M2M clients
 * - RequireScopes / M2mTenant* decorators: endpoint policy declarations
 * - M2mScopeGuard / M2mTenantGuard: deny-by-default enforcement guards
 */

export * from './integration-scopes';
export * from './m2m-tenant-auth.service';
export * from './require-scopes.decorator';
export * from './m2m-tenant.decorator';
export * from './m2m-scope.guard';
export * from './m2m-tenant.guard';
