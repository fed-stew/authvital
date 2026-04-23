import { initClient } from '@ts-rest/core';
import {
  superAdminContract,
  instanceContract,
  licensingContract,
  webhooksContract,
  pubsubContract,
} from '@authvital/contracts';

// =============================================================================
// ts-rest CLIENT CONFIGURATION
// =============================================================================

const clientOptions = {
  baseUrl: '/api',
  baseHeaders: {
    'Content-Type': 'application/json',
  },
  credentials: 'include' as const, // Send cookies (httpOnly session)
};

// Initialize typed clients from contracts
const saClient = initClient(superAdminContract, clientOptions);
const instanceClient = initClient(instanceContract, clientOptions);
const licensingClient = initClient(licensingContract, clientOptions);
const webhooksClient = initClient(webhooksContract, clientOptions);
const pubsubClient = initClient(pubsubContract, clientOptions);

// =============================================================================
// HELPER: Unwrap ts-rest response → just the body (matches old axios pattern)
// =============================================================================

/**
 * Unwrap a ts-rest response — returns body on success, throws on error.
 * Uses `any` to bypass the discriminated union type narrowing that
 * ts-rest clients return (e.g., `{ status: 200; body: X } | { status: 401; body: Y }`).
 * This matches the old axios pattern where error responses throw.
 */
function unwrap(response: any): any {
  if (response.status >= 400) {
    const err: any = new Error(response.body?.message || `API error ${response.status}`);
    err.response = { status: response.status, data: response.body };
    throw err;
  }
  return response.body;
}

// =============================================================================
// SUPER ADMIN API — Drop-in replacement for the old axios superAdminApi
// =============================================================================
// All methods return the response body directly (not { status, body }),
// matching the old `const { data } = await axios.get(...)` pattern so
// existing page components don't need to change.
// =============================================================================

