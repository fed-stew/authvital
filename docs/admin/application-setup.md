# Application Setup Guide

> Step-by-step guide for creating and configuring OAuth applications.

## Overview

An **Application** in AuthVital is an OAuth client that users can authenticate with. Each application has:

- OAuth credentials (client ID, optionally client secret)
- Redirect URIs for OAuth callbacks
- Branding customization
- Role and permission definitions
- Licensing configuration

## Creating an Application

### Via Admin Panel

1. Navigate to **Applications** → **Create New**
2. Fill in basic details:

| Field | Description | Example |
|-------|-------------|--------|
| Name | Display name | "Project Manager" |
| Slug | URL-safe identifier | `project-manager` |
| Description | Optional description | "Manage your team's projects" |
| Type | SPA or MACHINE | SPA |

3. Click **Create**

### Via API

```typescript
const app = await authvital.admin.createApplication({
  name: 'Project Manager',
  slug: 'project-manager',
  description: 'Manage your team projects',
  type: 'SPA',
  redirectUris: ['https://app.example.com/callback'],
  postLogoutRedirectUris: ['https://app.example.com'],
});

console.log('Client ID:', app.clientId);
```

## Application Types

### SPA (Single Page Application)

For browser-based applications:

- **No client secret** (public client)
- **Requires PKCE** for security
- Tokens stored in memory/cookies

```typescript
{
  type: 'SPA',
  // No clientSecret generated
}
```

### MACHINE (Server-to-Server)

For backend services and cron jobs:

- **Has client secret** (confidential client)
- Uses **client credentials** grant
- Tokens used for M2M communication

```typescript
{
  type: 'MACHINE',
  // clientSecret generated automatically
}
```

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

```typescript
await authvital.admin.createApplication({
  // Basic Info
  name: 'Project Manager Pro',
  slug: 'pm-pro',
  description: 'Enterprise project management',
  type: 'SPA',
  
  // OAuth
  redirectUris: [
    'https://pm.example.com/callback',
    'https://{tenant}.pm.example.com/callback',
    'http://localhost:3000/callback',
  ],
  postLogoutRedirectUris: [
    'https://pm.example.com',
  ],
  allowedWebOrigins: [
    'https://pm.example.com',
    'http://localhost:3000',
  ],
  accessTokenTtl: 1800,  // 30 minutes
  refreshTokenTtl: 1209600,  // 14 days
  
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
});
```

## After Creation

### Get Credentials

After creating an app, note:

```typescript
{
  clientId: 'a1b2c3d4-e5f6-...',      // Always generated
  clientSecret: 'secret_xyz...',       // Only for MACHINE type
}
```

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
