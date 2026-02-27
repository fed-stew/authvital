# Identity Sync Prisma Schema

> Full OIDC-compliant Prisma schema for identity synchronization.

The SDK expects this schema structure. Add it to your `schema.prisma`:

## Identity Model

```prisma
// =============================================================================
// AuthVital Identity Sync Models
// =============================================================================
// These models mirror OIDC standard claims from AuthVital.
// Table names use "av_" prefix to distinguish from your app's tables.
// =============================================================================

model Identity {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE IDENTITY (OIDC Standard Claims - Profile Scope)
  // ═══════════════════════════════════════════════════════════════════════════
  id                String    @id                           // AuthVital subject ID (OIDC: sub claim)
  username          String?   @unique                       // Unique handle, e.g., @janesmith (OIDC: preferred_username)
  displayName       String?   @map("display_name")          // Full display name (OIDC: name)
  givenName         String?   @map("given_name")            // First name (OIDC: given_name)
  familyName        String?   @map("family_name")           // Last name (OIDC: family_name)
  middleName        String?   @map("middle_name")           // Middle name(s) (OIDC: middle_name)
  nickname          String?                                 // Casual name (OIDC: nickname)
  pictureUrl        String?   @map("picture_url")           // Profile picture URL (OIDC: picture)
  website           String?                                 // Personal website URL (OIDC: website)
  gender            String?                                 // Gender identity (OIDC: gender)
  birthdate         String?                                 // Date of birth, YYYY-MM-DD format (OIDC: birthdate)
  zoneinfo          String?                                 // IANA timezone, e.g., America/New_York (OIDC: zoneinfo)
  locale            String?                                 // Preferred locale, e.g., en-US (OIDC: locale)

  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL SCOPE
  // ═══════════════════════════════════════════════════════════════════════════
  email             String?   @unique                       // Primary email address (OIDC: email)
  emailVerified     Boolean   @default(false) @map("email_verified")  // Is email verified? (OIDC: email_verified)

  // ═══════════════════════════════════════════════════════════════════════════
  // PHONE SCOPE
  // ═══════════════════════════════════════════════════════════════════════════
  phone             String?   @unique                       // Primary phone number (OIDC: phone_number)
  phoneVerified     Boolean   @default(false) @map("phone_verified")  // Is phone verified? (OIDC: phone_number_verified)

  // ═══════════════════════════════════════════════════════════════════════════
  // TENANT CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════
  tenantId          String?   @map("tenant_id")             // Current tenant association
  appRole           String?   @map("app_role")              // Role within this app (e.g., admin, editor, viewer)
  groups            String[]  @default([])                  // Group memberships (string array)

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS FLAGS (IMPORTANT - SEE TERMINOLOGY SECTION!)
  // ═══════════════════════════════════════════════════════════════════════════
  isActive          Boolean   @default(true) @map("is_active")        // IDP-level: Can login to ANY app?
  hasAppAccess      Boolean   @default(true) @map("has_app_access")   // App-level: Has access to THIS app?

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  syncedAt          DateTime  @default(now()) @map("synced_at")       // Last sync timestamp
  createdAt         DateTime  @default(now()) @map("created_at")      // Record creation time
  updatedAt         DateTime  @updatedAt @map("updated_at")           // Last update time

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATIONSHIPS
  // ═══════════════════════════════════════════════════════════════════════════
  sessions          IdentitySession[]

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES (for common query patterns)
  // ═══════════════════════════════════════════════════════════════════════════
  @@index([tenantId])
  @@index([email])
  @@index([username])

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE NAME - Uses "av_" prefix to distinguish from your app's tables
  // ═══════════════════════════════════════════════════════════════════════════
  @@map("av_identities")
}
```

---

## Identity Session Model

```prisma
model IdentitySession {
  id              String    @id @default(cuid())            // Local session ID
  identityId      String    @map("identity_id")             // Foreign key to Identity
  identity        Identity  @relation(fields: [identityId], references: [id], onDelete: Cascade)

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION IDENTIFICATION
  // ═══════════════════════════════════════════════════════════════════════════
  authSessionId   String?   @map("auth_session_id")         // AuthVital's session ID (for revocation)

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  deviceInfo      String?   @map("device_info")             // Device description
  ipAddress       String?   @map("ip_address")              // Client IP address
  userAgent       String?   @map("user_agent")              // Browser/client user agent

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  createdAt       DateTime  @default(now()) @map("created_at")
  lastActiveAt    DateTime  @default(now()) @map("last_active_at")
  expiresAt       DateTime  @map("expires_at")
  revokedAt       DateTime? @map("revoked_at")              // If revoked, when

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES
  // ═══════════════════════════════════════════════════════════════════════════
  @@index([identityId])
  @@index([authSessionId])

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE NAME
  // ═══════════════════════════════════════════════════════════════════════════
  @@map("av_identity_sessions")
}
```

---

## OIDC Claims Reference

How the schema fields map to OIDC standard claims:

| Schema Field | OIDC Claim | Scope | Description |
|--------------|------------|-------|--------------|
| `id` | `sub` | openid | Subject identifier (unique user ID) |
| `username` | `preferred_username` | profile | The user's preferred username |
| `displayName` | `name` | profile | Full name (display name) |
| `givenName` | `given_name` | profile | First/given name |
| `familyName` | `family_name` | profile | Last/family name |
| `middleName` | `middle_name` | profile | Middle name(s) |
| `nickname` | `nickname` | profile | Casual name the user prefers |
| `pictureUrl` | `picture` | profile | URL of profile picture |
| `website` | `website` | profile | User's website URL |
| `gender` | `gender` | profile | Gender identity |
| `birthdate` | `birthdate` | profile | Birthday (YYYY-MM-DD) |
| `zoneinfo` | `zoneinfo` | profile | IANA timezone string |
| `locale` | `locale` | profile | Locale preference (e.g., en-US) |
| `email` | `email` | email | Email address |
| `emailVerified` | `email_verified` | email | Is email verified? |
| `phone` | `phone_number` | phone | Phone number |
| `phoneVerified` | `phone_number_verified` | phone | Is phone verified? |
| `groups` | `groups` | (custom) | Group memberships |

---

## Running Migrations

After adding the schema:

```bash
# Generate migration
npx prisma migrate dev --name add-identity-sync

# Generate Prisma client
npx prisma generate
```

---

## Related Documentation

- [Identity Sync Overview](./index.md)
- [Sync Handler](./sync-handler.md)
- [Extending the Schema](./advanced.md#extending-the-schema)
