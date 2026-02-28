# Organization Sync Prisma Schema

> Full Prisma schema for syncing organization, application, and SSO provider data from AuthVital.

The SDK expects this schema structure. Add it to your `schema.prisma`:

## Organization Model

```prisma
// =============================================================================
// AuthVital Organization Sync Models
// =============================================================================
// These models mirror organization-level data from AuthVital.
// Table names use "av_" prefix to distinguish from your app's tables.
// =============================================================================

model Organization {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  id                      String    @id                           // AuthVital tenant ID
  name                    String                                  // Display name
  slug                    String    @unique                       // URL-safe identifier
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTION & BILLING
  // ═══════════════════════════════════════════════════════════════════════════
  plan                    String    @default("free")              // free, starter, pro, enterprise
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  allowSignups            Boolean   @default(true) @map("allow_signups")      // Self-signup enabled?
  requireMfa              Boolean   @default(false) @map("require_mfa")       // MFA required for all users?
  allowedEmailDomains     String[]  @default([]) @map("allowed_email_domains") // Restrict signups to domains
  sessionLifetimeMinutes  Int       @default(480) @map("session_lifetime_minutes") // Session duration
  passwordPolicy          String    @default("standard") @map("password_policy")   // standard, strict
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  status                  String    @default("active")            // active, suspended, deleted
  suspendedAt             DateTime? @map("suspended_at")          // When suspended (if applicable)
  suspendedBySub          String?   @map("suspended_by_sub")      // Who suspended (subject ID)
  suspendedReason         String?   @map("suspended_reason")      // Why suspended
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT TRAIL
  // ═══════════════════════════════════════════════════════════════════════════
  createdBySub            String?   @map("created_by_sub")        // Who created (subject ID)
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  syncedAt                DateTime  @default(now()) @map("synced_at")         // Last sync timestamp
  createdAt               DateTime  @default(now()) @map("created_at")        // Record creation time
  updatedAt               DateTime  @updatedAt @map("updated_at")             // Last update time
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RELATIONSHIPS
  // ═══════════════════════════════════════════════════════════════════════════
  applications            Application[]
  ssoProviders            SsoProvider[]
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES
  // ═══════════════════════════════════════════════════════════════════════════
  @@index([slug])
  @@index([plan])
  @@index([status])
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE NAME - Uses "av_" prefix
  // ═══════════════════════════════════════════════════════════════════════════
  @@map("av_organizations")
}
```

---

## Application Model

```prisma
model Application {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  id                        String    @id                           // AuthVital application ID
  organizationId            String    @map("organization_id")       // Parent organization
  organization              Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  name                      String                                  // Display name
  description               String?                                 // Optional description
  clientId                  String    @unique @map("client_id")     // OAuth client ID
  applicationType           String    @map("application_type")      // web, spa, native, machine
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OAUTH CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  redirectUris              String[]  @default([]) @map("redirect_uris")           // Allowed redirect URIs
  postLogoutRedirectUris    String[]  @default([]) @map("post_logout_redirect_uris") // Post-logout URIs
  allowedScopes             String[]  @default([]) @map("allowed_scopes")          // Permitted scopes
  grantTypes                String[]  @default([]) @map("grant_types")             // authorization_code, etc.
  tokenEndpointAuthMethod   String    @default("client_secret_basic") @map("token_endpoint_auth_method")
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  accessTokenTtlSeconds     Int       @default(3600) @map("access_token_ttl_seconds")   // 1 hour default
  refreshTokenTtlSeconds    Int       @default(604800) @map("refresh_token_ttl_seconds") // 7 days default
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  isActive                  Boolean   @default(true) @map("is_active")
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT TRAIL
  // ═══════════════════════════════════════════════════════════════════════════
  createdBySub              String?   @map("created_by_sub")        // Who created (subject ID)
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  syncedAt                  DateTime  @default(now()) @map("synced_at")
  createdAt                 DateTime  @default(now()) @map("created_at")
  updatedAt                 DateTime  @updatedAt @map("updated_at")
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES
  // ═══════════════════════════════════════════════════════════════════════════
  @@index([organizationId])
  @@index([clientId])
  @@index([isActive])
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE NAME
  // ═══════════════════════════════════════════════════════════════════════════
  @@map("av_applications")
}
```

---

## SSO Provider Model

