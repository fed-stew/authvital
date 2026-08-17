# Tenant-Isolated Databases

> Route each verified event to the right per-tenant database.

!!! info "You own the routing — there's no `IdentitySyncHandler` resolver"
    Earlier drafts passed a resolver function to `new IdentitySyncHandler(...)`.
    That class doesn't exist. The pattern is still simple: every
    [`SyncEvent`](./events.md) carries `tenant_id`, so your dispatcher looks up
    the tenant's Prisma client and runs the upsert against it.

## Per-tenant Prisma client factory

```typescript
// lib/tenant-prisma.ts
import { PrismaClient } from '@prisma/client';

const clients = new Map<string, PrismaClient>();

export function getTenantPrisma(tenantId: string): PrismaClient {
  let client = clients.get(tenantId);
  if (client) return client;

  const url = getTenantDatabaseUrl(tenantId); // from your tenant registry / env
  client = new PrismaClient({ datasources: { db: { url } } });
  clients.set(tenantId, client);
  return client;
}

function getTenantDatabaseUrl(tenantId: string): string {
  // e.g. process.env[`DATABASE_URL_${tenantId}`] or a lookup service
  return `postgresql://user:pass@host:5432/tenant_${tenantId}`;
}
```

## Tenant-aware dispatcher

Resolve the client from `event.tenant_id`, then reuse the same per-event logic
from [Building a Sync Handler](./sync-handler.md):

```typescript
// lib/sync-handler.ts
import type { SyncEvent } from '@authvital/shared';
import { getTenantPrisma } from './tenant-prisma';

export async function syncIdentityEvent(event: SyncEvent): Promise<void> {
  const prisma = getTenantPrisma(event.tenant_id);

  switch (event.type) {
    case 'subject.created':
      await prisma.identity.upsert({
        where: { id: event.data.sub },
        create: {
          id: event.data.sub,
          email: event.data.email,
          givenName: event.data.given_name,
          familyName: event.data.family_name,
          isActive: true,
          hasAppAccess: true,
        },
        update: { email: event.data.email, isActive: true },
      });
      break;
    case 'member.joined':
      await prisma.identity.update({
        where: { id: event.data.sub },
        data: { tenantId: event.tenant_id, tenantRoles: event.data.tenant_roles },
      });
      break;
    // … remaining cases as in sync-handler.md, using `prisma`
  }
}
```

Your webhook route stays identical — verify, then call `syncIdentityEvent(event)`.

## How resolution works

```
webhook (tenant_id = "acme")
        │
        ▼
verifyWebhook(...)  ──►  syncIdentityEvent(event)
                               │  getTenantPrisma("acme")
                               ▼
                        ACME's database (av_identities)
```

## Async resolvers

If tenant config lives in a registry, make the factory async and `await` it in
the dispatcher:

```typescript
export async function getTenantPrisma(tenantId: string): Promise<PrismaClient> {
  const tenant = await tenantRegistry.findById(tenantId);
  if (!tenant) throw new Error(`Unknown tenant: ${tenantId}`);
  return clientFor(tenant.databaseUrl);
}
```

## Connection-pool hygiene

For many tenants, cap the number of cached clients and evict least-recently-used
ones (`await client.$disconnect()` on eviction). If a tenant DB is unreachable,
**throw** from the dispatcher so the webhook returns non-2xx and AuthVital
retries (it retries up to 5 times with backoff).

## Related

- [Building a Sync Handler](./sync-handler.md) · [Multi-Tenancy Concepts](../../concepts/multi-tenancy.md)
