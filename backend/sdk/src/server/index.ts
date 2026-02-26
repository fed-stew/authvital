/**
 * @authvader/sdk - Server-Side SDK
 * 
 * Import from '@authvader/sdk/server' for backend-to-backend operations.
 * 
 * @example
 * ```ts
 * import { createAuthVader } from '@authvader/sdk/server';
 * 
 * // Configure once at startup
 * const authvader = createAuthVader({
 *   authVaderHost: process.env.AV_HOST,
 *   clientId: process.env.AV_CLIENT_ID,
 *   clientSecret: process.env.AV_CLIENT_SECRET,
 * });
 * 
 * // Validate JWT from request (uses cached JWKS, no IDP auth needed)
 * const { authenticated, user } = await authvader.getCurrentUser(request);
 * 
 * // M2M calls (uses client_credentials automatically)
 * const members = await authvader.memberships.listForTenant('tenant-123');
 * ```
 */

// Main unified client (RECOMMENDED)
export {
  AuthVader,
  createAuthVader,
  type AuthVaderConfig,
  type GetCurrentUserResult,
  type ValidatedClaims,
  type RequestLike,
} from './authvader';

// Base client for extending (advanced use cases)
export { BaseClient, extractAuthorizationHeader, appendClientIdToUri } from './base-client';

// Namespaces (for advanced composition)
export {
  createInvitationsNamespace,
  createMembershipsNamespace,
  createPermissionsNamespace,
  createEntitlementsNamespace,
  createLicensesNamespace,
  createSessionsNamespace,
  type InvitationsNamespace,
  type MembershipsNamespace,
  type PermissionsNamespace,
  type EntitlementsNamespace,
  type LicensesNamespace,
  type SessionsNamespace,
} from './namespaces';

// Note: AuthVaderClient was removed - use createAuthVader() instead

// OAuth flow utilities
export {
  OAuthFlow,
  // PKCE
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCE,
  // State management
  generateState,
  encodeState,
  decodeState,
  encodeStateWithVerifier,
  decodeStateWithVerifier,
  // URL building
  buildAuthorizeUrl,
  // Token operations
  exchangeCodeForTokens,
  refreshAccessToken,
  // JWT
  decodeJwt,
  // Types from oauth-flow
  type StatePayload,
  type AuthorizeUrlParams,
  type TokenExchangeParams,
  type RefreshTokenParams,
} from './oauth-flow';

// JWT Validation (low-level, prefer createAuthVader().getCurrentUser() instead)
export {
  JwtValidator,
  createJwtValidator,
  createJwtMiddleware,
  createPassportJwtOptions,
  // Standalone helpers (deprecated, use createAuthVader instead)
  getCurrentUser,
  getCurrentUserFromConfig,
  type JwtValidatorConfig,
  type JwksKey,
  type Jwks,
  type JwtHeader,
  type JwtPayload,
  type ValidateTokenResult,
} from './jwt-validator';

// URL builders (for landing pages, emails - no PKCE needed)
export {
  getSignupUrl,
  getLoginUrl,
  getLogoutUrl,
  getPasswordResetUrl,
  getInviteAcceptUrl,
  // Standalone account settings URL (doesn't need tenantId)
  // For tenant-specific URLs, use authvader.getManagementUrls(req)
  getAccountSettingsUrl,
  type AuthUrlOptions,
  type SignupUrlOptions,
  type LoginUrlOptions,
  type LogoutUrlOptions,
} from './urls';

