# Building a Sync Handler

> Map verified AuthVital events to your database. There is no pre-built handler —
> you write a small dispatcher. It's ~40 lines.

!!! info "No `IdentitySyncHandler` / `WebhookRouter` in the SDK"
    You own the dispatch logic. The event **types and type-guards** ship in
    `@authvital/shared` (`SyncEvent`, `isSubjectEvent`, …); the **verification**
    helper is in [Manual Verification](../webhooks-verification.md). This page
    shows the real thing, mirroring `examples/bff-express/src/webhooks.ts`.

## The dispatcher

```typescript
// lib/sync-handler.ts
import type {
  SyncEvent,
  SubjectCreatedEvent,
  SubjectUpdatedEvent,
  SubjectDeletedEvent,
  SubjectDeactivatedEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  MemberRoleChangedEvent,
  AppAccessGrantedEvent,
  AppAccessRevokedEvent,
  AppAccessRoleChangedEvent,
} from '@authvital/shared';
import { prisma } from './prisma';

export async function syncIdentityEvent(event: SyncEvent): Promise<void> {
  switch (event.type) {
    case 'subject.created':      return onSubjectCreated(event);
    case 'subject.updated':      return onSubjectUpdated(event);
    case 'subject.deleted':      return onSubjectDeleted(event);
    case 'subject.deactivated':  return onSubjectDeactivated(event);
    case 'member.joined':        return onMemberJoined(event);
    case 'member.left':          return onMemberLeft(event);
    case 'member.role_changed':  return onMemberRoleChanged(event);
    case 'app_access.granted':   return onAppAccessGranted(event);
    case 'app_access.revoked':   return onAppAccessRevoked(event);
    case 'app_access.role_changed': return onAppAccessRoleChanged(event);
    default: return; // invite.* / license.* — ignore for identity sync
  }
}
```

## Subject handlers

Every event has the envelope `{ id, type, timestamp, tenant_id, application_id, data }`.
`subject.*` `data` carries only `{ sub, email?, given_name?, family_name?, subject_type? }`
(`subject.updated` adds `changed_fields`).

```typescript
async function onSubjectCreated(e: SubjectCreatedEvent) {
  await prisma.identity.upsert({
    where: { id: e.data.sub },
    create: {
      id: e.data.sub,
      email: e.data.email,
      givenName: e.data.given_name,
      familyName: e.data.family_name,
      subjectType: e.data.subject_type ?? 'user',
      isActive: true,
      hasAppAccess: true,
    },
    update: {
      email: e.data.email,
      givenName: e.data.given_name,
      familyName: e.data.family_name,
      isActive: true,
    },
  });
}

async function onSubjectUpdated(e: SubjectUpdatedEvent) {
  // Only apply the fields AuthVital says changed.
  const data: Record<string, unknown> = {};
  for (const f of e.data.changed_fields) {
    if (f === 'email') data.email = e.data.email;
    if (f === 'given_name') data.givenName = e.data.given_name;
    if (f === 'family_name') data.familyName = e.data.family_name;
  }
  await prisma.identity.update({ where: { id: e.data.sub }, data });
}

async function onSubjectDeleted(e: SubjectDeletedEvent) {
  await prisma.identity.delete({ where: { id: e.data.sub } }).catch(() => {});
}

async function onSubjectDeactivated(e: SubjectDeactivatedEvent) {
  await prisma.identity.update({ where: { id: e.data.sub }, data: { isActive: false } });
}
```

## Member handlers

`member.*` `data` carries `{ membership_id, sub, email?, tenant_roles: string[] }`
(`member.joined` also adds `given_name?`, `family_name?`; `member.role_changed`
adds `previous_roles`). Note the field is **`tenant_roles`**, an array of slugs.

```typescript
async function onMemberJoined(e: MemberJoinedEvent) {
  await prisma.identity.update({
    where: { id: e.data.sub },
    data: { tenantId: e.tenant_id, tenantRoles: e.data.tenant_roles },
  });
}

async function onMemberLeft(e: MemberLeftEvent) {
  await prisma.identity.update({
    where: { id: e.data.sub },
    data: { tenantId: null, tenantRoles: [] },
  });
}

async function onMemberRoleChanged(e: MemberRoleChangedEvent) {
  await prisma.identity.update({
    where: { id: e.data.sub },
    data: { tenantRoles: e.data.tenant_roles },
  });
}
```

## App-access handlers

`app_access.*` `data` carries `{ membership_id, sub, email?, role_id, role_name, role_slug }`
(role-changed adds `previous_role_*`). This is where `hasAppAccess` and the app role live.

```typescript
async function onAppAccessGranted(e: AppAccessGrantedEvent) {
  await prisma.identity.update({
    where: { id: e.data.sub },
    data: { hasAppAccess: true, appRole: e.data.role_slug },
  });
}

async function onAppAccessRevoked(e: AppAccessRevokedEvent) {
  await prisma.identity.update({
    where: { id: e.data.sub },
    data: { hasAppAccess: false, appRole: null },
  });
}

async function onAppAccessRoleChanged(e: AppAccessRoleChangedEvent) {
  await prisma.identity.update({
    where: { id: e.data.sub },
    data: { appRole: e.data.role_slug },
  });
}
```

## Event → action reference

| Event | Real `data` fields | Prisma action |
|-------|--------------------|---------------|
| `subject.created` | `sub, email?, given_name?, family_name?, subject_type?` | upsert identity |
| `subject.updated` | above + `changed_fields` | update changed fields only |
| `subject.deleted` | `sub, email?` | delete identity |
| `subject.deactivated` | `sub, email?` | `isActive = false` |
| `member.joined` | `membership_id, sub, email?, tenant_roles, given_name?, family_name?` | set `tenantId`, `tenantRoles` |
| `member.left` | `membership_id, sub, email?` | clear tenant fields |
| `member.role_changed` | `... tenant_roles, previous_roles` | update `tenantRoles` |
| `app_access.granted` | `membership_id, sub, email?, role_id, role_name, role_slug` | `hasAppAccess=true`, `appRole` |
| `app_access.revoked` | `membership_id, sub, email?` | `hasAppAccess=false` |
| `app_access.role_changed` | `... role_slug, previous_role_*` | update `appRole` |

!!! tip "Idempotency"
    AuthVital retries failed deliveries. Prefer `upsert`, and use
    `X-AuthVital-Event-Id` to de-duplicate if you record processed events.

## Related

- [Event Details](./events.md) · [Prisma Schema](./prisma-schema.md) · [Tenant Isolation](./tenant-isolation.md) · [Manual Verification](../webhooks-verification.md)
