import axios from 'axios';

// =============================================================================
// USER API CLIENT (auth via httpOnly cookies)
// =============================================================================
export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies with requests
});

// Response interceptor for user API error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect if not already on auth pages or public pages
      const publicPaths = ['/auth/', '/super-admin', '/invite'];
      const isPublicPage = publicPaths.some(path => window.location.pathname.startsWith(path));
      
      if (!isPublicPage) {
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  }
);

// =============================================================================
// SUPER ADMIN API CLIENT (auth via httpOnly cookies)
// =============================================================================
const superAdminClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies with requests
});

// Response interceptor for super admin API error handling
superAdminClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't auto-redirect on 401 - let the component handle it
    return Promise.reject(error);
  }
);

// =============================================================================
// Auth API
// =============================================================================

export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  },

  register: async (email: string, password: string) => {
    const { data } = await api.post('/auth/register', { email, password });
    return data;
  },

  signup: async (params: {
    email: string;
    password: string;
    givenName?: string;
    familyName?: string;
    phone?: string;
  }) => {
    const { data } = await api.post('/auth/signup', params);
    return data;
  },

  signupAnonymous: async (deviceId?: string) => {
    const { data } = await api.post('/auth/signup/anonymous', { deviceId });
    return data;
  },

  upgradeAccount: async (params: {
    email: string;
    password: string;
    givenName?: string;
    familyName?: string;
    phone?: string;
  }) => {
    const { data } = await api.post('/auth/upgrade-account', params);
    return data;
  },

  forgotPassword: async (email: string) => {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  },

  resetPassword: async (token: string, newPassword: string) => {
    const { data } = await api.post('/auth/reset-password', { token, newPassword });
    return data;
  },

  verifyResetToken: async (token: string) => {
    const { data } = await api.post('/auth/verify-reset-token', { token });
    return data;
  },

  getProfile: async () => {
    const { data } = await api.get('/auth/profile');
    return data;
  },
};

// =============================================================================
// Signup API (Email Verification Flow)
// =============================================================================

export const signupApi = {
  /**
   * Initiate signup - sends verification code to email
   * selectedLicenseTypeId is optional - will auto-provision default if configured
   */
  initiateSignup: async (params: {
    email: string;
    tenantName?: string;
    givenName?: string;
    familyName?: string;
    callbackUrl?: string;
    redirectUri?: string;
    clientId?: string; // Track which app initiated signup (optional - will grant access to FREE apps)
    selectedLicenseTypeId?: string; // User's selected license type (OPTIONAL)
  }) => {
    const { data } = await api.post('/signup/initiate', params);
    return data;
  },

  /**
   * Verify email via token (from email link)
   */
  verifyToken: async (token: string) => {
    const { data } = await api.post('/signup/verify', { token });
    return data;
  },

  /**
   * Complete signup after verification
   */
  completeSignup: async (params: {
    email: string;
    password: string;
    token?: string;
    givenName?: string;
    familyName?: string;
    tenantName?: string;
    slug?: string;
  }) => {
    const { data } = await api.post('/signup/complete', params);
    return data;
  },

  /**
   * Get available license types for signup (public endpoint)
   */
  getLicenseTypesForSignup: async (applicationId: string) => {
    const { data } = await api.get(`/signup/license-types/${applicationId}`);
    return data;
  },

  /**
   * Look up application by clientId (public endpoint)
   * ClientId is the OAuth client ID - static and never changes
   */
  getApplicationByClientId: async (clientId: string) => {
    const { data } = await api.get(`/signup/application/${clientId}`);
    return data;
  },

  /**
   * Get pending signup info by verification token (public endpoint)
   * Returns email, application info, selected license type, etc.
   */
  getPendingSignupByToken: async (token: string) => {
    const { data } = await api.get(`/signup/pending/${token}`);
    return data;
  },

  /**
   * Resend verification email
   */
  resendVerification: async (email: string, callbackUrl?: string) => {
    const { data } = await api.post('/signup/resend', { email, callbackUrl });
    return data;
  },
};

// =============================================================================
// API Keys API
// =============================================================================

export const apiKeysApi = {
  list: async () => {
    const { data } = await api.get('/api-keys');
    return data;
  },

  create: async (name: string, permissions?: string[], expiresInDays?: number) => {
    const { data } = await api.post('/api-keys', { name, permissions, expiresInDays });
    return data;
  },

  update: async (keyId: string, updates: { name?: string; permissions?: string[]; isActive?: boolean }) => {
    const { data } = await api.put(`/api-keys/${keyId}`, updates);
    return data;
  },

  revoke: async (keyId: string) => {
    const { data } = await api.delete(`/api-keys/${keyId}`);
    return data;
  },
};

// =============================================================================
// Tenancy API
// =============================================================================