```prisma
model SsoProvider {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  id                  String    @id                           // AuthVital SSO provider ID
  organizationId      String    @map("organization_id")       // Parent organization
  organization        Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  providerType        String    @map("provider_type")         // google, microsoft, okta, saml, oidc
  displayName         String    @map("display_name")          // Display name for login UI
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PROVIDER CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  clientId            String?   @map("client_id")             // OAuth client ID (if applicable)
  issuer              String?                                 // OIDC issuer URL
  authorizationEndpoint String? @map("authorization_endpoint") // OAuth authorization URL
  tokenEndpoint       String?   @map("token_endpoint")        // OAuth token URL
  userinfoEndpoint    String?   @map("userinfo_endpoint")     // OIDC userinfo URL
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DOMAIN CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  domains             String[]  @default([])                  // Email domains that trigger this SSO
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ATTRIBUTE MAPPING (stored as JSON)
  // ═══════════════════════════════════════════════════════════════════════════
  attributeMapping    Json      @default("{}") @map("attribute_mapping") // Map provider claims to AuthVital
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  isEnabled           Boolean   @default(true) @map("is_enabled")
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT TRAIL
  // ═══════════════════════════════════════════════════════════════════════════
  createdBySub        String?   @map("created_by_sub")        // Who created (subject ID)
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  syncedAt            DateTime  @default(now()) @map("synced_at")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES
  // ═══════════════════════════════════════════════════════════════════════════
  @@index([organizationId])
  @@index([providerType])
  @@index([isEnabled])
  
  // ═══════════════════════════════════════════════════════════════════════════
  // UNIQUE CONSTRAINT (one provider type per org)
  // ═══════════════════════════════════════════════════════════════════════════
  @@unique([organizationId, providerType])
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE NAME
  // ═══════════════════════════════════════════════════════════════════════════
  @@map("av_sso_providers")
}
```

---

## Optional: Audit Log Model

For compliance requirements, you may want to track all organization changes:

```prisma
model OrganizationAuditLog {
  id              String   @id @default(cuid())
  organizationId  String   @map("organization_id")
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT DATA
  // ═══════════════════════════════════════════════════════════════════════════
  eventType       String   @map("event_type")        // tenant.created, application.updated, etc.
  entityType      String   @map("entity_type")       // organization, application, sso_provider
  entityId        String   @map("entity_id")         // ID of the affected entity
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHANGE DATA
  // ═══════════════════════════════════════════════════════════════════════════
  changedFields   String[] @default([]) @map("changed_fields")  // Fields that changed
  previousValues  Json     @default("{}") @map("previous_values") // Previous field values
  newValues       Json     @default("{}") @map("new_values")      // New field values
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ACTOR
  // ═══════════════════════════════════════════════════════════════════════════
  changedBySub    String?  @map("changed_by_sub")    // Who made the change
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TIMESTAMP
  // ═══════════════════════════════════════════════════════════════════════════
  createdAt       DateTime @default(now()) @map("created_at")
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES
  // ═══════════════════════════════════════════════════════════════════════════
  @@index([organizationId])
  @@index([eventType])
  @@index([entityType, entityId])
  @@index([changedBySub])
  @@index([createdAt])
  
  @@map("av_organization_audit_logs")
}
```

---

## Field Mapping Reference

How schema fields map to AuthVital webhook data:

### Organization Fields

| Schema Field | Webhook Field | Description |
|--------------|---------------|-------------|
| `id` | `tenant_id` | AuthVital tenant identifier |
| `name` | `name` | Display name |
| `slug` | `slug` | URL-safe identifier |
| `plan` | `plan` | Subscription plan |
| `allowSignups` | `settings.allow_signups` | Self-signup enabled |
| `requireMfa` | `settings.require_mfa` | MFA required for all |
| `allowedEmailDomains` | `settings.allowed_email_domains` | Domain restrictions |
| `sessionLifetimeMinutes` | `settings.session_lifetime_minutes` | Session duration |
| `passwordPolicy` | `settings.password_policy` | Password requirements |
| `status` | Derived from event type | active, suspended |
| `createdBySub` | `created_by_sub` | Creator subject ID |

### Application Fields

| Schema Field | Webhook Field | Description |
|--------------|---------------|-------------|
| `id` | `application_id` | AuthVital app ID |
| `organizationId` | `tenant_id` | Parent tenant |
| `name` | `name` | Display name |
| `description` | `description` | App description |
| `clientId` | `client_id` | OAuth client ID |
| `applicationType` | `application_type` | web, spa, native, machine |
| `redirectUris` | `config.redirect_uris` | OAuth redirect URIs |
| `allowedScopes` | `config.allowed_scopes` | Permitted scopes |
| `grantTypes` | `config.grant_types` | OAuth grant types |
| `accessTokenTtlSeconds` | `config.access_token_ttl_seconds` | Token lifetime |

### SSO Provider Fields

| Schema Field | Webhook Field | Description |
|--------------|---------------|-------------|
| `id` | `provider_id` | AuthVital provider ID |
| `organizationId` | `tenant_id` | Parent tenant |
| `providerType` | `provider_type` | google, okta, saml, etc. |
| `displayName` | `display_name` | Login UI label |
| `clientId` | `config.client_id` | OAuth client ID |
| `domains` | `config.domains` | Trigger domains |
| `attributeMapping` | `config.attribute_mapping` | Claim mapping |
| `isEnabled` | `is_enabled` | SSO active |

---

## Running Migrations

After adding the schema:

```bash
# Generate migration
npx prisma migrate dev --name add-organization-sync

# Generate Prisma client
npx prisma generate
```

!!! tip "Combine with Identity Sync"
    If you're using both Identity Sync and Organization Sync, you can add all models in a single migration:
    
    ```bash
    npx prisma migrate dev --name add-authvital-sync
    ```

---

## Related Documentation

- [Organization Sync Overview](./index.md)
- [Event Details](./events.md)
- [Use Cases](./use-cases.md)
- [Identity Sync Schema](../identity-sync/prisma-schema.md)
