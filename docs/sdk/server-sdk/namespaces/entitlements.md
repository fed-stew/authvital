# Entitlements

> Feature flags, seat availability and subscription status via `client.integration`.

!!! info "There is no fluent `authvital.entitlements.*(req, …)` namespace"
    Earlier drafts described `authvital.entitlements.canPerform(req, 'seats')`
    and `.decrementUsage(req, 'seats')`. **That API does not exist.** Use the M2M
    integration methods below.

## Methods

Verified against `packages/sdk-server/src/client/integration.ts`:

| Method | Params | Returns |
|--------|--------|---------|
| `checkFeature` | `{ tenantId, feature, applicationId? }` | `{ hasAccess, licenseType, reason? }` |
| `checkSeats` | `{ tenantId, applicationId? }` | `SeatCheckResult` |
| `getSubscriptionStatus` | `{ tenantId, applicationId? }` | subscription status |

!!! info "`checkFeature` is a **tenant-level** entitlement check"
    It checks whether the TENANT has access to a feature (not a per-user check),
    so it sends `feature` (not `featureKey`) and takes **no `userId`**. For a
    per-user feature check gated by the user's license, use
    `client.checkLicenseFeature({ userId, applicationId, featureKey })` — see
    [Licenses](./licenses.md).

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

// Does the tenant have access to a feature?
const { hasAccess } = await client.integration.checkFeature({
  tenantId: 'tenant-abc',
  feature: 'advanced-analytics',
});

// Are there seats to add another member?
const seats = await client.integration.checkSeats({ tenantId: 'tenant-abc' });
if (!seats.allowed) {
  // seats.reason, seats.currentUsage, seats.limit, seats.wouldTriggerOverage
}

// Subscription status for a tenant
const status = await client.integration.getSubscriptionStatus({ tenantId: 'tenant-abc' });
```

`SeatCheckResult` shape (from the SDK types):

```typescript
interface SeatCheckResult {
  allowed: boolean;
  currentUsage?: number;
  limit?: number;
  reason?: string;
  wouldTriggerOverage?: boolean;
  overagePriceId?: string | null;
}
```

!!! note "No usage-decrement method"
    There is no `decrementUsage` in the SDK. Seat usage is derived from actual
    license assignments — grant/revoke licenses (see [Licenses](./licenses.md))
    and usage updates accordingly.

## Example: seat gate before inviting

```typescript
const seats = await client.integration.checkSeats({ tenantId });
if (!seats.allowed) {
  return res.status(402).json({
    error: 'Seat limit reached',
    used: seats.currentUsage,
    limit: seats.limit,
    reason: seats.reason,
  });
}
await client.integration.sendInvitation({ tenantId, email, roleId, clientId: process.env.AV_CLIENT_ID! });
```

## See also

- [Licenses](./licenses.md) · [Invitations](./invitations.md) · [Integration API (overview)](./overview.md)
