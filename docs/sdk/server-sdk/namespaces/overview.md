# Integration API (server-to-server)

> The real `client.integration.*` methods for backend operations.

!!! warning "There is no fluent `authvital.tenants.*` namespace API"
    Earlier drafts of these docs described a fluent, request-scoped namespace API
    (`authvital.invitations.send(req, …)`, `authvital.memberships.listForTenant(req)`,
    `authvital.tenants.get(id)`, etc.). **That API does not exist in the code.**

    The real server-to-server surface is a single **integration client** reached
    via `client.integration`, where `client = createServerClient(...)`. Every
    method uses the OAuth **Client Credentials (M2M)** grant automatically — you
    do not pass an Express `req`; you pass explicit params like `{ tenantId }` /
    `{ userId }`.

    The per-topic pages in this section have been reconciled to the real API:
    each maps to the verified `client.integration.*` methods, or explains what
    the SDK genuinely does not provide (auth, sso, admin, session-listing). This
    page and the source in `packages/sdk-server/src/client/integration.ts` remain
    the canonical reference for method names, params and return shapes.

## Getting the integration client

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

// M2M token is acquired + cached automatically on first call
const { memberships } = await client.integration.listTenantMembers({ tenantId });
```

## Memberships

| Method | Signature (params) | Returns |
|--------|--------------------|---------|
| `validateMembership` | `{ userId, tenantId }` | `{ valid, membership? }` |
| `listTenantMembers` | `{ tenantId, status?, includeRoles? }` | `{ memberships }` |
| `listUserMemberships` | `{ userId?, tenantId?, clientId?, status?, includeRoles? }` | `{ memberships }` |
| `listUserTenants` | `{ userId }` | tenants for the user |

```typescript
// Which tenants does a user belong to?
const tenants = await client.integration.listUserTenants({ userId });
```

## Roles

| Method | Signature (params) | Returns |
|--------|--------------------|---------|
| `getApplicationRoles` | `{ clientId, tenantId? }` | `ApplicationRolesResult` |
| `getTenantRoles` | `{ tenantId? }` (optional) | `{ roles }` |
| `setMemberRole` | `{ membershipId, roleId, applicationId }` | result (sets an **app** role) |

## Permissions & entitlements

| Method | Signature (params) | Returns |
|--------|--------------------|---------|
| `checkPermission` | `{ userId, tenantId, permission, applicationId? }` | `PermissionCheckResult` |
| `checkPermissions` | `{ userId, tenantId, permissions, applicationId? }` | `BulkPermissionCheckResult` |
| `getUserPermissions` | `{ userId, tenantId }` | `{ permissions }` |
| `checkFeature` | `{ tenantId, feature, applicationId? }` | `{ hasAccess, licenseType, reason? }` |
| `checkSeats` | `{ tenantId, applicationId? }` | `SeatCheckResult` |
| `getSubscriptionStatus` | `{ tenantId, applicationId? }` | subscription status |

```typescript
const { allowed } = await client.integration.checkPermission({
  userId, tenantId, permission: 'projects:create',
});
```

## Invitations

| Method | Signature (params) | Returns |
|--------|--------------------|---------|
| `sendInvitation` | `{ tenantId, email, roleId, clientId?, expiresInDays?, givenName?, familyName? }` | `{ sub, expiresAt }` |
| `listInvitations` | `{ tenantId }` | `{ invitations }` |
| `revokeInvitation` | `{ invitationId }` | `{ success, message }` |
| `resendInvitation` | `{ invitationId }` | `{ expiresAt }` |

```typescript
await client.integration.sendInvitation({ tenantId, email: 'new@corp.com' });
const { invitations } = await client.integration.listInvitations({ tenantId });
```

## Licensing

| Method | Signature (params) | Returns |
|--------|--------------------|---------|
| `grantLicense` | `{ userId, tenantId, applicationId, licenseTypeId }` | result |
| `revokeLicense` | `{ userId, tenantId, applicationId }` | result |
| `changeLicenseType` | `{ userId, tenantId, applicationId, newLicenseTypeId }` | result |
| `getUserLicenses` | `{ userId, tenantId }` | `{ licenses }` |
| `getLicenseHolders` | `{ tenantId, applicationId }` | `{ holders }` |
| `getUsageOverview` | `{ tenantId }` | `LicenseUsageOverview` |

```typescript
const { licenses } = await client.integration.getUserLicenses({ userId, tenantId });
const overview = await client.integration.getUsageOverview({ tenantId });
```

> The per-user **entitlement reads** (`checkLicense`, `checkLicenseFeature`,
> `getAppLicensedUsers`, `countLicensedUsers`) are **not** on `client.integration`.
> They live directly on `ServerClient` and use the user's access token (see the
> next section and [Licenses](./licenses.md)).

## MFA

| Method | Signature (params) | Returns |
|--------|--------------------|---------|
| `getUserMfaStatus` | `{ userId }` | `{ enabled, methods? }` |

## Non-integration convenience methods

These live directly on the `ServerClient` (they use the session's user access
token, not M2M):

| Method | Description |
|--------|-------------|
| `client.getCurrentUser()` | `GET /api/users/me` -> `User \| null` |
| `client.getTenantMemberships()` | `GET /api/tenants/memberships` |
| `client.hasPermission(permission)` | fail-closed check via `POST /api/integration/check-permission` (identity read from the access token) -> `boolean` |
| `client.checkLicense({ userId, applicationId })` | entitlement read; `tenantId` from the user JWT -> `LicenseCheckResult` |
| `client.checkLicenseFeature({ userId, applicationId, featureKey })` | entitlement read -> `{ hasFeature }` |
| `client.getAppLicensedUsers({ applicationId })` | entitlement read -> `LicensedUser[]` |
| `client.countLicensedUsers({ applicationId })` | entitlement read -> `{ count }` |
| `client.introspectToken(token?)` | RFC 7662 introspection |
| `client.revokeToken(token?, hint?)` | RFC 7009 revocation |
| `client.getClientCredentialsToken(scope?)` | Raw M2M token |

!!! tip "Tenant-admin UI = hosted console, not the SDK"
    Managing members, app access, SSO, domains, billing and audit for humans is
    done in the **hosted console** (`/tenant/:tenantId/*`). Deep-link into it
    with the `@authvital/core` helpers (`getManagementUrls`, `getAppPickerUrl`,
    `getOrgPickerUrl`, `getAccountSettingsUrl`) — see [OAuth Flow](../oauth-flow.md).
    The SDK's job is auth + gating + entitlement reads + M2M automation.
