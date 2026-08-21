# Organization Sync Events

> Real system-webhook payloads — the CANONICAL contracts from
> `@authvital/shared` (`system-events.types.ts`), compile-time enforced at
> every emit site via the generic `dispatch<T>()` in
> `packages/backend/src/webhooks/system-webhook.service.ts`.

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
    There is **no** `plan`, `attribute_mapping`, `grant_types`, or
    `token_endpoint_auth_method`. `settings` on tenant events is the
    tenant's FREEFORM settings JSON — not a structured object. Only the
    fields below are sent.

---

## Tenant events

### `tenant.created`

```json
{
  "event": "tenant.created",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "data": {
    "tenant_id": "tnt_acme123",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "created_at": "2024-01-15T10:00:00.000Z",
    "settings": { "theme": "dark" },
    "created_by_sub": "usr_founder001",
    "owner_email": "founder@acme.com"
  }
}
```
`created_by_sub` / `owner_email` are optional.

### `tenant.updated`

```json
{
  "event": "tenant.updated",
  "data": {
    "tenant_id": "tnt_acme123",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "changed_fields": ["name"],
    "settings": { "theme": "dark" },
    "updated_by_sub": "usr_admin001"
  }
}
```
`previous_values` / `updated_by_sub` are optional. Membership changes are
reported as `changed_fields: ["members"]`.

### `tenant.deleted`

`data`: `{ tenant_id, name, slug, deleted_at, deleted_by_sub? }`.

### `tenant.suspended`

Typed as `{ tenant_id, name, slug, suspended_at, suspended_by_sub?, reason? }`
— but **not currently emitted** by any backend code. Don't rely on it yet.

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

`tenant.app.granted` is ALSO emitted for tenant-level subscription grants
(license pool provisioning) — in that mode there is **no `user_id` /
`access_type`**; instead the payload carries `subscription_id`,
`license_type_id`, `license_type_name`, `quantity_purchased`, and `status`:

```json
{
  "event": "tenant.app.granted",
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

### `tenant.app.revoked`

`data`: `{ tenant_id, tenant_slug?, user_id, user_email?, application_id, application_name?, application_slug?, revoked_by_id? }`.

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

Same top-level fields as `created` plus `changed_fields` and
`previous_values`, and WITHOUT the `config` block (config changes surface
via `changed_fields`/`previous_values`). The `licensing` block is always
present — including on enable/disable toggles (`changed_fields:
["is_active"]`).

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

`data`: `{ provider_id, tenant_id: null, provider_type, removed_at }`.

---

## Summary

| Event | Key `data` fields | Notes |
|-------|-------------------|-------|
| `tenant.created` | `tenant_id, name, slug, created_at, settings, created_by_sub?, owner_email?` | |
| `tenant.updated` | `tenant_id, name, slug, changed_fields, settings, previous_values?, updated_by_sub?` | |
| `tenant.deleted` | `tenant_id, name, slug, deleted_at, deleted_by_sub?` | |
| `tenant.suspended` | `tenant_id, name, slug, suspended_at, suspended_by_sub?, reason?` | **not emitted yet** |
| `tenant.app.granted` | user-level: `tenant_id, user_id, application_id, access_type, …` / subscription: `tenant_id, application_id, subscription_id, license_type_*, …` | two grant modes |
| `tenant.app.revoked` | `tenant_id, user_id, application_id, revoked_by_id?, …` | |
| `application.created` | `application_id, name, slug, client_id, application_type, config, licensing` | `tenant_id: null` |
| `application.updated` | above minus `config`, plus `changed_fields, previous_values` | `tenant_id: null` |
| `application.deleted` | `application_id, name, slug, client_id, deleted_at` | `tenant_id: null` |
| `sso.provider_added` | `provider_id, provider_type, display_name, is_enabled` | `tenant_id: null` |
| `sso.provider_updated` | `provider_id, provider_type, changed_fields` | `tenant_id: null` |
| `sso.provider_removed` | `provider_id, provider_type, removed_at` | `tenant_id: null` |

## Related

- [Overview](./index.md) · [Use Cases](./use-cases.md) · [Prisma Schema](./prisma-schema.md)
