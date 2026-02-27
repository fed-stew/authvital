/**
 * @authvital/sdk - Namespaces Index
 *
 * Re-exports all namespace factory functions and their types.
 */

export {
  createInvitationsNamespace,
  type InvitationsNamespace,
} from './invitations';

export {
  createMembershipsNamespace,
  type MembershipsNamespace,
} from './memberships';

export {
  createPermissionsNamespace,
  type PermissionsNamespace,
} from './permissions';

export {
  createEntitlementsNamespace,
  type EntitlementsNamespace,
} from './entitlements';

export {
  createLicensesNamespace,
  type LicensesNamespace,
} from './licenses';

export {
  createSessionsNamespace,
  type SessionsNamespace,
} from './sessions';

export {
  createMfaNamespace,
  type MfaNamespace,
  type MfaSetupResponse,
  type MfaVerifyResult,
  type MfaChallengeResult,
  type MfaStatus,
} from './mfa';

export {
  createTenantsNamespace,
  type TenantsNamespace,
  type Tenant,
  type CreateTenantParams,
  type UpdateTenantParams,
  type TenantSsoConfig,
  type ConfigureSsoParams as TenantConfigureSsoParams,
} from './tenants';

export {
  createSsoNamespace,
  type SsoNamespace,
  type SsoProvider,
  type SsoLink,
} from './sso';

export {
  createAdminNamespace,
  type AdminNamespace,
  type InstanceSettings,
  type InstanceSsoConfig,
  type ConfigureSsoParams as AdminConfigureSsoParams,
} from './admin';

export {
  createUsersNamespace,
  type UsersNamespace,
  type UserProfile,
  type UserSession,
  type UpdateUserParams,
} from './users';

export {
  createAuthNamespace,
  type AuthNamespace,
  type RegisterResponse,
  type LoginResponse,
  type MfaRequiredResponse,
} from './auth';
