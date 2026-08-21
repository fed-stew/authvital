# GCP Pub/Sub Integration

> AuthVital can publish all webhook events to a GCP Pub/Sub topic, enabling
> event-driven architectures and reliable async processing.

This is powered by a **transactional outbox pattern** — events are persisted
in the database before publishing, guaranteeing zero data loss even during
Pub/Sub outages.

---

## Overview

### How It Works

1. When an event occurs (e.g., tenant created, member joined), it is written
   to the `pub_sub_outbox_events` table in PostgreSQL.
2. A background worker polls this table every 10 seconds and publishes
   pending events to the configured GCP Pub/Sub topic.
3. Successfully published events are marked as `PUBLISHED` and cleaned up
   after 7 days.
4. Failed publishes are retried with exponential back-off (up to 10 attempts
   over ~48 hours).

### Events Published

All events from both AuthVital event systems are published:

**System Webhook Events** (instance-level):
- `tenant.created`, `tenant.updated`, `tenant.deleted`, `tenant.suspended`
- `tenant.app.granted`, `tenant.app.revoked`
- `application.created`, `application.updated`, `application.deleted`
- `sso.provider_added`, `sso.provider_updated`, `sso.provider_removed`

**31 event types** across **9 categories**. See [Event Payloads](#event-payloads)
for the complete `data` field reference.

**Sync Events** (per-application):
- `invite.created`, `invite.accepted`, `invite.deleted`, `invite.expired`
- `subject.created`, `subject.updated`, `subject.deleted`, `subject.deactivated`
- `member.joined`, `member.left`, `member.role_changed`, `member.suspended`, `member.activated`
- `app_access.granted`, `app_access.revoked`, `app_access.role_changed`
- `license.assigned`, `license.revoked`, `license.changed`

---

## Configuration

### Environment Variables (Infrastructure Only)

Only two environment variables remain — both are infrastructure/credential concerns:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PUBSUB_PROJECT_ID` | When using GCP | — | GCP project ID |
| `PUBSUB_EMULATOR_HOST` | No | — | Pub/Sub emulator host for local development |

All application-level configuration (enable/disable, topic, events) is managed
via the Super Admin dashboard.

### Authentication

AuthVital uses **Application Default Credentials (ADC)**. If you're running
with the same GCP service account that deploys AuthVital, no additional
configuration is needed.

For local development, either:
- Use `gcloud auth application-default login`
- Set `GOOGLE_APPLICATION_CREDENTIALS` to a service account key file
- Use the Pub/Sub emulator (see below)

### Required IAM Permissions

The service account needs the following permissions on the Pub/Sub topic:
- `pubsub.topics.get`
- `pubsub.topics.create` (only if auto-create is used)
- `pubsub.topics.publish`

The predefined role `roles/pubsub.publisher` covers these.

---

## Admin API

Pub/Sub is configured and monitored through the Super Admin API. All endpoints
require super admin authentication.

### Configuration

```bash
# Get current config
GET /api/super-admin/pubsub/config

# Response:
{
  "id": "pubsub_config",
  "enabled": false,
  "topic": "authvital-events",
  "orderingEnabled": true,
  "events": [],
  "createdAt": "...",
  "updatedAt": "..."
}
```

```bash
# Enable Pub/Sub and select events
PUT /api/super-admin/pubsub/config
{
  "enabled": true,
  "topic": "authvital-events",
  "events": [
    "tenant.created",
    "tenant.updated",
    "tenant.deleted",
    "member.joined",
    "member.left"
  ]
}
```

### Event Types

```bash
# Get all available event types (for the event picker UI)
GET /api/super-admin/pubsub/event-types
```

Returns event types grouped by category (Tenant Lifecycle, Invitations,
Subjects, Members, App Access, Licenses).

### Outbox Dashboard

```bash
# Get outbox statistics
GET /api/super-admin/pubsub/outbox

# Response:
{
  "PENDING": 3,
  "PUBLISHED": 1542,
  "FAILED": 1,
  "SKIPPED": 89
}
```

```bash
# Get recent events (optionally filter by status)
GET /api/super-admin/pubsub/outbox/events?status=FAILED&limit=20

# Retry a single failed event
POST /api/super-admin/pubsub/outbox/:id/retry

# Retry all failed events
POST /api/super-admin/pubsub/outbox/retry-all
```

---

## Message Format

### Message Body (JSON)

Every Pub/Sub message contains this JSON envelope:

```json
{
  "id": "clx1abc2d0001...",
  "source": "authvital",
  "event_type": "tenant.created",
  "event_source": "system_webhook",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "tenant_id": "clx1tenant001...",
  "application_id": null,
  "data": {
    "tenant_id": "clx1tenant001...",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "created_at": "2025-01-15T10:30:00.000Z",
    "settings": {},
    "created_by_sub": "clx1user001...",
    "owner_email": "admin@acme.com"
  }
}
```

### Message Attributes

Each message includes these attributes for server-side filtering:

| Attribute | Example | Description |
|---|---|---|
| `event_type` | `tenant.created` | The event type |
| `event_source` | `system_webhook` | Which system produced the event |
| `tenant_id` | `clx1tenant001...` | The tenant ID |
| `source` | `authvital` | Always `"authvital"` |

### Message Ordering

When ordering is enabled (the default):
- **System webhook events** use `tenant_id` as the ordering key
- **Sync events** use `tenant_id:application_id` as the ordering key

This guarantees that events for the same tenant are delivered in order.

> **Note:** Subscribers must also enable ordering on their subscriptions for
> this to take effect.

---

## Event Payloads

Every Pub/Sub message uses the envelope format shown above. The `data` field
contains the event-specific payload. Below is the complete reference for all
31 event types.

> **Tip:** These are the same payloads used by [HTTP Webhooks](./webhooks-events.md).
> If you're already consuming webhooks, the Pub/Sub `data` field is identical.

### Tenant Events

Source: `system_webhook` | Ordering key: `tenant_id`

Payload contracts: `TenantCreatedEventData` / `TenantUpdatedEventData` /
`TenantDeletedEventData` in `@authvital/shared` (strictly enforced at every
emit site — the `data` blocks below are exact).

#### `tenant.created`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "tenant.created",
  "event_source": "system_webhook",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "tenant_id": "tnt_newcorp789",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_newcorp789",
    "name": "NewCorp Industries",
    "slug": "newcorp",
    "created_at": "2024-01-15T10:00:00.000Z",
    "settings": { "theme": "dark" },
    "created_by_sub": "usr_founder001",
    "owner_email": "founder@newcorp.com"
  }
}
```

`created_by_sub` and `owner_email` are optional (absent on super-admin
creation / when unknown). `settings` is the tenant's freeform settings JSON
— there is no `plan` field.

#### `tenant.updated`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "tenant.updated",
  "event_source": "system_webhook",
  "timestamp": "2024-01-20T14:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_acme123",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "changed_fields": ["name", "settings"],
    "settings": { "theme": "light" },
    "updated_by_sub": "usr_admin001"
  }
}
```

`previous_values` and `updated_by_sub` are optional. Membership changes are
reported as `changed_fields: ["members"]`.

#### `tenant.deleted`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "tenant.deleted",
  "event_source": "system_webhook",
  "timestamp": "2024-02-01T09:00:00.000Z",
  "tenant_id": "tnt_oldcorp456",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_oldcorp456",
    "name": "Old Corp Inc",
    "slug": "old-corp",
    "deleted_at": "2024-02-01T09:00:00.000Z"
  }
}
```

