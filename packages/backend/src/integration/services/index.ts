/**
 * Integration Services Barrel Export
 *
 * These services handle M2M (machine-to-machine) integration operations:
 * - IntegrationPermissionsService: Permission checking
 * - IntegrationEntitlementsService: Feature/seat/subscription checking
 * - IntegrationLicensingService: License grant/revoke/change operations
 * - IntegrationTenantsService: Tenant and membership queries
 * - IntegrationRolesService: Role queries and assignment
 * - IntegrationInvitationsService: Invitation management via API
 */

export * from './integration-permissions.service';
export * from './integration-entitlements.service';
export * from './integration-licensing.service';
export * from './integration-tenants.service';
export * from './integration-roles.service';
export * from './integration-invitations.service';
