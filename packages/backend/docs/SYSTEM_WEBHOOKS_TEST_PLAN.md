# System Webhooks Test Plan

## Overview

This document provides a comprehensive test plan for verifying the System Webhooks feature, specifically the tenant lifecycle and app access events.

## Manual Testing Checklist

### Tenant Lifecycle Events

- [ ] **tenant.created**: Create a new tenant via admin UI
  - Verify webhook fires with tenant_id, tenant_name, tenant_slug
  - Verify owner info is included if applicable

- [ ] **tenant.updated**: Update a tenant's name or settings
  - Verify webhook fires with changed_fields array

- [ ] **tenant.deleted**: Delete a tenant (must remove all members first)
  - Verify webhook fires BEFORE deletion completes

- [ ] **tenant.suspended**: (If suspension feature exists)
  - Verify webhook fires with reason

### Tenant App Access Events

- [ ] **tenant.app.granted (Manual)**: Admin grants access to a user
  - Verify webhook fires with user, app, and tenant details
  - Verify access_type is 'GRANTED'

- [ ] **tenant.app.granted (Auto FREE)**: New member joins tenant with FREE app
  - Verify webhook fires automatically
  - Verify access_type is 'AUTO_FREE'

- [ ] **tenant.app.granted (Auto TENANT_WIDE)**: New member joins tenant with TENANT_WIDE app
  - Verify webhook fires automatically
  - Verify access_type is 'AUTO_TENANT'

- [ ] **tenant.app.granted (Auto OWNER)**: Owner signs up and creates tenant
  - Verify webhook fires for owner access
  - Verify access_type is 'AUTO_OWNER'

- [ ] **tenant.app.granted (License)**: PER_SEAT license assigned
  - Verify webhook fires with license_assignment_id

- [ ] **tenant.app.revoked**: Admin revokes access
  - Verify webhook fires with user, app, and tenant details
  - Verify revoked_by_id is included

### UI Testing

- [ ] **Webhooks Page**: Navigate to System Webhooks in admin
  - Verify event picker shows categorized events
  - Verify "All Events" vs "Selected Events" modes work
  - Verify category expand/collapse works
  - Verify wildcard selection (e.g., tenant.* selects all tenant events)

- [ ] **Create Webhook**: Create a webhook with selected events
  - Verify it saves correctly
  - Verify no per-webhook secret is generated (uses JWKS)

- [ ] **Test Webhook**: Click test button
  - Verify test payload is delivered
  - Verify delivery is logged

## API Endpoints

### Event Types Endpoint

```bash
GET /api/super-admin/webhooks/event-types
```

**Expected Response:**
```json
{
  "categories": [
    {
      "slug": "tenant",
      "name": "Tenant Lifecycle",
      "description": "Events related to tenant creation and management",
      "events": [
        { "type": "tenant.created", "description": "When a new tenant is created" },
        { "type": "tenant.updated", "description": "When tenant details are updated" },
        { "type": "tenant.deleted", "description": "When a tenant is deleted" },
        { "type": "tenant.suspended", "description": "When a tenant is suspended" }
      ]
    },
    {
      "slug": "tenant.app",
      "name": "Tenant App Access",
      "description": "Events related to application access within tenants",
      "events": [
        { "type": "tenant.app.granted", "description": "When a user is granted access to an application in a tenant" },
        { "type": "tenant.app.revoked", "description": "When application access is revoked from a user" }
      ]
    }
  ]
}
```

### Available Events (Flat List)

```bash
GET /api/super-admin/webhooks/events
```

**Expected Response:**
```json
{
  "events": [
    "tenant.created",
    "tenant.updated",
    "tenant.deleted",
    "tenant.suspended",
    "tenant.app.granted",
    "tenant.app.revoked"
  ]
}
```

## Event Payload Examples

### tenant.created

```json
{
  "event": "tenant.created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "tenant_id": "clx123abc...",
    "tenant_name": "Acme Corp",
    "tenant_slug": "acme-corp",
    "owner_id": "user_abc123...",
    "owner_email": "owner@acme.com"
  }
}
```

### tenant.updated

```json
{
  "event": "tenant.updated",
  "timestamp": "2024-01-15T10:32:00.000Z",
  "data": {
    "tenant_id": "clx123abc...",
    "tenant_name": "Acme Corporation",
    "tenant_slug": "acme-corp",
    "changed_fields": ["name"]
  }
}
```

### tenant.deleted

```json
{
  "event": "tenant.deleted",
  "timestamp": "2024-01-15T10:35:00.000Z",
  "data": {
    "tenant_id": "clx123abc...",
    "tenant_slug": "acme-corp"
  }
}
```

### tenant.suspended

```json
{
  "event": "tenant.suspended",
  "timestamp": "2024-01-15T10:36:00.000Z",
  "data": {
    "tenant_id": "clx123abc...",
    "tenant_name": "Acme Corp",
    "tenant_slug": "acme-corp",
    "reason": "Non-payment"
  }
}
```

### tenant.app.granted