#### `tenant.suspended`

!!! note "Reserved — not currently emitted"
    The `TenantSuspendedEventData` contract is defined for forward
    compatibility, but no core code path dispatches it today.

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "tenant.suspended",
  "event_source": "system_webhook",
  "timestamp": "2024-01-25T16:00:00.000Z",
  "tenant_id": "tnt_suspended789",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_suspended789",
    "name": "Suspended Company",
    "slug": "suspended-co",
    "suspended_at": "2024-01-25T16:00:00.000Z",
    "suspended_by_sub": "usr_superadmin001",
    "reason": "Payment failed after 3 retry attempts"
  }
}
```

### Tenant App Access Events

Source: `system_webhook` | Ordering key: `tenant_id`

Payload contracts: `TenantAppGrantedEventData` / `TenantAppRevokedEventData`.
`tenant.app.granted` covers two grant modes — user-level access grants
(`user_id` + `access_type`) and tenant-level subscription grants
(`subscription_id` + `license_type_*`, no `user_id`).

#### `tenant.app.granted`

User-level grant:

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "tenant.app.granted",
  "event_source": "system_webhook",
  "timestamp": "2024-01-16T15:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_acme123",
    "tenant_slug": "acme-corp",
    "user_id": "usr_jane001",
    "user_email": "jane@acme.com",
    "application_id": "app_dashboard456",
    "application_name": "Acme Dashboard",
    "application_slug": "acme-dashboard",
    "access_type": "GRANTED",
    "granted_by_id": "usr_admin001"
  }
}
```