// Types from types.ts
export type {
  // Config
  AuthVaderClientConfig,
  OAuthFlowConfig,
  // Tokens
  TokenResponse,
  // JWT types
  JwtLicenseInfo,
  EnhancedJwtPayload,
  // Invitations
  InvitationResponse,
  PendingInvitation,
  PendingInvitationsResponse,
  SendInvitationParams,
  ResendInvitationParams,
  RevokeInvitationResponse,
  // Memberships
  MembershipUser,
  MembershipRole,
  TenantMembership,
  TenantMembershipsResponse,
  ApplicationMembership,
  ApplicationMembershipsResponse,
  ValidateMembershipResponse,
  UserTenantMembership,
  UserTenantsResponse,
  // Tenant roles
  TenantRoleDefinition,
  TenantRolesResponse,
  // Application roles
  ApplicationRoleDefinition,
  ApplicationRolesResponse,
  SetMemberRoleResponse,
  // Permissions
  CheckPermissionParams,
  CheckPermissionResult,
  CheckPermissionsParams,
  CheckPermissionsResult,
  UserPermissions,
  // Entitlements
  FeatureCheckResult,
  // Re-exported canonical licensing types
  SubscriptionSummary,
  MemberWithLicenses,
  AvailableLicenseType,
  TenantLicenseOverview,
  SubscriptionStatusType,
  MembershipStatusType,
} from './types';

// License-related types (return types for licenses namespace methods)
export type {
  LicenseGrantResponse,
  LicenseRevokeResponse,
  LicenseCheckResponse,
  LicenseFeatureResponse,
  LicensedUser,
  LicenseHolder,
  LicenseAuditLogEntry,
  LicenseAuditLogResponse,
  UsageOverviewResponse,
  UsageTrendEntry,
  UserLicenseListItem,
} from './namespaces/licenses-types';

// =============================================================================
// IDENTITY SYNC (local database mirroring)
// =============================================================================

export {
  // Prisma schema snippets
  IDENTITY_SCHEMA,
  IDENTITY_SESSION_SCHEMA,
  FULL_SCHEMA,
  printSchema,
  // Pre-built sync handler
  IdentitySyncHandler,
  // Session cleanup
  cleanupSessions,
  getCleanupSQL,
  // Types
  type IdentityBase,
  type IdentityCreate,
  type IdentityUpdate,
  type IdentitySessionBase,
  type IdentitySessionCreate,
  type IdentitySessionUpdate,
  type SessionCleanupOptions,
  type SessionCleanupResult,
  type PrismaClientLike,
  type PrismaClientResolver,
  type PrismaClientOrResolver,
} from '../sync';

// =============================================================================
// WEBHOOKS
// =============================================================================

export {
  // Main API: Event handler base class
  AuthVaderEventHandler,
  InviteEventHandler,
  SubjectEventHandler,
  MemberEventHandler,
  AppAccessEventHandler,
  LicenseEventHandler,
  // Router
  WebhookRouter,
  type WebhookRouterOptions,
  // Low-level verifier (advanced use cases)
  WebhookVerifier,
  type WebhookVerifierOptions,
  // Handler interfaces
  type IAuthVaderEventHandler,
  type IInviteEventHandler,
  type ISubjectEventHandler,
  type IMemberEventHandler,
  type IAppAccessEventHandler,
  type ILicenseEventHandler,
  // Event types
  SYNC_EVENT_TYPES,
  type SyncEventType,
  type SyncEvent,
  type InviteCreatedEvent,
  type InviteAcceptedEvent,
  type InviteDeletedEvent,
  type InviteExpiredEvent,
  type SubjectData,
  type SubjectCreatedEvent,
  type SubjectUpdatedEvent,
  type SubjectDeletedEvent,
  type SubjectDeactivatedEvent,
  type MemberJoinedEvent,
  type MemberLeftEvent,
  type MemberRoleChangedEvent,
  type MemberSuspendedEvent,
  type MemberActivatedEvent,
  type AppAccessGrantedEvent,
  type AppAccessRevokedEvent,
  type AppAccessDeactivatedEvent,
  type AppAccessRoleChangedEvent,
  type LicenseAssignedEvent,
  type LicenseRevokedEvent,
  type LicenseChangedEvent,
  // Type guards
  isInviteEvent,
  isSubjectEvent,
  isMemberEvent,
  isAppAccessEvent,
  isLicenseEvent,
} from '../webhooks';
