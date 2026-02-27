# Tenant-Isolated Databases

> Multi-tenant setup where each tenant has their own isolated database.

## Overview

For multi-tenant applications where each tenant has their own isolated database, the `IdentitySyncHandler` supports a **resolver function pattern**.

### Single Database vs Tenant-Isolated

```typescript
import { IdentitySyncHandler } from '@authvital/sdk/server';
import { PrismaClient } from '@prisma/client';

// ═══════════════════════════════════════════════════════════════════════════
// OPTION 1: Single Database (shared or single-tenant)
// ═══════════════════════════════════════════════════════════════════════════
const prisma = new PrismaClient();
const handler = new IdentitySyncHandler(prisma);

// ═══════════════════════════════════════════════════════════════════════════
// OPTION 2: Tenant-Isolated Databases
// ═══════════════════════════════════════════════════════════════════════════
// Pass a resolver function that returns the Prisma client for a given tenant
const handler = new IdentitySyncHandler((tenantId: string) => {
  return getTenantPrisma(tenantId);
});
```

---

## Full Example: Tenant-Isolated Setup

### Tenant Prisma Client Factory

```typescript
// lib/tenant-prisma.ts
import { PrismaClient } from '@prisma/client';

// Cache Prisma clients per tenant to avoid creating new connections
const tenantClients = new Map<string, PrismaClient>();

export function getTenantPrisma(tenantId: string): PrismaClient {
  // Check cache first
  let client = tenantClients.get(tenantId);
  if (client) return client;

  // Get tenant's database URL from your tenant registry
  const databaseUrl = getTenantDatabaseUrl(tenantId);
  
  // Create new Prisma client for this tenant
  client = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
  
  tenantClients.set(tenantId, client);
  return client;
}

function getTenantDatabaseUrl(tenantId: string): string {
  // This could come from:
  // - Environment variables: process.env[`DATABASE_URL_${tenantId}`]
  // - A tenant registry database
  // - A configuration service
  // - etc.
  
  // Example: Each tenant has their own database
  return `postgresql://user:pass@host:5432/tenant_${tenantId}`;
}
```

### Webhook Handler Setup

```typescript
// webhooks/authvital.ts
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { getTenantPrisma } from '../lib/tenant-prisma';

// The handler will call this function with the tenantId from each webhook event
const syncHandler = new IdentitySyncHandler((tenantId) => getTenantPrisma(tenantId));

const router = new WebhookRouter({
  handler: syncHandler,
  authVitalHost: process.env.AV_HOST!,
});

export default router;
```

---

## How Tenant Resolution Works

1. Webhook event arrives with `tenant_id` in the payload
2. `IdentitySyncHandler` calls your resolver function with that `tenant_id`
3. Your resolver returns the appropriate Prisma client for that tenant
4. The handler uses that client to perform the database operation
5. The identity is synced to the correct tenant database

```
┌─────────────┐              ┌──────────────────────┐
│  AuthVital  │              │   Your Webhook API   │
│   Webhook   │ ──────────▶ │  IdentitySyncHandler │
│  (tenant_id │              │                      │
│  = "acme")  │              └──────────────────────┘
└─────────────┘                        │
                                       │ resolver("acme")
                                       ▼
                    ┌──────────────────────────────────┐
                    │         getTenantPrisma          │
                    │   returns Prisma client for ACME │
                    └──────────────────────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────┐
                    │   ACME's Isolated Database       │
                    │   (av_identities table)          │
                    └──────────────────────────────────┘
```

---

## Async Resolvers

The resolver can also be async if you need to fetch tenant configuration from a database or service:

```typescript
const syncHandler = new IdentitySyncHandler(async (tenantId: string) => {
  // Fetch tenant config from your registry
  const tenant = await tenantRegistry.findById(tenantId);
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }
  
  return getTenantPrisma(tenant.databaseUrl);
});
```

---

## Connection Pool Management

For large numbers of tenants, consider implementing connection pool limits:

```typescript
// lib/tenant-prisma.ts
import { PrismaClient } from '@prisma/client';

const MAX_CACHED_CLIENTS = 100;
const tenantClients = new Map<string, {
  client: PrismaClient;
  lastUsed: number;
}>();

export async function getTenantPrisma(tenantId: string): Promise<PrismaClient> {
  // Check cache
  const cached = tenantClients.get(tenantId);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.client;
  }
  
  // Evict oldest if at limit
  if (tenantClients.size >= MAX_CACHED_CLIENTS) {
    const oldest = [...tenantClients.entries()]
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    
    await oldest[1].client.$disconnect();
    tenantClients.delete(oldest[0]);
  }
  
  // Create new client
  const databaseUrl = await getTenantDatabaseUrl(tenantId);
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  
  tenantClients.set(tenantId, { client, lastUsed: Date.now() });
  return client;
}
```

---

## Error Handling

If a tenant's database is unavailable, handle gracefully:

```typescript
const syncHandler = new IdentitySyncHandler(async (tenantId: string) => {
  try {
    return await getTenantPrisma(tenantId);
  } catch (error) {
    console.error(`Failed to connect to tenant ${tenantId} database:`, error);
    
    // Option 1: Re-throw to fail the webhook (will retry)
    throw error;
    
    // Option 2: Return a fallback/default database
    // return getDefaultPrisma();
  }
});
```

---

## Related Documentation

- [Identity Sync Overview](./index.md)
- [Sync Handler](./sync-handler.md)
- [Multi-Tenancy Concepts](../../concepts/multi-tenancy.md)
