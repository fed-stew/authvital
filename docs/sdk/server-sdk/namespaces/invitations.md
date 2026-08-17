# Invitations

> Send, list, resend and revoke tenant invitations via `client.integration`.

!!! info "There is no fluent `authvital.invitations.*(req, …)` namespace"
    Earlier drafts described `authvital.invitations.send(req, …)`,
    `.listPending(req)`, `.resend(req, …)`, `.revoke(req, id)` that read the
    tenant from the JWT. **That API does not exist.** Use the M2M integration
    client below; you pass `tenantId` / `invitationId` explicitly.

## Methods

Verified against `packages/sdk-server/src/client/integration.ts`:

| Method | Params | Returns |
|--------|--------|---------|
| `sendInvitation` | `{ tenantId, email, roleId, clientId?, expiresInDays?, givenName?, familyName? }` | `{ sub, expiresAt }` |
| `listInvitations` | `{ tenantId }` | `{ invitations: Invitation[] }` |
| `revokeInvitation` | `{ invitationId }` | `{ success: boolean; message: string }` |
| `resendInvitation` | `{ invitationId }` | `{ expiresAt: string }` |

!!! info "`roleId` is required and is a **TenantRole** id"
    `sendInvitation` requires a singular `roleId` — a **TenantRole** id (from
    `getTenantRoles`), the role the invitee gets on joining. `clientId` (the
    OAuth client the invite is for) drives the accept redirect. Verified against
    `SendInvitationDto` + `IntegrationInvitationsService`.

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

// Send an invitation
const { roles } = await client.integration.getTenantRoles();
const { sub, expiresAt } = await client.integration.sendInvitation({
  tenantId: 'tenant-abc',
  email: 'new@corp.com',
  roleId: roles.find((r) => r.slug === 'member')!.slug, // a TenantRole id
  clientId: process.env.AV_CLIENT_ID!,
  expiresInDays: 7,
  givenName: 'Jordan',
  familyName: 'Lee',
});

// List pending invitations
const { invitations } = await client.integration.listInvitations({
  tenantId: 'tenant-abc',
});

// Resend / revoke by invitation id
await client.integration.resendInvitation({ invitationId: 'inv-123' });
await client.integration.revokeInvitation({ invitationId: 'inv-123' });
```

`Invitation` shape (from the SDK types):

```typescript
interface Invitation {
  id: string;
  email: string;
  status: string;
  roleId?: string;
  expiresAt?: string;
  createdAt?: string;
}
```

!!! note "Human-facing invitations live in the hosted console"
    `client.integration.sendInvitation` is the **M2M automation** path. For the
    interactive tenant-admin flow (invite/resend/revoke with a UI), send admins
    to the hosted console at `/tenant/:tenantId/members` — deep-link with the
    [`@authvital/core` management-url helpers](../oauth-flow.md).

## Example: gate invites on seat availability

```typescript
const seats = await client.integration.checkSeats({ tenantId: 'tenant-abc' });
if (!seats.allowed) {
  throw new Error(seats.reason ?? 'No seats available');
}
await client.integration.sendInvitation({
  tenantId: 'tenant-abc', email, roleId, clientId: process.env.AV_CLIENT_ID!,
});
```

## See also

- [Memberships & Roles](./memberships.md) · [Entitlements](./entitlements.md) · [Integration API (overview)](./overview.md)
