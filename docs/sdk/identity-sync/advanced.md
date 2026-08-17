# Advanced Identity Sync

> Custom side effects, initial backfill, session cleanup, and schema extensions —
> all built on the real dispatcher, not a phantom `IdentitySyncHandler`.

!!! info "Everything here uses real primitives"
    No `AuthVitalEventHandler`, `WebhookRouter`, `createAuthVital`, or
    `cleanupSessions` SDK exports — none of those exist. You extend the
    [dispatcher you wrote](./sync-handler.md), use `createServerClient(...).integration.*`
    for server calls, and run your own Prisma queries for cleanup.

## Custom side effects

Add behaviour by extending your own dispatcher — do the DB upsert, then fire your
side effects. Remember the real payload fields (see [Event Details](./events.md)).

```typescript
import type { SubjectCreatedEvent, MemberJoinedEvent } from '@authvital/shared';
import { prisma } from './prisma';
import { sendWelcomeEmail, notifySlack } from './services';

export async function onSubjectCreated(e: SubjectCreatedEvent) {
  await prisma.identity.upsert({
    where: { id: e.data.sub },
    create: {
      id: e.data.sub,
      email: e.data.email,
      givenName: e.data.given_name,
      familyName: e.data.family_name,
      isActive: true,
      hasAppAccess: true,
    },
    update: { email: e.data.email },
  });

  if (e.data.email) {
    await sendWelcomeEmail({ to: e.data.email, name: e.data.given_name ?? 'there' });
  }
  await notifySlack(` New user: ${e.data.email ?? e.data.sub}`);
}

export async function onMemberJoined(e: MemberJoinedEvent) {
  await prisma.identity.update({
    where: { id: e.data.sub },
    data: { tenantId: e.tenant_id, tenantRoles: e.data.tenant_roles },
  });
  await notifySlack(` ${e.data.email ?? e.data.sub} joined ${e.tenant_id}`);
}
```

Wire these into the `switch` from [Building a Sync Handler](./sync-handler.md).

## Initial backfill

Webhooks only cover changes going forward. To seed existing members, page through
the **integration API** with an M2M client and upsert. There is no
`authvital.admin.listUsers()` — the real method is `listTenantMembers`.

```typescript
import { createServerClient } from '@authvital/server';
import { prisma } from './prisma';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

export async function backfillTenant(tenantId: string) {
  const { memberships } = await client.integration.listTenantMembers({
    tenantId,
    status: 'ACTIVE',
    includeRoles: true,
  });

  for (const m of memberships) {
    await prisma.identity.upsert({
      where: { id: m.userId },
      create: {
        id: m.userId,
        email: m.email,
        givenName: m.givenName,
        familyName: m.familyName,
        tenantId,
        tenantRoles: (m.tenantRoles ?? []).map((r) => r.slug),
        isActive: m.status === 'ACTIVE',
        hasAppAccess: true,
      },
      update: {
        email: m.email,
        tenantId,
        tenantRoles: (m.tenantRoles ?? []).map((r) => r.slug),
      },
    });
  }
  console.log(`Backfilled ${memberships.length} members for ${tenantId}`);
}
```

## Session cleanup

Session rows are yours (if your schema mirrors sessions) — clean them with a
plain Prisma query on a cron. This is not an SDK feature.

```typescript
import cron from 'node-cron';
import { prisma } from './prisma';

cron.schedule('0 3 * * *', async () => {
  const { count } = await prisma.identitySession.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] },
  });
  console.log(`Cleaned up ${count} sessions`);
});
```

## Querying synced identities

```typescript
// Active users with access to this app in a tenant
await prisma.identity.findMany({
  where: { tenantId, isActive: true, hasAppAccess: true },
  orderBy: { givenName: 'asc' },
});

// By email
await prisma.identity.findUnique({ where: { email: 'jane@example.com' } });
```

## Extending the schema

Add your own columns/relations alongside the mirrored fields:

```prisma
model Identity {
  // … mirrored fields (see prisma-schema.md) …
  preferences   Json?     @default("{}")
  lastSeenAt    DateTime?
  posts         Post[]
  @@map("av_identities")
}
```

Your custom fields are independent of webhook sync — update them freely.

## Security

- **Always verify signatures** with `verifyWebhook` before processing. Never skip it.
- Don't leak internal flags (`isActive`, `hasAppAccess`, `syncedAt`) in public API responses.
- Rate-limit the webhook route as defense-in-depth (e.g. `express-rate-limit`).

## Related

- [Building a Sync Handler](./sync-handler.md) · [Event Details](./events.md) · [Webhooks Best Practices](../webhooks-advanced.md)
