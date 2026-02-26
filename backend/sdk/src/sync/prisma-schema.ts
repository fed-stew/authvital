/**
 * @authvader/sdk - Prisma Schema Snippets
 * 
 * Copy these model definitions into your schema.prisma file.
 * The sync handler expects these exact field names.
 */

export const IDENTITY_SCHEMA = `
// =============================================================================
// AUTHVADER IDENTITY (synced from IDP)
// =============================================================================
// Copy this into your schema.prisma and customize as needed.
// The sync handler only touches these base fields.

model Identity {
  // ─────────────────────────────────────────────────────────────────────────────
  // CORE IDENTITY (synced from AuthVader - OIDC Standard Claims)
  // ─────────────────────────────────────────────────────────────────────────────
  id                String    @id                      // AuthVader subject ID (sub claim)
  username          String?   @unique                  // Unique handle (@janesmith)
  displayName       String?   @map("display_name")     // Full name (OIDC: name)
  givenName         String?   @map("given_name")       // First name
  familyName        String?   @map("family_name")      // Last name
  middleName        String?   @map("middle_name")      // Middle name(s)
  nickname          String?                            // Casual name
  pictureUrl        String?   @map("picture_url")      // Profile picture URL
  website           String?                            // Personal URL
  gender            String?                            // Gender identity
  birthdate         String?                            // YYYY-MM-DD
  zoneinfo          String?                            // IANA timezone
  locale            String?                            // Language (e.g., en-US)
  
  // ─────────────────────────────────────────────────────────────────────────────
  // EMAIL SCOPE (OIDC Standard)
  // ─────────────────────────────────────────────────────────────────────────────
  email             String?   @unique
  emailVerified     Boolean   @default(false) @map("email_verified")
  
  // ─────────────────────────────────────────────────────────────────────────────
  // PHONE SCOPE (OIDC Standard)
  // ─────────────────────────────────────────────────────────────────────────────
  phone             String?   @unique
  phoneVerified     Boolean   @default(false) @map("phone_verified")
  
  // ─────────────────────────────────────────────────────────────────────────────
  // TENANT CONTEXT (for multi-tenant apps)
  // ─────────────────────────────────────────────────────────────────────────────
  tenantId          String?   @map("tenant_id")        // Current tenant ID
  appRole           String?   @map("app_role")         // Role slug (e.g., "admin")
  groups            String[]  @default([])             // Group slugs in tenant
  
  // ─────────────────────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────────────────────
  isActive          Boolean   @default(true) @map("is_active")       // IDP-level: can user log in at all?
  hasAppAccess      Boolean   @default(true) @map("has_app_access")  // App-level: does user have access to THIS app?
  
  // ─────────────────────────────────────────────────────────────────────────────
  // SYNC METADATA
  // ─────────────────────────────────────────────────────────────────────────────
  syncedAt          DateTime  @default(now()) @map("synced_at")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  
  // ─────────────────────────────────────────────────────────────────────────────
  // RELATIONS
  // ─────────────────────────────────────────────────────────────────────────────
  sessions          IdentitySession[]
  
  // ─────────────────────────────────────────────────────────────────────────────
  // ADD YOUR APP-SPECIFIC RELATIONS BELOW
  // ─────────────────────────────────────────────────────────────────────────────
  // profile         UserProfile?
  // posts           Post[]
  
  @@index([tenantId])
  @@index([email])
  @@index([username])
  @@map("av_identities")
}
`;

export const IDENTITY_SESSION_SCHEMA = `
// =============================================================================
// AUTHVADER IDENTITY SESSION (optional - for session management)
// =============================================================================

model IdentitySession {
  id              String    @id @default(cuid())
  identityId      String    @map("identity_id")
  identity        Identity  @relation(fields: [identityId], references: [id], onDelete: Cascade)
  
  authSessionId   String?   @map("auth_session_id")   // AuthVader session ID
  deviceInfo      String?   @map("device_info")       // Parsed device info
  ipAddress       String?   @map("ip_address")
  userAgent       String?   @map("user_agent")
  
  createdAt       DateTime  @default(now()) @map("created_at")
  lastActiveAt    DateTime  @default(now()) @map("last_active_at")
  expiresAt       DateTime  @map("expires_at")
  revokedAt       DateTime? @map("revoked_at")
  
  @@index([identityId])
  @@index([authSessionId])
  @@map("av_identity_sessions")
}
`;

/**
 * Combined schema snippet - both models together
 */
export const FULL_SCHEMA = `${IDENTITY_SCHEMA}\n\n${IDENTITY_SESSION_SCHEMA}`;

/**
 * Print the schema to console (for easy copy-paste)
 */
export function printSchema(): void {
  console.log('// ============================================================================');
  console.log('// AUTHVADER SDK - PRISMA SCHEMA SNIPPET');
  console.log('// Copy the following into your schema.prisma file');
  console.log('// ============================================================================');
  console.log(FULL_SCHEMA);
}
