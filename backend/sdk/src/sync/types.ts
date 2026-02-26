/**
 * @authvader/sdk - Identity Sync Types
 * 
 * TypeScript types matching the Prisma schema snippets.
 * Use these for type-safe operations with synced identities.
 * 
 * Follows OIDC Standard Claims:
 * - Profile Scope: name, given_name, family_name, etc.
 * - Email Scope: email, email_verified
 * - Phone Scope: phone_number, phone_number_verified
 */

// =============================================================================
// IDENTITY TYPES
// =============================================================================

/**
 * Base identity fields synced from AuthVader (OIDC-compliant)
 */
export interface IdentityBase {
  /** AuthVader subject ID (sub claim in JWT) */
  id: string;
  
  // ─────────────────────────────────────────────────────────────────────────────
  // PROFILE SCOPE (OIDC Standard)
  // ─────────────────────────────────────────────────────────────────────────────
  /** Unique handle (e.g., @janesmith) - OIDC: preferred_username */
  username: string | null;
  /** Full display name - OIDC: name */
  displayName: string | null;
  /** First name - OIDC: given_name */
  givenName: string | null;
  /** Last name - OIDC: family_name */
  familyName: string | null;
  /** Middle name(s) - OIDC: middle_name */
  middleName: string | null;
  /** Casual name - OIDC: nickname */
  nickname: string | null;
  /** Profile picture URL - OIDC: picture */
  pictureUrl: string | null;
  /** Personal/professional URL - OIDC: website */
  website: string | null;
  /** Gender identity - OIDC: gender */
  gender: string | null;
  /** Birth date in YYYY-MM-DD format - OIDC: birthdate */
  birthdate: string | null;
  /** IANA timezone (e.g., America/New_York) - OIDC: zoneinfo */
  zoneinfo: string | null;
  /** Language/region (e.g., en-US) - OIDC: locale */
  locale: string | null;
  
  // ─────────────────────────────────────────────────────────────────────────────
  // EMAIL SCOPE (OIDC Standard)
  // ─────────────────────────────────────────────────────────────────────────────
  /** Identity's email address - OIDC: email */
  email: string | null;
  /** Whether email is verified - OIDC: email_verified */
  emailVerified: boolean;
  
  // ─────────────────────────────────────────────────────────────────────────────
  // PHONE SCOPE (OIDC Standard)
  // ─────────────────────────────────────────────────────────────────────────────
  /** Phone number in E.164 format - OIDC: phone_number */
  phone: string | null;
  /** Whether phone is verified - OIDC: phone_number_verified */
  phoneVerified: boolean;
  
  // ─────────────────────────────────────────────────────────────────────────────
  // TENANT CONTEXT
  // ─────────────────────────────────────────────────────────────────────────────
  /** Current tenant ID (for multi-tenant apps) */
  tenantId: string | null;
  /** Role slug from app_roles claim */
  appRole: string | null;
  /** Group slugs in current tenant */
  groups: string[];
  
  // ─────────────────────────────────────────────────────────────────────────────
  // STATUS & METADATA
  // ─────────────────────────────────────────────────────────────────────────────
  /** 
   * Whether the identity is active at the IDP level.
   * When false, user cannot log into ANY app - all sessions invalidated.
   * Set via subject.deactivated event.
   */
  isActive: boolean;
  /**
   * Whether the identity has access to THIS specific app.
   * When false, user can still log into other apps, just not this one.
   * Set via app_access.granted/revoked events.
   */
  hasAppAccess: boolean;
  /** Last sync timestamp */
  syncedAt: Date;
  /** When the identity was first synced */
  createdAt: Date;
  /** Last update timestamp - OIDC: updated_at (as unix timestamp in JWT) */
  updatedAt: Date;
}

/**
 * Identity for creation (id required, others optional)
 */
