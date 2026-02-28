# Organization Sync Events

> Complete reference for all organization-level webhook events with TypeScript types and JSON payload examples.

**See also:** [Organization Sync Overview](./index.md) | [Webhooks Guide](../webhooks.md)

---

## Tenant Events

Tenant events fire when organizations are created, modified, or removed from AuthVital.

### TypeScript Types

```typescript
interface TenantSettings {
  allow_signups: boolean;                    // Whether self-signup is enabled
  require_mfa: boolean;                      // Whether MFA is required for all users
  allowed_email_domains: string[];           // Restrict signups to specific domains
  session_lifetime_minutes: number;          // Session duration
  password_policy: 'standard' | 'strict';    // Password requirements
}

interface TenantData {
  tenant_id: string;                         // Unique tenant identifier
  name: string;                              // Display name
  slug: string;                              // URL-safe identifier
  plan: 'free' | 'starter' | 'pro' | 'enterprise'; // Subscription plan
  settings: TenantSettings;                  // Tenant configuration
}

interface TenantCreatedData extends TenantData {
  created_by_sub: string;                    // Subject ID of creator
  created_at: string;                        // ISO timestamp
}

interface TenantUpdatedData extends TenantData {
  changed_fields: string[];                  // Fields that changed
  previous_values: Record<string, unknown>;  // Previous field values
  updated_by_sub: string;                    // Subject ID of updater
}

interface TenantDeletedData {
  tenant_id: string;
  name: string;
  slug: string;
  deleted_by_sub: string;
  deleted_at: string;
}

interface TenantSuspendedData extends TenantData {
  suspended_by_sub: string;
  suspended_at: string;
  reason?: string;
}

// Event types
type TenantCreatedEvent = BaseEvent<'tenant.created', TenantCreatedData>;
type TenantUpdatedEvent = BaseEvent<'tenant.updated', TenantUpdatedData>;
type TenantDeletedEvent = BaseEvent<'tenant.deleted', TenantDeletedData>;
type TenantSuspendedEvent = BaseEvent<'tenant.suspended', TenantSuspendedData>;
```

---

### `tenant.created`

Fires when a new tenant (organization) is provisioned in AuthVital.

```json
{
  "id": "evt_01HQTNT001ABC",
  "type": "tenant.created",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_acme123",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "plan": "pro",
    "created_by_sub": "usr_founder001",
    "created_at": "2024-01-15T10:00:00.000Z",
    "settings": {
      "allow_signups": true,
      "require_mfa": false,
      "allowed_email_domains": ["acme.com", "acme.io"],
      "session_lifetime_minutes": 480,
      "password_policy": "standard"
    }
  }
}
```

**Handler behavior:**

```typescript
// Handler creates organization record
await prisma.organization.create({
  data: {
    id: 'tnt_acme123',
    name: 'Acme Corporation',
    slug: 'acme-corp',
    plan: 'pro',
    createdBySub: 'usr_founder001',
    allowSignups: true,
    requireMfa: false,
    allowedEmailDomains: ['acme.com', 'acme.io'],
    sessionLifetimeMinutes: 480,
    passwordPolicy: 'standard',
    status: 'active',
    syncedAt: new Date(),
  },
});
```

---

### `tenant.updated`

Fires when tenant settings or plan changes. Includes `changed_fields` and `previous_values` for audit trails.

```json
{
  "id": "evt_01HQTNT002DEF",
  "type": "tenant.updated",
  "timestamp": "2024-01-20T14:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_acme123",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "plan": "enterprise",
    "changed_fields": ["plan", "settings.require_mfa"],
    "previous_values": {
      "plan": "pro",
      "settings.require_mfa": false
    },
    "updated_by_sub": "usr_admin001",
    "settings": {
      "allow_signups": true,
      "require_mfa": true,
      "allowed_email_domains": ["acme.com", "acme.io"],
      "session_lifetime_minutes": 480,
      "password_policy": "strict"
    }
  }
}
```

