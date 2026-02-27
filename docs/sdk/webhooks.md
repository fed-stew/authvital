# Webhooks Guide

> Handle real-time events from AuthVital to keep your systems in sync.

## Overview

AuthVital emits webhooks for key events across your identity system:

- **Subject Events** - User, service account, and machine lifecycle
- **Member Events** - Tenant membership changes
- **Invitation Events** - Invite lifecycle
- **App Access Events** - Application role assignments
- **License Events** - License assignments and changes

**Related documentation:**

| Guide | Description |
|-------|-------------|
| [Event Types & Payloads](./webhooks-events.md) | All event types with full payload examples |
| [Event Handler Reference](./webhooks-handler.md) | AuthVitalEventHandler class & examples |
| [Framework Integration](./webhooks-frameworks.md) | Express, Next.js, NestJS setup |
| [Manual Verification](./webhooks-verification.md) | Low-level API & manual RSA verification |
| [Best Practices](./webhooks-advanced.md) | Error handling, idempotency, testing |

---

## Webhook Delivery

```
┌─────────────┐                           ┌─────────────┐
│  AuthVital  │                           │  Your App   │
│             │                           │             │
│  Event      │   POST + RSA Signature    │  Webhook    │
│  Triggered  │ ────────────────────────▶ │  Endpoint   │
│             │   (JWKS verified)         │             │
└─────────────┘                           └─────────────┘
```

**Delivery characteristics:**

| Property | Value |
|----------|-------|
| Method | `POST` |
| Content-Type | `application/json` |
| Signature | **RSA-SHA256** via JWKS (NOT HMAC!) |
| Timeout | 30 seconds |
| Retries | 3 attempts with exponential backoff |

---

## Webhook Security

> ⚠️ **IMPORTANT**: AuthVital uses **RSA-SHA256 with JWKS** for webhook signatures, NOT HMAC-SHA256!

AuthVital signs all webhook payloads using RSA private keys, and you verify them using the corresponding public keys from the JWKS endpoint.

### How Signature Verification Works

1. AuthVital creates a signature payload: `{timestamp}.{body}`
2. AuthVital signs this payload using its RSA private key
3. AuthVital sends the webhook with signature headers
4. Your app fetches the public key from JWKS using the Key ID header
5. Your app verifies the signature using the RSA public key

### Webhook Headers

Every webhook request includes these headers:

| Header | Description | Example |
|--------|-------------|----------|
| `X-AuthVital-Signature` | RSA-SHA256 signature (base64 encoded) | `MEUCIQDk7...` |
| `X-AuthVital-Key-Id` | JWKS Key ID used for signing | `authvital-webhook-key-1` |
| `X-AuthVital-Timestamp` | Unix timestamp (for replay protection) | `1705312200` |
| `X-AuthVital-Event-Id` | Unique event identifier | `evt_abc123xyz` |
| `X-AuthVital-Event-Type` | Event type string | `subject.created` |

### JWKS Endpoint

Public keys for signature verification are available at:

```
https://{your-authvital-host}/.well-known/jwks.json
```

The SDK automatically derives this URL from the `authVitalHost` configuration or `AV_HOST` environment variable.

---

## Event Payload Structure

All webhook events follow this base structure:

```typescript
interface BaseEvent<T extends string, D> {
  id: string;             // Unique event ID (same as X-AuthVital-Event-Id header)
  type: T;                // Event type (e.g., 'subject.created')
  timestamp: string;      // ISO 8601 timestamp
  tenant_id: string;      // Tenant ID where event occurred
  application_id: string; // Application ID (your app)
  data: D;                // Event-specific payload data
}
```

**Example raw webhook payload:**

```json
{
  "id": "evt_01HQXYZ123ABC",
  "type": "subject.created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "sub": "usr_jane789",
    "email": "jane@example.com",
    "given_name": "Jane",
    "family_name": "Smith",
    "subject_type": "user"
  }
}
```

➡️ **See [Event Types & Payloads](./webhooks-events.md) for all event types with full examples.**

---

## Quick Start

### 1. Install the SDK

```bash
npm install @authvital/sdk
# or
yarn add @authvital/sdk
# or
pnpm add @authvital/sdk
```

### 2. Create an Event Handler

```typescript
import { AuthVitalEventHandler } from '@authvital/sdk/webhooks';
import type {
  SubjectCreatedEvent,
  MemberJoinedEvent,
  LicenseAssignedEvent,
} from '@authvital/sdk/webhooks';

class MyEventHandler extends AuthVitalEventHandler {
  async onSubjectCreated(event: SubjectCreatedEvent): Promise<void> {
    console.log('New user:', event.data.email);
    // Sync to your database...
  }

  async onMemberJoined(event: MemberJoinedEvent): Promise<void> {
    console.log(`${event.data.email} joined with roles:`, event.data.tenant_roles);
  }

  async onLicenseAssigned(event: LicenseAssignedEvent): Promise<void> {
    console.log(`License ${event.data.license_type_name} assigned`);
  }
}
```

