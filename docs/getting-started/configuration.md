# Configuration Reference

> Complete reference for all AuthVital environment variables and settings.

## Environment Variables

### Core Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes* | - | PostgreSQL connection string |
| `BASE_URL` | Yes | - | Public URL of AuthVital (no trailing slash) |
| `PORT` | No | `8000` | Server port |
| `NODE_ENV` | No | `development` | Environment (`development` or `production`) |

*Or use individual DB_* variables for Cloud SQL.

### Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SIGNING_KEY_SECRET` | Yes | - | 32-byte hex string (64 chars) for JWT signing |
| `COOKIE_SECURE` | No | `true` in prod | Set HTTPS-only cookies |
| `KEY_ROTATION_INTERVAL_SECONDS` | No | `604800` | JWT key rotation interval (7 days) |

**Generate a secure signing key:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: a1b2c3d4e5f6...
```

⚠️ **Warning**: Changing `SIGNING_KEY_SECRET` invalidates all existing tokens and sessions!

### Database (Cloud SQL)

When using Google Cloud SQL, configure individual components instead of `DATABASE_URL`:

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | Yes | Cloud SQL socket path or hostname |
| `DB_USERNAME` | Yes | Database username |
| `DB_PASSWORD` | Yes | Database password |
| `DB_DATABASE` | Yes | Database name |

The application constructs `DATABASE_URL` from these at startup.

### CORS

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGINS` | No | `BASE_URL` | Comma-separated allowed origins |

**Examples:**

```bash
# Single origin
CORS_ORIGINS=https://app.example.com

# Multiple origins
CORS_ORIGINS=https://app.example.com,https://admin.example.com

# Wildcard subdomain
CORS_ORIGINS=https://*.example.com

# Development (allow localhost)
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Email (SendGrid)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENDGRID_API_KEY` | No | - | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | No | - | Sender email address |
| `SENDGRID_FROM_NAME` | No | `AuthVital` | Sender name |

If not configured, emails are logged to console (useful for development).

### Bootstrap

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPER_ADMIN_EMAIL` | No | - | Email for initial super admin account |
| `DEFAULT_SUPER_ADMIN_PASSWORD` | No | - | Password for super admin (dev only!) |

When `SUPER_ADMIN_EMAIL` is set and no super admin exists:
1. Creates a super admin account
2. Sends password reset email (or logs to console if email not configured)

### Run Mode (Docker)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RUN_MODE` | No | `full` | Startup behavior in Docker |

**Run modes:**

| Mode | Behavior |
|------|----------|
| `full` | Run migrations + bootstrap, then start API |
| `production` | Start API only (migrations run separately) |
| `migration` | Run migrations + bootstrap, then exit |

## Application Settings (Instance)

These are configured in the admin panel or via API, stored in the database:

### Sign-up Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `allowSignUp` | boolean | `false` | Allow public sign-up |
| `autoCreateTenant` | boolean | `true` | Create tenant for new users |
| `allowGenericDomains` | boolean | `true` | Allow gmail.com, etc. |
| `allowAnonymousSignUp` | boolean | `false` | Allow accounts without email verification |
| `requiredUserFields` | string[] | `[]` | Required fields for signup |
| `defaultTenantRoleIds` | string[] | `[]` | Default roles for new members |

### Single-Tenant Mode

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `singleTenantMode` | boolean | `false` | Enable single-tenant mode |
| `defaultTenantId` | string | - | The single tenant ID |

When enabled:
- All signups auto-join the default tenant
- No tenant picker is shown
- Tokens are always tenant-scoped

### Branding (Instance Default)

| Setting | Type | Description |
|---------|------|-------------|
| `brandingName` | string | Display name on login pages |
| `brandingLogoUrl` | string | Logo URL (200x50px recommended) |
| `brandingIconUrl` | string | Icon URL (64x64px recommended) |
| `brandingPrimaryColor` | string | Primary color (hex, e.g., `#6366f1`) |
| `brandingBackgroundColor` | string | Background color or CSS gradient |
| `brandingAccentColor` | string | Accent/secondary color |
| `brandingSupportUrl` | string | Support/help link |
| `brandingPrivacyUrl` | string | Privacy policy link |
| `brandingTermsUrl` | string | Terms of service link |
| `initiateLoginUri` | string | Default login initiation URL |

### Security Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `superAdminMfaRequired` | boolean | `false` | Require MFA for super admins |

## Application Configuration

Each OAuth application has its own settings:

### OAuth Settings

| Setting | Type | Description |
|---------|------|-------------|
| `clientId` | string | OAuth client ID (auto-generated) |
| `clientSecret` | string | OAuth client secret (MACHINE type only) |
| `type` | enum | `SPA` or `MACHINE` |
| `redirectUris` | string[] | Allowed redirect URIs |
| `postLogoutRedirectUris` | string[] | Allowed post-logout URIs |
| `allowedWebOrigins` | string[] | Allowed CORS origins |
| `accessTokenTtl` | number | Access token lifetime (seconds, default: 3600) |
| `refreshTokenTtl` | number | Refresh token lifetime (seconds, default: 604800) |

### Redirect URI Patterns

AuthVital supports flexible redirect URI matching:

