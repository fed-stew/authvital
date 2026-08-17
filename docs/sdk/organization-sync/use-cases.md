# Organization Sync Use Cases

> Patterns built on the **real** system-webhook events (see [Events](./events.md)).
> There is no `OrganizationSyncHandler` — you write a small dispatcher.

```typescript
// dispatcher signature used below
export async function handleSystemEvent(event: string, data: any): Promise<void> { /* ... */ }
```

## Provisioning workflows

React to tenant creation to bootstrap per-tenant resources:

```typescript
if (event === 'tenant.created') {
  await provisionTenant({
    tenantId: data.tenant_id,
    slug: data.tenant_slug,
    name: data.tenant_name,
    ownerEmail: data.owner_email,
  });
}
```

!!! note "No `plan`/`settings` in the payload"
    `tenant.created` gives you `tenant_id`, `tenant_name`, `tenant_slug`, and
    (optionally) `owner_id`/`owner_email`. If you need plan/settings, fetch them
    from AuthVital out-of-band — they aren't in the event.

Grant/revoke of app access can drive per-user resource provisioning too:

```typescript
if (event === 'tenant.app.granted') {
  await grantResources({ userId: data.user_id, appId: data.application_id, tenantId: data.tenant_id });
}
if (event === 'tenant.app.revoked') {
  await revokeResources({ userId: data.user_id, appId: data.application_id, tenantId: data.tenant_id });
}
```

## Billing integration

There is **no** `tenant.updated` plan-change payload. Billing signals come from
the per-application **license** sync events (`license.assigned` / `license.revoked`
/ `license.changed`) — see [Identity Sync events](../identity-sync/events.md) —
or the `tenant.app.granted` system event, which includes a
`license_assignment_id` when access came from a license.

```typescript
if (event === 'tenant.app.granted' && data.license_assignment_id) {
  await billing.recordSeatUsage(data.tenant_id, data.application_id);
}
```

For on-demand entitlement checks use
`client.integration.checkSeats` / `checkFeature` / `getSubscriptionStatus`
(see [Entitlements](../server-sdk/namespaces/entitlements.md)).

## Audit logging

Persist an audit row per system event — `changed_fields` is available on
`tenant.updated`, `application.updated`, and `sso.provider_updated`:

```typescript
await prisma.orgAuditLog.create({
  data: {
    event,
    changedFields: data.changed_fields ?? [],
    tenantId: data.tenant_id ?? null,
    applicationId: data.application_id ?? null,
    payload: data,
    receivedAt: new Date(),
  },
});
```

!!! warning "No `previous_values`"
    The system webhook sends `changed_fields` but **not** the old values. If you
    need before/after diffs, compare against your own last-known state.

## SSO configuration tracking

```typescript
if (event.startsWith('sso.')) {
  await prisma.ssoProviderState.upsert({
    where: { providerId: data.provider_id },
    create: { providerId: data.provider_id, providerType: data.provider_type, enabled: data.is_enabled ?? true },
    update: { enabled: event === 'sso.provider_removed' ? false : (data.is_enabled ?? undefined) },
  });
}
```

SSO events carry only `provider_id`, `provider_type`, and (`_added`) `display_name`
/ `is_enabled` or (`_updated`) `changed_fields`. Connection secrets/config are
**not** delivered.

## Reliability caveat

System webhooks are **fire-and-forget with no retries** (see [Overview](./index.md)).
Respond `2xx` quickly and offload real work to a queue so a slow handler can't
cause you to miss events.

## Related

- [Overview](./index.md) · [Events](./events.md) · [Identity Sync](../identity-sync/index.md)
