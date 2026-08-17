# Tenant API Reference

> REST API endpoints for tenant management.

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tenants/mine` | GET | List the current user's tenants |
| `/api/tenants` | POST | Create tenant |
| `/api/tenants/:tenantId` | GET | Get tenant details |
| `/api/tenants/:tenantId` | PATCH | Update tenant |
| `/api/tenants/:tenantId` | DELETE | Delete tenant |
| `/api/tenants/:tenantId/members` | GET | List members |
| `/api/tenants/:tenantId/members/:membershipId` | PATCH | Update member |
| `/api/tenants/:tenantId/members/:membershipId` | DELETE | Remove member |
| `/api/tenants/:tenantId/members/:membershipId/role` | POST | Set member role |
| `/api/tenants/:tenantId/members/invite` | POST | Invite a member |
| `/api/tenants/:tenantId/app-access-matrix` | GET | Members × applications access grid (`app-access:view`) |
| `/api/tenants/:tenantId/audit` | GET | Tenant audit log, paginated/filterable (`audit:view`) |
| `/api/tenants/:tenantId/audit/export` | GET | CSV export of the audit log (`audit:export`) |
| `/api/invitations` | POST | Create an invitation |
| `/api/invitations/tenant/:tenantId` | GET | List a tenant's invitations |
| `/api/invitations/:id/resend` | POST | Resend invitation |
| `/api/invitations/:id` | PATCH/DELETE | Update / revoke invitation |
| `/api/invitations/accept` | POST | Accept invitation (body: token) |
| `/api/invitations/token/:token` | GET | Look up invitation by token |

!!! note "Verified against the backend controllers"
    Corrections vs earlier drafts: listing tenants is `GET /api/tenants/mine`
    (there is no `GET /api/tenants`); invitations live on the **invitations**
    controller (`/api/invitations/*`) and the **members** controller
    (`/api/tenants/:tenantId/members/invite`) — not under
    `/api/tenants/:id/invitations`. Member role changes are
    `POST .../members/:membershipId/role`.

---

## List User's Tenants

### GET /api/tenants/mine

Get tenants the current user is a member of.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**

```json
{
  "tenants": [
    {
      "id": "tenant-uuid",
      "name": "Acme Corporation",
      "slug": "acme-corp",
      "role": "owner",
      "memberCount": 15,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## Create Tenant

### POST /api/tenants

Create a new tenant. User becomes owner.

**Request:**

```json
{
  "name": "My Company",
  "slug": "my-company"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `slug` | string | No | URL-safe identifier (auto-generated if omitted) |

**Response (201 Created):**

```json
{
  "id": "tenant-uuid",
  "name": "My Company",
  "slug": "my-company",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 409 | `SLUG_TAKEN` | Slug already in use |
| 422 | `VALIDATION_FAILED` | Invalid name or slug format |

---

## Get Tenant Details

### GET /api/tenants/:id

Get details for a specific tenant.

**Response (200 OK):**

```json
{
  "id": "tenant-uuid",
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "settings": {},
  "mfaPolicy": "OPTIONAL",
  "memberCount": 15,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-20T15:45:00Z"
}
```

---

## Update Tenant

### PATCH /api/tenants/:id

Update tenant settings. Requires admin/owner role.

**Request:**

```json
{
  "name": "Acme Corporation Inc.",
  "settings": {
    "timezone": "America/New_York"
  }
}
```

**Response (200 OK):**

```json
{
  "id": "tenant-uuid",
  "name": "Acme Corporation Inc.",
  "slug": "acme-corp",
  "settings": {
    "timezone": "America/New_York"
  },
  "updatedAt": "2024-01-20T16:00:00Z"
}
```

!!! note "MFA policy has its own endpoint"
    The MFA policy is not updated via this endpoint — use
    `PATCH /api/tenants/:id/mfa-policy` (below).

---

## MFA Policy

### GET /api/tenants/:id/mfa-policy

Get the tenant's MFA policy. Requires the `tenant:view` permission.

**Response (200 OK):**

```json
{
  "policy": "REQUIRED",
  "gracePeriodDays": 14
}
```

### PATCH /api/tenants/:id/mfa-policy

Update the tenant's MFA policy. Requires the `tenant:manage` permission.

`policy` must be one of `DISABLED`, `OPTIONAL`, `ENCOURAGED`, or `REQUIRED`.
There is no separate "enforced after grace" value — use `REQUIRED` with
`gracePeriodDays > 0` to give members a grace window, or `0` to enforce
immediately.

**Request:**

```json
{
  "policy": "REQUIRED",
  "gracePeriodDays": 14
}
```

### GET /api/tenants/:id/mfa-stats

MFA compliance statistics for the tenant. Requires the `tenant:view`
permission. `unenrolledActiveMemberCount` counts ACTIVE human members
(service accounts excluded) without MFA — useful before switching the policy
to `REQUIRED`.

**Response (200 OK):**

```json
{
  "totalMembers": 15,
  "mfaEnabled": 11,
  "mfaDisabled": 4,
  "complianceRate": 73,
  "unenrolledActiveMemberCount": 4
}
```

---

## Delete Tenant

### DELETE /api/tenants/:id

Delete a tenant. **Requires owner role.**

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Tenant deleted"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 403 | `OWNER_REQUIRED` | Only owner can delete |

---

## List Members

### GET /api/tenants/:id/members

List all tenant members.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | all | Filter: `ACTIVE`, `INVITED`, `SUSPENDED` |
| `role` | string | all | Filter by role |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page |

**Response (200 OK):**

```json
{
  "members": [
    {
      "id": "membership-uuid",
      "userId": "user-uuid",
      "status": "ACTIVE",
      "role": "owner",
      "joinedAt": "2024-01-15T10:30:00Z",
      "user": {
        "email": "owner@example.com",
        "displayName": "Jane Smith",
        "pictureUrl": "https://..."
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "pages": 1
  }
}
```

---

## Update Member

### PATCH /api/tenants/:id/members/:membershipId

Update a member's role or status.

**Request:**

```json
{
  "role": "admin"
}
```

**Response (200 OK):**

```json
{
  "id": "membership-uuid",
  "userId": "user-uuid",
  "status": "ACTIVE",
  "role": "admin",
  "updatedAt": "2024-01-20T16:00:00Z"
}
```

---

## Remove Member

### DELETE /api/tenants/:id/members/:membershipId

Remove a member from the tenant.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Member removed"
}
```

---

## List Invitations

### GET /api/invitations/tenant/:tenantId

List a tenant's invitations.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | `PENDING` | Filter by status |

**Response (200 OK):**

```json
{
  "invitations": [
    {
      "id": "invitation-uuid",
      "email": "newuser@example.com",
      "role": "member",
      "status": "PENDING",
      "expiresAt": "2024-01-22T10:30:00Z",
      "createdAt": "2024-01-15T10:30:00Z",
      "invitedBy": {
        "id": "user-uuid",
        "displayName": "Jane Smith"
      }
    }
  ]
}
```

---

## Send Invitation

### POST /api/tenants/:tenantId/members/invite

Invite someone to join the tenant. (An alternative `POST /api/invitations`
endpoint also exists on the invitations controller.)

**Request:**

```json
{
  "email": "newuser@example.com",
  "role": "member",
  "expiresInDays": 7
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email to invite |
| `role` | string | No | Role to assign (default: `member`) |
| `expiresInDays` | number | No | Days until expiration (default: 7) |

**Response (201 Created):**

```json
{
  "id": "invitation-uuid",
  "email": "newuser@example.com",
  "role": "member",
  "status": "PENDING",
  "expiresAt": "2024-01-22T10:30:00Z"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 409 | `ALREADY_MEMBER` | User already a member |
| 409 | `INVITATION_EXISTS` | Pending invitation exists |

---

## Resend Invitation

### POST /api/invitations/:id/resend

Resend invitation email.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Invitation resent"
}
```

---

## Revoke Invitation

### DELETE /api/invitations/:id

Cancel a pending invitation. (Use `PATCH /api/invitations/:id` to modify one.)

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Invitation revoked"
}
```

---

## Accept Invitation

### POST /api/invitations/accept

Accept an invitation (user endpoint). The token is sent in the request **body**
(look one up first with `GET /api/invitations/token/:token`). Existing users can
also accept via `POST /api/tenants/:tenantId/members/:membershipId/accept`.

**Request:**

```json
{
  "token": "invitation-token",
  "password": "securePassword123",
  "givenName": "John",
  "familyName": "Doe"
}
```

Existing (authenticated) users send just `{ "token": "..." }`.

**Response (200 OK):**

```json
{
  "success": true,
  "tenantId": "tenant-uuid",
  "tenantName": "Acme Corporation"
}
```

---

## Access Matrix

### GET /api/tenants/:tenantId/app-access-matrix

Returns the whole **members × applications** access grid in a single call (built
for the console's Access Matrix page so it doesn't fan out N per-app requests).

**Guards:** `JwtAuthGuard + TenantIdentifierGuard + TenantAccessGuard + PermissionGuard`
· **Permission:** `app-access:view` · `tenantId` from the URL.

---

## Audit Log

### GET /api/tenants/:tenantId/audit

Paginated, filterable tenant audit log (read-only).

**Guards:** `JwtAuthGuard + TenantIdentifierGuard + TenantAccessGuard + PermissionGuard`
· **Permission:** `audit:view` (Owner + Admin by default) · `tenantId` from the URL.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | string | Filter by action token (e.g. `member.role_changed`) |
| `actor` | string | Filter by actor (user id / email) |
| `from` | string (ISO) | Start of the time window |
| `to` | string (ISO) | End of the time window |
| `page` | number | Page number |
| `pageSize` | number | Items per page |

> Instrumented actions today: `member.*`, `invite.*`, `app_access.*`,
> `license.*` (see `audit-actions.ts`). Subscription / SSO / domain /
> tenant-settings mutations are **not** yet instrumented — see the
> [authorization model gap appendix](../sdk/authorization-model.md#6-gap-remediation-appendix).

### GET /api/tenants/:tenantId/audit/export

CSV export of the (filtered) audit log. Same query params as above.

**Guards:** same stack · **Permission:** `audit:export` (Owner only by default —
export is a heavier, exfil-adjacent capability, so it is **not** granted to Admin
automatically). Responds with `Content-Type: text/csv`.

---

## Using the SDK (M2M integration)

!!! warning "No `authvital.tenants` / `authvital.memberships` / `authvital.invitations` fluent API"
    The server SDK exposes these via **`createServerClient(...).integration.*`**
    (M2M / client-credentials), not a request-scoped fluent namespace. Also note:
    the integration client has **no tenant create/update/delete** — tenant CRUD is
    only available through the user-context REST endpoints on this page.

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

// A user's tenants
const { tenants } = await client.integration.listUserTenants({ userId });

// Tenant members (optionally include roles)
const { memberships } = await client.integration.listTenantMembers({
  tenantId,
  status: 'ACTIVE',
  includeRoles: true,
});

// Roles available in a tenant
const roles = await client.integration.getTenantRoles({ tenantId });

// Set a member's APPLICATION role (roleId = an app Role id + applicationId)
await client.integration.setMemberRole({ membershipId, roleId, applicationId });

// Invitations (roleId is a required TenantRole id; clientId drives the redirect)
const { sub, expiresAt } = await client.integration.sendInvitation({
  tenantId,
  email: 'newuser@example.com',
  roleId,                          // required (a TenantRole id)
  clientId: process.env.AV_CLIENT_ID!, // optional
  expiresInDays: 7,                // optional
  givenName: 'John',               // optional
  familyName: 'Doe',               // optional
});
const invites = await client.integration.listInvitations({ tenantId });
await client.integration.resendInvitation({ invitationId });
await client.integration.revokeInvitation({ invitationId });
```

See the [integration namespace overview](../sdk/server-sdk/namespaces/overview.md)
for exact signatures and return shapes.

---

## Related Documentation

- [Multi-Tenancy](../concepts/multi-tenancy.md)
- [Tenant Admin Guide](../admin/tenant-admin.md)
- [Access Control](../concepts/access-control.md)
