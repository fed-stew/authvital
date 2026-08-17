# Licensing API Reference

> REST API endpoints for license and subscription management.

!!! tip "Use the SDK integration client"
    These endpoints are documented for reference; for server-to-server use, prefer
    `createServerClient(...).integration.*` — see the
    [Licenses namespace](../sdk/server-sdk/namespaces/licenses.md). (There is no
    `authvital.licenses.*` fluent namespace.)

---

## Endpoints Overview

### License checks / entitlement reads (`/api/integration/licenses/*`)

!!! info "These run on the **user's** access token, not M2M"
    Every route below is guarded by `JwtAuthGuard + TenantPermissionGuard(licenses:view)`
    and derives `tenantId` **from the JWT**. In the SDK they are exposed on the
    `ServerClient` itself (`client.checkLicense`, `client.checkLicenseFeature`,
    `client.getAppLicensedUsers`, `client.countLicensedUsers`) — **not** on
    `client.integration.*`, and they take no `tenantId` param. An M2M
    client-credentials token is rejected by these routes.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/integration/licenses/check` | GET/POST | Check user's license |
| `/api/integration/licenses/check-bulk` | POST | Bulk license check |
| `/api/integration/licenses/feature` | GET/POST | Check feature access |
| `/api/integration/licenses/type` | GET | Get user's license type |
| `/api/integration/licenses/apps/:applicationId/users` | GET | List licensed users |
| `/api/integration/licenses/apps/:applicationId/count` | GET | Count licensed users |

### License management (M2M, `/api/integration/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/integration/grant-license` | POST | Grant license to user |
| `/api/integration/revoke-license` | POST | Revoke license from user |
| `/api/integration/change-license-type` | POST | Change a user's license type |
| `/api/integration/user-licenses` | GET | A user's licenses |
| `/api/integration/license-holders` | GET | License holders |
| `/api/integration/usage-overview` | GET | Usage overview |

### Tenant-scoped licensing (`/api/tenants/:tenantId/licenses/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tenants/:tenantId/licenses/overview` | GET | Tenant license overview |
| `/api/tenants/:tenantId/licenses/subscriptions` | GET/POST | List / create subscriptions |
| `/api/tenants/:tenantId/licenses/available-types` | GET | Available license types |
| `/api/tenants/:tenantId/licenses/grant` | POST | Grant (tenant-scoped, `licenses:manage`) |
| `/api/tenants/:tenantId/licenses/revoke` | POST | Revoke (tenant-scoped, `licenses:manage`) |
| `/api/tenants/:tenantId/licenses/usage-trends` | GET | Seat-usage time series for charts (`billing:view`) |
| `/api/tenants/:tenantId/licenses/subscriptions/:subscriptionId/quantity` | PATCH | Resize a subscription (`licenses:provision`) |
| `/api/tenants/:tenantId/licenses/subscriptions/:subscriptionId/cancel` | POST | Cancel a subscription (`licenses:provision`) |

!!! warning "Path corrections vs earlier drafts"
    There is **no** `/api/licensing/*` controller. Grant/revoke on the
    integration API are `/api/integration/grant-license` and
    `/api/integration/revoke-license` (M2M) — **not**
    `/api/integration/licenses/grant`. Tenant license overview/subscriptions live
    under `/api/tenants/:tenantId/licenses/*`.

---

## SDK vs Raw API

=== "SDK (integration client)"

    ```typescript
    import { createServerClient } from '@authvital/server';

    const client = createServerClient({ /* authVitalHost, clientId, clientSecret */ });

    // `client` carries the user's session tokens; tenantId comes from the JWT.
    // These entitlement reads live on the ServerClient, NOT client.integration.

    // Check license
    const result = await client.checkLicense({
      userId, applicationId: 'app-123',
    });
    if (result.hasLicense) console.log('License type:', result.licenseType);

    // Check feature
    const { hasFeature } = await client.checkLicenseFeature({
      userId, applicationId: 'app-123', featureKey: 'sso',
    });
    ```

=== "Raw API"

    ```bash
    # Check license
    curl -H "Authorization: Bearer $JWT" \
      "https://auth.example.com/api/integration/licenses/check?applicationId=app-123"
    
    # Check feature
    curl -H "Authorization: Bearer $JWT" \
      "https://auth.example.com/api/integration/licenses/feature?applicationId=app-123&featureKey=sso"
    ```

---

## Check License

### GET /api/integration/licenses/check

Check if the authenticated user (or specified user) has a license for an application.

!!! info "Tenant from JWT"
    The `tenantId` is automatically extracted from the JWT for security.
    You cannot query licenses for other tenants.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | No | User to check (defaults to JWT subject) |
| `applicationId` | string | Yes | Application to check |

**Response (200 OK) - Has License:**

```json
{
  "hasLicense": true,
  "licenseType": "pro",
  "licenseTypeName": "Pro Plan",
  "features": ["api-access", "advanced-reports", "sso"],
  "assignedAt": "2024-01-15T10:30:00Z"
}
```

**Response (200 OK) - No License:**

```json
{
  "hasLicense": false,
  "licenseType": null,
  "licenseTypeName": null,
  "features": []
}
```

---

## Check Feature

### GET /api/integration/licenses/feature

Check if a user has access to a specific license feature.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | No | User to check |
| `applicationId` | string | Yes | Application to check |
| `featureKey` | string | Yes | Feature key to check |

**Response (200 OK):**

```json
{
  "hasFeature": true
}
```

---

## Get License Type

### GET /api/integration/licenses/type

Get the license type slug for a user.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | No | User to check |
| `applicationId` | string | Yes | Application to check |

**Response (200 OK):**

```json
{
  "licenseType": "pro"
}
```

---

## List Licensed Users

### GET /api/integration/licenses/apps/:applicationId/users

Get all users with licenses for an application in the authenticated tenant.

**Response (200 OK):**

```json
[
  {
    "userId": "user-123",
    "email": "user@example.com",
    "givenName": "John",
    "familyName": "Doe",
    "licenseType": "pro",
    "licenseTypeName": "Pro Plan",
    "assignedAt": "2024-01-15T10:30:00Z"
  }
]
```

---

## Count Licensed Users

### GET /api/integration/licenses/apps/:applicationId/count

Get count of licensed users for an application.

**Response (200 OK):**

```json
{
  "count": 42
}
```

---

## Grant License

### POST /api/integration/grant-license

Assign a license to a user (M2M). A tenant-scoped variant exists at
`POST /api/tenants/:tenantId/licenses/grant`.

**Request:**

```json
{
  "userId": "user-123",
  "applicationId": "app-456",
  "licenseTypeId": "license-pro"
}
```

**Response (201 Created):**

```json
{
  "id": "assignment-789",
  "userId": "user-123",
  "licenseTypeId": "license-pro",
  "licenseTypeName": "Pro Plan",
  "assignedAt": "2024-01-15T10:30:00Z"
}
```

**SDK Equivalent:**

```typescript
await client.integration.grantLicense({
  userId: 'user-123',
  applicationId: 'app-456',
  licenseTypeId: 'license-pro',
});
```

---

## Revoke License

### POST /api/integration/revoke-license

Remove a license from a user (M2M). Tenant-scoped variant:
`POST /api/tenants/:tenantId/licenses/revoke`.

**Request:**

```json
{
  "userId": "user-123",
  "applicationId": "app-456"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "License revoked"
}
```

**SDK Equivalent:**

```typescript
await client.integration.revokeLicense({
  userId: 'user-123',
  applicationId: 'app-456',
});
```

---

## Admin: Tenant License Overview

### GET /api/tenants/:tenantId/licenses/overview

Get full license overview for a tenant. (The M2M integration equivalent is
`GET /api/integration/usage-overview`.)

**Response (200 OK):**

```json
{
  "tenantId": "tenant-123",
  "tenantName": "Acme Corporation",
  "totalSeatsOwned": 50,
  "totalSeatsAssigned": 35,
  "totalSeatsAvailable": 15,
  "subscriptions": [
    {
      "applicationId": "app-456",
      "applicationName": "Project Manager",
      "licenseTypeId": "license-pro",
      "licenseTypeName": "Pro Plan",
      "quantityPurchased": 50,
      "quantityAssigned": 35,
      "quantityAvailable": 15,
      "status": "ACTIVE"
    }
  ]
}
```

**SDK Equivalent:**

```typescript
const overview = await client.integration.getUsageOverview({ tenantId: 'tenant-123' });
```

---

## Admin: Usage Trends

### GET /api/tenants/:tenantId/licenses/usage-trends

Seat-usage time series (owned vs assigned) for charts, built from the daily
snapshots written by the license-lifecycle sweep.

**Guards:** `JwtAuthGuard + TenantIdentifierGuard + TenantAccessGuard + PermissionGuard`
· **Permission:** `billing:view` · `tenantId` from the URL.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | 30 | Size of the trailing time window in days |

> Not exposed as an SDK wrapper; call it with `client.get(...)` or surface it via
> the hosted console's Billing/Usage view (`/tenant/:tenantId/billing`). Historical
> backfill + per-environment snapshot scheduling are still open — see the
> [authorization model gap appendix](../sdk/authorization-model.md#6-gap-remediation-appendix).

---

## Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `INVALID_APPLICATION_ID` | Application not found |
| 400 | `NO_SEATS_AVAILABLE` | All license seats are assigned |
| 400 | `ALREADY_LICENSED` | User already has a license for this app |
| 401 | `UNAUTHORIZED` | Invalid or missing JWT |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `LICENSE_NOT_FOUND` | License assignment not found |
