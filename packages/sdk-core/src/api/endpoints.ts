/**
 * @authvital/core - API Endpoint Definitions
 *
 * URL path constants for all AuthVital API endpoints.
 * These are environment-agnostic - just strings, no implementation.
 *
 * @packageDocumentation
 */

// =============================================================================
// BASE PATHS
// =============================================================================

/** Base path for OAuth endpoints */
export const OAUTH_BASE = '/oauth';

/** Base path for API endpoints */
export const API_BASE = '/api';

/** Base path for admin endpoints */
export const ADMIN_BASE = '/api/admin';

// =============================================================================
// OAUTH ENDPOINTS
// =============================================================================

/**
 * OAuth authorization endpoint.
 * Used for initiating the OAuth flow.
 */
export const OAUTH_AUTHORIZE = `${OAUTH_BASE}/authorize`;

/**
 * OAuth token endpoint.
 * Used for exchanging codes for tokens and refreshing tokens.
 */
export const OAUTH_TOKEN = `${OAUTH_BASE}/token`;

/**
 * OAuth token introspection endpoint (RFC 7662).
 * Used for checking token validity and retrieving token metadata.
 */
export const OAUTH_INTROSPECT = `${OAUTH_BASE}/introspect`;

/**
 * OAuth token revocation endpoint (RFC 7009).
 * Used for revoking access or refresh tokens.
 */
export const OAUTH_REVOKE = `${OAUTH_BASE}/revoke`;

/**
 * JWKS endpoint for public key retrieval.
 */
export const JWKS = '/.well-known/jwks.json';

/**
 * OpenID Connect configuration endpoint.
 */
export const OPENID_CONFIG = '/.well-known/openid-configuration';

// =============================================================================
// AUTHENTICATION ENDPOINTS
// =============================================================================

/**
 * Get current user endpoint.
 */
export const AUTH_ME = `${API_BASE}/auth/me`;

/**
 * Login endpoint (direct username/password).
 */
export const AUTH_LOGIN = `${API_BASE}/auth/login`;

/**
 * Signup endpoint (direct registration).
 */
export const AUTH_SIGNUP = `${API_BASE}/auth/signup`;

/**
 * Logout endpoint.
 */
export const AUTH_LOGOUT = `${API_BASE}/auth/logout`;

/**
 * Logout redirect endpoint (clears cookies and redirects).
 */
export const AUTH_LOGOUT_REDIRECT = `${API_BASE}/auth/logout/redirect`;

/**
 * Token refresh endpoint.
 */
export const AUTH_REFRESH = `${API_BASE}/auth/refresh`;

/**
 * Password change endpoint.
 */
export const AUTH_CHANGE_PASSWORD = `${API_BASE}/auth/change-password`;

/**
 * Forgot password endpoint.
 */
export const AUTH_FORGOT_PASSWORD = `${API_BASE}/auth/forgot-password`;

/**
 * Reset password endpoint.
 */
export const AUTH_RESET_PASSWORD = `${API_BASE}/auth/reset-password`;

/**
 * Verify email endpoint.
 */
export const AUTH_VERIFY_EMAIL = `${API_BASE}/auth/verify-email`;

// =============================================================================
// MFA ENDPOINTS
// =============================================================================

/** MFA base path */
export const MFA_BASE = `${API_BASE}/mfa`;

/**
 * MFA setup endpoint.
 */
export const MFA_SETUP = `${MFA_BASE}/setup`;

/**
 * MFA enable endpoint.
 */
export const MFA_ENABLE = `${MFA_BASE}/enable`;

/**
 * MFA disable endpoint.
 */
export const MFA_DISABLE = `${MFA_BASE}/disable`;

/**
 * MFA verify endpoint (for login challenges).
 */
export const MFA_VERIFY = `${MFA_BASE}/verify`;

/**
 * MFA status endpoint.
 */
export const MFA_STATUS = `${MFA_BASE}/status`;

// =============================================================================
// TENANT ENDPOINTS
// =============================================================================

/** Tenant base path */
export const TENANT_BASE = `${API_BASE}/tenants`;

/**
 * List user tenants endpoint.
 */
export const TENANT_LIST = TENANT_BASE;

/**
 * Get tenant by ID endpoint.
 */
export const getTenantById = (tenantId: string): string =>
  `${TENANT_BASE}/${tenantId}`;

/**
 * Get tenant memberships endpoint.
 */
export const getTenantMemberships = (tenantId: string): string =>
  `${TENANT_BASE}/${tenantId}/memberships`;