export const tenancyApi = {
  createTenant: async (name: string, slug: string) => {
    const { data } = await api.post('/tenancy/tenants', { name, slug });
    return data;
  },

  getTenant: async (tenantId: string) => {
    const { data } = await api.get(`/tenancy/tenants/${tenantId}`);
    return data;
  },

  getMyTenants: async () => {
    const { data } = await api.get('/tenancy/my-tenants');
    return data;
  },

  inviteUser: async (tenantId: string, userId: string) => {
    const { data } = await api.post(`/tenancy/tenants/${tenantId}/invite`, { userId });
    return data;
  },

  acceptInvitation: async (membershipId: string) => {
    const { data } = await api.post(`/tenancy/memberships/${membershipId}/accept`);
    return data;
  },

  removeMember: async (tenantId: string, membershipId: string) => {
    const { data } = await api.delete(`/tenancy/tenants/${tenantId}/members/${membershipId}`);
    return data;
  },
};

// =============================================================================
// Billing API
// =============================================================================

export const billingApi = {
  getSubscriptions: async () => {
    const { data } = await api.get('/billing/subscriptions');
    return data;
  },

  getTenantSubscription: async (tenantId: string) => {
    const { data } = await api.get(`/billing/tenants/${tenantId}/subscription`);
    return data;
  },

  assignSubscription: async (tenantId: string, subscriptionId: string) => {
    const { data } = await api.post('/billing/assign', { tenantId, subscriptionId });
    return data;
  },

  cancelSubscription: async (tenantSubscriptionId: string) => {
    const { data } = await api.put(`/billing/tenant-subscriptions/${tenantSubscriptionId}/cancel`);
    return data;
  },

  toggleAutoRenew: async (tenantSubscriptionId: string) => {
    const { data } = await api.put(`/billing/tenant-subscriptions/${tenantSubscriptionId}/toggle-renew`);
    return data;
  },

  changeSubscription: async (tenantId: string, subscriptionId: string) => {
    const { data } = await api.put(`/billing/tenants/${tenantId}/change-subscription`, { subscriptionId });
    return data;
  },
};

// =============================================================================
// Access Control API
// =============================================================================

export const accessControlApi = {
  getAllRoles: async () => {
    const { data } = await api.get('/access-control/roles');
    return data;
  },

  getUserPermissions: async (tenantId: string) => {
    const { data } = await api.get('/access-control/permissions', { params: { tenantId } });
    return data;
  },

  getUserRoles: async (tenantId: string) => {
    const { data } = await api.get('/access-control/user-roles', { params: { tenantId } });
    return data;
  },

  verifyPermission: async (tenantId: string, permission: string) => {
    const { data } = await api.get('/access-control/verify', {
      params: { tenantId, permission },
    });
    return data;
  },

  assignRole: async (membershipId: string, roleId: string) => {
    const { data } = await api.post(`/access-control/memberships/${membershipId}/roles/${roleId}`);
    return data;
  },

  removeRole: async (membershipId: string, roleId: string) => {
    const { data } = await api.delete(`/access-control/memberships/${membershipId}/roles/${roleId}`);
    return data;
  },

  // Tenant Role Management (uses super-admin endpoints for admin panel)

  // Get all available tenant roles
  getTenantRoles: async () => {
    const { data } = await superAdminClient.get('/super-admin/tenant-roles');
    return data;
  },

  // Get membership's tenant roles
  getMembershipTenantRoles: async (membershipId: string) => {
    const { data } = await superAdminClient.get(`/super-admin/memberships/${membershipId}/tenant-roles`);
    return data;
  },

  // Assign tenant role to membership
  assignTenantRole: async (membershipId: string, tenantRoleSlug: string) => {
    const { data } = await superAdminClient.post(`/super-admin/memberships/${membershipId}/tenant-roles`, { tenantRoleSlug });
    return data;
  },

  // Remove tenant role from membership
  removeTenantRole: async (membershipId: string, roleSlug: string) => {
    const { data } = await superAdminClient.delete(`/super-admin/memberships/${membershipId}/tenant-roles/${roleSlug}`);
    return data;
  },

  // Get membership's resolved tenant permissions
  getMembershipTenantPermissions: async (membershipId: string) => {
    const { data } = await superAdminClient.get(`/access-control/memberships/${membershipId}/tenant-permissions`);
    return data;
  },
};

// =============================================================================
// Domain Verification API (uses superAdminClient for admin panel)
// =============================================================================

