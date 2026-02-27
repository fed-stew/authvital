# Tenants Namespace

> Tenant CRUD operations and SSO configuration.

## Overview

The tenants namespace provides methods for managing tenant organizations and their SSO settings.

```typescript
const tenants = authvital.tenants;
```

---

## Methods

### get()

Get tenant details by ID.

```typescript
const tenant = await authvital.tenants.get('tenant-123');

console.log(tenant);
// {
//   id: 'tenant-123',
//   name: 'Acme Corporation',
//   slug: 'acme-corp',
//   mfaPolicy: 'OPTIONAL',
//   memberCount: 25,
//   createdAt: '2024-01-01T00:00:00Z',
//   ...
// }
```

---

### create()

Create a new tenant. The authenticated user becomes the owner.

```typescript
const tenant = await authvital.tenants.create(request, {
  name: 'Acme Corporation',
  slug: 'acme-corp', // Optional: auto-generated if not provided
});
```

---

### update()

Update tenant settings. Requires admin or owner role.

```typescript
await authvital.tenants.update('tenant-123', {
  name: 'Acme Corp Inc.',
  mfaPolicy: 'REQUIRED',
  mfaGracePeriodDays: 14, // Only with ENFORCED_AFTER_GRACE
  settings: { customField: 'value' },
});
```

**MFA Policies:**

| Policy | Description |
|--------|-------------|
| `OPTIONAL` | MFA is optional for all users |
| `REQUIRED` | MFA is required immediately |
| `ENFORCED_AFTER_GRACE` | MFA required after grace period |

---

### delete()

Delete a tenant. Requires owner role. **This is destructive!**

```typescript
await authvital.tenants.delete('tenant-123');
```

---

## SSO Configuration

### configureSso()

Configure SSO for a tenant.

```typescript
const ssoConfig = await authvital.tenants.configureSso('tenant-123', {
  provider: 'MICROSOFT',
  enabled: true,
  clientId: 'azure-app-id',
  clientSecret: 'azure-secret',
  enforced: true,          // Optional: force SSO-only login
  allowedDomains: ['acme.com'], // Optional: restrict by email domain
  autoCreateUser: true,    // Optional: auto-provision users
  autoLinkExisting: true,  // Optional: link existing users
  scopes: ['openid', 'email', 'profile'], // Optional
});
```

---

### getSsoConfig()

Get SSO configuration for a tenant. Returns `null` if not configured.

```typescript
const ssoConfig = await authvital.tenants.getSsoConfig('tenant-123', 'MICROSOFT');

if (ssoConfig?.enforced) {
  // Hide password login, show SSO only
}
```

---

### disableSso()

Disable SSO for a tenant.

```typescript
await authvital.tenants.disableSso('tenant-123', 'GOOGLE');
```

---

## Complete Example

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// Get tenant details
app.get('/api/tenant', async (req, res) => {
  const claims = await authvital.validateRequest(req);
  const tenant = await authvital.tenants.get(claims.tenantId);
  res.json(tenant);
});

// Update tenant settings
app.patch('/api/tenant', async (req, res) => {
  const claims = await authvital.validateRequest(req);
  const tenant = await authvital.tenants.update(claims.tenantId, req.body);
  res.json(tenant);
});

// Configure Microsoft SSO
app.put('/api/tenant/sso/microsoft', async (req, res) => {
  const claims = await authvital.validateRequest(req);
  
  const ssoConfig = await authvital.tenants.configureSso(claims.tenantId, {
    provider: 'MICROSOFT',
    enabled: true,
    clientId: req.body.clientId,
    clientSecret: req.body.clientSecret,
    enforced: req.body.enforced || false,
    allowedDomains: req.body.allowedDomains || [],
  });
  
  res.json(ssoConfig);
});
```