/**
 * Get tenant invitations endpoint.
 */
export const getTenantInvitations = (tenantId: string): string =>
  `${TENANT_BASE}/${tenantId}/invitations`;

/**
 * Send invitation endpoint.
 */
export const getTenantSendInvite = (tenantId: string): string =>
  `${TENANT_BASE}/${tenantId}/invitations`;

/**
 * Revoke invitation endpoint.
 */
export const getTenantRevokeInvite = (tenantId: string, invitationId: string): string =>
  `${TENANT_BASE}/${tenantId}/invitations/${invitationId}`;

/**
 * Get tenant roles endpoint.
 */
export const getTenantRoles = (tenantId: string): string =>
  `${TENANT_BASE}/${tenantId}/roles`;

/**
 * Set member role endpoint.
 */
export const getTenantSetMemberRole = (tenantId: string, membershipId: string): string =>
  `${TENANT_BASE}/${tenantId}/memberships/${membershipId}/role`;

/**
 * Remove member endpoint.
 */
export const getTenantRemoveMember = (tenantId: string, membershipId: string): string =>
  `${TENANT_BASE}/${tenantId}/memberships/${membershipId}`;

/**
 * Get tenant domains endpoint.
 */
export const getTenantDomains = (tenantId: string): string =>
  `${TENANT_BASE}/${tenantId}/domains`;

/**
 * Verify domain endpoint.
 */
export const getTenantVerifyDomain = (tenantId: string, domainId: string): string =>
  `${TENANT_BASE}/${tenantId}/domains/${domainId}/verify`;

// =============================================================================
// INVITATION ENDPOINTS
// =============================================================================

/** Invitation base path */
export const INVITATION_BASE = `${API_BASE}/invitations`;

/**
 * Get invitation details endpoint.
 */
export const getInvitationByToken = (token: string): string =>
  `${INVITATION_BASE}/${token}`;

/**
 * Accept invitation endpoint.
 */
export const getAcceptInvitation = (token: string): string =>
  `${INVITATION_BASE}/${token}/accept`;

/**
 * Decline invitation endpoint.
 */
export const getDeclineInvitation = (token: string): string =>
  `${INVITATION_BASE}/${token}/decline`;

// =============================================================================
// LICENSE ENDPOINTS
// =============================================================================

/** License base path */
export const LICENSE_BASE = `${API_BASE}/licenses`;

/**
 * Get tenant license overview endpoint.
 */
export const getTenantLicenses = (tenantId: string): string =>
  `${LICENSE_BASE}?tenantId=${encodeURIComponent(tenantId)}`;

/**
 * Get available license types endpoint.
 */
export const getAvailableLicenseTypes = (tenantId: string, applicationId: string): string =>
  `${LICENSE_BASE}/types?tenantId=${encodeURIComponent(tenantId)}&applicationId=${encodeURIComponent(applicationId)}`;

/**
 * Grant license endpoint.
 */
export const LICENSE_GRANT = LICENSE_BASE;

/**
 * Revoke license endpoint.
 */
export const getRevokeLicense = (assignmentId: string): string =>
  `${LICENSE_BASE}/${assignmentId}`;

/**
 * Change license type endpoint.
 */
export const getChangeLicense = (assignmentId: string): string =>
  `${LICENSE_BASE}/${assignmentId}/type`;

// =============================================================================
// PERMISSION ENDPOINTS
// =============================================================================

/** Permission base path */
export const PERMISSION_BASE = `${API_BASE}/permissions`;

/**
 * Check permission endpoint.
 */
export const PERMISSION_CHECK = `${PERMISSION_BASE}/check`;

/**
 * Check multiple permissions endpoint.
 */
export const PERMISSION_CHECK_BATCH = `${PERMISSION_BASE}/check-batch`;

/**
 * Get user permissions endpoint.
 */
export const getUserPermissions = (tenantId: string): string =>
  `${PERMISSION_BASE}?tenantId=${encodeURIComponent(tenantId)}`;

// =============================================================================
// APPLICATION ENDPOINTS
// =============================================================================

/** Application base path */
export const APPLICATION_BASE = `${API_BASE}/applications`;

/**
 * Get application roles endpoint.
 */
export const getApplicationRoles = (applicationId: string): string =>
  `${APPLICATION_BASE}/${applicationId}/roles`;

/**
 * Get application memberships endpoint.
 */
export const getApplicationMemberships = (applicationId: string): string =>
  `${APPLICATION_BASE}/${applicationId}/memberships`;

// =============================================================================
// SSO ENDPOINTS
// =============================================================================