```
# Exact match
https://app.example.com/callback

# Wildcard subdomain
https://*.example.com/callback

# Tenant placeholder (validates tenant exists in DB)
https://{tenant}.example.com/callback

# Localhost for development
http://localhost:3000/callback
http://localhost:*/callback
```

### Licensing Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `licensingMode` | enum | `FREE` | `FREE`, `PER_SEAT`, or `TENANT_WIDE` |
| `defaultLicenseTypeId` | string | - | Default license type for new tenants |
| `defaultSeatCount` | number | `5` | Initial seats for new subscriptions |
| `autoProvisionOnSignup` | boolean | `false` | Auto-create subscription on tenant signup |
| `autoGrantToOwner` | boolean | `true` | Grant license to tenant owner |
| `allowMixedLicensing` | boolean | `false` | Allow multiple license types per tenant |
| `availableFeatures` | json | `[]` | Feature flag definitions |

### Access Control

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `accessMode` | enum | `AUTOMATIC` | How users get application access |

**Access modes:**

| Mode | Description |
|------|-------------|
| `AUTOMATIC` | All tenant members get access automatically |
| `MANUAL_AUTO_GRANT` | Manual control, new members get access by default |
| `MANUAL_NO_DEFAULT` | Manual control, new members need explicit grant |
| `DISABLED` | No new access grants (existing access preserved) |

### Application Branding

Each app can override instance branding:

| Setting | Type | Description |
|---------|------|-------------|
| `brandingName` | string | App display name |
| `brandingLogoUrl` | string | App logo |
| `brandingIconUrl` | string | App icon |
| `brandingPrimaryColor` | string | Primary color |
| `brandingBackgroundColor` | string | Background |
| `brandingAccentColor` | string | Accent color |
| `brandingSupportUrl` | string | Support link |
| `brandingPrivacyUrl` | string | Privacy policy |
| `brandingTermsUrl` | string | Terms of service |
| `initiateLoginUri` | string | Login initiation URL (supports `{tenant}` placeholder) |

### Webhook Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `webhookUrl` | string | - | Webhook endpoint URL |
| `webhookEnabled` | boolean | `false` | Enable webhooks |
| `webhookEvents` | string[] | `[]` | Events to subscribe to (empty = all) |

## Tenant Configuration

### MFA Policies

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `mfaPolicy` | enum | `OPTIONAL` | MFA requirement level |
| `mfaGracePeriodDays` | number | `7` | Days before enforcing MFA |

**MFA policies:**

| Policy | Description |
|--------|-------------|
| `OPTIONAL` | MFA available but not required |
| `REQUIRED` | All members must enable MFA immediately |
| `ENFORCED_AFTER_GRACE` | Required after grace period |

### SSO Configuration

| Setting | Type | Description |
|---------|------|-------------|
| `provider` | enum | `GOOGLE` or `MICROSOFT` |
| `enabled` | boolean | Enable this SSO provider |
| `clientId` | string | OAuth client ID (optional, uses instance default) |
| `clientSecret` | string | OAuth client secret (optional) |
| `enforced` | boolean | Disable password login when true |
| `allowedDomains` | string[] | Restrict SSO to specific email domains |

## Example Configurations

### Development

!!! warning "⚠️ Development Only - DO NOT use in production"
    The values below are for **local development only**:
    
    - `localdev123` - Example password, never use in production
    - `0123456789...` - Known key that would allow JWT forgery
    - `COOKIE_SECURE=false` - Only for local HTTP development
    
    **For production**, use the examples in the sections below with secrets from a secret manager.

```bash
# .env
DATABASE_URL=postgresql://authvital:localdev123@localhost:5432/authvital
BASE_URL=http://localhost:8000
PORT=8000
NODE_ENV=development
SIGNING_KEY_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
COOKIE_SECURE=false
SUPER_ADMIN_EMAIL=admin@localhost
```

### Production (Cloud Run)

```bash
# Set via Secret Manager / Cloud Run env vars
DB_HOST=/cloudsql/project:region:instance
DB_USERNAME=postgres
DB_PASSWORD=<from-secret-manager>
DB_DATABASE=authvital
BASE_URL=https://auth.yourcompany.com
NODE_ENV=production
SIGNING_KEY_SECRET=<from-secret-manager>
COOKIE_SECURE=true
CORS_ORIGINS=https://app.yourcompany.com,https://admin.yourcompany.com
SENDGRID_API_KEY=<from-secret-manager>
SENDGRID_FROM_EMAIL=noreply@yourcompany.com
```

### Production (Self-hosted)

```bash
# .env
DATABASE_URL=postgresql://authvital:securepassword@db:5432/authvital
BASE_URL=https://auth.yourcompany.com
PORT=8000
NODE_ENV=production
SIGNING_KEY_SECRET=<generate-secure-key>
COOKIE_SECURE=true
CORS_ORIGINS=https://app.yourcompany.com
SENDGRID_API_KEY=SG.xxxx
SENDGRID_FROM_EMAIL=noreply@yourcompany.com
SENDGRID_FROM_NAME=YourCompany
SUPER_ADMIN_EMAIL=admin@yourcompany.com
```

---

## Related Documentation

- [Installation & Deployment](./installation.md)
- [Architecture Overview](../concepts/architecture.md)
- [Security Best Practices](../security/best-practices/index.md)