export interface IdentityCreate {
  id: string;
  // Profile
  username?: string | null;
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  middleName?: string | null;
  nickname?: string | null;
  pictureUrl?: string | null;
  website?: string | null;
  gender?: string | null;
  birthdate?: string | null;
  zoneinfo?: string | null;
  locale?: string | null;
  // Email
  email?: string | null;
  emailVerified?: boolean;
  // Phone
  phone?: string | null;
  phoneVerified?: boolean;
  // Tenant context
  tenantId?: string | null;
  appRole?: string | null;
  groups?: string[];
  // Status
  isActive?: boolean;
  hasAppAccess?: boolean;
}

/**
 * Identity for updates (all fields optional)
 */
export interface IdentityUpdate {
  // Profile
  username?: string | null;
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  middleName?: string | null;
  nickname?: string | null;
  pictureUrl?: string | null;
  website?: string | null;
  gender?: string | null;
  birthdate?: string | null;
  zoneinfo?: string | null;
  locale?: string | null;
  // Email
  email?: string | null;
  emailVerified?: boolean;
  // Phone
  phone?: string | null;
  phoneVerified?: boolean;
  // Tenant context
  tenantId?: string | null;
  appRole?: string | null;
  groups?: string[];
  // Status
  isActive?: boolean;
  hasAppAccess?: boolean;
  syncedAt?: Date;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

/**
 * Identity session fields
 */
export interface IdentitySessionBase {
  id: string;
  identityId: string;
  /** AuthVader's session ID (for linking) */
  authSessionId: string | null;
  /** Parsed device info (e.g., "Chrome on macOS") */
  deviceInfo: string | null;
  /** Client IP address */
  ipAddress: string | null;
  /** Raw user agent string */
  userAgent: string | null;
  /** When the session was created */
  createdAt: Date;
  /** Last activity timestamp */
  lastActiveAt: Date;
  /** When the session expires */
  expiresAt: Date;
  /** When the session was revoked (null if active) */
  revokedAt: Date | null;
}

/**
 * Session for creation
 */
export interface IdentitySessionCreate {
  identityId: string;
  authSessionId?: string | null;
  deviceInfo?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
}

/**
 * Session for updates
 */
export interface IdentitySessionUpdate {
  lastActiveAt?: Date;
  revokedAt?: Date | null;
  deviceInfo?: string | null;
}

// =============================================================================
// CLEANUP OPTIONS
// =============================================================================

/**
 * Options for session cleanup
 */
export interface SessionCleanupOptions {
  /** Delete sessions expired more than X days ago (default: 30) */
  expiredOlderThanDays?: number;
  /** Also delete revoked sessions (default: false - keeps for audit) */
  deleteRevoked?: boolean;
  /** Dry run - log what would be deleted without deleting (default: false) */
  dryRun?: boolean;
}

/**
 * Result of cleanup operation
 */
export interface SessionCleanupResult {
  /** Number of sessions deleted (or would be deleted in dry run) */
  deletedCount: number;
  /** Whether this was a dry run */
  dryRun: boolean;
}

// =============================================================================
// PRISMA CLIENT INTERFACE
// =============================================================================

/**
 * Minimal Prisma client interface for the sync handler
 * 
 * This allows the sync handler to work with any Prisma client
 * that has the expected identity and identitySession models.
 */
export interface PrismaClientLike {
  identity: {
    upsert: (args: {
      where: { id: string };
      create: IdentityCreate;
      update: IdentityUpdate;
    }) => Promise<unknown>;
    update: (args: {
      where: { id: string };
      data: IdentityUpdate;
    }) => Promise<unknown>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
  identitySession: {
    deleteMany: (args: {
      where: {
        OR?: Array<Record<string, unknown>>;
        expiresAt?: { lt: Date };
        revokedAt?: { not: null } | { lt: Date };
      };
    }) => Promise<{ count: number }>;
  };
}

/**
 * Function that resolves a Prisma client for a given tenant
 * Used for tenant-isolated database architectures
 */
export type PrismaClientResolver = (tenantId: string) => PrismaClientLike | Promise<PrismaClientLike>;

/**
 * Either a direct Prisma client (shared DB) or a resolver function (tenant-isolated DBs)
 */
export type PrismaClientOrResolver = PrismaClientLike | PrismaClientResolver;