/** SSO base path */
export const SSO_BASE = `${API_BASE}/sso`;

/**
 * Initiate SSO login endpoint.
 */
export const SSO_INITIATE = `${SSO_BASE}/initiate`;

/**
 * SSO callback endpoint.
 */
export const SSO_CALLBACK = `${SSO_BASE}/callback`;

// =============================================================================
// SESSION ENDPOINTS
// =============================================================================

/** Session base path */
export const SESSION_BASE = `${API_BASE}/sessions`;

/**
 * List user sessions endpoint.
 */
export const SESSION_LIST = SESSION_BASE;

/**
 * Revoke session endpoint.
 */
export const getRevokeSession = (sessionId: string): string =>
  `${SESSION_BASE}/${sessionId}`;

/**
 * Revoke all sessions endpoint.
 */
export const SESSION_REVOKE_ALL = `${SESSION_BASE}/all`;

// =============================================================================
// SUPER ADMIN ENDPOINTS
// =============================================================================

/** Super admin base path */
export const SUPER_ADMIN_BASE = `${ADMIN_BASE}`;

/**
 * Super admin login endpoint.
 */
export const SUPER_ADMIN_LOGIN = `${SUPER_ADMIN_BASE}/auth/login`;

/**
 * Super admin MFA verify endpoint.
 */
export const SUPER_ADMIN_MFA_VERIFY = `${SUPER_ADMIN_BASE}/auth/mfa/verify`;

/**
 * Super admin change password endpoint.
 */
export const SUPER_ADMIN_CHANGE_PASSWORD = `${SUPER_ADMIN_BASE}/auth/change-password`;

/**
 * Super admin MFA setup endpoint.
 */
export const SUPER_ADMIN_MFA_SETUP = `${SUPER_ADMIN_BASE}/auth/mfa/setup`;

/**
 * Super admin MFA enable endpoint.
 */
export const SUPER_ADMIN_MFA_ENABLE = `${SUPER_ADMIN_BASE}/auth/mfa/enable`;

/**
 * Super admin MFA disable endpoint.
 */
export const SUPER_ADMIN_MFA_DISABLE = `${SUPER_ADMIN_BASE}/auth/mfa/disable`;

/**
 * Super admin MFA status endpoint.
 */
export const SUPER_ADMIN_MFA_STATUS = `${SUPER_ADMIN_BASE}/auth/mfa/status`;

/**
 * Super admin MFA policy endpoint.
 */
export const SUPER_ADMIN_MFA_POLICY = `${SUPER_ADMIN_BASE}/auth/mfa/policy`;

// =============================================================================
// WEBHOOK ENDPOINTS
// =============================================================================

/** Webhook base path */
export const WEBHOOK_BASE = `${API_BASE}/webhooks`;

/**
 * List webhooks endpoint.
 */
export const WEBHOOK_LIST = WEBHOOK_BASE;

/**
 * Create webhook endpoint.
 */
export const WEBHOOK_CREATE = WEBHOOK_BASE;

/**
 * Get webhook endpoint.
 */
export const getWebhookById = (webhookId: string): string =>
  `${WEBHOOK_BASE}/${webhookId}`;

/**
 * Update webhook endpoint.
 */
export const getWebhookUpdate = (webhookId: string): string =>
  `${WEBHOOK_BASE}/${webhookId}`;

/**
 * Delete webhook endpoint.
 */
export const getWebhookDelete = (webhookId: string): string =>
  `${WEBHOOK_BASE}/${webhookId}`;

/**
 * Test webhook endpoint.
 */
export const getWebhookTest = (webhookId: string): string =>
  `${WEBHOOK_BASE}/${webhookId}/test`;

/**
 * Get webhook deliveries endpoint.
 */
export const getWebhookDeliveries = (webhookId: string): string =>
  `${WEBHOOK_BASE}/${webhookId}/deliveries`;

/**
 * Get webhook stats endpoint.
 */
export const getWebhookStats = (webhookId: string): string =>
  `${WEBHOOK_BASE}/${webhookId}/stats`;

// =============================================================================
// PUBSUB ENDPOINTS
// =============================================================================

/** PubSub base path */
export const PUBSUB_BASE = `${API_BASE}/pubsub`;

/**
 * Publish event endpoint.
 */
export const PUBSUB_PUBLISH = `${PUBSUB_BASE}/publish`;

/**
 * Get subscription info endpoint.
 */
export const getPubSubSubscription = (topic: string): string =>
  `${PUBSUB_BASE}/subscriptions/${topic}`;
