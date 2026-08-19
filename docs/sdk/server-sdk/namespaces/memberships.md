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
| `validateMembership` | `{ userId, tenantId }` | `{ isMember: boolean; membership: { id, status, joinedAt } \| null }` |
| `listTenantMembers` | `{ tenantId, status?, includeRoles? }` | `TenantMembershipsResponse` |
| `listUserMemberships` | `{ userId?, tenantId?, clientId?, status?, includeRoles? }` | `ApplicationMembershipsResponse` |
| `listUserTenants` | `{ userId }` | `UserTenantsResponse` |

`status` is `'ACTIVE' \| 'INVITED' \| 'SUSPENDED'`. `listUserMemberships`
defaults `clientId` to the SDK's configured `clientId` when omitted (this is the
"members with access to *my* app" query).

!!! info "`listUserMemberships` userId semantics"
    All filters are applied **server-side**. When `userId` is **omitted**, the
    call returns memberships for **all users** that hold roles on the
    application — client-credentials (M2M) tokens have no associated user, so
    there is no "token user" fallback. Pass `userId` to scope the results to a
    single user.

```typescript
// All members of a tenant, with role details
const { memberships } = await client.integration.listTenantMembers({
  tenantId: 'tenant-abc',
  status: 'ACTIVE',
  includeRoles: true,
});

// Members who have access to THIS application (all users)
const appMembers = await client.integration.listUserMemberships({
  tenantId: 'tenant-abc',
});

// ONE user's memberships on THIS application (filtered server-side)
const userMemberships = await client.integration.listUserMemberships({
  userId: 'user-123',
});

// Org picker: every tenant a user belongs to
const tenants = await client.integration.listUserTenants({ userId: 'user-123' });
```

Response shapes are **nested** (re-exported from `@authvital/shared`; the old
flat `Membership` interface never matched the wire format and has been
removed):

```typescript
// Shared building blocks
interface MembershipUser {
  id: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
}

interface MembershipRole {
  id: string;
  name: string;
  slug: string;
  applicationId?: string;   // present on tenant/user-tenant queries
  applicationName?: string; // present on tenant/user-tenant queries
}

interface MembershipTenant {
  id: string;
  name: string;
  slug: string;
  initiateLoginUri: string | null;
}

// listTenantMembers → TenantMembershipsResponse
interface TenantMembershipsResponse {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  initiateLoginUri: string | null;
  memberships: Array<{
    id: string;
    status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
    joinedAt: string | null;
    createdAt: string;
    user: MembershipUser;
    roles: MembershipRole[];
  }>;
  totalCount: number;
}

// listUserMemberships → ApplicationMembershipsResponse
interface ApplicationMembershipsResponse {
  applicationId: string;
  applicationName: string;
  clientId: string;
  memberships: Array<{
    id: string;
    status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
    joinedAt: string | null;
    createdAt: string;
    user: MembershipUser;
    tenant: MembershipTenant;
    roles: MembershipRole[]; // only the queried app's roles (no applicationId)
  }>;
  totalCount: number;
}

// listUserTenants → UserTenantsResponse
interface UserTenantsResponse {
  userId: string;
  memberships: Array<{
    id: string;
    status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
    joinedAt: string | null;
    createdAt: string;
    tenant: MembershipTenant;
    roles: MembershipRole[];
  }>;
  totalCount: number;
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
