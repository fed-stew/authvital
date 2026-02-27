# Licensing API Reference

> REST API endpoints for license and subscription management.

!!! tip "SDK Recommended"
    While these endpoints are documented for reference, we strongly recommend using
    the [Server SDK Licenses Namespace](../sdk/server-sdk/namespaces/licenses.md)
    for all license operations.

---

## Endpoints Overview

### Integration API (JWT Auth)

These endpoints are for application integrations and require JWT authentication:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/integration/licenses/check` | GET/POST | Check user's license |
| `/api/integration/licenses/feature` | GET/POST | Check feature access |
| `/api/integration/licenses/type` | GET | Get user's license type |
| `/api/integration/licenses/apps/:id/users` | GET | List licensed users |
| `/api/integration/licenses/apps/:id/count` | GET | Count licensed users |
| `/api/integration/licenses/grant` | POST | Grant license to user |
| `/api/integration/licenses/revoke` | POST | Revoke license from user |

### Admin API (M2M Auth)

These endpoints require Super Admin or M2M authentication:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/licensing/license-types` | GET/POST | Manage license types |
| `/api/licensing/tenants/:id/license-overview` | GET | Tenant license overview |
| `/api/licensing/tenants/:id/subscriptions` | GET | List subscriptions |

---

## SDK vs Raw API

=== "SDK (Recommended)"

    ```typescript
    import { createAuthVital } from '@authvital/sdk/server';
    
    const authvital = createAuthVital({ /* config */ });
    
    // Check license
    const result = await authvital.licenses.check(req, undefined, 'app-123');
    
    if (result.hasLicense) {
      console.log('License type:', result.licenseType);
    }
    
    // Check feature
    const { hasFeature } = await authvital.licenses.hasFeature(
      req, undefined, 'app-123', 'sso'
    );
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

### POST /api/integration/licenses/grant

Assign a license to a user.

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
await authvital.licenses.grant(req, {
  userId: 'user-123',
  applicationId: 'app-456',
  licenseTypeId: 'license-pro',
});
```

---

## Revoke License

### POST /api/integration/licenses/revoke

Remove a license from a user.

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
await authvital.licenses.revoke(req, {
  userId: 'user-123',
  applicationId: 'app-456',
});
```

---

## Admin: Tenant License Overview

### GET /api/licensing/tenants/:tenantId/license-overview

Get full license overview for a tenant. Requires Super Admin or M2M auth.

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
const overview = await authvital.licenses.getTenantOverview('tenant-123');
```

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