export const domainApi = {
  registerDomain: async (tenantId: string, domainName: string) => {
    const { data } = await superAdminClient.post('/super-admin/domains/register', { tenantId, domainName });
    return data;
  },

  getTenantDomains: async (tenantId: string) => {
    const { data } = await superAdminClient.get(`/super-admin/domains/tenant/${tenantId}`);
    return data;
  },

  getDomain: async (domainId: string) => {
    const { data } = await superAdminClient.get(`/super-admin/domains/${domainId}`);
    return data;
  },

  verifyDomain: async (domainId: string) => {
    const { data } = await superAdminClient.post(`/super-admin/domains/${domainId}/verify`);
    return data;
  },

  deleteDomain: async (domainId: string) => {
    const { data } = await superAdminClient.delete(`/super-admin/domains/${domainId}`);
    return data;
  },
};

// =============================================================================
// Super Admin API
// =============================================================================

export const superAdminApi = {
  login: async (email: string, password: string) => {
    const { data } = await superAdminClient.post('/super-admin/login', { email, password });
    return data;
  },

  logout: async () => {
    const { data } = await superAdminClient.post('/super-admin/logout');
    return data;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const { data } = await superAdminClient.post('/super-admin/change-password', {
      currentPassword,
      newPassword,
    });
    return data;
  },

  getProfile: async () => {
    const { data } = await superAdminClient.get('/super-admin/profile');
    return data;
  },

  getSystemStats: async () => {
    const { data } = await superAdminClient.get('/super-admin/stats');
    return data;
  },

  // Admin Account Management
  getAdminAccounts: async () => {
    const { data } = await superAdminClient.get('/super-admin/admins');
    return data;
  },

  createAdminAccount: async (params: { 
    email: string; 
    password?: string; 
    givenName?: string;
    familyName?: string;
    displayName?: string;
  }) => {
    const { data } = await superAdminClient.post('/super-admin/create-admin', params);
    return data;
  },

  deleteAdminAccount: async (adminId: string) => {
    const { data } = await superAdminClient.delete(`/super-admin/admins/${adminId}`);
    return data;
  },

  // Instance Configuration
  getInstanceMeta: async () => {
    const { data } = await superAdminClient.get('/instance');
    return data;
  },

  updateInstanceMeta: async (updates: {
    name?: string;
    allowSignUp?: boolean;
    autoCreateTenant?: boolean;
    allowGenericDomains?: boolean;
    allowAnonymousSignUp?: boolean;
    requiredUserFields?: string[];
    defaultTenantRoleIds?: string[];
    initiateLoginUri?: string | null;
    brandingName?: string | null;
    brandingLogoUrl?: string | null;
    brandingIconUrl?: string | null;
    brandingPrimaryColor?: string | null;
    brandingBackgroundColor?: string | null;
    brandingAccentColor?: string | null;
    brandingSupportUrl?: string | null;
    brandingPrivacyUrl?: string | null;
    brandingTermsUrl?: string | null;
  }) => {
    const { data } = await superAdminClient.patch('/instance', updates);
    return data;
  },

  getInstanceUuid: async () => {
    const { data } = await superAdminClient.get('/instance/uuid');
    return data;
  },

  // Instance API Keys (Fleet Manager)
  getInstanceApiKeys: async () => {
    const { data } = await superAdminClient.get('/instance/api-keys');
    return data;
  },

  createInstanceApiKey: async (keyData: { name: string; description?: string }) => {
    const { data } = await superAdminClient.post('/instance/api-keys', keyData);
    return data;
  },

  revokeInstanceApiKey: async (keyId: string) => {
    const { data } = await superAdminClient.delete(`/instance/api-keys/${keyId}`);
    return data;
  },

  // Super Admin Management
  createSuperAdmin: async (email: string, password: string, name?: string) => {
    const { data } = await superAdminClient.post('/super-admin/create-admin', { email, password, name });
    return data;
  },

  // User Management
  getAllUsers: async (opts?: { search?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.search) params.set('search', opts.search);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    const { data } = await superAdminClient.get(`/super-admin/users${query}`);
    return data;
  },

  createUser: async (
    userData: { givenName?: string; familyName?: string; email?: string; phone?: string; password?: string }
  ) => {
    const { data: result } = await superAdminClient.post('/super-admin/users', userData);
    return result;
  },

  updateUser: async (
    userId: string,
    data: { givenName?: string; familyName?: string; email?: string; phone?: string }
  ) => {
    const { data: result } = await superAdminClient.put(`/super-admin/users/${userId}`, data);
    return result;
  },

  deleteUser: async (userId: string) => {
    const { data } = await superAdminClient.delete(`/super-admin/users/${userId}`);
    return data;
  },

  getUserDetail: async (userId: string) => {
    const { data } = await superAdminClient.get(`/super-admin/users/${userId}`);
    return data;
  },

  sendPasswordReset: async (userId: string) => {
    const { data } = await superAdminClient.post(`/super-admin/users/${userId}/send-password-reset`);
    return data;
  },

  // Tenant Management
  getAllTenants: async (opts?: { search?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.search) params.set('search', opts.search);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    const { data } = await superAdminClient.get(`/super-admin/tenants${query}`);
    return data;
  },

  createTenant: async (name: string, slug: string, ownerEmail?: string) => {
    const { data } = await superAdminClient.post('/super-admin/tenants', {
      name,
      slug,
      ownerEmail,
    });
    return data;
  },

  getTenantDetail: async (tenantId: string) => {
    const { data } = await superAdminClient.get(`/super-admin/tenants/${tenantId}`);
    return data;
  },

  updateTenant: async (tenantId: string, updates: { name?: string; slug?: string }) => {
    const { data } = await superAdminClient.put(`/super-admin/tenants/${tenantId}`, updates);
    return data;
  },

  deleteTenant: async (tenantId: string) => {
    const { data } = await superAdminClient.delete(`/super-admin/tenants/${tenantId}`);
    return data;
  },

  removeTenantMember: async (tenantId: string, membershipId: string) => {
    const { data } = await superAdminClient.delete(`/super-admin/tenants/${tenantId}/members/${membershipId}`);
    return data;
  },

  updateMemberRoles: async (membershipId: string, roleIds: string[]) => {
    const { data } = await superAdminClient.put(`/super-admin/memberships/${membershipId}/roles`, { roleIds });
    return data;
  },

  updateMembershipStatus: async (membershipId: string, status: 'ACTIVE' | 'SUSPENDED' | 'INVITED') => {
    const { data } = await superAdminClient.put(`/super-admin/memberships/${membershipId}/status`, { status });
    return data;
  },

  getAvailableUsersForTenant: async (tenantId: string) => {
    const { data } = await superAdminClient.get(`/super-admin/tenants/${tenantId}/available-users`);
    return data;
  },

  inviteUserToTenant: async (params: {
    email: string;
    tenantId: string;
    role?: string;
    applicationId?: string;
    licenseTypeId?: string;
    autoAssign?: boolean;
  }) => {
    const { data } = await superAdminClient.post(`/super-admin/tenants/${params.tenantId}/invite`, params);
    return data;
  },

  // Service Accounts
  listServiceAccounts: async (tenantId: string) => {
    const { data } = await superAdminClient.get(`/super-admin/tenants/${tenantId}/service-accounts`);
    return data;
  },

  createServiceAccount: async (
    tenantId: string,
    name: string,
    roleIds?: string[],
    description?: string
  ) => {
    const { data } = await superAdminClient.post(`/super-admin/tenants/${tenantId}/service-accounts`, {
      name,
      roleIds,
      description,
    });
    return data;
  },

  updateServiceAccountRoles: async (tenantId: string, serviceAccountId: string, roleIds: string[]) => {
    const { data } = await superAdminClient.put(
      `/super-admin/tenants/${tenantId}/service-accounts/${serviceAccountId}/roles`,
      { roleIds }
    );
    return data;
  },

  revokeServiceAccount: async (tenantId: string, serviceAccountId: string) => {
    const { data } = await superAdminClient.delete(
      `/super-admin/tenants/${tenantId}/service-accounts/${serviceAccountId}`
    );
    return data;
  },

  // Application Management
  getAllApplications: async () => {
    const { data } = await superAdminClient.get('/super-admin/applications');
    return data;
  },

  createApplication: async (
    appData: {
      name: string;
      description?: string;
      redirectUris?: string[];
      postLogoutRedirectUri?: string;
      initiateLoginUri?: string;
      // Branding
      brandingName?: string;
      brandingLogoUrl?: string;
      brandingIconUrl?: string;
      brandingPrimaryColor?: string;
      brandingBackgroundColor?: string;
      brandingAccentColor?: string;
      brandingSupportUrl?: string;
      brandingPrivacyUrl?: string;
      brandingTermsUrl?: string;
      // Licensing configuration
      licensingMode?: string;
      defaultLicenseTypeId?: string;
      defaultSeatCount?: number;
      autoProvisionOnSignup?: boolean;
      autoGrantToOwner?: boolean;
    }
  ) => {
    const { data } = await superAdminClient.post('/super-admin/applications', appData);
    return data;
  },

  updateApplication: async (
    appId: string,
    updates: {
      name?: string;
      description?: string;
      redirectUris?: string[];
      postLogoutRedirectUri?: string;
      initiateLoginUri?: string;
      accessTokenTtl?: number;
      refreshTokenTtl?: number;
      isActive?: boolean;
      // Branding
      brandingName?: string;
      brandingLogoUrl?: string;
      brandingIconUrl?: string;
      brandingPrimaryColor?: string;
      brandingBackgroundColor?: string;
      brandingAccentColor?: string;
      brandingSupportUrl?: string;
      brandingPrivacyUrl?: string;
      brandingTermsUrl?: string;
      // Licensing configuration
      licensingMode?: string;
      accessMode?: string;
      defaultLicenseTypeId?: string;
      defaultSeatCount?: number;
      autoProvisionOnSignup?: boolean;
      autoGrantToOwner?: boolean;
      // Webhooks
      webhookUrl?: string | null;
      webhookEnabled?: boolean;
      webhookEvents?: string[];
    }
  ) => {
    const { data } = await superAdminClient.put(`/super-admin/applications/${appId}`, updates);
    return data;
  },

  deleteApplication: async (appId: string) => {
    const { data } = await superAdminClient.delete(`/super-admin/applications/${appId}`);
    return data;
  },

  regenerateClientSecret: async (appId: string) => {
    const { data } = await superAdminClient.post(`/super-admin/applications/${appId}/regenerate-secret`);
    return data;
  },

  // ==========================================================================
  // LICENSE TYPES - License Types (Catalog Management)
  // ==========================================================================

  // Get all license types for an application
  getApplicationLicenseTypes: async (applicationId: string, includeArchived = false) => {
    const params = includeArchived ? '?includeArchived=true' : '';
    const { data } = await superAdminClient.get(`/licensing/applications/${applicationId}/license-types${params}`);
    return data;
  },

  // Check if a new member can be added to an application
  checkMemberAccess: async (tenantId: string, applicationId: string) => {
    const { data } = await superAdminClient.get(`/licensing/tenants/${tenantId}/applications/${applicationId}/check-member-access`);
    return data;
  },

  // Get subscription statistics for an application
  getApplicationSubscriptionStats: async (applicationId: string) => {
    const { data } = await superAdminClient.get(`/licensing/applications/${applicationId}/subscription-stats`);
    return data;
  },

  // Get all license types in the instance
  getAllLicenseTypes: async (includeArchived = false) => {
    const params = includeArchived ? '?includeArchived=true' : '';
    const { data } = await superAdminClient.get(`/licensing/license-types${params}`);
    return data;
  },

  // Create a new license type
  createLicenseType: async (licenseType: {
    name: string;
    slug: string;
    description?: string;
    applicationId: string;
    displayOrder?: number;
    status?: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';
    features?: Record<string, boolean>;
  }) => {
    const { data } = await superAdminClient.post('/licensing/license-types', licenseType);
    return data;
  },

  // Get a single license type
  getLicenseType: async (licenseTypeId: string) => {
    const { data } = await superAdminClient.get(`/licensing/license-types/${licenseTypeId}`);
    return data;
  },

  // Update a license type
  updateLicenseType: async (licenseTypeId: string, updates: {
    name?: string;
    slug?: string;
    description?: string;
    displayOrder?: number;
    status?: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';
    features?: Record<string, boolean>;
  }) => {
    const { data } = await superAdminClient.put(`/licensing/license-types/${licenseTypeId}`, updates);
    return data;
  },

  // Archive a license type
  archiveLicenseType: async (licenseTypeId: string) => {
    const { data } = await superAdminClient.post(`/licensing/license-types/${licenseTypeId}/archive`);
    return data;
  },

  // Delete a license type (only if no active subscriptions)
  deleteLicenseType: async (licenseTypeId: string) => {
    const { data } = await superAdminClient.delete(`/licensing/license-types/${licenseTypeId}`);
    return data;
  },

  // ==========================================================================
  // LICENSE SUBSCRIPTIONS (Inventory Management)
  // ==========================================================================

  // Provision a subscription (buy seats)
  provisionSubscription: async (subscription: {
    tenantId: string;
    applicationId: string;
    licenseTypeId: string;
    quantityPurchased: number;
    currentPeriodEnd: string; // ISO date string
  }) => {
    const { data } = await superAdminClient.post('/licensing/subscriptions', subscription);
    return data;
  },

  // Get a subscription
  getSubscription: async (subscriptionId: string) => {
    const { data } = await superAdminClient.get(`/licensing/subscriptions/${subscriptionId}`);
    return data;
  },

  // Update subscription quantity
  updateSubscriptionQuantity: async (subscriptionId: string, quantityPurchased: number) => {
    const { data } = await superAdminClient.put(`/licensing/subscriptions/${subscriptionId}/quantity`, { quantityPurchased });
    return data;
  },

  // Cancel a subscription
  cancelSubscription: async (subscriptionId: string) => {
    const { data } = await superAdminClient.post(`/licensing/subscriptions/${subscriptionId}/cancel`);
    return data;
  },

  // Expire a subscription immediately
  expireSubscription: async (subscriptionId: string) => {
    const { data } = await superAdminClient.post(`/licensing/subscriptions/${subscriptionId}/expire`);
    return data;
  },

  // Get all subscriptions for a tenant (their "wallet")
  getTenantSubscriptions: async (tenantId: string) => {
    const { data } = await superAdminClient.get(`/licensing/tenants/${tenantId}/subscriptions`);
    return data;
  },

  // Get full license overview for a tenant
  getTenantLicenseOverview: async (tenantId: string) => {
    const { data } = await superAdminClient.get(`/licensing/tenants/${tenantId}/license-overview`);
    return data;
  },

  // ==========================================================================
  // LICENSE ASSIGNMENTS (User Access Management)
  // ==========================================================================

  // Grant a license to a user
  grantLicense: async (assignment: {
    tenantId: string;
    userId: string;
    applicationId: string;
    licenseTypeId: string;
  }) => {
    const { data } = await superAdminClient.post('/licensing/licenses/grant', assignment);
    return data;
  },

  // Revoke a license from a user
  revokeLicense: async (assignment: {
    tenantId: string;
    userId: string;
    applicationId: string;
  }) => {
    const { data } = await superAdminClient.post('/licensing/licenses/revoke', assignment);
    return data;
  },

  // Change a user's license type
  changeLicenseType: async (change: {
    tenantId: string;
    userId: string;
    applicationId: string;
    newLicenseTypeId: string;
  }) => {
    const { data } = await superAdminClient.post('/licensing/licenses/change-type', change);
    return data;
  },

  // Get all licenses for a user in a tenant
  getUserLicenses: async (tenantId: string, userId: string) => {
    const { data } = await superAdminClient.get(`/licensing/tenants/${tenantId}/users/${userId}/licenses`);
    return data;
  },

  // Get all license holders for an app in a tenant
  getAppLicenseHolders: async (tenantId: string, applicationId: string) => {
    const { data } = await superAdminClient.get(`/licensing/tenants/${tenantId}/applications/${applicationId}/license-holders`);
    return data;
  },

  // Get assignments for a subscription
  getSubscriptionAssignments: async (subscriptionId: string) => {
    const { data } = await superAdminClient.get(`/licensing/subscriptions/${subscriptionId}/assignments`);
    return data;
  },

  // Revoke all licenses for a user
  revokeAllUserLicenses: async (tenantId: string, userId: string) => {
    const { data } = await superAdminClient.delete(`/licensing/tenants/${tenantId}/users/${userId}/all-licenses`);
    return data;
  },

  // ==========================================================================
  // TENANT LICENSE MANAGEMENT
  // ==========================================================================

  // Get all tenant members with their license assignments
  getTenantMembersWithLicenses: async (tenantId: string) => {
    const { data } = await superAdminClient.get(`/licensing/tenants/${tenantId}/members-with-licenses`);
    return data;
  },

  // Get available license types for provisioning
  getAvailableLicenseTypesForTenant: async (tenantId: string) => {
    const { data } = await superAdminClient.get(`/licensing/tenants/${tenantId}/available-license-types`);
    return data;
  },

  // Bulk grant licenses
  grantLicensesBulk: async (assignments: Array<{
    tenantId: string;
    userId: string;
    applicationId: string;
    licenseTypeId: string;
  }>) => {
    const { data } = await superAdminClient.post('/licensing/licenses/grant-bulk', { assignments });
    return data;
  },

  // Bulk revoke licenses
  revokeLicensesBulk: async (revocations: Array<{
    tenantId: string;
    userId: string;
    applicationId: string;
  }>) => {
    const { data } = await superAdminClient.post('/licensing/licenses/revoke-bulk', { revocations });
    return data;
  },

  // Role Management (Per Application)
  // Roles are simple: name, slug, description - no permissions
  createRole: async (appId: string, name: string, slug: string, description?: string) => {
    const { data } = await superAdminClient.post(`/super-admin/applications/${appId}/roles`, { name, slug, description });
    return data;
  },

  updateRole: async (roleId: string, updates: { name?: string; slug?: string; description?: string }) => {
    const { data } = await superAdminClient.put(`/super-admin/roles/${roleId}`, updates);
    return data;
  },

  deleteRole: async (roleId: string) => {
    const { data } = await superAdminClient.delete(`/super-admin/roles/${roleId}`);
    return data;
  },

  setDefaultRole: async (roleId: string) => {
    const { data } = await superAdminClient.post(`/super-admin/roles/${roleId}/set-default`);
    return data;
  },

  // ==========================================================================
  // MFA MANAGEMENT
  // ==========================================================================

  /** Initialize MFA setup - returns QR code and backup codes */
  mfaSetup: async () => {
    const { data } = await superAdminClient.post<{
      secret: string;
      qrCodeDataUrl: string;
      backupCodes: string[];
    }>('/super-admin/mfa/setup');
    return data;
  },

  /** Enable MFA after verification */
  mfaEnable: async (params: { secret: string; code: string; backupCodes: string[] }) => {
    const { data } = await superAdminClient.post('/super-admin/mfa/enable', params);
    return data;
  },

  /** Disable MFA (requires verification code) */
  mfaDisable: async (code: string) => {
    const { data } = await superAdminClient.post('/super-admin/mfa/disable', { code });
    return data;
  },

  /** Verify MFA code during login (with challenge token from initial login) */
  mfaVerify: async (challengeToken: string, code: string) => {
    const { data } = await superAdminClient.post('/super-admin/mfa/verify', { challengeToken, code });
    return data;
  },

  /** Get current user's MFA status */
  getMfaStatus: async () => {
    const { data } = await superAdminClient.get<{
      enabled: boolean;
      verifiedAt: string | null;
      backupCodesRemaining: number;
    }>('/super-admin/mfa/status');
    return data;
  },

  /** Get instance MFA policy */
  getMfaPolicy: async () => {
    const { data } = await superAdminClient.get<{
      superAdminMfaRequired: boolean;
    }>('/super-admin/settings/mfa-policy');
    return data;
  },

  /** Update instance MFA policy */
  updateMfaPolicy: async (required: boolean) => {
    const { data } = await superAdminClient.put('/super-admin/settings/mfa-policy', {
      required, // Backend expects 'required', not 'superAdminMfaRequired'
    });
    return data;
  },

  // ==========================================================================
  // SSO MANAGEMENT
  // ==========================================================================

  /** Get all configured SSO providers */
  getSsoProviders: async () => {
    const { data } = await superAdminClient.get('/super-admin/sso/providers');
    return data;
  },

  /** Get a single SSO provider configuration */
  getSsoProvider: async (provider: string) => {
    const { data } = await superAdminClient.get(`/super-admin/sso/providers/${provider}`);
    return data;
  },

  /** Create or update an SSO provider configuration */
  upsertSsoProvider: async (config: {
    provider: string;
    clientId: string;
    clientSecret: string;
    enabled?: boolean;
    scopes?: string[];
    allowedDomains?: string[];
    autoCreateUser?: boolean;
    autoLinkExisting?: boolean;
  }) => {
    const { data } = await superAdminClient.post('/super-admin/sso/providers', config);
    return data;
  },

  /** Update an existing SSO provider configuration */
  updateSsoProvider: async (provider: string, config: {
    clientId?: string;
    clientSecret?: string;
    enabled?: boolean;
    scopes?: string[];
    allowedDomains?: string[];
    autoCreateUser?: boolean;
    autoLinkExisting?: boolean;
  }) => {
    const { data } = await superAdminClient.put(`/super-admin/sso/providers/${provider}`, config);
    return data;
  },

  /** Delete an SSO provider configuration */
  deleteSsoProvider: async (provider: string) => {
    const { data } = await superAdminClient.delete(`/super-admin/sso/providers/${provider}`);
    return data;
  },

  /** Test an SSO provider configuration */
  testSsoProvider: async (provider: string) => {
    const { data } = await superAdminClient.post(`/super-admin/sso/providers/${provider}/test`);
    return data;
  },

  // ==========================================================================
  // SYSTEM WEBHOOKS
  // ==========================================================================

  getWebhookEvents: async () => {
    const { data } = await superAdminClient.get<{ events: string[] }>('/super-admin/webhooks/events');
    return data.events;
  },

  getWebhookEventTypes: async () => {
    const { data } = await superAdminClient.get<{
      categories: Array<{
        slug: string;
        name: string;
        description: string;
        events: Array<{ type: string; description: string }>;
      }>;
    }>('/super-admin/webhooks/event-types');
    return data.categories;
  },

  getWebhooks: async () => {
    const { data } = await superAdminClient.get('/super-admin/webhooks');
    return data;
  },

  getWebhook: async (id: string) => {
    const { data } = await superAdminClient.get(`/super-admin/webhooks/${id}`);
    return data;
  },

  getWebhookDeliveries: async (id: string) => {
    const { data } = await superAdminClient.get(`/super-admin/webhooks/${id}/deliveries`);
    return data;
  },

  createWebhook: async (params: {
    name: string;
    url: string;
    events: string[];
    description?: string;
  }) => {
    const { data } = await superAdminClient.post('/super-admin/webhooks', params);
    return data;
  },

  updateWebhook: async (
    id: string,
    params: {
      name?: string;
      url?: string;
      events?: string[];
      isActive?: boolean;
      description?: string;
    },
  ) => {
    const { data } = await superAdminClient.put(`/super-admin/webhooks/${id}`, params);
    return data;
  },

  deleteWebhook: async (id: string) => {
    const { data } = await superAdminClient.delete(`/super-admin/webhooks/${id}`);
    return data;
  },

  testWebhook: async (id: string) => {
    const { data } = await superAdminClient.post(`/super-admin/webhooks/${id}/test`);
    return data;
  },
};

