# Upgrading to the Broker Architecture

> For existing installs moving to a version that includes the event broker,
> service-role split, and dedicated webhook signing key.

## TL;DR — do nothing, everything keeps working

The defaults preserve exact pre-upgrade behavior:

- `SERVICE_ROLE` defaults to `all` — one container serving everything.
- `WEBHOOK_DELIVERY_MODE` defaults to `legacy` — webhooks delivered in-core,
  same immediate attempt + 5-retry cron as before.
- Two **additive** migrations apply automatically on upgrade:
    1. `delivery_*` lifecycle columns on `pub_sub_outbox_events` (defaults,
       ignored in legacy mode).
    2. A `purpose` column on `signing_keys` (existing keys become `TOKEN`;
       a dedicated `WEBHOOK` key is generated on first boot).
- Webhook receivers need **no changes**: a new webhook-purpose `kid` appears
  in JWKS and webhook signatures start using it, but receivers resolve keys
  by `kid` against JWKS as always.

## Opting in to the split topology

1. **Local / self-hosted** (Postgres-only broker transport):

    ```bash
    docker compose --profile split up -d postgres migrate \
      authvital-public authvital-admin authvital-broker
    ```

2. **GCP Cloud Run** (Pub/Sub transport, DLQ, internal admin ingress):

    ```bash
    ./scripts/deploy-gcp.sh --project my-proj \
      --base-url https://auth.example.com --split
    ```

3. **Manual**: set `WEBHOOK_DELIVERY_MODE=broker` on every core instance,
   then start the broker (`packages/broker`) against the same database with
   the same `MASTER_SECRET`. Order matters loosely: cores in broker mode
   simply queue events until a broker consumes them.

!!! warning "Never run legacy mode alongside a broker"
    A core in `legacy` mode delivers webhooks itself AND leaves outbox rows
    for the broker — running both means **double delivery**. Switch the mode
    and start the broker as one operation.

## Rollback

Instant and safe, in either order:

1. Set `WEBHOOK_DELIVERY_MODE=legacy` (or unset it) on the core and restart.
2. Stop the broker.

In-flight events are not lost: rows the broker had queued stay in the outbox
(delivery bookkeeping simply stops), and any sync event still `PENDING`
is picked up by the core's legacy retry cron. The migrations do not need to
be reverted — the new columns are inert in legacy mode.

## Breaking change: canonical system-event payloads

As of this version, the 12 `system_webhook` event payload shapes are
**canonical and strictly typed** (contracts in `@authvital/shared`,
enforced at compile time on every emit site). If you consume
`tenant.*`, `tenant.app.*`, `application.*`, or `sso.provider_*` events
via system webhooks or Pub/Sub, review the changes below. Sync events
(`subject.*`, `invite.*`, `member.*`, `app_access.*`, `license.*`) are
UNCHANGED.

| Event | Added | Removed / never existed | Renamed |
|---|---|---|---|
| `tenant.created` | `created_at`, `settings` (freeform JSON) | `plan`, structured `settings` fields (docs fiction) | `tenant_name` → `name`, `tenant_slug` → `slug`, `owner_id` → `created_by_sub` |
| `tenant.updated` | `settings`, `updated_by_sub?`, `previous_values?`; `name` now always present | `plan` (docs fiction) | `tenant_name` → `name`, `tenant_slug` → `slug` |
| `tenant.deleted` | `name`, `deleted_at` | `plan` (docs fiction) | `tenant_slug` → `slug` |
| `tenant.suspended` | — (contract reserved; still not emitted) | `plan`, `settings` (docs fiction) | — |
| `tenant.app.granted` | canonical union of BOTH grant modes: user-level (`user_id?`, `access_type?`, `role_*?`, `license_assignment_id?`) and tenant-level subscription (`subscription_id?`, `license_type_*?`, `quantity_purchased?`, `status?`) | — | — |
| `tenant.app.revoked` | `application_name` (previously missing) | — | — |
| `application.created` | — (already matched docs) | `allowed_scopes`, `grant_types`, `token_endpoint_auth_method`, `created_by_sub` (docs fiction); `tenant_id` is always `null` — apps are instance-scoped | — |
| `application.updated` | `licensing` block now ALWAYS present (incl. enable/disable toggles); `client_id` coerced to `string \| null` | `config` block, `updated_by_sub` (docs fiction) | — |
| `application.deleted` | — | `deleted_by_sub` (docs fiction) | — |
| `sso.provider_added` | — | `config` block, `created_by_sub`/`created_at` (docs fiction); `provider_id` is the provider enum key, not a row id | — |
| `sso.provider_updated` | — | `display_name`, `is_enabled`, `previous_values`, `updated_by_sub`, `config` (docs fiction) | — |
| `sso.provider_removed` | `removed_at` | `display_name`, `removed_by_sub` (docs fiction) | — |

Migration guidance:

- **Typed consumers** (`@authvital/server/pubsub`): upgrade
  `@authvital/shared` / `@authvital/server` together — the compiler walks
  you through every affected handler (`event.data` is now strictly narrowed
  for system events, same as sync events).
- **Untyped consumers**: search your handlers for the removed/renamed
  fields above; the most common breakers are `tenant_name`/`tenant_slug` →
  `name`/`slug` and any reliance on the fictional `plan`/structured
  `settings` fields (which were never actually sent).

## See also

- [Event Broker architecture](../concepts/event-broker.md)
- [Service Roles & split deployment](../concepts/service-roles.md)
- [Configuration reference](./configuration.md)
- [Webhook event payload reference](../sdk/webhooks-events.md)
