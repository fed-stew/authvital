# Memberships & Roles

> Server-to-server (M2M) membership and role operations via `client.integration`.

!!! info "There is no fluent `authvital.memberships.*(req, …)` namespace"
    Earlier drafts described request-scoped methods like
    `authvital.memberships.listForTenant(req)`,
    `.listTenantsForUser(req)`, `.setMemberRole(req, id, slug)` with built-in
    "pre-flight permission validation". **That API does not exist.** The real
    surface is the M2M integration client below — it takes explicit params
    (`{ tenantId }`, `{ userId }`, …), not an Express `req`, and it does **not**
    perform any client-side role hierarchy checks.

## Getting the client

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});
```

## Membership methods

Verified against `packages/sdk-server/src/client/integration.ts`:

| Method | Params | Returns |
|--------|--------|---------|
| `validateMembership` | `{ userId, tenantId }` | `{ valid: boolean; membership?: Membership }` |
| `listTenantMembers` | `{ tenantId, status?, includeRoles? }` | `{ memberships: Membership[] }` |
| `listUserMemberships` | `{ userId?, tenantId?, clientId?, status?, includeRoles? }` | `{ memberships: Membership[] }` |
| `listUserTenants` | `{ userId }` | tenants for the user |

`status` is `'ACTIVE' \| 'INVITED' \| 'SUSPENDED'`. `listUserMemberships`
defaults `clientId` to the SDK's configured `clientId` when omitted (this is the
"members with access to *my* app" query).

```typescript
// All members of a tenant, with role details
const { memberships } = await client.integration.listTenantMembers({
  tenantId: 'tenant-abc',
  status: 'ACTIVE',
  includeRoles: true,
});

// Members who have access to THIS application
const appMembers = await client.integration.listUserMemberships({
  tenantId: 'tenant-abc',
  includeRoles: true,
});

// Org picker: every tenant a user belongs to
const tenants = await client.integration.listUserTenants({ userId: 'user-123' });
```

`Membership` shape (from the SDK types):

```typescript
interface Membership {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  roles?: Array<{ slug: string; name: string }>;
  tenantRoles?: Array<{ slug: string; name: string }>;
  createdAt?: string;
  updatedAt?: string;
}
```

## Role methods

| Method | Params | Returns |
|--------|--------|---------|
| `getApplicationRoles` | `{ clientId, tenantId? }` | `ApplicationRolesResult` |
| `getTenantRoles` | `{ tenantId? }` (optional) | `{ roles: TenantRole[] }` |
| `setMemberRole` | `{ membershipId, roleId, applicationId }` | result |

!!! info "`setMemberRole` sets an APPLICATION role"
    `setMemberRole` assigns a member's role **within an application**, not the
    tenant-level role. All three fields are required (verified against
    `SetMemberRoleDto` + `integration.ts`):

    - `membershipId` — the target membership.
    - `roleId` — an **application Role id** (from `getApplicationRoles`).
    - `applicationId` — the application that role belongs to (guards against
      assigning a role from a different app).

```typescript
// Roles defined for an application (pass a clientId explicitly)
const appRoles = await client.integration.getApplicationRoles({
  clientId: process.env.AV_CLIENT_ID!,
});

// Instance-wide tenant roles (owner/admin/member, …)
const { roles } = await client.integration.getTenantRoles();

// Assign a member an APPLICATION role (app-scoped, not tenant-scoped)
await client.integration.setMemberRole({
  membershipId: 'membership-123',
  roleId: appRoles.roles.find((r) => r.slug === 'editor')!.id,
  applicationId: appRoles.applicationId,
});
```

!!! warning "No client-side permission pre-flight"
    `setMemberRole` does **not** enforce a role hierarchy (e.g. "only owners can
    promote to owner") in the SDK. Authorization is enforced by the backend
    based on the M2M credentials. Do your own guard checks before calling if you
    need product-specific rules. Tenant-admin role management for humans lives
    in the hosted console (`/tenant/:tenantId/members`).

## See also

- [Permissions](./permissions.md) · [Invitations](./invitations.md) · [Integration API (overview)](./overview.md)