Tenant-level subscription grant:

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "tenant.app.granted",
  "event_source": "system_webhook",
  "timestamp": "2024-01-16T15:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_acme123",
    "application_id": "app_dashboard456",
    "application_name": "Acme Dashboard",
    "subscription_id": "sub_001",
    "license_type_id": "lt_pro",
    "license_type_name": "Pro",
    "quantity_purchased": 10,
    "status": "ACTIVE"
  }
}
```

#### `tenant.app.revoked`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "tenant.app.revoked",
  "event_source": "system_webhook",
  "timestamp": "2024-01-20T16:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_acme123",
    "tenant_slug": "acme-corp",
    "user_id": "usr_jane001",
    "user_email": "jane@acme.com",
    "application_id": "app_legacy789",
    "application_name": "Legacy App",
    "application_slug": "legacy-app",
    "revoked_by_id": "usr_admin001"
  }
}
```

### Application Events

Source: `system_webhook` | Ordering key: none (applications are
instance-scoped; `tenant_id` is always `null`)

Payload contracts: `ApplicationCreatedEventData` /
`ApplicationUpdatedEventData` / `ApplicationDeletedEventData`.

#### `application.created`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "application.created",
  "event_source": "system_webhook",
  "timestamp": "2024-01-15T11:00:00.000Z",
  "tenant_id": null,
  "application_id": null,
  "data": {
    "application_id": "app_dashboard456",
    "tenant_id": null,
    "name": "Acme Dashboard",
    "description": "Main customer dashboard",
    "slug": "acme-dashboard",
    "client_id": "acme_dashboard_prod",
    "application_type": "AUTOMATIC",
    "is_active": true,
    "created_at": "2024-01-15T11:00:00.000Z",
    "config": {
      "redirect_uris": [
        "https://dashboard.acme.com/callback",
        "http://localhost:3000/callback"
      ],
      "post_logout_redirect_uris": ["https://dashboard.acme.com"],
      "initiate_login_uri": null,
      "access_token_ttl_seconds": 3600,
      "refresh_token_ttl_seconds": 604800
    },
    "licensing": {
      "mode": "FREE",
      "allow_mixed": false,
      "default_seat_count": 5,
      "auto_provision_on_signup": true,
      "auto_grant_to_owner": true
    }
  }
}
```

#### `application.updated`

Includes enable/disable toggles (`changed_fields: ["is_active"]`). No
`config` block — configuration changes surface via
`changed_fields`/`previous_values`.

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "application.updated",
  "event_source": "system_webhook",
  "timestamp": "2024-01-18T15:30:00.000Z",
  "tenant_id": null,
  "application_id": null,
  "data": {
    "application_id": "app_dashboard456",
    "tenant_id": null,
    "name": "Acme Dashboard",
    "description": "Main customer dashboard",
    "slug": "acme-dashboard",
    "client_id": "acme_dashboard_prod",
    "application_type": "AUTOMATIC",
    "is_active": true,
    "changed_fields": ["name"],
    "previous_values": { "name": "Old Dashboard" },
    "licensing": {
      "mode": "FREE",
      "allow_mixed": false,
      "default_seat_count": 5,
      "auto_provision_on_signup": true,
      "auto_grant_to_owner": true
    }
  }
}
```

