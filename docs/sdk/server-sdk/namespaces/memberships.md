# Memberships Namespace

> Manage tenant and application memberships, roles, and user access.

## Overview

The memberships namespace provides methods for managing team members, listing users across tenants and applications, and managing roles.

```typescript
const memberships = authvital.memberships;
```

---

## Methods

### listForTenant()

List all members of a tenant with their roles and details.

```typescript
const { memberships } = await authvital.memberships.listForTenant(request, {
  status: 'ACTIVE',        // Optional: 'ACTIVE' | 'INVITED' | 'SUSPENDED'
  includeRoles: true,      // Optional: include role details
  appendClientId: true,    // Optional: add client_id to initiateLoginUri
});

memberships.forEach(m => {
  console.log(`${m.user.email} - ${m.membership.status}`);
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request` | `RequestLike` | Yes | Incoming HTTP request |
| `status` | `string` | No | Filter by status |
| `includeRoles` | `boolean` | No | Include role details |
| `appendClientId` | `boolean` | No | Add client_id to login URIs |

**Return Type:**

```typescript
interface TenantMembershipsResponse {
  memberships: Array<{
    user: {
      id: string;
      email: string;
      givenName?: string;
      familyName?: string;
      picture?: string;
    };
    membership: {
      id: string;
      status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
      joinedAt: string;
    };
    roles?: Array<{
      slug: string;
      name: string;
      type: 'tenant' | 'application';
    }>;
  }>;
  initiateLoginUri?: string;
}
```

---

### listTenantsForUser()

Get all tenants the authenticated user belongs to. Perfect for building an **org picker**!

```typescript
const { memberships } = await authvital.memberships.listTenantsForUser(request, {
  status: 'ACTIVE',
  appendClientId: true, // Adds client_id to login URLs
});

memberships.forEach(m => {
  console.log(m.tenant.name, m.tenant.initiateLoginUri);
  // "Acme Corp" "https://acme.auth.example.com/login?client_id=your-client-id"
});
```

**Return Type:**

```typescript
interface UserTenantsResponse {
  memberships: Array<{
    tenant: {
      id: string;
      name: string;
      slug: string;
      initiateLoginUri: string;
      logoUrl?: string;
    };
    role: string;
    memberSince: string;
  }>;
}
```

**Example: Org Picker API**

```typescript
app.get('/api/my-organizations', async (req, res) => {
  const { memberships } = await authvital.memberships.listTenantsForUser(req, {
    appendClientId: true,
  });
  
  res.json({
    organizations: memberships.map(m => ({
      id: m.tenant.id,
      name: m.tenant.name,
      logo: m.tenant.logoUrl,
      switchUrl: m.tenant.initiateLoginUri,
      role: m.role,
    })),
  });
});
```

---

### listForApplication()

Get members who have access to YOUR specific app (not just any tenant member).

```typescript
const { memberships } = await authvital.memberships.listForApplication(request, {
  status: 'ACTIVE',
  appendClientId: true,
});
```

**When to Use Which:**

| Method | Returns | Use Case |
|--------|---------|----------|
| `listForTenant()` | All tenant members | Admin panel showing all team members |
| `listForApplication()` | Only users with app access | Your app's user list |

---

### validate()

Validate that the authenticated user is a member of their tenant.

```typescript
const result = await authvital.memberships.validate(request);

if (result.valid) {
  console.log('Membership:', result.membership);
}
```

---

### getTenantRoles()

Get all available tenant roles (IDP-level). These are instance-wide, not tenant-specific.

```typescript
const { roles } = await authvital.memberships.getTenantRoles();

console.log(roles);
// [
//   { slug: 'owner', name: 'Owner', permissions: ['*'] },
//   { slug: 'admin', name: 'Admin', permissions: ['members:invite', ...] },
//   { slug: 'member', name: 'Member', permissions: ['profile:view'] },
// ]
```

!!! info "No request parameter needed"
    This method uses M2M authentication, not user JWT.

---

### getApplicationRoles()

Get all roles defined for YOUR application. Uses `clientId` from SDK config automatically.

```typescript
const { roles } = await authvital.memberships.getApplicationRoles();

console.log(roles);
// [
//   { slug: 'admin', name: 'Admin', permissions: ['*'] },
//   { slug: 'editor', name: 'Editor', permissions: ['projects:create', 'projects:edit'] },
//   { slug: 'viewer', name: 'Viewer', permissions: ['projects:view'] },
// ]
```

**Tenant vs Application Roles:**

| Type | Scope | Examples |
|------|-------|----------|
| Tenant Roles | IDP-level, all apps | `owner`, `admin`, `member` |
| Application Roles | Your app only | `editor`, `viewer`, `super-user` |

---

### setMemberRole()

Change a member's tenant role. Includes **pre-flight permission validation**!

```typescript
const result = await authvital.memberships.setMemberRole(
  request,
  'membership-123',
  'admin' // role slug
);

console.log(result.role); // { id, name, slug }
```

**Pre-flight Checks:**

The SDK validates permissions before making the API call:

| Rule | Description |
|------|-------------|
| Caller must be admin+ | Only admins and owners can change roles |
| Can't promote above self | Admins can't make someone an owner |
| Only owners can create owners | Owner promotion is owner-exclusive |

**Error Handling:**

```typescript
try {
  await authvital.memberships.setMemberRole(req, membershipId, 'owner');
} catch (error) {
  // Descriptive error messages:
  // - "Insufficient permissions: only owners and admins can change member roles"
  // - "Insufficient permissions: only owners can promote to owner"
  console.error(error.message);
}
```

---

## Complete Example: Team Management

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// List team members
app.get('/api/team', async (req, res) => {
  const { memberships } = await authvital.memberships.listForTenant(req, {
    includeRoles: true,
  });
  
  res.json({
    members: memberships.map(m => ({
      id: m.membership.id,
      userId: m.user.id,
      email: m.user.email,
      name: `${m.user.givenName || ''} ${m.user.familyName || ''}`.trim(),
      avatar: m.user.picture,
      status: m.membership.status,
      role: m.roles?.[0]?.slug,
      joinedAt: m.membership.joinedAt,
    })),
  });
});

// Get available roles for dropdown
app.get('/api/team/roles', async (req, res) => {
  const { roles } = await authvital.memberships.getTenantRoles();
  res.json(roles);
});

// Update member role
app.put('/api/team/:membershipId/role', async (req, res) => {
  try {
    const result = await authvital.memberships.setMemberRole(
      req,
      req.params.membershipId,
      req.body.role,
    );
    res.json(result);
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
});

// List user's organizations (for org picker)
app.get('/api/my-orgs', async (req, res) => {
  const { memberships } = await authvital.memberships.listTenantsForUser(req, {
    appendClientId: true,
  });
  res.json(memberships);
});
```
