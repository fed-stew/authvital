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
    "tenant_name": "Acme Corp",
    "tenant_slug": "acme-corp",
    "owner_id": "clx1user001...",
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
    "plan": "pro",
    "created_by_sub": "usr_founder001",
    "created_at": "2024-01-15T10:00:00.000Z",
    "settings": {
      "allow_signups": true,
      "require_mfa": false,
      "allowed_email_domains": ["newcorp.com"],
      "session_lifetime_minutes": 480,
      "password_policy": "standard"
    }
  }
}
```

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
    "plan": "enterprise",
    "changed_fields": ["plan", "settings.require_mfa"],
    "previous_values": {
      "plan": "pro",
      "settings.require_mfa": false
    },
    "updated_by_sub": "usr_admin001",
    "settings": {
      "allow_signups": true,
      "require_mfa": true,
      "allowed_email_domains": ["acme.com"],
      "session_lifetime_minutes": 480,
      "password_policy": "strict"
    }
  }
}
```

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
    "deleted_by_sub": "usr_superadmin001",
    "deleted_at": "2024-02-01T09:00:00.000Z"
  }
}
```

#### `tenant.suspended`

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
    "suspended_by_sub": "usr_superadmin001",
    "suspended_at": "2024-01-25T16:00:00.000Z",
    "reason": "Payment failed after 3 retry attempts"
  }
}
```

### Tenant App Access Events

Source: `system_webhook` | Ordering key: `tenant_id`

#### `tenant.app.granted`

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
    "application_name": "Acme Dashboard"
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
    "application_id": "app_legacy789",
    "application_name": "Legacy App"
  }
}
```

### Application Events

Source: `system_webhook` | Ordering key: `application_id`

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
      "post_logout_redirect_uris": [
        "https://dashboard.acme.com"
      ],
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
    "changed_fields": ["config.redirect_uris", "config.access_token_ttl_seconds"],
    "previous_values": {
      "config.redirect_uris": [
        "https://dashboard.acme.com/callback"
      ],
      "config.access_token_ttl_seconds": 1800
    },
    "config": {
      "redirect_uris": [
        "https://dashboard.acme.com/callback",
        "https://staging.dashboard.acme.com/callback",
        "http://localhost:3000/callback"
      ],
      "post_logout_redirect_uris": [
        "https://dashboard.acme.com"
      ],
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

Source: `system_webhook` | Ordering key: `provider_id`

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
    "provider_type": "OKTA"
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

### Example Subscriber (Node.js)

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();
const subscription = pubsub.subscription('my-subscriber');

subscription.on('message', (message) => {
  const event = JSON.parse(message.data.toString());
  
  console.log(`Received: ${event.event_type}`);
  console.log(`Tenant: ${event.tenant_id}`);
  console.log(`Data:`, event.data);
  
  // Important: Acknowledge to prevent redelivery
  message.ack();
});

subscription.on('error', (error) => {
  console.error('Subscription error:', error);
});
```

---

## Deduplication

Pub/Sub provides **at-least-once delivery**. Subscribers may receive the same
message more than once. Use the `id` field in the message envelope to
deduplicate:

```typescript
const processedIds = new Set<string>();

subscription.on('message', (message) => {
  const event = JSON.parse(message.data.toString());
  
  if (processedIds.has(event.id)) {
    message.ack(); // Already processed
    return;
  }
  
  // Process the event...
  processedIds.add(event.id);
  message.ack();
});
```

For production use, store processed IDs in a database or Redis rather than
an in-memory Set.

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

The `pub_sub_outbox_events` table tracks all events:

| Status | Meaning |
|---|---|
| `PENDING` | Queued for publishing |
| `PUBLISHED` | Successfully published (cleaned up after 7 days) |
| `FAILED` | All 10 retry attempts exhausted |
| `SKIPPED` | Pub/Sub is disabled |

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