#### `application.deleted`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "application.deleted",
  "event_source": "system_webhook",
  "timestamp": "2024-02-01T10:00:00.000Z",
  "tenant_id": null,
  "application_id": null,
  "data": {
    "application_id": "app_legacy789",
    "tenant_id": null,
    "name": "Legacy App",
    "slug": "legacy-app",
    "client_id": "acme_legacy_deprecated",
    "deleted_at": "2024-02-01T10:00:00.000Z"
  }
}
```

### SSO Provider Events

Source: `system_webhook` | Ordering key: none (providers are
instance-scoped; `tenant_id` is always `null`). `provider_id` is the
provider enum key (e.g. `GOOGLE`), not a row id.

Payload contracts: `SsoProviderAddedEventData` /
`SsoProviderUpdatedEventData` / `SsoProviderRemovedEventData`.

#### `sso.provider_added`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "sso.provider_added",
  "event_source": "system_webhook",
  "timestamp": "2024-01-16T09:00:00.000Z",
  "tenant_id": null,
  "application_id": null,
  "data": {
    "provider_id": "GOOGLE",
    "tenant_id": null,
    "provider_type": "GOOGLE",
    "display_name": "GOOGLE",
    "is_enabled": true
  }
}
```

#### `sso.provider_updated`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "sso.provider_updated",
  "event_source": "system_webhook",
  "timestamp": "2024-01-20T11:00:00.000Z",
  "tenant_id": null,
  "application_id": null,
  "data": {
    "provider_id": "GOOGLE",
    "tenant_id": null,
    "provider_type": "GOOGLE",
    "changed_fields": ["enabled", "allowedDomains"]
  }
}
```

#### `sso.provider_removed`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "sso.provider_removed",
  "event_source": "system_webhook",
  "timestamp": "2024-02-01T14:00:00.000Z",
  "tenant_id": null,
  "application_id": null,
  "data": {
    "provider_id": "OKTA",
    "tenant_id": null,
    "provider_type": "OKTA",
    "removed_at": "2024-02-01T14:00:00.000Z"
  }
}
```

### Subject Events

Source: `sync_event` | Ordering key: `tenant_id:application_id`

#### `subject.created`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "subject.created",
  "event_source": "sync_event",
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

#### `subject.updated`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "subject.updated",
  "event_source": "sync_event",
  "timestamp": "2024-01-15T11:45:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "sub": "usr_jane789",
    "email": "jane.smith@example.com",
    "given_name": "Jane",
    "family_name": "Smith",
    "subject_type": "user",
    "changed_fields": ["email"]
  }
}
```

#### `subject.deleted`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "subject.deleted",
  "event_source": "sync_event",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "sub": "usr_jane789",
    "email": "jane.smith@example.com",
    "subject_type": "user"
  }
}
```

#### `subject.deactivated`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "subject.deactivated",
  "event_source": "sync_event",
  "timestamp": "2024-01-15T12:15:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "sub": "usr_jane789",
    "email": "jane.smith@example.com",
    "subject_type": "user"
  }
}
```

### Invitation Events

Source: `sync_event` | Ordering key: `tenant_id:application_id`

#### `invite.created`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "invite.created",
  "event_source": "sync_event",
  "timestamp": "2024-01-15T09:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "invite_id": "inv_xyz789",
    "membership_id": "mem_pending001",
    "email": "newuser@example.com",
    "tenant_roles": ["member"],
    "invited_by_sub": "usr_admin001",
    "expires_at": "2024-01-22T09:00:00.000Z"
  }
}
```

#### `invite.accepted`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "invite.accepted",
  "event_source": "sync_event",
  "timestamp": "2024-01-16T14:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "invite_id": "inv_xyz789",
    "membership_id": "mem_active001",
    "email": "newuser@example.com",
    "tenant_roles": ["member"],
    "sub": "usr_newuser001",
    "given_name": "Alex",
    "family_name": "Johnson"
  }
}
```

#### `invite.deleted`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "invite.deleted",
  "event_source": "sync_event",
  "timestamp": "2024-01-17T10:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "invite_id": "inv_another456",
    "membership_id": "mem_pending002",
    "email": "cancelled@example.com",
    "tenant_roles": ["member"]
  }
}
```

