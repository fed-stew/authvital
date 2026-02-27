# Permissions Namespace

> Check and list user permissions for tenant-scoped operations.

## Overview

The permissions namespace provides **API-based** permission checks. For JWT-based (zero-API-call) checks, see [JWT Validation](../jwt-validation.md).

!!! tip "JWT vs API Permission Checks"
    - **JWT checks** (`hasTenantPermission`, `hasAppPermission`): Instant, offline
    - **API checks** (this namespace): Real-time, queries the IDP

```typescript
const permissions = authvital.permissions;
```

---

## Methods

### check()

Check if the authenticated user has a specific permission.

```typescript
const { allowed } = await authvital.permissions.check(request, 'users:write');

if (!allowed) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request` | `RequestLike` | Yes | Incoming HTTP request |
| `permission` | `string` | Yes | Permission key to check |

**Return Type:**

```typescript
interface CheckPermissionResult {
  allowed: boolean;
  permission: string;
}
```

---

### checkMany()

Check multiple permissions at once.

```typescript
const { results } = await authvital.permissions.checkMany(request, [
  'documents:read',
  'documents:write',
  'admin:access',
]);

// results = { 'documents:read': true, 'documents:write': true, 'admin:access': false }

// Check if user has ANY permission
const hasAny = Object.values(results).some(v => v);

// Check if user has ALL permissions
const hasAll = Object.values(results).every(v => v);
```

**Return Type:**

```typescript
interface CheckPermissionsResult {
  results: Record<string, boolean>;
}
```

---

### list()

Get all permissions for the authenticated user.

```typescript
const permissions = await authvital.permissions.list(request);

console.log(permissions);
// ['users:read', 'users:write', 'documents:read', ...]
```

---

## Complete Example

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// Permission check middleware
const requirePermission = (permission: string) => {
  return async (req, res, next) => {
    const { allowed } = await authvital.permissions.check(req, permission);
    
    if (!allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        required: permission,
      });
    }
    
    next();
  };
};

// Protected endpoints
app.get('/api/users', requirePermission('users:read'), (req, res) => {
  // Only accessible if user has users:read permission
});

app.post('/api/users', requirePermission('users:write'), (req, res) => {
  // Only accessible if user has users:write permission
});

// Get all permissions (for building UI)
app.get('/api/my-permissions', async (req, res) => {
  const permissions = await authvital.permissions.list(req);
  res.json({ permissions });
});
```
