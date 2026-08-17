# Organization Sync Events

> Real system-webhook payloads, verified against
> `packages/backend/src/webhooks/` (`system-webhook.service.ts`,
> `types/system-events.ts`) and the services that dispatch them.

## Envelope

All system-webhook events share this shape (note **`event`**, not `type`, and no
top-level `id`/`tenant_id`/`application_id`):

```jsonc
{
  "event": "tenant.created",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "data": { /* event-specific */ }
}
```

Headers: `X-Webhook-Signature`, `X-Webhook-Key-Id`, `X-Webhook-Event`,
`X-Webhook-Timestamp`. See [Overview](./index.md) for verification.

!!! warning "Payloads are lean"
    There is **no** `plan`, `settings`, `previous_values`, `attribute_mapping`,
    `grant_types`, or `token_endpoint_auth_method`. Only the fields below are sent.

---

## Tenant events

### `tenant.created`

```json
{
  "event": "tenant.created",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "data": {
    "tenant_id": "tnt_acme123",
    "tenant_name": "Acme Corporation",
    "tenant_slug": "acme-corp",
    "owner_id": "usr_founder001",
    "owner_email": "founder@acme.com"
  }
}
```
`owner_id` / `owner_email` are optional.

### `tenant.updated`

```json
{
  "event": "tenant.updated",
  "data": {
    "tenant_id": "tnt_acme123",
    "tenant_name": "Acme Corporation",
    "tenant_slug": "acme-corp",
    "changed_fields": ["name"]
  }
}
```

### `tenant.deleted`

`data`: `{ tenant_id, tenant_slug }`.

### `tenant.suspended`

Typed as `{ tenant_id, tenant_name, tenant_slug, reason? }` — but **not currently
emitted** by any backend code. Don't rely on it yet.

---

## Tenant app-access events

Fired when a user gains/loses access to an application within a tenant. (This
overlaps conceptually with the per-app `app_access.*` sync events, but is a
distinct system event.)

### `tenant.app.granted`

```json
{
  "event": "tenant.app.granted",
  "data": {
    "tenant_id": "tnt_acme123",
    "tenant_slug": "acme-corp",
    "user_id": "usr_123",
    "user_email": "jane@acme.com",
    "application_id": "app_dashboard456",
    "application_name": "Acme Dashboard",
    "application_slug": "acme-dashboard",
    "access_type": "GRANTED",
    "granted_by_id": "usr_admin001",
    "license_assignment_id": "lic_asg_1"
  }
}
```
`access_type` is one of `GRANTED | INVITED | AUTO_FREE | AUTO_TENANT | AUTO_OWNER`.
`user_email`, `application_name`, `granted_by_id`, `license_assignment_id` are optional.

### `tenant.app.revoked`

`data`: `{ tenant_id, tenant_slug, user_id, user_email?, application_id, application_slug?, revoked_by_id? }`.

---

## Application events

Applications are global (not tenant-scoped), so **`tenant_id` is `null`**.

### `application.created`

```json
{
  "event": "application.created",
  "data": {
    "application_id": "app_dashboard456",
    "tenant_id": null,
    "name": "Acme Dashboard",
    "description": "Main customer dashboard",
    "slug": "acme-dashboard",
    "client_id": "acme_dashboard_prod",
    "application_type": "SPA",
    "is_active": true,
    "created_at": "2024-01-15T11:00:00.000Z",
    "config": {
      "redirect_uris": ["https://dashboard.acme.com/callback"],
      "post_logout_redirect_uris": ["https://dashboard.acme.com"],
      "initiate_login_uri": null,
      "access_token_ttl_seconds": 3600,
      "refresh_token_ttl_seconds": 604800
    },
    "licensing": { /* app licensing settings */ }
  }
}
```
`application_type` reflects the app's `accessMode`. The `config` and `licensing`
objects mirror the application's stored settings.

### `application.updated`

Same top-level fields as `created` plus a `changed_fields` array. Emitted on
settings changes (also fired by some licensing/config sub-flows).

### `application.deleted`

`data`: `{ application_id, tenant_id: null, name, slug, client_id, deleted_at }`.

---

## SSO provider events

Providers are keyed by provider slug; **`tenant_id` is `null`** (global config).

### `sso.provider_added`

```json
{
  "event": "sso.provider_added",
  "data": {
    "provider_id": "google",
    "tenant_id": null,
    "provider_type": "google",
    "display_name": "google",
    "is_enabled": true
  }
}
```
(Upserts are dispatched as `sso.provider_added`.)

### `sso.provider_updated`

`data`: `{ provider_id, tenant_id: null, provider_type, changed_fields }`.

### `sso.provider_removed`

`data`: `{ provider_id, tenant_id: null, provider_type }`.

---

## Summary

| Event | Key `data` fields | Notes |
|-------|-------------------|-------|
| `tenant.created` | `tenant_id, tenant_name, tenant_slug, owner_id?, owner_email?` | |
| `tenant.updated` | `tenant_id, tenant_name, tenant_slug, changed_fields` | |
| `tenant.deleted` | `tenant_id, tenant_slug` | |
| `tenant.suspended` | `tenant_id, tenant_name, tenant_slug, reason?` | **not emitted yet** |
| `tenant.app.granted` | `tenant_id, tenant_slug, user_id, application_id, access_type, …` | |
| `tenant.app.revoked` | `tenant_id, tenant_slug, user_id, application_id, …` | |
| `application.created` | `application_id, name, slug, client_id, application_type, config, licensing` | `tenant_id: null` |
| `application.updated` | above + `changed_fields` | `tenant_id: null` |
| `application.deleted` | `application_id, name, slug, client_id, deleted_at` | `tenant_id: null` |
| `sso.provider_added` | `provider_id, provider_type, display_name, is_enabled` | `tenant_id: null` |
| `sso.provider_updated` | `provider_id, provider_type, changed_fields` | `tenant_id: null` |
| `sso.provider_removed` | `provider_id, provider_type` | `tenant_id: null` |

## Related

- [Overview](./index.md) · [Use Cases](./use-cases.md) · [Prisma Schema](./prisma-schema.md)