#### `invite.expired`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "invite.expired",
  "event_source": "sync_event",
  "timestamp": "2024-01-22T09:00:01.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "invite_id": "inv_expired789",
    "membership_id": "mem_pending003",
    "email": "noreply@example.com",
    "tenant_roles": ["member"]
  }
}
```

### Member Events

Source: `sync_event` | Ordering key: `tenant_id:application_id`

#### `member.joined`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "member.joined",
  "event_source": "sync_event",
  "timestamp": "2024-01-16T14:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_active001",
    "sub": "usr_newuser001",
    "email": "newuser@example.com",
    "tenant_roles": ["member"],
    "given_name": "Alex",
    "family_name": "Johnson"
  }
}
```

#### `member.left`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "member.left",
  "event_source": "sync_event",
  "timestamp": "2024-01-20T16:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_active001",
    "sub": "usr_leaving001",
    "email": "leaving@example.com",
    "tenant_roles": ["member"]
  }
}
```

#### `member.role_changed`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "member.role_changed",
  "event_source": "sync_event",
  "timestamp": "2024-01-18T11:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_active002",
    "sub": "usr_promoted001",
    "email": "promoted@example.com",
    "tenant_roles": ["admin", "member"],
    "previous_roles": ["member"]
  }
}
```

#### `member.suspended`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "member.suspended",
  "event_source": "sync_event",
  "timestamp": "2024-01-19T09:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_suspended001",
    "sub": "usr_suspended001",
    "email": "suspended@example.com",
    "tenant_roles": ["member"]
  }
}
```

#### `member.activated`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "member.activated",
  "event_source": "sync_event",
  "timestamp": "2024-01-21T13:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_reactivated001",
    "sub": "usr_reactivated001",
    "email": "reactivated@example.com",
    "tenant_roles": ["member"]
  }
}
```

### App Access Events

Source: `sync_event` | Ordering key: `tenant_id:application_id`

#### `app_access.granted`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "app_access.granted",
  "event_source": "sync_event",
  "timestamp": "2024-01-16T15:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_active001",
    "sub": "usr_newuser001",
    "email": "newuser@example.com",
    "role_id": "role_viewer001",
    "role_name": "Viewer",
    "role_slug": "viewer",
    "given_name": "Alex",
    "family_name": "Johnson"
  }
}
```

#### `app_access.revoked`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "app_access.revoked",
  "event_source": "sync_event",
  "timestamp": "2024-01-20T16:15:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_revoked001",
    "sub": "usr_revoked001",
    "email": "revoked@example.com",
    "role_id": "role_viewer001",
    "role_name": "Viewer",
    "role_slug": "viewer"
  }
}
```

#### `app_access.role_changed`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "app_access.role_changed",
  "event_source": "sync_event",
  "timestamp": "2024-01-18T12:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_upgraded001",
    "sub": "usr_upgraded001",
    "email": "upgraded@example.com",
    "role_id": "role_editor001",
    "role_name": "Editor",
    "role_slug": "editor",
    "previous_role_id": "role_viewer001",
    "previous_role_name": "Viewer",
    "previous_role_slug": "viewer"
  }
}
```

### License Events

Source: `sync_event` | Ordering key: `tenant_id:application_id`

#### `license.assigned`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "license.assigned",
  "event_source": "sync_event",
  "timestamp": "2024-01-16T15:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "assignment_id": "asgn_lic001",
    "sub": "usr_licensed001",
    "email": "licensed@example.com",
    "license_type_id": "lic_pro001",
    "license_type_name": "Pro Plan"
  }
}
```

