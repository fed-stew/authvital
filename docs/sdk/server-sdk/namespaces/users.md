# Users Namespace

> User profile and account management operations.

## Overview

The users namespace provides methods for managing user profiles, passwords, sessions, and account settings.

```typescript
const users = authvital.users;
```

---

## Profile Management

### getCurrentUser()

Get the current authenticated user's profile.

```typescript
const user = await authvital.users.getCurrentUser(request);

console.log(user);
// {
//   id: 'user-123',
//   email: 'user@example.com',
//   givenName: 'John',
//   familyName: 'Doe',
//   pictureUrl: 'https://...',
//   mfaEnabled: true,
//   ...
// }
```

---

### updateCurrentUser()

Update the current user's profile.

```typescript
const updated = await authvital.users.updateCurrentUser(request, {
  displayName: 'John D.',
  givenName: 'John',
  familyName: 'Doe',
  zoneinfo: 'America/New_York',
  locale: 'en-US',
});
```

**Updatable Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `displayName` | `string` | Display name |
| `givenName` | `string` | First name |
| `familyName` | `string` | Last name |
| `middleName` | `string` | Middle name |
| `nickname` | `string` | Nickname |
| `pictureUrl` | `string` | Profile picture URL |
| `website` | `string` | Personal website |
| `zoneinfo` | `string` | Timezone (IANA) |
| `locale` | `string` | Locale (e.g., 'en-US') |

---

## Password Management

### changePassword()

Change the current user's password.

```typescript
await authvital.users.changePassword(request, {
  currentPassword: 'old-password',
  newPassword: 'new-secure-password',
});
```

---

### requestEmailChange()

Request email change (sends verification to new email).

```typescript
await authvital.users.requestEmailChange(request, {
  newEmail: 'newemail@example.com',
  password: 'current-password',
});
// Verification email sent to new address
```

---

## Session Management

### getSessions()

Get active sessions for the current user.

```typescript
const sessions = await authvital.users.getSessions(request);

sessions.forEach(s => {
  console.log(`${s.userAgent} - ${s.isCurrent ? 'Current' : s.lastActive}`);
});
```

---

### revokeSession()

Revoke a specific session.

```typescript
await authvital.users.revokeSession(request, 'session-123');
```

---

### revokeAllSessions()

Revoke all sessions except the current one.

```typescript
const { count } = await authvital.users.revokeAllSessions(request);
console.log(`Revoked ${count} sessions`);
```

---

## MFA Status

### getMfaStatus()

Get MFA status for a user.

```typescript
const { mfaEnabled, mfaVerifiedAt } = await authvital.users.getMfaStatus('user-123');

if (!mfaEnabled && tenantPolicy === 'REQUIRED') {
  // Redirect to MFA setup
}
```

---

## Account Deletion

### deleteAccount()

Delete the current user's account.

```typescript
await authvital.users.deleteAccount(request, {
  password: 'current-password',
  confirmation: 'DELETE MY ACCOUNT',
});
```

---

## Complete Example

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// Get current user profile
app.get('/api/me', async (req, res) => {
  const user = await authvital.users.getCurrentUser(req);
  res.json(user);
});

// Update profile
app.patch('/api/me', async (req, res) => {
  const updated = await authvital.users.updateCurrentUser(req, req.body);
  res.json(updated);
});

// Change password
app.post('/api/me/password', async (req, res) => {
  await authvital.users.changePassword(req, {
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
  });
  res.json({ success: true });
});

// Get active sessions
app.get('/api/me/sessions', async (req, res) => {
  const sessions = await authvital.users.getSessions(req);
  res.json(sessions);
});

// Revoke session
app.delete('/api/me/sessions/:id', async (req, res) => {
  await authvital.users.revokeSession(req, req.params.id);
  res.json({ success: true });
});

// Logout everywhere
app.delete('/api/me/sessions', async (req, res) => {
  const { count } = await authvital.users.revokeAllSessions(req);
  res.json({ revoked: count });
});

// Delete account
app.delete('/api/me', async (req, res) => {
  await authvital.users.deleteAccount(req, {
    password: req.body.password,
    confirmation: req.body.confirmation,
  });
  res.clearCookie('access_token');
  res.json({ success: true });
});
```
