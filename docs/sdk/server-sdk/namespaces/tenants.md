# Tenants

> Listing a user's tenants and working with tenant data.

!!! info "There is no fluent `authvital.tenants.*` CRUD namespace"
    Earlier drafts described `authvital.tenants.get()`, `.create()`, `.update()`,
    `.delete()`, `.configureSso()`, etc. **The server SDK does not expose tenant
    CRUD.** The integration client provides membership/tenant *lookups*; creating
    and administering tenants is done through AuthVital's admin UI and the backend
    REST API ([API Reference → Tenant API](../../../api/tenant-api.md)).

## What the SDK provides (M2M integration client)

Verified against `packages/sdk-server/src/client/integration.ts`:

| Method | Params | Returns |
|--------|--------|---------|
| `client.integration.listUserTenants` | `{ userId }` | tenants the user belongs to |
| `client.integration.validateMembership` | `{ userId, tenantId }` | `{ valid, membership? }` |
| `client.integration.listTenantMembers` | `{ tenantId, status?, includeRoles? }` | `{ memberships }` |
| `client.integration.listUserMemberships` | `{ userId?, tenantId?, clientId?, status?, includeRoles? }` | `{ memberships }` |

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

// Which tenants does this user belong to? (great for an org picker)
const tenants = await client.integration.listUserTenants({ userId: 'user-123' });

// Is this user actually a member of this tenant?
const { valid, membership } = await client.integration.validateMembership({
  userId: 'user-123',
  tenantId: 'tenant-abc',
});
```

## The current user's tenant

The active tenant is carried in the access-token claim `tenant_id`. Read it from
the verified JWT rather than making a call:

```typescript
import { verifyToken } from '@authvital/server';

const { valid, payload } = await verifyToken(tokens.accessToken, {
  jwksUri: `${process.env.AV_HOST}/.well-known/jwks.json`,
  issuer: process.env.AV_HOST,
  audience: process.env.AV_CLIENT_ID,
});
const tenantId = payload.tenant_id;
```

## Creating / updating / deleting tenants & SSO config

Not part of the SDK. Use AuthVital's admin surfaces or call the backend REST
endpoints directly with `client.get()/post()/patch()/delete()`:

- [API Reference → Tenant API](../../../api/tenant-api.md)
- [Administration → Tenant Admin](../../../admin/tenant-admin.md)
- [Security → SSO](../../../security/sso.md)

## See also

- [Memberships](./memberships.md) · [Integration API (overview)](./overview.md)