#### `license.revoked`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "license.revoked",
  "event_source": "sync_event",
  "timestamp": "2024-01-25T10:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "assignment_id": "asgn_lic001",
    "sub": "usr_licensed001",
    "email": "licensed@example.com",
    "license_type_id": "lic_pro001",
    "license_type_name": "Pro Plan"
  }
}
```

#### `license.changed`

```json
{
  "id": "evt_01HQ...",
  "source": "authvital",
  "event_type": "license.changed",
  "event_source": "sync_event",
  "timestamp": "2024-01-20T14:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "assignment_id": "asgn_lic002",
    "sub": "usr_upgraded001",
    "email": "upgraded@example.com",
    "license_type_id": "lic_enterprise001",
    "license_type_name": "Enterprise Plan",
    "previous_license_type_id": "lic_pro001",
    "previous_license_type_name": "Pro Plan"
  }
}
```

---

## Subscribing to Events

### Create a Subscription

```bash
gcloud pubsub subscriptions create my-subscriber \
  --topic=authvital-events \
  --enable-message-ordering
```

### Filter by Event Type

```bash
gcloud pubsub subscriptions create tenant-events-only \
  --topic=authvital-events \
  --message-filter='attributes.event_type = "tenant.created"' \
  --enable-message-ordering
```

### Example Subscriber — Server SDK (recommended for Node.js)

`@authvital/server/pubsub` handles parsing, validation, typed routing, and
deduplication so you don't hand-roll JSON handling. It has **no dependency
on `@google-cloud/pubsub`** — pass it any Message-like object.

**Pull subscription:**

```typescript
import { PubSub } from '@google-cloud/pubsub';
import {
  createPubSubDispatcher,
  parsePubSubMessage,
  InMemoryDedupeStore,
  PubSubParseError,
} from '@authvital/server/pubsub';

const dispatcher = createPubSubDispatcher({
  dedupeStore: new InMemoryDedupeStore(), // per-process; see Deduplication
})
  .on('member.joined', async (event) => {
    // event.data is fully typed: membership_id, sub, email, tenant_roles...
    await db.members.upsert({ id: event.data.membership_id, roles: event.data.tenant_roles });
  })
  .on('license.*', async (event) => {
    // Category wildcard — same matching rules as the platform's event filter
    await refreshEntitlements(event.tenant_id);
  })
  .onAny((event) => console.log('unhandled event:', event.event_type));

const subscription = new PubSub().subscription('my-subscriber');

subscription.on('message', async (message) => {
  try {
    await dispatcher.dispatch(parsePubSubMessage(message));
    message.ack();
  } catch (err) {
    if (err instanceof PubSubParseError) {
      message.ack(); // poison message — redelivery can never succeed
      return;
    }
    message.nack(); // transient handler failure — let Pub/Sub redeliver
  }
});
```

**Push endpoint (Express):**

```typescript
import express from 'express';
import { createPubSubPushHandler } from '@authvital/server/pubsub';

const handlePush = createPubSubPushHandler(dispatcher, {
  onError: (err) => console.error('handler failed', err),
});

const app = express();
app.post('/pubsub/push', express.json(), async (req, res) => {
  const { status, error } = await handlePush(req.body);
  res.status(status).send(error ? { error } : undefined);
});
```

Status mapping (per Pub/Sub push retry semantics — only 2xx acks):
handled/duplicate/unhandled return **204** (ack), parse errors return
**400** (permanent — pair the push subscription with a dead-letter topic so
poison messages park instead of retrying forever), handler errors return
**500** (transient — Pub/Sub redelivers and the dedupe id was NOT recorded,
so the retry re-runs your handlers).

### Example Subscriber — Raw (any language)

No SDK required — the envelope is plain JSON:

```typescript
import { PubSub } from '@google-cloud/pubsub';

const subscription = new PubSub().subscription('my-subscriber');

subscription.on('message', (message) => {
  const event = JSON.parse(message.data.toString());

  console.log(`Received: ${event.event_type}`);
  console.log(`Tenant: ${event.tenant_id}`);
  console.log(`Data:`, event.data);

  // Important: Acknowledge to prevent redelivery
  message.ack();
});
```

---

## Deduplication

Pub/Sub provides **at-least-once delivery**. Subscribers may receive the same
message more than once. The dispatcher deduplicates on the envelope's unique
`id` via a pluggable store:

```typescript
import type { DedupeStore } from '@authvital/server/pubsub';