export const superAdminApi = {
  // ===========================================================================
  // AUTH
  // ===========================================================================

  login: async (email: string, password: string) =>
    unwrap(await saClient.login({ body: { email, password } })),

  logout: async () =>
    unwrap(await saClient.logout({ body: {} })),

  changePassword: async (currentPassword: string, newPassword: string) =>
    unwrap(await saClient.changePassword({ body: { currentPassword, newPassword } })),

  forgotPassword: async (email: string) =>
    unwrap(await saClient.forgotPassword({ body: { email } })),

  verifyResetToken: async (token: string) =>
    unwrap(await saClient.verifyResetToken({ body: { token } })),

  resetPassword: async (token: string, newPassword: string) =>
    unwrap(await saClient.resetPassword({ body: { token, newPassword } })),

  getProfile: async () =>
    unwrap(await saClient.getProfile()),

  getSystemStats: async () =>
    unwrap(await saClient.getSystemStats()),

  // ===========================================================================
  // ADMIN ACCOUNTS
  // ===========================================================================

  getAdminAccounts: async () =>
    unwrap(await saClient.getAdmins()),

  createAdminAccount: async (params: {
    email: string;
    password?: string;
    givenName?: string;
    familyName?: string;
    displayName?: string;
  }) =>
    unwrap(await saClient.createAdmin({ body: params })),

  deleteAdminAccount: async (adminId: string) =>
    unwrap(await saClient.deleteAdmin({ params: { id: adminId }, body: {} })),

  // ===========================================================================
  // MFA
  // ===========================================================================

  mfaSetup: async () =>
    unwrap(await saClient.mfaSetup({ body: {} })),

  mfaEnable: async (params: { secret: string; code: string; backupCodes: string[] }) =>
    unwrap(await saClient.mfaEnable({ body: params })),

  mfaDisable: async (code: string) =>
    unwrap(await saClient.mfaDisable({ body: { code } })),

  mfaVerify: async (challengeToken: string, code: string) =>
    unwrap(await saClient.mfaVerify({ body: { challengeToken, code } })),

  getMfaStatus: async () =>
    unwrap(await saClient.mfaStatus()),

  getMfaPolicy: async () =>
    unwrap(await saClient.getMfaPolicy()),

  updateMfaPolicy: async (required: boolean) =>
    unwrap(await saClient.updateMfaPolicy({ body: { required } })),

  // ===========================================================================
  // INSTANCE CONFIGURATION
  // ===========================================================================

  getInstanceMeta: async () =>
    unwrap(await instanceClient.getInstanceMeta()),

  updateInstanceMeta: async (updates: Record<string, any>) =>
    unwrap(await instanceClient.updateInstanceMeta({ body: updates })),

  getInstanceUuid: async () =>
    unwrap(await instanceClient.getInstanceUuid()),

  getInstanceApiKeys: async () =>
    unwrap(await instanceClient.listApiKeys()),

  createInstanceApiKey: async (keyData: { name: string; description?: string }) =>
    unwrap(await instanceClient.createApiKey({ body: keyData })),

  revokeInstanceApiKey: async (keyId: string) =>
    unwrap(await instanceClient.revokeApiKey({ params: { id: keyId }, body: {} })),

  // ===========================================================================
  // USERS
  // ===========================================================================

  getAllUsers: async (opts?: { search?: string; limit?: number; offset?: number }) =>
    unwrap(await saClient.getUsers({ query: opts ?? {} })),

  createUser: async (userData: {
    givenName?: string;
    familyName?: string;
    email?: string;
    phone?: string;
    password?: string;
  }) =>
    unwrap(await saClient.createUser({ body: userData })),

  updateUser: async (userId: string, data: {
    givenName?: string;
    familyName?: string;
    email?: string;
    phone?: string;
  }) =>
    unwrap(await saClient.updateUser({ params: { id: userId }, body: data })),

  deleteUser: async (userId: string) =>
    unwrap(await saClient.deleteUser({ params: { id: userId }, body: {} })),

  getUserDetail: async (userId: string) =>
    unwrap(await saClient.getUser({ params: { id: userId } })),

  sendPasswordReset: async (userId: string) =>
    unwrap(await saClient.sendUserPasswordReset({ params: { id: userId }, body: {} })),

  // ===========================================================================
  // TENANTS
  // ===========================================================================

  getAllTenants: async (opts?: { search?: string; limit?: number; offset?: number }) =>
    unwrap(await saClient.getTenants({ query: opts ?? {} })),

  createTenant: async (name: string, slug: string, ownerEmail?: string) =>
    unwrap(await saClient.createTenant({ body: { name, slug, ownerEmail } })),

  getTenantDetail: async (tenantId: string) =>
    unwrap(await saClient.getTenant({ params: { id: tenantId } })),

  updateTenant: async (tenantId: string, updates: { name?: string; slug?: string }) =>
    unwrap(await saClient.updateTenant({ params: { id: tenantId }, body: updates })),

  deleteTenant: async (tenantId: string) =>
    unwrap(await saClient.deleteTenant({ params: { id: tenantId }, body: {} })),

  removeTenantMember: async (tenantId: string, membershipId: string) =>
    unwrap(await saClient.removeTenantMember({ params: { tenantId, membershipId }, body: {} })),

  updateMemberRoles: async (membershipId: string, roleIds: string[]) =>
    unwrap(await saClient.updateMemberRoles({ params: { membershipId }, body: { roleIds } })),

  updateMembershipStatus: async (membershipId: string, status: 'ACTIVE' | 'SUSPENDED' | 'INVITED') =>
    unwrap(await saClient.updateMembershipStatus({ params: { membershipId }, body: { status } })),

  getAvailableUsersForTenant: async (tenantId: string) =>
    unwrap(await saClient.getAvailableUsersForTenant({ params: { tenantId } })),

  inviteUserToTenant: async (params: {
    email: string;
    tenantId: string;
    role?: string;
    applicationId?: string;
    licenseTypeId?: string;
    autoAssign?: boolean;
  }) =>
    unwrap(await saClient.inviteUserToTenant({
      params: { tenantId: params.tenantId },
      body: params,
    })),

  // ===========================================================================
  // TENANT MFA
  // ===========================================================================

  getTenantMfaPolicy: async (tenantId: string) =>
    unwrap(await saClient.getTenantMfaPolicy({ params: { tenantId } })),

  updateTenantMfaPolicy: async (tenantId: string, policy: 'DISABLED' | 'OPTIONAL' | 'ENCOURAGED' | 'REQUIRED', gracePeriodDays?: number) =>
    unwrap(await saClient.updateTenantMfaPolicy({
      params: { tenantId },
      body: { policy, gracePeriodDays },
    })),

  getTenantMfaStats: async (tenantId: string) =>
    unwrap(await saClient.getTenantMfaStats({ params: { tenantId } })),

  // ===========================================================================
  // SERVICE ACCOUNTS
  // ===========================================================================

  listServiceAccounts: async (tenantId: string) =>
    unwrap(await saClient.listServiceAccounts({ params: { tenantId } })),

  createServiceAccount: async (
    tenantId: string,
    name: string,
    roleIds?: string[],
    description?: string,
  ) =>
    unwrap(await saClient.createServiceAccount({
      params: { tenantId },
      body: { name, roleIds, description },
    })),

  updateServiceAccountRoles: async (tenantId: string, serviceAccountId: string, roleIds: string[]) =>
    unwrap(await saClient.updateServiceAccountRoles({
      params: { tenantId, serviceAccountId },
      body: { roleIds },
    })),

  revokeServiceAccount: async (tenantId: string, serviceAccountId: string) =>
    unwrap(await saClient.revokeServiceAccount({
      params: { tenantId, serviceAccountId },
      body: {},
    })),

  // ===========================================================================
  // APPLICATIONS
  // ===========================================================================

  getAllApplications: async () =>
    unwrap(await saClient.getApplications()),

  createApplication: async (appData: { name: string; [key: string]: any }) =>
    unwrap(await saClient.createApplication({ body: appData })),

  updateApplication: async (appId: string, updates: Record<string, any>) =>
    unwrap(await saClient.updateApplication({ params: { id: appId }, body: updates })),

  deleteApplication: async (appId: string) =>
    unwrap(await saClient.deleteApplication({ params: { id: appId }, body: {} })),

  disableApplication: async (appId: string) =>
    unwrap(await saClient.disableApplication({ params: { id: appId }, body: {} })),

  enableApplication: async (appId: string) =>
    unwrap(await saClient.enableApplication({ params: { id: appId }, body: {} })),

  regenerateClientSecret: async (appId: string) =>
    unwrap(await saClient.regenerateClientSecret({ params: { id: appId }, body: {} })),

  revokeClientSecret: async (appId: string) =>
    unwrap(await saClient.revokeClientSecret({ params: { id: appId }, body: {} })),

  // ===========================================================================
  // ROLES
  // ===========================================================================

  createRole: async (appId: string, name: string, slug: string, description?: string) =>
    unwrap(await saClient.createRole({ params: { appId }, body: { name, slug, description } })),

  updateRole: async (roleId: string, updates: { name?: string; slug?: string; description?: string }) =>
    unwrap(await saClient.updateRole({ params: { id: roleId }, body: updates })),

  deleteRole: async (roleId: string) =>
    unwrap(await saClient.deleteRole({ params: { id: roleId }, body: {} })),

  setDefaultRole: async (roleId: string) =>
    unwrap(await saClient.setDefaultRole({ params: { id: roleId }, body: {} })),

  // ===========================================================================
  // TENANT ROLES
  // ===========================================================================

  getTenantRoles: async () =>
    unwrap(await saClient.getTenantRoles()),

  getMembershipTenantRoles: async (membershipId: string) =>
    unwrap(await saClient.getMembershipTenantRoles({ params: { membershipId } })),

  assignTenantRole: async (membershipId: string, tenantRoleSlug: string) =>
    unwrap(await saClient.assignTenantRole({ params: { membershipId }, body: { tenantRoleSlug } })),

  removeTenantRole: async (membershipId: string, roleSlug: string) =>
    unwrap(await saClient.removeTenantRole({ params: { membershipId, roleSlug }, body: {} })),

  // ===========================================================================
  // DOMAINS
  // ===========================================================================

  registerDomain: async (tenantId: string, domainName: string) =>
    unwrap(await saClient.registerDomain({ body: { tenantId, domainName } })),

  getTenantDomains: async (tenantId: string) =>
    unwrap(await saClient.getTenantDomains({ params: { tenantId } })),

  verifyDomain: async (domainId: string) =>
    unwrap(await saClient.verifyDomain({ params: { domainId }, body: {} })),

  deleteDomain: async (domainId: string) =>
    unwrap(await saClient.deleteDomain({ params: { domainId }, body: {} })),

  // ===========================================================================
  // SSO
  // ===========================================================================

  getSsoProviders: async () =>
    unwrap(await saClient.getSsoProviders()),

  getSsoProvider: async (provider: string) =>
    unwrap(await saClient.getSsoProvider({ params: { provider } })),

  upsertSsoProvider: async (config: {
    provider: string;
    clientId: string;
    clientSecret: string;
    enabled?: boolean;
    scopes?: string[];
    allowedDomains?: string[];
    autoCreateUser?: boolean;
    autoLinkExisting?: boolean;
  }) =>
    unwrap(await saClient.createSsoProvider({ body: config })),

  updateSsoProvider: async (provider: string, config: Record<string, any>) =>
    unwrap(await saClient.updateSsoProvider({ params: { provider }, body: config })),

  deleteSsoProvider: async (provider: string) =>
    unwrap(await saClient.deleteSsoProvider({ params: { provider }, body: {} })),

  testSsoProvider: async (provider: string) =>
    unwrap(await saClient.testSsoProvider({ params: { provider }, body: {} })),

  // ===========================================================================
  // LICENSE TYPES
  // ===========================================================================

  getApplicationLicenseTypes: async (applicationId: string, includeArchived = false) =>
    unwrap(await licensingClient.getApplicationLicenseTypes({
      params: { applicationId },
      query: { includeArchived },
    })),

  getAllLicenseTypes: async (includeArchived = false) =>
    unwrap(await licensingClient.getAllLicenseTypes({ query: { includeArchived } })),

  createLicenseType: async (licenseType: { name: string; slug: string; applicationId: string; [key: string]: any }) =>
    unwrap(await licensingClient.createLicenseType({ body: licenseType })),

  getLicenseType: async (licenseTypeId: string) =>
    unwrap(await licensingClient.getLicenseType({ params: { id: licenseTypeId } })),

  updateLicenseType: async (licenseTypeId: string, updates: Record<string, any>) =>
    unwrap(await licensingClient.updateLicenseType({ params: { id: licenseTypeId }, body: updates })),

  archiveLicenseType: async (licenseTypeId: string) =>
    unwrap(await licensingClient.archiveLicenseType({ params: { id: licenseTypeId }, body: {} })),

  deleteLicenseType: async (licenseTypeId: string) =>
    unwrap(await licensingClient.deleteLicenseType({ params: { id: licenseTypeId }, body: {} })),

  checkMemberAccess: async (tenantId: string, applicationId: string) =>
    unwrap(await licensingClient.checkMemberAccess({ params: { tenantId, applicationId } })),

  getApplicationSubscriptionStats: async (applicationId: string) =>
    unwrap(await licensingClient.getApplicationSubscriptionStats({ params: { applicationId } })),

  // ===========================================================================
  // SUBSCRIPTIONS
  // ===========================================================================

  provisionSubscription: async (subscription: {
    tenantId: string;
    applicationId: string;
    licenseTypeId: string;
    quantityPurchased: number;
    currentPeriodEnd: string;
  }) =>
    unwrap(await licensingClient.provisionSubscription({ body: subscription })),

  getSubscription: async (subscriptionId: string) =>
    unwrap(await licensingClient.getSubscription({ params: { id: subscriptionId } })),

  updateSubscriptionQuantity: async (subscriptionId: string, quantityPurchased: number) =>
    unwrap(await licensingClient.updateSubscriptionQuantity({
      params: { id: subscriptionId },
      body: { quantityPurchased },
    })),

  cancelSubscription: async (subscriptionId: string) =>
    unwrap(await licensingClient.cancelSubscription({ params: { id: subscriptionId }, body: {} })),

  expireSubscription: async (subscriptionId: string) =>
    unwrap(await licensingClient.expireSubscription({ params: { id: subscriptionId }, body: {} })),

  getTenantSubscriptions: async (tenantId: string) =>
    unwrap(await licensingClient.getTenantSubscriptions({ params: { tenantId } })),

  getTenantLicenseOverview: async (tenantId: string) =>
    unwrap(await licensingClient.getTenantLicenseOverview({ params: { tenantId } })),

  // ===========================================================================
  // LICENSE ASSIGNMENTS
  // ===========================================================================

  grantLicense: async (assignment: {
    tenantId: string;
    userId: string;
    applicationId: string;
    licenseTypeId: string;
  }) =>
    unwrap(await licensingClient.grantLicense({ body: assignment })),

  revokeLicense: async (assignment: {
    tenantId: string;
    userId: string;
    applicationId: string;
  }) =>
    unwrap(await licensingClient.revokeLicense({ body: assignment })),

  changeLicenseType: async (change: {
    tenantId: string;
    userId: string;
    applicationId: string;
    newLicenseTypeId: string;
  }) =>
    unwrap(await licensingClient.changeLicenseType({ body: change })),

  getUserLicenses: async (tenantId: string, userId: string) =>
    unwrap(await licensingClient.getUserLicenses({ params: { tenantId, userId } })),

  getAppLicenseHolders: async (tenantId: string, applicationId: string) =>
    unwrap(await licensingClient.getAppLicenseHolders({ params: { tenantId, applicationId } })),

  getSubscriptionAssignments: async (subscriptionId: string) =>
    unwrap(await licensingClient.getSubscriptionAssignments({ params: { id: subscriptionId } })),

  revokeAllUserLicenses: async (tenantId: string, userId: string) =>
    unwrap(await licensingClient.revokeAllUserLicenses({ params: { tenantId, userId }, body: {} })),

  getTenantMembersWithLicenses: async (tenantId: string) =>
    unwrap(await licensingClient.getTenantMembersWithLicenses({ params: { tenantId } })),

  getAvailableLicenseTypesForTenant: async (tenantId: string) =>
    unwrap(await licensingClient.getAvailableLicenseTypesForTenant({ params: { tenantId } })),

  grantLicensesBulk: async (assignments: Array<{
    tenantId: string;
    userId: string;
    applicationId: string;
    licenseTypeId: string;
  }>) =>
    unwrap(await licensingClient.grantLicensesBulk({ body: { assignments } })),

  revokeLicensesBulk: async (revocations: Array<{
    tenantId: string;
    userId: string;
    applicationId: string;
  }>) =>
    unwrap(await licensingClient.revokeLicensesBulk({ body: { revocations } })),

  // ===========================================================================
  // WEBHOOKS (ts-rest contract)
  // ===========================================================================

  getWebhookEvents: async () => {
    const data = unwrap(await webhooksClient.getAvailableEvents());
    return data.events;
  },

  getWebhookEventTypes: async () => {
    const data = unwrap(await webhooksClient.getEventTypes());
    return data.categories;
  },

  getWebhooks: async () =>
    unwrap(await webhooksClient.getWebhooks()),

  getWebhook: async (id: string) =>
    unwrap(await webhooksClient.getWebhook({ params: { id } })),

  getWebhookDeliveries: async (id: string) =>
    unwrap(await webhooksClient.getDeliveries({ params: { id } })),

  createWebhook: async (params: { name: string; url: string; events: string[]; description?: string }) =>
    unwrap(await webhooksClient.createWebhook({ body: params })),

  updateWebhook: async (id: string, params: { name?: string; url?: string; events?: string[]; isActive?: boolean; description?: string }) =>
    unwrap(await webhooksClient.updateWebhook({ params: { id }, body: params })),

  deleteWebhook: async (id: string) =>
    unwrap(await webhooksClient.deleteWebhook({ params: { id }, body: {} })),

  testWebhook: async (id: string) =>
    unwrap(await webhooksClient.testWebhook({ params: { id }, body: {} })),

  // ===========================================================================
  // PUB/SUB (ts-rest contract)
  // ===========================================================================

  getPubSubConfig: async () =>
    unwrap(await pubsubClient.getConfig()),

  updatePubSubConfig: async (params: { enabled?: boolean; topic?: string; orderingEnabled?: boolean; events?: string[] }) =>
    unwrap(await pubsubClient.updateConfig({ body: params })),

  getPubSubEventTypes: async () => {
    const data = unwrap(await pubsubClient.getEventTypes());
    return data.categories;
  },

  getPubSubOutboxStats: async () =>
    unwrap(await pubsubClient.getOutboxStats()),

  getPubSubOutboxEvents: async (params?: { status?: string; limit?: number }) =>
    unwrap(await pubsubClient.getOutboxEvents({ query: params || {} })),

  retryPubSubEvent: async (id: string) =>
    unwrap(await pubsubClient.retryEvent({ params: { id }, body: {} })),

  retryAllPubSubEvents: async () =>
    unwrap(await pubsubClient.retryAllFailed({ body: {} })),

  // ===========================================================================
  // SYNC (event types for app webhook settings)
  // ===========================================================================

  getSyncEventTypes: async () =>
    unwrap(await webhooksClient.getEventTypes()),
};

// =============================================================================
// DOMAIN API — Also migrated (was on superAdminClient)
// =============================================================================

export const domainApi = {
  registerDomain: superAdminApi.registerDomain,
  getTenantDomains: superAdminApi.getTenantDomains,
  verifyDomain: superAdminApi.verifyDomain,
  deleteDomain: superAdminApi.deleteDomain,
  // getDomain not in contract — can add later if needed
  getDomain: async (_domainId: string) => {
    throw new Error('getDomain not yet implemented in ts-rest contract');
  },
};

// =============================================================================
// ACCESS CONTROL — Tenant role methods that were on accessControlApi
// =============================================================================

export const accessControlTenantRoles = {
  getTenantRoles: superAdminApi.getTenantRoles,
  getMembershipTenantRoles: superAdminApi.getMembershipTenantRoles,
  assignTenantRole: superAdminApi.assignTenantRole,
  removeTenantRole: superAdminApi.removeTenantRole,
};
