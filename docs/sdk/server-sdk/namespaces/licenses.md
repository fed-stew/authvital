# Licenses

> Two distinct surfaces: **M2M licensing automation** via `client.integration`
> (writes/reads acting as your app) and **per-user entitlement reads** directly
> on `client` (using the end user's access token).

!!! info "There is no fluent `authvital.licenses.*(req, …)` namespace"
    Earlier drafts described a large surface split into "user-scoped (JWT)" and
    "admin (M2M)" methods — `grant(req, …)`, `check(req, userId, appId)`,
    `getTenantOverview()`, `grantBulk()`, `getUsageTrends()`, `getAuditLog()`,
    and more. **Most of those do not exist.** The real, verified surface is the
    two sets below. Anything not listed here is not provided by the SDK.

## Getting the client

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});
```

## M2M automation methods (`client.integration.*`)

These use the **Client Credentials (M2M)** grant automatically and act as your
application. `tenantId` is passed explicitly. Verified against
`packages/sdk-server/src/client/integration.ts`:

| Method | Params | Returns |
|--------|--------|---------|
| `grantLicense` | `{ userId, tenantId, applicationId, licenseTypeId }` | result |
| `revokeLicense` | `{ userId, tenantId, applicationId }` | result |
| `changeLicenseType` | `{ userId, tenantId, applicationId, newLicenseTypeId }` | result |
| `getUserLicenses` | `{ userId, tenantId }` | `{ licenses: UserLicense[] }` |
| `getLicenseHolders` | `{ tenantId, applicationId }` | `{ holders: LicenseHolder[] }` |
| `getUsageOverview` | `{ tenantId }` | `LicenseUsageOverview` |

```typescript
// Grant / change / revoke (M2M automation)
await client.integration.grantLicense({
  userId: 'user-123', tenantId: 'tenant-abc',
  applicationId: 'app-789', licenseTypeId: 'license-pro',
});
await client.integration.changeLicenseType({
  userId: 'user-123', tenantId: 'tenant-abc',
  applicationId: 'app-789', newLicenseTypeId: 'license-enterprise',
});
await client.integration.revokeLicense({
  userId: 'user-123', tenantId: 'tenant-abc', applicationId: 'app-789',
});

// Report
const overview = await client.integration.getUsageOverview({ tenantId: 'tenant-abc' });
const { holders } = await client.integration.getLicenseHolders({
  tenantId: 'tenant-abc', applicationId: 'app-789',
});
const { licenses } = await client.integration.getUserLicenses({
  userId: 'user-123', tenantId: 'tenant-abc',
});
```

## Entitlement reads (`client.*`, user token)

!!! warning "These moved off `client.integration` and dropped `tenantId`"
    `checkLicense`, `checkLicenseFeature`, `getAppLicensedUsers` and
    `countLicensedUsers` live directly on the **`ServerClient`** (not
    `client.integration`). They call `GET /api/integration/licenses/*`, which is
    guarded by `JwtAuthGuard + TenantPermissionGuard(licenses:view)` and derives
    `tenantId` **from the user's JWT** — so they run on the session user's access
    token and take **no `tenantId` param**. An M2M token has no
    `tenant_permissions`/`tenant_id` and is rejected by these routes.

Construct the client with the user's `SessionTokens` (or let the session
middleware do it), then call:

| Method | Params | Returns |
|--------|--------|---------|
| `checkLicense` | `{ userId, applicationId }` | `LicenseCheckResult` |
| `checkLicenseFeature` | `{ userId, applicationId, featureKey }` | `{ hasFeature: boolean }` |
| `getAppLicensedUsers` | `{ applicationId }` | `LicensedUser[]` |
| `countLicensedUsers` | `{ applicationId }` | `{ count: number }` |

```typescript
// `client` carries the end user's session tokens; tenantId comes from the JWT.
const result = await client.checkLicense({
  userId: 'user-123', applicationId: 'app-789',
});
if (result.hasLicense) {
  console.log('Licensed as', result.licenseTypeName);
}

const { hasFeature } = await client.checkLicenseFeature({
  userId: 'user-123', applicationId: 'app-789', featureKey: 'sso',
});

const users = await client.getAppLicensedUsers({ applicationId: 'app-789' });
const { count } = await client.countLicensedUsers({ applicationId: 'app-789' });
```

## Types

```typescript
interface UserLicense {
  id: string;
  applicationId: string;
  licenseTypeId: string;
  licenseTypeName?: string;
  grantedAt?: string;
}

interface LicenseHolder {
  userId: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  licenseType: string;
  grantedAt?: string;
}

interface LicenseUsageOverview {
  totalSeats: number;
  usedSeats: number;
  availableSeats: number;
  applications: Array<{
    applicationId: string;
    applicationName: string;
    totalSeats: number;
    usedSeats: number;
  }>;
}

// ServerClient entitlement-read shapes
interface LicenseCheckResult {
  hasLicense: boolean;
  licenseType?: string;
  licenseTypeName?: string;
  features?: Record<string, unknown>;
  reason?: string;
}

interface LicensedUser {
  userId: string;
  licenseType: string;
  licenseTypeName: string;
}
```

## Feature gating example

```typescript
// Gate a feature for the current session user (user-token entitlement read).
async function requireFeature(userId: string, applicationId: string, featureKey: string) {
  const { hasFeature } = await client.checkLicenseFeature({
    userId, applicationId, featureKey,
  });
  if (!hasFeature) throw new Error(`Feature '${featureKey}' requires an upgrade`);
}
```

!!! note "Managed in the hosted console, not the SDK"
    Bulk grant/revoke, **usage trends** (`GET /api/tenants/:tenantId/licenses/usage-trends`,
    gated on `billing:view`), subscription provisioning/cancel and the
    members×apps matrix are surfaced in the **hosted console**
    (`/tenant/:tenantId/licenses`, `/billing`, `/access-matrix`) — deep-link into
    it with the [`@authvital/core` management-url helpers](../oauth-flow.md).
    Where a corresponding tenant-scoped REST route exists you can also call it
    directly with `client.get()/post()`.

## See also

- [Entitlements](./entitlements.md) · [Concepts → Licensing](../../../concepts/licensing.md) · [Integration API (overview)](./overview.md)
