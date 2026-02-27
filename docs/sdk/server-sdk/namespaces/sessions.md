# Sessions Namespace

> Manage user sessions: list, revoke specific sessions, or logout everywhere.

## Overview

The sessions namespace provides methods for session management, useful for building "manage devices" UIs and logout functionality.

```typescript
const sessions = authvital.sessions;
```

---

## Methods

### list()

Get all active sessions for the authenticated user.

```typescript
const { sessions, count } = await authvital.sessions.list(request, {
  applicationId: 'app-123', // Optional: filter by app
});

sessions.forEach(s => {
  console.log(`${s.userAgent} - ${s.ipAddress} - expires ${s.expiresAt}`);
});
```

**Return Type:**

```typescript
interface SessionsListResponse {
  sessions: Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
    userAgent: string | null;
    ipAddress: string | null;
    tenant: string | null;
  }>;
  count: number;
}
```

---

### revoke()

Revoke a specific session by ID.

```typescript
const result = await authvital.sessions.revoke(request, 'session-id');

console.log(result.message); // 'Session revoked successfully'
```

---

### revokeAll()

Revoke ALL sessions for the authenticated user ("logout everywhere").

```typescript
const result = await authvital.sessions.revokeAll(request, {
  applicationId: 'app-123', // Optional: only revoke for this app
});

console.log(`Logged out of ${result.count} devices`);
```

---

### logout()

Logout current session by refresh token.

!!! tip "For browser apps"
    Prefer redirecting to `/oauth/logout` which handles cookie clearing automatically.

```typescript
const result = await authvital.sessions.logout(refreshToken);

res.clearCookie('refresh_token');
res.json(result);
```

---

## Complete Example: Session Management UI

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// List all sessions
app.get('/api/sessions', async (req, res) => {
  const { sessions, count } = await authvital.sessions.list(req);
  
  res.json({
    sessions: sessions.map(s => ({
      id: s.id,
      device: parseUserAgent(s.userAgent),
      location: s.ipAddress,
      lastActive: s.createdAt,
      expiresAt: s.expiresAt,
    })),
    total: count,
  });
});

// Revoke specific session
app.post('/api/sessions/:id/revoke', async (req, res) => {
  const result = await authvital.sessions.revoke(req, req.params.id);
  res.json(result);
});

// Logout everywhere
app.post('/api/logout-all', async (req, res) => {
  const result = await authvital.sessions.revokeAll(req);
  res.json({ message: `Logged out of ${result.count} devices` });
});

// Normal logout
app.post('/api/logout', async (req, res) => {
  const refreshToken = req.cookies.refresh_token || req.body.refresh_token;
  
  if (refreshToken) {
    await authvital.sessions.logout(refreshToken);
  }
  
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.json({ success: true });
});
```
