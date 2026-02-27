# Admin Namespace

> Instance-level administration operations.

## Overview

The admin namespace provides methods for super admin and instance-level operations. These require elevated permissions.

```typescript
const admin = authvital.admin;
```

---

## Instance Settings

### getInstanceSettings()

Get current instance settings.

```typescript
const settings = await authvital.admin.getInstanceSettings();

console.log(settings);
// {
//   superAdminMfaRequired: true,
//   defaultMfaPolicy: 'OPTIONAL',
//   publicRegistrationEnabled: true,
//   emailVerificationRequired: true,
//   sessionTimeoutSeconds: 3600,
//   accessTokenLifetimeSeconds: 900,
//   refreshTokenLifetimeSeconds: 604800,
// }
```

---

### updateInstanceSettings()

Update instance settings.

```typescript
await authvital.admin.updateInstanceSettings({
  superAdminMfaRequired: true,
  defaultMfaPolicy: 'REQUIRED',
  sessionTimeoutSeconds: 1800, // 30 minutes
});
```

**Available Settings:**

| Setting | Type | Description |
|---------|------|-------------|
| `superAdminMfaRequired` | `boolean` | Require MFA for all super admins |
| `defaultMfaPolicy` | `string` | Default MFA policy for new tenants |
| `publicRegistrationEnabled` | `boolean` | Allow public user registration |
| `emailVerificationRequired` | `boolean` | Require email verification |
| `sessionTimeoutSeconds` | `number` | Session timeout in seconds |
| `accessTokenLifetimeSeconds` | `number` | Access token lifetime |
| `refreshTokenLifetimeSeconds` | `number` | Refresh token lifetime |

---

## Instance SSO

### configureSso()

Configure instance-level SSO (default for all tenants without custom config).

```typescript
await authvital.admin.configureSso({
  provider: 'GOOGLE',
  enabled: true,
  clientId: 'google-client-id',
  clientSecret: 'google-client-secret',
  scopes: ['openid', 'email', 'profile'],
  allowedDomains: ['yourcompany.com'],
  autoCreateUser: true,
  autoLinkExisting: true,
});
```

---

### getSsoConfig()

Get instance SSO configuration.

```typescript
const googleConfig = await authvital.admin.getSsoConfig('GOOGLE');

if (googleConfig?.enabled) {
  console.log('Google SSO is enabled');
}
```

---

## User Management

### disableUserMfa()

Disable a user's MFA (emergency admin operation). Use when user has lost access to authenticator AND backup codes.

```typescript
await authvital.admin.disableUserMfa('user-123', {
  reason: 'User lost access to authenticator app',
  adminId: currentAdminId,
});
```

!!! warning "Audit Trail"
    This action is logged with the reason and admin ID for security auditing.

---

### forcePasswordReset()

Force a user to reset their password on next login.

```typescript
await authvital.admin.forcePasswordReset('user-123');
```

---

### disableUser()

Disable a user account.

```typescript
await authvital.admin.disableUser('user-123', {
  reason: 'Policy violation',
});
```

---

### enableUser()

Enable a disabled user account.

```typescript
await authvital.admin.enableUser('user-123');
```

---

### revokeUserSessions()

Revoke all sessions for a user (force logout everywhere).

```typescript
const { count } = await authvital.admin.revokeUserSessions('user-123');
console.log(`Revoked ${count} sessions`);
```

---

## Complete Example

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// Get instance settings
app.get('/api/admin/settings', async (req, res) => {
  const settings = await authvital.admin.getInstanceSettings();
  res.json(settings);
});

// Update instance settings
app.patch('/api/admin/settings', async (req, res) => {
  const settings = await authvital.admin.updateInstanceSettings(req.body);
  res.json(settings);
});

// Emergency: Disable user's MFA
app.post('/api/admin/users/:id/disable-mfa', async (req, res) => {
  const adminClaims = await authvital.validateRequest(req);
  
  await authvital.admin.disableUserMfa(req.params.id, {
    reason: req.body.reason,
    adminId: adminClaims.sub,
  });
  
  res.json({ success: true });
});

// Disable user account
app.post('/api/admin/users/:id/disable', async (req, res) => {
  await authvital.admin.disableUser(req.params.id, {
    reason: req.body.reason,
  });
  res.json({ success: true });
});

// Enable user account
app.post('/api/admin/users/:id/enable', async (req, res) => {
  await authvital.admin.enableUser(req.params.id);
  res.json({ success: true });
});

// Force logout user everywhere
app.post('/api/admin/users/:id/revoke-sessions', async (req, res) => {
  const { count } = await authvital.admin.revokeUserSessions(req.params.id);
  res.json({ revokedSessions: count });
});
```