### 3. Configure the WebhookRouter

```typescript
import { WebhookRouter } from '@authvital/sdk/webhooks';

const router = new WebhookRouter({
  // AuthVital host - used to derive JWKS URL automatically
  // Falls back to AV_HOST environment variable if not provided
  authVitalHost: process.env.AV_HOST,
  
  // Your event handler implementation
  handler: new MyEventHandler(),
  
  // Replay protection: reject events older than this (seconds)
  // Default: 300 (5 minutes)
  maxTimestampAge: 300,
  
  // How long to cache JWKS keys (milliseconds)
  // Default: 3600000 (1 hour)
  keysCacheTtl: 3600000,
});
```

### 4. Add the Webhook Endpoint (Express)

```typescript
import express from 'express';

const app = express();

// IMPORTANT: Use express.raw() for signature verification!
// The body must be the raw buffer, not parsed JSON.
app.post(
  '/webhooks/authvital',
  express.raw({ type: 'application/json' }),
  router.expressHandler()
);

app.listen(3000, () => {
  console.log('Webhook endpoint ready at http://localhost:3000/webhooks/authvital');
});
```

➡️ **See [Framework Integration](./webhooks-frameworks.md) for Next.js, NestJS, and more.**

### 5. Register Your Webhook in AuthVital

**Via Admin Panel:**

1. Go to **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:
   - **Name**: Descriptive name (e.g., "Production User Sync")
   - **URL**: Your webhook endpoint URL
   - **Events**: Select events to subscribe to
4. Save and note the webhook ID

**Via REST API:**

Webhook management is done through the AuthVital Admin API. You'll need a super admin session or API key:

```bash
# Create a webhook
curl -X POST https://your-authvital-host/api/admin/webhooks \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "User Sync Webhook",
    "url": "https://myapp.com/webhooks/authvital",
    "events": ["subject.created", "subject.updated", "subject.deleted", "member.joined", "member.left", "member.role_changed", "license.assigned", "license.revoked"],
    "enabled": true
  }'
```

!!! note "SDK Support Coming Soon"
    Programmatic webhook management via the SDK (`@authvital/sdk/admin`) is planned for a future release. For now, use the Admin UI or REST API directly.

---

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `authVitalHost` | `string` | No* | `process.env.AV_HOST` | AuthVital host URL |
| `handler` | `AuthVitalEventHandler` | Yes | - | Your event handler instance |
| `maxTimestampAge` | `number` | No | `300` | Max age in seconds for replay protection |
| `keysCacheTtl` | `number` | No | `3600000` | JWKS cache TTL in milliseconds |

*Either `authVitalHost` or `AV_HOST` environment variable must be set.

---

## Event Types Summary

| Category | Event Type | Description |
|----------|------------|-------------|
| **Subject** | `subject.created` | User/service account/machine created |
| | `subject.updated` | Profile updated (includes changed_fields) |
| | `subject.deleted` | Permanently deleted |
| | `subject.deactivated` | Soft deleted / deactivated |
| **Member** | `member.joined` | Joined a tenant |
| | `member.left` | Left or removed from tenant |
| | `member.role_changed` | Tenant roles changed |
| | `member.suspended` | Suspended in tenant |
| | `member.activated` | Reactivated in tenant |
| **Invite** | `invite.created` | Invitation sent |
| | `invite.accepted` | Invitation accepted |
| | `invite.deleted` | Invitation revoked |
| | `invite.expired` | Invitation expired |
| **App Access** | `app_access.granted` | Granted app access |
| | `app_access.revoked` | App access revoked |
| | `app_access.role_changed` | App role changed |
| **License** | `license.assigned` | License assigned |
| | `license.revoked` | License revoked |
| | `license.changed` | License type changed |

➡️ **See [Event Types & Payloads](./webhooks-events.md) for full payload documentation.**

---

## Related Documentation

- [Event Types & Payloads](./webhooks-events.md) - All events with TypeScript types and JSON examples
- [Event Handler Reference](./webhooks-handler.md) - AuthVitalEventHandler class documentation
- [Framework Integration](./webhooks-frameworks.md) - Express, Next.js, NestJS examples
- [Manual Verification](./webhooks-verification.md) - Low-level AuthVitalWebhooks class
- [Best Practices](./webhooks-advanced.md) - Error handling, retries, idempotency, testing
- [Identity Sync](./identity-sync/index.md) - Patterns for syncing users to your database
- [Server SDK](./server-sdk/index.md) - Server-side SDK reference