// =============================================================================
// Sync API (Webhooks & Events)
// =============================================================================

export const syncApi = {
  /**
   * Get available event types for webhook configuration
   * Returns categories with their events for the event picker UI
   */
  getEventTypes: async () => {
    const { data } = await superAdminClient.get('/sync/event-types');
    return data;
  },
};

// =============================================================================
// Tenant Management API
// =============================================================================

export const tenantApi = {
  // Overview
  getOverview: async (tenantId: string) => {
    const { data } = await api.get(`/tenants/${tenantId}/overview`);
    return data;
  },

  // Members
  getMembers: async (tenantId: string) => {
    const { data } = await api.get(`/tenants/${tenantId}/members`);
    return data;
  },

  getMemberDetail: async (tenantId: string, membershipId: string) => {
    const { data } = await api.get(
      `/tenants/${tenantId}/members/${membershipId}`,
    );
    return data;
  },

  updateMember: async (
    tenantId: string,
    membershipId: string,
    update: { status?: 'ACTIVE' | 'SUSPENDED' },
  ) => {
    const { data } = await api.patch(
      `/tenants/${tenantId}/members/${membershipId}`,
      update,
    );
    return data;
  },

  removeMember: async (tenantId: string, membershipId: string) => {
    const { data } = await api.delete(
      `/tenants/${tenantId}/members/${membershipId}`,
    );
    return data;
  },

  // Applications
  getApplications: async (tenantId: string) => {
    const { data } = await api.get(`/tenants/${tenantId}/applications`);
    return data;
  },

  getAppUsers: async (tenantId: string, appId: string) => {
    const { data } = await api.get(
      `/tenants/${tenantId}/members/apps/${appId}`,
    );
    return data;
  },

  getAvailableMembers: async (tenantId: string, appId: string) => {
    const { data } = await api.get(
      `/tenants/${tenantId}/members/apps/${appId}/available`,
    );
    return data;
  },

  grantAppAccess: async (
    tenantId: string,
    appId: string,
    membershipIds: string[],
    roleId: string,
  ) => {
    const { data } = await api.post(
      `/tenants/${tenantId}/members/apps/${appId}/access`,
      {
        membershipIds,
        roleId,
      },
    );
    return data;
  },

  updateAppRole: async (
    tenantId: string,
    appId: string,
    membershipId: string,
    roleId: string,
  ) => {
    const { data } = await api.patch(
      `/tenants/${tenantId}/members/apps/${appId}/access/${membershipId}`,
      {
        roleId,
      },
    );
    return data;
  },

  revokeAppAccess: async (
    tenantId: string,
    appId: string,
    membershipId: string,
  ) => {
    const { data } = await api.delete(
      `/tenants/${tenantId}/members/apps/${appId}/access/${membershipId}`,
    );
    return data;
  },

  toggleAppAccess: async (
    tenantId: string,
    appId: string,
    userId: string,
    enable: boolean,
    roleId?: string,
  ) => {
    const { data } = await api.post(
      `/tenants/${tenantId}/members/apps/${appId}/toggle`,
      { userId, enable, roleId },
    );
    return data;
  },

  // Invitations
  getTenantRoles: async () => {
    const { data } = await api.get('/authorization/tenant-roles');
    return data;
  },

  inviteUser: async (
    tenantId: string,
    email: string,
    roleId: string,
    options?: {
      applicationId?: string;
      licenseTypeId?: string;
      givenName?: string;
      familyName?: string;
    },
  ) => {
    const { data } = await api.post('/invitations', {
      email,
      tenantId,
      roleId,
      ...options,
    });
    return data;
  },

  revokeInvitation: async (invitationId: string) => {
    const { data } = await api.delete(`/invitations/${invitationId}`);
    return data;
  },

  resendInvitation: async (invitationId: string) => {
    const { data } = await api.post(`/invitations/${invitationId}/resend`);
    return data;
  },

  updateInvitationRole: async (invitationId: string, roleId: string) => {
    const { data } = await api.patch(`/invitations/${invitationId}`, { roleId });
    return data;
  },

  changeMemberRole: async (tenantId: string, membershipId: string, roleSlug: string) => {
    const { data } = await api.post(`/tenants/${tenantId}/members/${membershipId}/role`, { roleSlug });
    return data;
  },

  // SSO Management
  getTenantSsoConfig: async (tenantId: string) => {
    const { data } = await api.get(`/tenants/${tenantId}/sso/config`);
    return data;
  },

  updateTenantSsoConfig: async (tenantId: string, provider: string, config: {
    enabled?: boolean;
    clientId?: string | null;
    clientSecret?: string | null;
    enforced?: boolean;
    allowedDomains?: string[];
  }) => {
    const { data } = await api.put(`/tenants/${tenantId}/sso/config/${provider}`, config);
    return data;
  },

  deleteTenantSsoConfig: async (tenantId: string, provider: string) => {
    const { data } = await api.delete(`/tenants/${tenantId}/sso/config/${provider}`);
    return data;
  },
};