// The interface — implement over Redis/DB for production:
interface DedupeStore {
  has(id: string): Promise<boolean>;
  add(id: string, ttlMs?: number): Promise<void>;
}

// Example: Redis-backed implementation
const redisDedupe: DedupeStore = {
  has: async (id) => (await redis.exists(`av:evt:${id}`)) === 1,
  add: async (id, ttlMs = 86_400_000) =>
    void (await redis.set(`av:evt:${id}`, '1', 'PX', ttlMs)),
};

const dispatcher = createPubSubDispatcher({ dedupeStore: redisDedupe });
```

The bundled `InMemoryDedupeStore` (bounded LRU + TTL) is **per-process
only**: restarts forget everything and scaled-out subscribers don't share
it. Use it for single-instance consumers and development; use Redis or a
database unique index in production.

Ids are recorded **after** all handlers succeed — a thrown handler leaves
the id un-recorded so the redelivered message gets a full retry.

---

## Local Development

### Option 1: Pub/Sub Emulator

```bash
# Install and start the emulator
gcloud components install pubsub-emulator
gcloud beta emulators pubsub start --project=local-dev

# In your .env
PUBSUB_PROJECT_ID=local-dev
PUBSUB_EMULATOR_HOST=localhost:8085
```

After starting the app, enable Pub/Sub and select events via the Super Admin
API (`PUT /api/super-admin/pubsub/config`).

### Option 2: Leave Pub/Sub Disabled

When Pub/Sub is disabled (the default), events are still written to the
outbox table with `SKIPPED` status. This preserves the audit trail and lets
you inspect what would be published without actually connecting to GCP.

---

## Outbox Table

The `pub_sub_outbox_events` table tracks all events. Each row carries TWO
independent lifecycles:

**Publish lifecycle** (`status` — GCP topic export, owned by the core):

| Status | Meaning |
|---|---|
| `PENDING` | Queued for publishing |
| `PUBLISHED` | Successfully published (see cleanup rules below) |
| `FAILED` | All 10 retry attempts exhausted |
| `SKIPPED` | Pub/Sub is disabled |

**Webhook-delivery lifecycle** (`delivery_*` columns — owned by the
[authvital-broker](../concepts/event-broker.md) when
`WEBHOOK_DELIVERY_MODE=broker`):

| Column | Meaning |
|---|---|
| `delivery_status` | `PENDING` / `DELIVERED` / `FAILED` / `SKIPPED` |
| `delivery_attempts` | Attempt count against the 10-step backoff ladder |
| `last_delivery_attempt_at` | Timestamp of the last attempt |
| `last_delivery_error` | Categorized error (`[TIMEOUT] ...`, `[HTTP_ERROR] ...`) |

The two lifecycles are **fully independent**: broker webhook delivery does
not wait for (or care about) GCP publish status, and vice versa — they are
separate consumers of the same row. Cleanup respects both: rows are removed
after 7 days only when published/consumed **and** (in broker mode)
terminally delivered; `FAILED` rows of either lifecycle are retained
indefinitely for inspection and replay.

In `legacy` delivery mode the `delivery_*` columns stay at their defaults
and can be ignored.

### Monitoring Failed Events

Use the Super Admin API to inspect and retry failed events:

```bash
# List failed events
GET /api/super-admin/pubsub/outbox/events?status=FAILED

# Retry all failed events
POST /api/super-admin/pubsub/outbox/retry-all
```

Or query the table directly:

```sql
SELECT id, event_type, attempts, last_error, created_at
FROM pub_sub_outbox_events
WHERE status = 'FAILED'
ORDER BY created_at DESC;
```

---

## Related Documentation

- [Webhooks Guide](./webhooks.md) - HTTP webhook integration
- [Event Types & Payloads](./webhooks-events.md) - All event types with full payload examples
- [Best Practices](./webhooks-advanced.md) - Error handling, idempotency, testing
- [Identity Sync](./identity-sync/index.md) - Patterns for syncing users to your database
- [Organization Sync](./organization-sync/index.md) - Sync tenant, app, and SSO config locally
