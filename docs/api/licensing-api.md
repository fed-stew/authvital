# Licensing API Reference

> REST API endpoints for license and subscription management.

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/licenses/check` | GET | Check current user's license |
| `/api/tenants/:id/subscriptions` | GET | List tenant subscriptions |
| `/api/tenants/:id/subscriptions` | POST | Create subscription |
| `/api/tenants/:id/subscriptions/:subId` | PATCH | Update subscription |
| `/api/tenants/:id/licenses` | GET | List license assignments |
| `/api/tenants/:id/licenses` | POST | Assign license |
| `/api/tenants/:id/licenses/:userId` | DELETE | Unassign license |

---

## Check User License

### GET /api/licenses/check

Check the current user's license status for an application.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `applicationId` | string | Yes | Application to check |
| `tenantId` | string | No | Specific tenant (uses current if omitted) |

**Response (200 OK) - Has License:**

```json
{
  "hasLicense": true,
  "licenseType": {
    "id": "lt-pro",
    "name": "Pro Plan",
    "slug": "pro"
  },
  "features": {
    "api-access": true,
    "advanced-reports": true,
    "sso": true,
    "audit-logs": false
  },
  "subscription": {
    "status": "ACTIVE",
    "currentPeriodEnd": "2024-12-31T23:59:59Z"
  },
  "assignedAt": "2024-01-15T10:30:00Z"
}
```

**Response (200 OK) - No License:**

```json
{
  "hasLicense": false,
  "reason": "NO_SUBSCRIPTION",
  "availableLicenseTypes": [
    {
      "id": "lt-free",
      "name": "Free",
      "slug": "free"
    },
    {
      "id": "lt-pro",
      "name": "Pro",
      "slug": "pro"
    }
  ]
}
```

**Reason Codes:**

| Reason | Description |
|--------|-------------|
| `NO_SUBSCRIPTION` | Tenant has no subscription |
| `NO_SEATS_AVAILABLE` | All seats assigned |
| `NOT_ASSIGNED` | User not assigned a seat |
| `SUBSCRIPTION_EXPIRED` | Subscription has expired |

---

## Check Feature Access

### GET /api/licenses/check/feature/:featureKey

Check if user has access to a specific feature.

**Response (200 OK):**

```json
{
  "feature": "api-access",
  "hasAccess": true,
  "licenseType": "pro"
}
```

---

## List Tenant Subscriptions

### GET /api/tenants/:tenantId/subscriptions

List all subscriptions for a tenant.

**Response (200 OK):**

```json
{
  "subscriptions": [
    {
      "id": "sub-uuid",
      "applicationId": "app-uuid",
      "applicationName": "Project Manager",
      "licenseType": {
        "id": "lt-pro",
        "name": "Pro Plan",
        "slug": "pro",
        "features": {
          "api-access": true,
          "advanced-reports": true,
          "sso": true
        }
      },
      "quantityPurchased": 10,
      "quantityAssigned": 7,
      "status": "ACTIVE",
      "currentPeriodEnd": "2024-12-31T23:59:59Z",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## Create Subscription

### POST /api/tenants/:tenantId/subscriptions

Create a new subscription for a tenant.

**Request:**

```json
{
  "applicationId": "app-uuid",
  "licenseTypeId": "lt-pro",
  "quantityPurchased": 10,
  "externalId": "stripe_sub_xxx"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `applicationId` | string | Yes | Application ID |
| `licenseTypeId` | string | Yes | License type ID |
| `quantityPurchased` | number | No | Seats (for PER_SEAT mode) |
| `externalId` | string | No | Reference to billing system |

**Response (201 Created):**

```json
{
  "id": "sub-uuid",
  "applicationId": "app-uuid",
  "licenseTypeId": "lt-pro",
  "quantityPurchased": 10,
  "status": "ACTIVE",
  "currentPeriodEnd": "2025-01-15T10:30:00Z",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

## Update Subscription

### PATCH /api/tenants/:tenantId/subscriptions/:subscriptionId

Update subscription details.

**Request:**

```json
{
  "quantityPurchased": 20,
  "licenseTypeId": "lt-enterprise",
  "status": "ACTIVE",
  "currentPeriodEnd": "2025-12-31T23:59:59Z"
}
```

**Response (200 OK):**

```json
{
  "id": "sub-uuid",
  "quantityPurchased": 20,
  "licenseTypeId": "lt-enterprise",
  "status": "ACTIVE",
  "currentPeriodEnd": "2025-12-31T23:59:59Z",
  "updatedAt": "2024-01-20T16:00:00Z"
}
```

---

## Cancel Subscription

### POST /api/tenants/:tenantId/subscriptions/:subscriptionId/cancel

Cancel a subscription.

**Request:**

```json
{
  "atPeriodEnd": true
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `atPeriodEnd` | boolean | true | Cancel at end of period vs immediately |

**Response (200 OK):**

```json
{
  "id": "sub-uuid",
  "status": "CANCELED",
  "canceledAt": "2024-01-20T16:00:00Z",
  "currentPeriodEnd": "2024-12-31T23:59:59Z"
}
```

---

## List License Assignments

### GET /api/tenants/:tenantId/licenses

List all license assignments for a tenant.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `applicationId` | string | all | Filter by application |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page |

**Response (200 OK):**

```json
{
  "assignments": [
    {
      "id": "assignment-uuid",
      "userId": "user-uuid",
      "user": {
        "email": "user@example.com",
        "displayName": "Jane Smith"
      },
      "subscriptionId": "sub-uuid",
      "licenseType": {
        "id": "lt-pro",
        "name": "Pro Plan"
      },
      "assignedAt": "2024-01-15T10:30:00Z",
      "assignedBy": {
        "id": "admin-uuid",
        "displayName": "Admin User"
      }
    }
  ],
  "stats": {
    "purchased": 10,
    "assigned": 7,
    "available": 3
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 7
  }
}
```

---

## Assign License

### POST /api/tenants/:tenantId/licenses

Assign a license seat to a user.

**Request:**

```json
{
  "userId": "user-uuid",
  "applicationId": "app-uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | User to assign to |
| `applicationId` | string | Yes | Application to assign for |

**Response (201 Created):**

```json
{
  "id": "assignment-uuid",
  "userId": "user-uuid",
  "applicationId": "app-uuid",
  "subscriptionId": "sub-uuid",
  "licenseType": {
    "id": "lt-pro",
    "name": "Pro Plan"
  },
  "assignedAt": "2024-01-20T16:00:00Z"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `NO_SUBSCRIPTION` | Tenant has no active subscription |
| 400 | `NO_SEATS_AVAILABLE` | All seats assigned |
| 409 | `ALREADY_ASSIGNED` | User already has license |

---

## Unassign License

### DELETE /api/tenants/:tenantId/licenses/:userId

Remove a user's license assignment.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `applicationId` | string | Yes | Which application |

**Response (200 OK):**

```json
{
  "success": true,
  "message": "License unassigned",
  "seatsAvailable": 4
}
```

---

## Bulk Assign Licenses

### POST /api/tenants/:tenantId/licenses/bulk

Assign licenses to multiple users.

**Request:**

```json
{
  "applicationId": "app-uuid",
  "userIds": ["user-1", "user-2", "user-3"]
}
```

**Response (200 OK):**

```json
{
  "assigned": 3,
  "failed": 0,
  "results": [
    { "userId": "user-1", "success": true },
    { "userId": "user-2", "success": true },
    { "userId": "user-3", "success": true }
  ]
}
```

---

## License Statistics

### GET /api/tenants/:tenantId/licenses/stats

Get license usage statistics.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `applicationId` | string | Yes | Application to check |

**Response (200 OK):**

```json
{
  "subscription": {
    "id": "sub-uuid",
    "licenseType": "Pro Plan",
    "status": "ACTIVE",
    "currentPeriodEnd": "2024-12-31T23:59:59Z"
  },
  "seats": {
    "purchased": 10,
    "assigned": 7,
    "available": 3,
    "utilizationPercent": 70
  },
  "users": {
    "withLicense": 7,
    "withoutLicense": 8,
    "total": 15
  }
}
```

---

## Code Examples

### JavaScript

```javascript
// Check user's license
const licenseCheck = await fetch(
  `/api/licenses/check?applicationId=${appId}`,
  { headers: { Authorization: `Bearer ${token}` } }
).then(r => r.json());

if (!licenseCheck.hasLicense) {
  if (licenseCheck.reason === 'NO_SEATS_AVAILABLE') {
    showUpgradePrompt();
  } else {
    showPurchasePrompt(licenseCheck.availableLicenseTypes);
  }
}

// Assign license
const assignResponse = await fetch(`/api/tenants/${tenantId}/licenses`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-id',
    applicationId: appId,
  }),
});

// Get license stats
const stats = await fetch(
  `/api/tenants/${tenantId}/licenses/stats?applicationId=${appId}`,
  { headers: { Authorization: `Bearer ${token}` } }
).then(r => r.json());

console.log(`${stats.seats.available} seats available`);
```

### cURL

```bash
# Check license
curl "https://auth.example.com/api/licenses/check?applicationId=app-id" \
  -H "Authorization: Bearer eyJ..."

# List assignments
curl "https://auth.example.com/api/tenants/tenant-id/licenses?applicationId=app-id" \
  -H "Authorization: Bearer eyJ..."

# Assign license
curl -X POST "https://auth.example.com/api/tenants/tenant-id/licenses" \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-id","applicationId":"app-id"}'

# Unassign license
curl -X DELETE "https://auth.example.com/api/tenants/tenant-id/licenses/user-id?applicationId=app-id" \
  -H "Authorization: Bearer eyJ..."
```

---

## Webhook Events

License-related webhooks:

| Event | Trigger |
|-------|--------|
| `license.assigned` | License assigned to user |
| `license.unassigned` | License removed from user |
| `subscription.created` | New subscription created |
| `subscription.updated` | Subscription modified |
| `subscription.canceled` | Subscription canceled |
| `subscription.expired` | Subscription period ended |

---

## Related Documentation

- [Licensing Concepts](../concepts/licensing.md)
- [Webhooks Guide](../sdk/webhooks.md)
- [Tenant API](./tenant-api.md)
