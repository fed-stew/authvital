# Application Setup Guide

> Step-by-step guide for creating and configuring OAuth applications.

## Overview

An **Application** in AuthVital is a **container** — a product that users
authenticate with. The container owns branding, roles/permissions, licensing,
access mode, and webhooks. It does **not** carry OAuth credentials directly.

Instead, you add one or more **credentials** (`ApplicationClient` records) to
the app. The **type — `SPA` or `MACHINE` — is a property of the credential**,
not of the app:

- **SPA** credential → browser/user login (Authorization Code + PKCE, public,
  no secret).
- **MACHINE** credential → server-to-server (`client_credentials`, confidential,
  has a secret).

> **One app, one-or-more credentials (Entra-style).** Think of the App like a
> Microsoft Entra *app registration*: a single container that can hold more than
> one credential. An app may hold **at most one SPA** and **at most one MACHINE**
> credential (≤1 of each), and a given `clientId` is never both.

### The canonical example: a BFF (full-stack app)

A full-stack app using the **Backend-for-Frontend** pattern is **one App** with
**two credentials**:

| Credential | Type | Used for |
|------------|------|----------|
| `web-bff-client-id` | `SPA` | User login in the browser (Authorization Code + PKCE) |
| `local-machine-client-id` | `MACHINE` | Server-to-server integration calls (`client_credentials`) |

Same product, same roles/licensing/branding — two credentials for two different
token flows. See the [OAuth Flow concepts](../concepts/oauth-flow.md) for how the
two tokens relate.

## Creating an Application

Creating an app now means **creating the container and its first credential in
one step**, then optionally **adding more credentials** later.

### Via Admin Panel

1. Navigate to **Applications** → **Create New**
2. Fill in the **container** details:

| Field | Description | Example |
|-------|-------------|--------|
| Name | Display name | "Project Manager" |
| Slug | URL-safe identifier | `project-manager` |
| Description | Optional description | "Manage your team's projects" |

3. Add the **first credential**, choosing its **type** (`SPA` or `MACHINE`) and
   its credential-level settings (redirect URIs, token TTLs, etc.).
4. Click **Create**
5. To make it a BFF, open the app and **Add credential** of the other type — e.g.
   add a `MACHINE` credential to an app that already has a `SPA` one.

### Via API

!!! warning "There is no `authvital.admin.createApplication(...)` SDK method"
    The `@authvital/server` SDK has **no** `admin` namespace and cannot create
    applications. Its `client.integration.*` surface is for runtime
    membership/permission/license operations, not for provisioning OAuth clients.
    **Create applications in the Admin Panel** (the "Via Admin Panel" steps
    above). The snippet below shows the intended shape only — it does **not** map
    to a real SDK call.

The super-admin Admin API creates the **container plus its first credential** in
a single `POST /applications` call. The payload carries the container fields
(name, slug, description, branding, licensing, access mode, webhooks) plus a
nested `client` object (`AddClientInput`) describing the first credential:

```typescript
// ⚠️ Illustrative only — `authvital.admin.createApplication` does not exist.
// Shape mirrors POST /api/super-admin/applications (admin panel/API only).
const app = await authvital.admin.createApplication({
  // Container fields
  name: 'Project Manager',
  slug: 'project-manager',
  description: 'Manage your team projects',
  // First credential (type chosen here, not on the container)
  client: {
    type: 'SPA',
    redirectUris: ['https://app.example.com/callback'],
    postLogoutRedirectUris: ['https://app.example.com'],
  },
});

// The created SPA credential exposes the clientId
console.log('Client ID:', app.clients[0].clientId);
```

**Managing credentials on an existing app** (super-admin Admin API):

| Endpoint | Purpose |
|----------|---------|
| `POST /applications/:id/clients` | Add another credential (e.g. add a `MACHINE` credential to make a BFF) |
| `PATCH /applications/:id/clients/:clientId` | Update a credential's settings |
| `DELETE /applications/:id/clients/:clientId` | Remove a credential |
| `POST /applications/:id/clients/:clientId/rotate-secret` | Rotate a `MACHINE` secret |
| `GET/POST/DELETE /applications/:id/clients/:clientId/tenant-grants` | Manage per-tenant M2M grants |

!!! info "One-time plaintext secret"
    Adding, creating, or rotating a **MACHINE** credential returns its
    `clientSecret` **once, in plaintext** — store it immediately, it's hashed at
    rest and never shown again. A **SPA** credential never has a secret.

## Credential Types

Type is chosen **per credential** (`ApplicationClient`), not per app. An app may
hold one of each; a BFF holds both.

### SPA (Single Page Application)

A credential for browser-based user login:

- **No client secret** (public client)
- **Requires PKCE** for security
- Uses the **authorization_code** grant
- Tokens stored in memory/cookies

