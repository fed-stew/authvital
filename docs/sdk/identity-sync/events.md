# Identity Sync Events

> The exact payloads AuthVital sends, verified against
> `packages/shared/src/types/sync-events.types.ts`.

## Envelope

Every event has the same top-level shape (`BaseSyncEvent`):

```jsonc
{
  "id": "e2b1…",              // unique event id (also in X-AuthVital-Event-Id)
  "type": "subject.created",  // the event type — note: "type", NOT "event"
  "timestamp": "2024-01-15T10:30:00.000Z",
  "tenant_id": "tenant-xyz",
  "application_id": "app-123",
  "data": { /* event-specific */ }
}
```

!!! warning "Fields are minimal by design"
    `data` carries only what changed. There is **no** `preferred_username`,
    `name`, `picture`, `locale`, `groups`, or `app_role` on these payloads. For
    the full profile, read the ID token at login or call `client.getCurrentUser()`.

The TypeScript types and guards are importable from `@authvital/shared`
(`SyncEvent`, `SubjectCreatedEvent`, `isSubjectEvent`, …).

---

## Subject events

### `subject.created`

```jsonc
{
  "type": "subject.created",
  "tenant_id": "tenant-xyz",
  "application_id": "app-123",
  "data": {
    "sub": "user-abc-123",
    "email": "jane@example.com",
    "given_name": "Jane",
    "family_name": "Smith",
    "subject_type": "user"   // "user" | "service_account" | "machine"
  }
}
```

### `subject.updated`

Adds `changed_fields` — apply only those.

```jsonc
{
  "type": "subject.updated",
  "data": {
    "sub": "user-abc-123",
    "email": "jane.smith@newco.com",
    "family_name": "Smith-Johnson",
    "changed_fields": ["email", "family_name"]
  }
}
```

### `subject.deleted` / `subject.deactivated`

`data` is `{ sub, email? }`. `deleted` removes the record; `deactivated` sets
`isActive = false` (the person can no longer log into any app).

---

## Member events

Member `data` uses **`tenant_roles`** (array of role slugs), plus
`membership_id` and `sub`.

### `member.joined`

```jsonc
{
  "type": "member.joined",
  "tenant_id": "tenant-xyz",
  "data": {
    "membership_id": "mem-1",
    "sub": "user-abc-123",
    "email": "jane@example.com",
    "tenant_roles": ["editor"],
    "given_name": "Jane",
    "family_name": "Smith"
  }
}
```

### `member.left`

`data` is `{ membership_id, sub, email? }` — clear the tenant association.

### `member.role_changed`

```jsonc
{
  "type": "member.role_changed",
  "data": {
    "membership_id": "mem-1",
    "sub": "user-abc-123",
    "email": "jane@example.com",
    "tenant_roles": ["admin"],
    "previous_roles": ["editor"]
  }
}
```

There are also `member.suspended` and `member.activated` (`{ membership_id, sub, email? }`).

---

## App-access events

App-access `data` describes a role on **your** application:
`{ membership_id, sub, email?, role_id, role_name, role_slug }`.

### `app_access.granted`

```jsonc
{
  "type": "app_access.granted",
  "application_id": "app-123",
  "data": {
    "membership_id": "mem-1",
    "sub": "user-abc-123",
    "email": "jane@example.com",
    "role_id": "role-9",
    "role_name": "Viewer",
    "role_slug": "viewer",
    "given_name": "Jane",
    "family_name": "Smith"
  }
}
```

### `app_access.revoked`

`data` is `{ membership_id, sub, email? }` — set `hasAppAccess = false`.

### `app_access.role_changed`

Adds `previous_role_id`, `previous_role_name`, `previous_role_slug` alongside the
new `role_*` fields.

---

## Invite & license events

These also flow through the same webhook (handle them if relevant to your app):

- `invite.created` / `invite.accepted` / `invite.deleted` / `invite.expired` —
  `data` includes `invite_id`, `membership_id`, `email`, `tenant_roles`
  (accepted also adds `sub`).
- `license.assigned` / `license.revoked` / `license.changed` — `data` includes
  `assignment_id`, `sub`, `license_type_id`, `license_type_name` (changed adds
  `previous_license_type_*`).

See [Webhook Event Types](../webhooks-events.md) for the complete catalog of
sync-webhook events. Tenant/application/SSO **configuration** changes are a
separate channel — see [Organization Sync](../organization-sync/index.md).

---

## Mapping to Prisma

See [Building a Sync Handler](./sync-handler.md) for the full switch that turns
each of these into an upsert.

## Related

- [Sync Handler](./sync-handler.md) · [Prisma Schema](./prisma-schema.md) · [Overview](./index.md)
