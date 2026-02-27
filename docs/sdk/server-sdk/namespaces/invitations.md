# Invitations Namespace

> Manage tenant invitations: send, list pending, resend, and revoke.

## Overview

The invitations namespace provides methods for managing team invitations. All methods automatically extract the tenant ID from the authenticated user's JWT.

```typescript
const invitations = authvital.invitations;
```

---

## Methods

### send()

Send an invitation to join a tenant.

```typescript
const result = await authvital.invitations.send(request, {
  email: 'newuser@example.com',
  givenName: 'John',        // Optional
  familyName: 'Doe',        // Optional
  roleId: 'role-id',        // Optional: tenant role ID
  clientId: 'my-app-id',    // Optional: defaults to SDK clientId
});

console.log(result);
// { sub: 'user-uuid', expiresAt: '2024-01-15T00:00:00Z' }
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request` | `RequestLike` | Yes | Incoming HTTP request (for JWT extraction) |
| `email` | `string` | Yes | Email address to invite |
| `givenName` | `string` | No | Invitee's first name |
| `familyName` | `string` | No | Invitee's last name |
| `roleId` | `string` | No | Tenant role ID to assign |
| `clientId` | `string` | No | Application client ID (defaults to SDK config) |

**Return Type:**

```typescript
interface InvitationResponse {
  sub: string;       // User ID (created or existing)
  expiresAt: string; // Invitation expiration date
}
```

**Example: Invite with Role**

```typescript
app.post('/api/team/invite', async (req, res) => {
  // First, get available roles
  const { roles } = await authvital.memberships.getTenantRoles();
  const adminRole = roles.find(r => r.slug === 'admin');
  
  const { sub, expiresAt } = await authvital.invitations.send(req, {
    email: req.body.email,
    givenName: req.body.firstName,
    familyName: req.body.lastName,
    roleId: adminRole?.id,
  });
  
  res.json({ userId: sub, expiresAt });
});
```

---

### listPending()

Get all pending invitations for the authenticated user's tenant.

```typescript
const { invitations, totalCount } = await authvital.invitations.listPending(request);

invitations.forEach(inv => {
  console.log(`${inv.email} - expires ${inv.expiresAt}`);
});
```

**Return Type:**

```typescript
interface PendingInvitationsResponse {
  invitations: Array<{
    id: string;
    email: string;
    givenName?: string;
    familyName?: string;
    expiresAt: string;
    createdAt: string;
    role?: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
  totalCount: number;
}
```

**Example: List Pending Invitations**

```typescript
app.get('/api/team/invitations', async (req, res) => {
  const { invitations, totalCount } = await authvital.invitations.listPending(req);
  
  res.json({
    invitations: invitations.map(inv => ({
      id: inv.id,
      email: inv.email,
      name: `${inv.givenName || ''} ${inv.familyName || ''}`.trim(),
      expiresAt: inv.expiresAt,
      role: inv.role?.name,
    })),
    total: totalCount,
  });
});
```

---

### resend()

Resend an invitation (generates new token, extends expiry).

```typescript
const { expiresAt } = await authvital.invitations.resend(request, {
  invitationId: 'inv-123',
  expiresInDays: 7, // Optional, default 7
});

console.log('New expiry:', expiresAt);
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request` | `RequestLike` | Yes | Incoming HTTP request |
| `invitationId` | `string` | Yes | ID of invitation to resend |
| `expiresInDays` | `number` | No | Days until expiry (default: 7) |

---

### revoke()

Revoke an invitation.

```typescript
await authvital.invitations.revoke(request, 'inv-123');
```

**Example: Revoke Invitation Endpoint**

```typescript
app.delete('/api/team/invitations/:id', async (req, res) => {
  await authvital.invitations.revoke(req, req.params.id);
  res.json({ success: true });
});
```

---

## Complete Example: Invitation Management

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// Send invitation
app.post('/api/invitations', async (req, res) => {
  try {
    const result = await authvital.invitations.send(req, {
      email: req.body.email,
      givenName: req.body.firstName,
      familyName: req.body.lastName,
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// List pending
app.get('/api/invitations', async (req, res) => {
  const result = await authvital.invitations.listPending(req);
  res.json(result);
});

// Resend
app.post('/api/invitations/:id/resend', async (req, res) => {
  const result = await authvital.invitations.resend(req, {
    invitationId: req.params.id,
  });
  res.json(result);
});

// Revoke
app.delete('/api/invitations/:id', async (req, res) => {
  await authvital.invitations.revoke(req, req.params.id);
  res.status(204).send();
});
```
