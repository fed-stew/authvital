# Permissions

> Two real ways to authorize: **JWT claims** (offline) and the **integration
> API** (live, M2M).

!!! info "There is no fluent `authvital.permissions.*(req, …)` namespace"
    Earlier drafts described `authvital.permissions.check(req, perm)`,
    `.checkMany(req, [...])`, `.list(req)`. **That API does not exist.** Use one
    of the two verified approaches below.

## Option 1 — JWT claims (no network call)

AuthVital bakes the caller's permissions into the access token. Verify the token,
then read the claims. This is what the `bff-express` example does.

```typescript
import { verifyToken, decodeToken } from '@authvital/server';
import type { EnhancedJwtPayload } from '@authvital/shared';

const { valid, payload } = await verifyToken(accessToken, {
  jwksUri: `${process.env.AV_HOST}/.well-known/jwks.json`,
  issuer: process.env.AV_HOST,
  audience: process.env.AV_CLIENT_ID,
});

const claims = payload as unknown as EnhancedJwtPayload;

function hasAppPermission(c: EnhancedJwtPayload | null, permission: string): boolean {
  return Boolean(c?.app_permissions?.includes(permission));
}

if (!hasAppPermission(claims, 'projects:create')) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

Relevant claims: `app_permissions`, `app_roles`, `tenant_roles`, `tenant_permissions`.
See [Reference → JWT Claims](../../../reference/jwt-claims.md).

## Option 2 — Integration API (live check, M2M)

Verified against `packages/sdk-server/src/client/integration.ts`:

| Method | Params | Returns |
|--------|--------|---------|
| `checkPermission` | `{ userId, tenantId, permission, applicationId? }` | `{ allowed: boolean; permission: string }` |
| `checkPermissions` | `{ userId, tenantId, permissions, applicationId? }` | `{ results: Record<string, boolean>; allAllowed: boolean }` |
| `getUserPermissions` | `{ userId, tenantId }` | `{ permissions: string[] }` |

```typescript
const { allowed } = await client.integration.checkPermission({
  userId: 'user-123',
  tenantId: 'tenant-abc',
  permission: 'projects:create',
});

const bulk = await client.integration.checkPermissions({
  userId: 'user-123',
  tenantId: 'tenant-abc',
  permissions: ['documents:read', 'documents:write'],
});
// bulk.results = { 'documents:read': true, 'documents:write': false }
// bulk.allAllowed = false   // true only if EVERY permission is allowed
const hasAny = Object.values(bulk.results).some(Boolean);
```

!!! warning "`checkPermissions` reports ALL-of, not ANY-of"
    The bulk response's `allAllowed` is `true` only when *every* requested
    permission is granted. For "any of these" semantics, inspect the `results`
    map yourself. (The current backend does not compute an `anyAllowed` flag.)

!!! danger "`client.hasPermission()` targets an unimplemented endpoint"
    The convenience method `ServerClient.hasPermission(permission)` POSTs to
    `/api/auth/check-permission`, which **the backend does not currently
    implement** (permission checks live under `/api/integration/*`). Prefer
    `client.integration.checkPermission(...)` or JWT-claim checks until this is
    reconciled in the SDK.

## See also

- [JWT Validation](../jwt-validation.md) · [Middleware](../middleware.md) · [Integration API (overview)](./overview.md)
