/**
 * Canonical scope constants for M2M (machine-to-machine) integration access.
 *
 * These are the scopes an M2M client can be granted/request for the AuthVital
 * integration API. Deny-by-default: a client can only request scopes present in
 * its `m2mAllowedScopes` list.
 */
export const IntegrationScope = {
  READ: 'integration:read',
  WRITE: 'integration:write',
} as const;

export type IntegrationScopeValue =
  (typeof IntegrationScope)[keyof typeof IntegrationScope];

export const ALL_INTEGRATION_SCOPES = [
  IntegrationScope.READ,
  IntegrationScope.WRITE,
];
