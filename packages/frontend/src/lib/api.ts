import axios from 'axios';
import { getMemoryToken, setMemoryToken } from '@/contexts/AuthContext';

// =============================================================================
// RE-EXPORTS from ts-rest powered client (replaces hand-written axios calls)
// =============================================================================
export { superAdminApi, domainApi } from './admin-api';

// =============================================================================
// USER API CLIENT (auth via split-token: httpOnly cookie + memory token)
// =============================================================================
export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send httpOnly cookie with requests
});

// =============================================================================
// REQUEST INTERCEPTOR - Attach memory token to Authorization header
// =============================================================================
api.interceptors.request.use((config) => {
  const token = getMemoryToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// =============================================================================
// RESPONSE INTERCEPTOR - Handle 401 with token refresh
// =============================================================================
// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: Error) => void }> = [];

// Helper to process queue
const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else if (token) prom.resolve(token);
  });
  failedQueue = [];
};

// Response interceptor for user API error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue the request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }
      
      originalRequest._retry = true;
      isRefreshing = true;
      
      try {
        const response = await api.post('/auth/refresh', {}, { withCredentials: true });
        const newToken = response.data.access_token;
        setMemoryToken(newToken);
        
        // Update header and retry
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        
        processQueue(null, newToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        // Clear state and redirect to login
        setMemoryToken(null);
        
        // Only redirect if not already on auth pages or public pages
        const publicPaths = ['/auth/', '/super-admin', '/invite'];
        const isPublicPage = publicPaths.some(path => window.location.pathname.startsWith(path));
        
        if (!isPublicPage) {
          window.location.href = '/auth/login';
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
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

  logout: async () => {
    const { data } = await api.post('/auth/logout', {});
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