```typescript
// client: AddClientInput
{
  type: 'SPA',
  // No clientSecret generated (public client)
  redirectUris: ['https://app.example.com/callback'],
}
```

### MACHINE (Server-to-Server)

A credential for backend services and cron jobs:

- **Has client secret** (confidential client) — returned once at
  create/add/rotate, hashed at rest
- Uses the **client_credentials** grant
- Tokens used for M2M communication (deny-by-default; see
  [M2M Authorization](#m2m-authorization-machine-credentials))

```typescript
// client: AddClientInput
{
  type: 'MACHINE',
  // clientSecret returned once in plaintext at create/add/rotate
}
```

> **Both at once = a BFF.** Add a `SPA` credential for user login and a
> `MACHINE` credential for server-to-server, both under the same app. See the
> worked example in the [Overview](#the-canonical-example-a-bff-full-stack-app).

## OAuth Configuration

### Redirect URIs

Where users are sent after authentication:

```typescript
redirectUris: [
  'https://app.example.com/callback',
  'https://app.example.com/auth/callback',
  
  // Development
  'http://localhost:3000/callback',
  
  // Tenant placeholder (validates tenant exists)
  'https://{tenant}.app.example.com/callback',
]
```

**Best Practices:**
- Use specific URIs in production
- Avoid wildcards unless necessary
- Include development URIs separately

### Post-Logout Redirect URIs

Where users go after logging out:

```typescript
postLogoutRedirectUris: [
  'https://app.example.com',
  'https://app.example.com/goodbye',
]
```

### Allowed Web Origins

Origins allowed to make CORS requests to OAuth endpoints:

```typescript
allowedWebOrigins: [
  'https://app.example.com',
  'http://localhost:3000',
]
```

### Token Lifetimes

```typescript
{
  accessTokenTtl: 3600,    // 1 hour (default)
  refreshTokenTtl: 604800, // 7 days (default)
}
```

**Recommendations:**
- Access token: 15-60 minutes
- Refresh token: 7-30 days
- Shorter = more secure, more frequent refreshes

### Initiate Login URI

URL for third-party initiated login:

```typescript
{
  initiateLoginUri: 'https://{tenant}.app.example.com/login',
}
```

The `{tenant}` placeholder is replaced with the tenant's slug.

## Branding

Customize the login experience:

```typescript
{
  brandingName: 'Project Manager',         // Overrides app name on login
  brandingLogoUrl: 'https://cdn.../logo.png', // 200x50px recommended
  brandingIconUrl: 'https://cdn.../icon.png', // 64x64px (favicon)
  brandingPrimaryColor: '#6366f1',         // Buttons, links
  brandingBackgroundColor: '#f9fafb',      // Page background
  brandingAccentColor: '#4f46e5',          // Highlights
  brandingSupportUrl: 'https://support.example.com',
  brandingPrivacyUrl: 'https://example.com/privacy',
  brandingTermsUrl: 'https://example.com/terms',
}
```

## Defining Roles

Create roles for your application:

### Via Admin Panel

1. Go to **Application** → **Roles** tab
2. Click **Add Role**
3. Configure:
   - Name: "Administrator"
   - Slug: `admin`
   - Description: "Full application access"
   - Permissions: Select or enter permission strings

### Default Role

Mark one role as default - it's auto-assigned to new users:

```typescript
{
  name: 'Member',
  slug: 'member',
  isDefault: true,  // Auto-assign to new users
  permissions: ['projects:read', 'tasks:read', 'tasks:update'],
}
```

### Example Role Hierarchy

```typescript
const roles = [
  {
    name: 'Administrator',
    slug: 'admin',
    permissions: ['*'],  // Full access
  },
  {
    name: 'Manager',
    slug: 'manager',
    permissions: [
      'projects:*',
      'users:read',
      'users:invite',
      'reports:*',
    ],
  },
  {
    name: 'Member',
    slug: 'member',
    isDefault: true,
    permissions: [
      'projects:read',
      'tasks:*',
      'users:read',
    ],
  },
  {
    name: 'Viewer',
    slug: 'viewer',
    permissions: [
      'projects:read',
      'tasks:read',
      'users:read',
    ],
  },
];
```

## Licensing Configuration

### Licensing Mode

```typescript
{
  licensingMode: 'PER_SEAT',  // FREE, PER_SEAT, or TENANT_WIDE
}
```

### Defining License Types

1. Go to **Application** → **Licenses** tab
2. Click **Add License Type**
3. Configure:

```typescript
{
  name: 'Pro Plan',
  slug: 'pro',
  description: 'For growing teams',
  features: {
    'api-access': true,
    'advanced-reports': true,
    'sso': false,
    'audit-logs': false,
    'custom-branding': false,
  },
  displayOrder: 2,
}
```

### Defining Features

Define available features first:

```typescript
// Application settings
{
  availableFeatures: [
    { key: 'api-access', name: 'API Access', description: 'REST API access' },
    { key: 'sso', name: 'Single Sign-On', description: 'SAML/OIDC SSO' },
    { key: 'advanced-reports', name: 'Advanced Reports', description: 'Custom dashboards' },
    { key: 'audit-logs', name: 'Audit Logs', description: 'Activity tracking' },
    { key: 'custom-branding', name: 'Custom Branding', description: 'White-label' },
  ],
}
```

### Auto-Provisioning

```typescript
{
  autoProvisionOnSignup: true,       // Create subscription on tenant signup
  defaultLicenseTypeId: 'lt-free',   // Which license type
  defaultSeatCount: 5,               // Initial seats (PER_SEAT mode)
  autoGrantToOwner: true,            // Owner gets first seat
}
```

## Access Control

### Access Mode

```typescript
{
  accessMode: 'AUTOMATIC',  // Who gets access
}
```

| Mode | Behavior |
|------|----------|
| `AUTOMATIC` | All tenant members get access |
| `MANUAL_AUTO_GRANT` | New members get access by default |
| `MANUAL_NO_DEFAULT` | Must explicitly grant access |
| `DISABLED` | No new grants (existing preserved) |

## M2M Authorization (MACHINE credentials)

> Applies only to a **MACHINE credential** that calls the Integration API
> (`/api/integration/*`) via the `client_credentials` grant. These settings live
> on the **MACHINE credential** of an app — a sibling SPA credential (used for
> `authorization_code` + PKCE login) is unaffected.

The Integration API is **deny-by-default**: a valid M2M token is not enough. A
MACHINE credential must additionally be granted the right **scopes** and be
**authorized for the tenants** it acts on. The exact scope/tenant rules and the
errors a caller may see are documented in
[OAuth Endpoints: Integration API authorization](../api/oauth-endpoints.md#integration-api-authorization-deny-by-default)
— this section covers how to *configure* them.

!!! warning "Newly-migrated MACHINE clients are denied by default"
    After upgrading, existing MACHINE clients receive empty-scope tokens and
    `403`s until you configure Allowed scopes **and** either
    trusted-for-all-tenants or per-tenant grants below.

### Via Admin Panel

Go to **Super-Admin → Applications → *(a MACHINE app)* → Settings → "M2M
Authorization" card**, which exposes:

| Setting | Purpose |
|---------|---------|
| **Trusted for all tenants** (switch) | Grants access to *every* tenant. Use for first-party operator backends. Required for cross-tenant endpoints (`user-tenants`, `user-mfa-status`, `application-memberships` without a `tenantId`). |
| **Allowed scopes** (toggles) | Enable `integration:read` (reads + permission/feature/seat checks) and/or `integration:write` (mutations). Requesting a scope outside this set returns `400 invalid_scope`. |
| **Authorized tenants** (grants manager) | When *not* trusted-for-all, list the specific tenants the client may act on. |

### Via seed YAML

M2M settings live on the **MACHINE credential** in the app's `credentials:`
list. Each app is a container with a nested `credentials:` list (one entry per
credential, each with its own `type` and fields):

```yaml
applications:
  - slug: backend-api
    name: Backend API
    credentials:
      - type: MACHINE
        m2m_trusted_all_tenants: true        # access to every tenant
        allowed_scopes:                      # gate integration endpoints
          - integration:read
          - integration:write
        # For a scoped (non-trusted) credential, omit trusted-all and list grants:
        # m2m_trusted_all_tenants: false
        # m2m_tenant_grants:
        #   - acme
        #   - globex
```

- `m2m_trusted_all_tenants: true|false` — the trusted-for-all-tenants switch.
- `allowed_scopes: [integration:read, integration:write]` — the allow-list
  validated at the token endpoint.
- `m2m_tenant_grants: [<tenant-slug>, ...]` — explicit per-tenant grants (used
  when not trusted for all tenants).

!!! note "Old flat shape still accepted"
    A legacy entry with `type:` and credential fields at the app level (no
    `credentials:` list) is still accepted — it's normalized into a single
    credential of that type. New seeds should prefer the nested `credentials:`
    form so an app can declare both a SPA and a MACHINE credential (a BFF).

#### BFF example (one app, two credentials)

The bundled Web BFF is a single app holding both credential types:

```yaml
applications:
  - slug: web-bff
    name: Web BFF
    credentials:
      - type: SPA                            # browser user login (PKCE)
        client_id: web-bff-client-id
        redirect_uris:
          - http://localhost:3000/callback
      - type: MACHINE                        # server-to-server integration
        client_id: local-machine-client-id
        m2m_trusted_all_tenants: true
        allowed_scopes:
          - integration:read
          - integration:write
```

## Webhooks

### Per-Application Webhooks

Configure webhooks for this application's events:

```typescript
{
  webhookUrl: 'https://api.example.com/webhooks/authvital',
  webhookEnabled: true,
  webhookEvents: [
    'subject.created',
    'subject.updated',
    'member.joined',
    'license.assigned',
  ],
}
```

## Complete Example

> ⚠️ Illustrative shape only — as noted above, `authvital.admin.createApplication`
> is **not** a real SDK method. Provision applications via the Admin Panel.

```typescript
await authvital.admin.createApplication({
  // ── Container fields ──
  name: 'Project Manager Pro',
  slug: 'pm-pro',
  description: 'Enterprise project management',

  // Branding
  brandingName: 'PM Pro',
  brandingLogoUrl: 'https://cdn.example.com/pm-logo.png',
  brandingPrimaryColor: '#6366f1',
  brandingSupportUrl: 'https://support.example.com',
  brandingPrivacyUrl: 'https://example.com/privacy',
  brandingTermsUrl: 'https://example.com/terms',

  // Access
  accessMode: 'AUTOMATIC',

  // Licensing
  licensingMode: 'PER_SEAT',
  autoProvisionOnSignup: true,
  defaultSeatCount: 3,
  autoGrantToOwner: true,
  availableFeatures: [
    { key: 'api-access', name: 'API Access' },
    { key: 'sso', name: 'Single Sign-On' },
    { key: 'unlimited-projects', name: 'Unlimited Projects' },
  ],

  // Webhooks
  webhookUrl: 'https://api.example.com/webhooks/authvital',
  webhookEnabled: true,
  webhookEvents: ['subject.*', 'member.*', 'license.*'],

  // ── First credential (type + credential-level OAuth settings) ──
  client: {
    type: 'SPA',
    redirectUris: [
      'https://pm.example.com/callback',
      'https://{tenant}.pm.example.com/callback',
      'http://localhost:3000/callback',
    ],
    postLogoutRedirectUris: ['https://pm.example.com'],
    allowedWebOrigins: [
      'https://pm.example.com',
      'http://localhost:3000',
    ],
    accessTokenTtl: 1800,     // 30 minutes
    refreshTokenTtl: 1209600, // 14 days
  },
});

// Later, make it a BFF by adding a MACHINE credential:
//   POST /api/super-admin/applications/:id/clients  { type: 'MACHINE', ... }
// The response returns the one-time plaintext client secret.
```

## Disabling & Deleting Applications

### Disabling

Disabling an application is a reversible operation that immediately:
- Revokes all active user sessions (refresh tokens)
- Blocks new OAuth authorization requests
- Preserves all configuration, roles, and data

```typescript
// Via API
await fetch('/api/super-admin/applications/{id}/disable', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
});

// Response
{
  "success": true,
  "message": "Application \"Project Manager\" has been disabled. 42 active sessions were revoked.",
  "revokedSessions": 42
}
```

To re-enable:

```typescript
await fetch('/api/super-admin/applications/{id}/enable', {
  method: 'POST',
});
```

### Deleting

Deletion is **permanent and irreversible**. The application must be disabled first.

```typescript
// Step 1: Disable first
await fetch('/api/super-admin/applications/{id}/disable', { method: 'POST' });

// Step 2: Delete
await fetch('/api/super-admin/applications/{id}', { method: 'DELETE' });

// Response
{
  "success": true,
  "message": "Application deleted"
}
```

All associated data (roles, license types, subscriptions, tokens) is cascade-deleted.

## After Creation

### Get Credentials

Credentials belong to each **credential** on the app, not the container. After
creating an app (or adding a credential), note the values on that credential:

```typescript
// A SPA credential — public client, no secret
{
  type: 'SPA',
  clientId: 'a1b2c3d4-e5f6-...',      // Always generated
  clientSecret: null,                  // SPA never has a secret
}

// A MACHINE credential — confidential client
{
  type: 'MACHINE',
  clientId: 'f7g8h9i0-j1k2-...',
  clientSecret: 'secret_xyz...',       // Returned ONCE at create/add/rotate
}
```

A BFF app exposes **both** credentials — grab each `clientId` for its
respective flow (SPA for browser login, MACHINE for M2M).

### Create Roles

Add at least these roles:
1. **Admin** - Full access
2. **Member** (default) - Standard access
3. **Viewer** - Read-only (optional)

### Create License Types

If using licensing:
1. **Free** - Basic features
2. **Pro** - Enhanced features
3. **Enterprise** - All features

### Test the Integration

1. Create a test tenant
2. Register as a user
3. Test the OAuth flow
4. Verify roles and permissions work

---

## Related Documentation

- [Super Admin Guide](./super-admin.md)
- [OAuth Flow](../concepts/oauth-flow.md)
- [Licensing System](../concepts/licensing.md)
- [Access Control](../concepts/access-control.md)