```json
{
  "event": "tenant.app.granted",
  "timestamp": "2024-01-15T10:31:00.000Z",
  "data": {
    "tenant_id": "clx123abc...",
    "tenant_slug": "acme-corp",
    "user_id": "user_abc123...",
    "user_email": "user@acme.com",
    "application_id": "app_xyz789...",
    "application_name": "My App",
    "application_slug": "my-app",
    "access_type": "AUTO_FREE",
    "granted_by_id": null,
    "license_assignment_id": null
  }
}
```

**Access Types:**
- `GRANTED` - Manually granted by admin
- `INVITED` - Granted via invitation
- `AUTO_FREE` - Auto-granted for FREE licensing mode apps
- `AUTO_TENANT` - Auto-granted for TENANT_WIDE licensing mode apps
- `AUTO_OWNER` - Auto-granted to tenant owner

### tenant.app.revoked

```json
{
  "event": "tenant.app.revoked",
  "timestamp": "2024-01-15T10:40:00.000Z",
  "data": {
    "tenant_id": "clx123abc...",
    "tenant_slug": "acme-corp",
    "user_id": "user_abc123...",
    "user_email": "user@acme.com",
    "application_id": "app_xyz789...",
    "application_slug": "my-app",
    "revoked_by_id": "admin_user_456..."
  }
}
```

## Webhook Signature Verification (JWKS)

All webhooks are signed using RSA-SHA256 with the platform's signing key (same keys used for JWTs). This provides:
- **Consistent cryptography** across the platform
- **Key rotation support** via JWKS
- **No per-webhook secrets** to manage

### Headers Sent

| Header | Description |
|--------|-------------|
| `X-Webhook-Signature` | Base64-encoded RSA-SHA256 signature of the payload |
| `X-Webhook-Key-Id` | The `kid` of the signing key (for JWKS lookup) |
| `X-Webhook-Event` | The event type (e.g., `tenant.created`) |
| `X-Webhook-Timestamp` | ISO 8601 timestamp of when the event was dispatched |

### Verification Steps

1. Fetch the JWKS from `/.well-known/jwks.json`
2. Find the key matching the `X-Webhook-Key-Id` header
3. Verify the RSA-SHA256 signature against the raw request body

**Verification Example (Node.js):**
```javascript
const crypto = require('crypto');
const jose = require('jose');

async function verifyWebhookSignature(req, jwksUrl) {
  const signature = req.headers['x-webhook-signature'];
  const kid = req.headers['x-webhook-key-id'];
  const payload = JSON.stringify(req.body);

  // Fetch JWKS and find the key
  const jwks = await jose.createRemoteJWKSet(new URL(jwksUrl));
  const key = await jwks({ kid });
  
  // Export as crypto KeyObject
  const publicKey = await jose.exportSPKI(key);
  
  // Verify signature
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(payload);
  return verify.verify(publicKey, signature, 'base64');
}

// Usage
const isValid = await verifyWebhookSignature(
  req,
  'https://your-auth-server.com/.well-known/jwks.json'
);
```

**Simpler Example (using raw public key):**
```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, publicKeyPem) {
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(payload);
  return verify.verify(publicKeyPem, signature, 'base64');
}
```

## Code Paths Verified

The following code paths have been verified to fire events:

| Path | Service | Method | Event |
|------|---------|--------|-------|
| Tenant creation | `TenantsService` | `createTenant()` | `tenant.created` |
| Tenant creation (Admin) | `AdminTenantsService` | `createTenant()` | `tenant.created` |
| Tenant update | `TenantsService` | `updateTenant()` | `tenant.updated` |
| Tenant update (Admin) | `AdminTenantsService` | `updateTenant()` | `tenant.updated` |
| Tenant deletion | `TenantsService` | `deleteTenant()` | `tenant.deleted` |
| Tenant deletion (Admin) | `AdminTenantsService` | `deleteTenant()` | `tenant.deleted` |
| Manual access grant | `AppAccessService` | `grantAccess()` | `tenant.app.granted` |
| Bulk access grant | `AppAccessService` | `bulkGrantAccess()` | `tenant.app.granted` (per user) |
| Auto FREE grant | `AppAccessService` | `autoGrantFreeApps()` | `tenant.app.granted` |
| Auto TENANT_WIDE grant | `AppAccessService` | `autoGrantTenantWideApps()` | `tenant.app.granted` |
| Auto OWNER grant | `AppAccessService` | `autoGrantOwnerAccess()` | `tenant.app.granted` |
| License grant | `LicenseAssignmentService` | `grantLicense()` | `tenant.app.granted` |
| Access revoke | `AppAccessService` | `revokeAccess()` | `tenant.app.revoked` |
| Bulk access revoke | `AppAccessService` | `bulkRevokeAccess()` | `tenant.app.revoked` (per user) |
| License revoke | `LicenseAssignmentService` | `revokeLicense()` | `tenant.app.revoked` |

## Testing with webhook.site

1. Go to https://webhook.site and get a unique URL
2. Create a System Webhook in the admin UI with that URL
3. Select events to subscribe to
4. Perform the actions that trigger those events
5. Verify the payloads appear on webhook.site

## Notes

- All webhook dispatches use fire-and-forget pattern (non-blocking)
- Webhook failures do not affect the primary operation
- Failed deliveries are logged with status and error details
- Consecutive failures increment the `failureCount` on the webhook