**Handler behavior:**

```typescript
// Handler updates changed fields and logs audit entry
await prisma.organization.update({
  where: { id: 'tnt_acme123' },
  data: {
    plan: 'enterprise',
    requireMfa: true,
    passwordPolicy: 'strict',
    syncedAt: new Date(),
  },
});

// Optional: Create audit log entry
await prisma.organizationAuditLog.create({
  data: {
    organizationId: 'tnt_acme123',
    eventType: 'tenant.updated',
    changedFields: ['plan', 'settings.require_mfa'],
    previousValues: { plan: 'pro', 'settings.require_mfa': false },
    changedBySub: 'usr_admin001',
  },
});
```

!!! tip "Billing Integration"
    The `tenant.updated` event with `plan` in `changed_fields` is perfect for syncing subscription changes to Stripe or your billing system. See [Billing Use Case](./use-cases.md#billing-integration).

---

### `tenant.deleted`

Fires when a tenant is permanently removed from AuthVital.

```json
{
  "id": "evt_01HQTNT003GHI",
  "type": "tenant.deleted",
  "timestamp": "2024-02-01T09:00:00.000Z",
  "tenant_id": "tnt_oldcorp456",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_oldcorp456",
    "name": "Old Corp Inc",
    "slug": "old-corp",
    "deleted_by_sub": "usr_superadmin001",
    "deleted_at": "2024-02-01T09:00:00.000Z"
  }
}
```

**Handler behavior:**

```typescript
// Handler deletes organization (cascades to apps and SSO providers)
await prisma.organization.delete({
  where: { id: 'tnt_oldcorp456' },
});
```

!!! warning "Cascade Deletion"
    When you delete an organization, the Prisma schema cascades the deletion to related `Application` and `SsoProvider` records. Ensure this matches your data retention requirements.

---

### `tenant.suspended`

Fires when a tenant is deactivated (soft disable). Users cannot authenticate but data is preserved.

```json
{
  "id": "evt_01HQTNT004JKL",
  "type": "tenant.suspended",
  "timestamp": "2024-01-25T16:00:00.000Z",
  "tenant_id": "tnt_suspended789",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_suspended789",
    "name": "Suspended Company",
    "slug": "suspended-co",
    "plan": "starter",
    "suspended_by_sub": "usr_superadmin001",
    "suspended_at": "2024-01-25T16:00:00.000Z",
    "reason": "Payment failed after 3 retry attempts",
    "settings": {
      "allow_signups": false,
      "require_mfa": false,
      "allowed_email_domains": [],
      "session_lifetime_minutes": 480,
      "password_policy": "standard"
    }
  }
}
```

**Handler behavior:**

```typescript
// Handler sets status to suspended
await prisma.organization.update({
  where: { id: 'tnt_suspended789' },
  data: {
    status: 'suspended',
    suspendedAt: new Date('2024-01-25T16:00:00.000Z'),
    suspendedBySub: 'usr_superadmin001',
    suspendedReason: 'Payment failed after 3 retry attempts',
    syncedAt: new Date(),
  },
});
```

---

## Application Events

Application events fire when OAuth applications are created, modified, or removed from a tenant.

### TypeScript Types

```typescript
interface ApplicationConfig {
  redirect_uris: string[];                   // Allowed redirect URIs
  post_logout_redirect_uris: string[];       // Allowed post-logout URIs
  allowed_scopes: string[];                  // Permitted OAuth scopes
  grant_types: ('authorization_code' | 'refresh_token' | 'client_credentials')[];
  token_endpoint_auth_method: 'client_secret_basic' | 'client_secret_post' | 'none';
  access_token_ttl_seconds: number;          // Access token lifetime
  refresh_token_ttl_seconds: number;         // Refresh token lifetime
}

interface ApplicationData {
  application_id: string;                    // Unique application ID
  tenant_id: string;                         // Parent tenant ID
  name: string;                              // Display name
  description?: string;                      // Optional description
  client_id: string;                         // OAuth client ID
  application_type: 'web' | 'spa' | 'native' | 'machine';
  config: ApplicationConfig;
  is_active: boolean;
}

interface ApplicationCreatedData extends ApplicationData {
  created_by_sub: string;
  created_at: string;
}

interface ApplicationUpdatedData extends ApplicationData {
  changed_fields: string[];
  previous_values: Record<string, unknown>;
  updated_by_sub: string;
}

interface ApplicationDeletedData {
  application_id: string;
  tenant_id: string;
  name: string;
  client_id: string;
  deleted_by_sub: string;
  deleted_at: string;
}

// Event types
type ApplicationCreatedEvent = BaseEvent<'application.created', ApplicationCreatedData>;
type ApplicationUpdatedEvent = BaseEvent<'application.updated', ApplicationUpdatedData>;
type ApplicationDeletedEvent = BaseEvent<'application.deleted', ApplicationDeletedData>;
```

---

### `application.created`

Fires when a new OAuth application is registered to a tenant.

```json
{
  "id": "evt_01HQAPP001ABC",
  "type": "application.created",
  "timestamp": "2024-01-15T11:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_dashboard456",
  "data": {
    "application_id": "app_dashboard456",
    "tenant_id": "tnt_acme123",
    "name": "Acme Dashboard",
    "description": "Main customer dashboard",
    "client_id": "acme_dashboard_prod",
    "application_type": "spa",
    "is_active": true,
    "created_by_sub": "usr_admin001",
    "created_at": "2024-01-15T11:00:00.000Z",
    "config": {
      "redirect_uris": [
        "https://dashboard.acme.com/callback",
        "http://localhost:3000/callback"
      ],
      "post_logout_redirect_uris": [
        "https://dashboard.acme.com"
      ],
      "allowed_scopes": ["openid", "profile", "email"],
      "grant_types": ["authorization_code", "refresh_token"],
      "token_endpoint_auth_method": "none",
      "access_token_ttl_seconds": 3600,
      "refresh_token_ttl_seconds": 604800
    }
  }
}
```

**Handler behavior:**

```typescript
// Handler creates application record
await prisma.application.create({
  data: {
    id: 'app_dashboard456',
    organizationId: 'tnt_acme123',
    name: 'Acme Dashboard',
    description: 'Main customer dashboard',
    clientId: 'acme_dashboard_prod',
    applicationType: 'spa',
    isActive: true,
    createdBySub: 'usr_admin001',
    redirectUris: [
      'https://dashboard.acme.com/callback',
      'http://localhost:3000/callback',
    ],
    postLogoutRedirectUris: ['https://dashboard.acme.com'],
    allowedScopes: ['openid', 'profile', 'email'],
    grantTypes: ['authorization_code', 'refresh_token'],
    tokenEndpointAuthMethod: 'none',
    accessTokenTtlSeconds: 3600,
    refreshTokenTtlSeconds: 604800,
    syncedAt: new Date(),
  },
});
```

---

### `application.updated`

Fires when application configuration changes (redirect URIs, scopes, etc.).

```json
{
  "id": "evt_01HQAPP002DEF",
  "type": "application.updated",
  "timestamp": "2024-01-18T15:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_dashboard456",
  "data": {
    "application_id": "app_dashboard456",
    "tenant_id": "tnt_acme123",
    "name": "Acme Dashboard",
    "description": "Main customer dashboard",
    "client_id": "acme_dashboard_prod",
    "application_type": "spa",
    "is_active": true,
    "changed_fields": ["config.redirect_uris", "config.allowed_scopes"],
    "previous_values": {
      "config.redirect_uris": [
        "https://dashboard.acme.com/callback",
        "http://localhost:3000/callback"
      ],
      "config.allowed_scopes": ["openid", "profile", "email"]
    },
    "updated_by_sub": "usr_admin001",
    "config": {
      "redirect_uris": [
        "https://dashboard.acme.com/callback",
        "https://staging.dashboard.acme.com/callback",
        "http://localhost:3000/callback"
      ],
      "post_logout_redirect_uris": [
        "https://dashboard.acme.com"
      ],
      "allowed_scopes": ["openid", "profile", "email", "offline_access"],
      "grant_types": ["authorization_code", "refresh_token"],
      "token_endpoint_auth_method": "none",
      "access_token_ttl_seconds": 3600,
      "refresh_token_ttl_seconds": 604800
    }
  }
}
```

**Handler behavior:**

```typescript
// Handler updates changed configuration
await prisma.application.update({
  where: { id: 'app_dashboard456' },
  data: {
    redirectUris: [
      'https://dashboard.acme.com/callback',
      'https://staging.dashboard.acme.com/callback',
      'http://localhost:3000/callback',
    ],
    allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
    syncedAt: new Date(),
  },
});
```

---

### `application.deleted`

Fires when an application is removed from a tenant.

```json
{
  "id": "evt_01HQAPP003GHI",
  "type": "application.deleted",
  "timestamp": "2024-02-01T10:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_legacy789",
  "data": {
    "application_id": "app_legacy789",
    "tenant_id": "tnt_acme123",
    "name": "Legacy App",
    "client_id": "acme_legacy_deprecated",
    "deleted_by_sub": "usr_admin001",
    "deleted_at": "2024-02-01T10:00:00.000Z"
  }
}
```

**Handler behavior:**

```typescript
// Handler deletes application record
await prisma.application.delete({
  where: { id: 'app_legacy789' },
});
```

---

## SSO Events

SSO events fire when Single Sign-On providers are configured, modified, or removed from a tenant.

### TypeScript Types

```typescript
interface SsoProviderConfig {
  client_id: string;                        // OAuth client ID for the provider
  issuer?: string;                          // OIDC issuer URL (for OIDC/SAML)
  authorization_endpoint?: string;          // OAuth authorization URL
  token_endpoint?: string;                  // OAuth token URL
  userinfo_endpoint?: string;               // OIDC userinfo URL
  domains: string[];                        // Email domains that trigger this SSO
  attribute_mapping: Record<string, string>; // Map provider claims to AuthVital claims
}

interface SsoProviderData {
  provider_id: string;                      // Unique provider ID
  tenant_id: string;                        // Parent tenant ID
  provider_type: 'google' | 'microsoft' | 'okta' | 'saml' | 'oidc';
  display_name: string;                     // Display name for login UI
  is_enabled: boolean;                      // Whether SSO is active
  config: SsoProviderConfig;
}

interface SsoProviderAddedData extends SsoProviderData {
  created_by_sub: string;
  created_at: string;
}

interface SsoProviderUpdatedData extends SsoProviderData {
  changed_fields: string[];
  previous_values: Record<string, unknown>;
  updated_by_sub: string;
}

interface SsoProviderRemovedData {
  provider_id: string;
  tenant_id: string;
  provider_type: string;
  display_name: string;
  removed_by_sub: string;
  removed_at: string;
}

// Event types
type SsoProviderAddedEvent = BaseEvent<'sso.provider_added', SsoProviderAddedData>;
type SsoProviderUpdatedEvent = BaseEvent<'sso.provider_updated', SsoProviderUpdatedData>;
type SsoProviderRemovedEvent = BaseEvent<'sso.provider_removed', SsoProviderRemovedData>;
```

---

### `sso.provider_added`

Fires when an SSO provider is configured for a tenant.

```json
{
  "id": "evt_01HQSSO001ABC",
  "type": "sso.provider_added",
  "timestamp": "2024-01-16T09:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "provider_id": "sso_google001",
    "tenant_id": "tnt_acme123",
    "provider_type": "google",
    "display_name": "Sign in with Google",
    "is_enabled": true,
    "created_by_sub": "usr_admin001",
    "created_at": "2024-01-16T09:00:00.000Z",
    "config": {
      "client_id": "123456789.apps.googleusercontent.com",
      "domains": ["acme.com"],
      "attribute_mapping": {
        "email": "email",
        "given_name": "given_name",
        "family_name": "family_name",
        "picture": "picture"
      }
    }
  }
}
```

**Handler behavior:**

```typescript
// Handler creates SSO provider record
await prisma.ssoProvider.create({
  data: {
    id: 'sso_google001',
    organizationId: 'tnt_acme123',
    providerType: 'google',
    displayName: 'Sign in with Google',
    isEnabled: true,
    createdBySub: 'usr_admin001',
    clientId: '123456789.apps.googleusercontent.com',
    domains: ['acme.com'],
    attributeMapping: {
      email: 'email',
      given_name: 'given_name',
      family_name: 'family_name',
      picture: 'picture',
    },
    syncedAt: new Date(),
  },
});
```

---

### `sso.provider_updated`

Fires when SSO provider settings change.

```json
{
  "id": "evt_01HQSSO002DEF",
  "type": "sso.provider_updated",
  "timestamp": "2024-01-20T11:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "provider_id": "sso_google001",
    "tenant_id": "tnt_acme123",
    "provider_type": "google",
    "display_name": "Sign in with Google Workspace",
    "is_enabled": true,
    "changed_fields": ["display_name", "config.domains"],
    "previous_values": {
      "display_name": "Sign in with Google",
      "config.domains": ["acme.com"]
    },
    "updated_by_sub": "usr_admin001",
    "config": {
      "client_id": "123456789.apps.googleusercontent.com",
      "domains": ["acme.com", "acme.io"],
      "attribute_mapping": {
        "email": "email",
        "given_name": "given_name",
        "family_name": "family_name",
        "picture": "picture"
      }
    }
  }
}
```

**Handler behavior:**

```typescript
// Handler updates changed SSO configuration
await prisma.ssoProvider.update({
  where: { id: 'sso_google001' },
  data: {
    displayName: 'Sign in with Google Workspace',
    domains: ['acme.com', 'acme.io'],
    syncedAt: new Date(),
  },
});
```

---

### `sso.provider_removed`

Fires when an SSO provider is disconnected from a tenant.

```json
{
  "id": "evt_01HQSSO003GHI",
  "type": "sso.provider_removed",
  "timestamp": "2024-02-01T14:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "provider_id": "sso_okta001",
    "tenant_id": "tnt_acme123",
    "provider_type": "okta",
    "display_name": "Okta SSO",
    "removed_by_sub": "usr_admin001",
    "removed_at": "2024-02-01T14:00:00.000Z"
  }
}
```

**Handler behavior:**

```typescript
// Handler deletes SSO provider record
await prisma.ssoProvider.delete({
  where: { id: 'sso_okta001' },
});
```

---

## Event Summary

| Event | Affects | Key Fields |
|-------|---------|------------|
| `tenant.created` | New organization | All tenant fields, `created_by_sub` |
| `tenant.updated` | Existing organization | `changed_fields`, `previous_values` |
| `tenant.deleted` | Organization record | Deletes record (cascades) |
| `tenant.suspended` | Organization status | `status = 'suspended'`, `reason` |
| `application.created` | New application | All app config, `created_by_sub` |
| `application.updated` | Existing application | `changed_fields`, `previous_values` |
| `application.deleted` | Application record | Deletes record |
| `sso.provider_added` | New SSO provider | Provider config, `domains` |
| `sso.provider_updated` | Existing SSO provider | `changed_fields`, `previous_values` |
| `sso.provider_removed` | SSO provider record | Deletes record |

---

## Related Documentation

- [Organization Sync Overview](./index.md)
- [Prisma Schema](./prisma-schema.md)
- [Use Cases](./use-cases.md)
- [Webhook Event Types](../webhooks-events.md) - All webhook events
