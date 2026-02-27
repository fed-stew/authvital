# IdentitySyncHandler

> Pre-built webhook handler that syncs AuthVital identities to your Prisma database.

## Overview

The `IdentitySyncHandler` class automatically syncs identity data from AuthVital webhooks to your database. It supports:

- **Single database** (shared or single-tenant apps)
- **Tenant-isolated databases** (one database per tenant)

---

## Basic Usage (Single Database)

```typescript
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Pass the Prisma client directly
const syncHandler = new IdentitySyncHandler(prisma);

const router = new WebhookRouter({
  handler: syncHandler,
  authVitalHost: process.env.AV_HOST!,
});
```

---

## Tenant-Isolated Databases

For multi-tenant applications where each tenant has their own database:

```typescript
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { getTenantPrisma } from './lib/tenant-prisma';

// Pass a resolver function that returns the Prisma client per tenant
const syncHandler = new IdentitySyncHandler((tenantId: string) => {
  return getTenantPrisma(tenantId);
});

const router = new WebhookRouter({
  handler: syncHandler,
  authVitalHost: process.env.AV_HOST!,
});
```

See [Tenant Isolation](./tenant-isolation.md) for full setup guide.

---

## Events Handled

The `IdentitySyncHandler` automatically handles these events:

| Event | Database Action | Fields Affected |
|-------|-----------------|------------------|
| `subject.created` | `prisma.identity.create()` | All OIDC fields from payload |
| `subject.updated` | `prisma.identity.update()` | Only `changed_fields` from payload |
| `subject.deleted` | `prisma.identity.delete()` | Removes entire record |
| `subject.deactivated` | `prisma.identity.update()` | `isActive = false` |
| `member.joined` | `prisma.identity.update()` | `tenantId`, `appRole`, `groups` |
| `member.left` | `prisma.identity.update()` | Clears `tenantId`, `appRole`, `groups` |
| `member.role_changed` | `prisma.identity.update()` | `appRole`, `groups` |
| `app_access.granted` | `prisma.identity.update()` | `hasAppAccess = true`, `appRole` |
| `app_access.revoked` | `prisma.identity.update()` | `hasAppAccess = false`, clears `appRole` |
| `app_access.role_changed` | `prisma.identity.update()` | `appRole` |

---

## Selective Updates

When a `subject.updated` event fires, the handler **only updates the fields that actually changed**. AuthVital sends a `changed_fields` array in the payload:

```json
{
  "event": "subject.updated",
  "data": {
    "sub": "user-123",
    "email": "newemail@example.com",
    "given_name": "Jane",
    "changed_fields": ["email", "given_name"]
  }
}
```

The handler only updates `email` and `givenName`, leaving all other fields untouched. This is more efficient and prevents accidentally overwriting data.

---

## Mounting the Handler

### Express

```typescript
import express from 'express';
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { prisma } from './lib/prisma';

const app = express();
const syncHandler = new IdentitySyncHandler(prisma);
const router = new WebhookRouter({
  handler: syncHandler,
  authVitalHost: process.env.AV_HOST!,
});

// IMPORTANT: Use raw body for signature verification
app.post(
  '/webhooks/authvital',
  express.raw({ type: 'application/json' }),
  router.expressHandler()
);
```

### Next.js (App Router)

```typescript
// app/api/webhooks/authvital/route.ts
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { prisma } from '@/lib/prisma';

const syncHandler = new IdentitySyncHandler(prisma);
const router = new WebhookRouter({
  handler: syncHandler,
  authVitalHost: process.env.AV_HOST!,
});

export async function POST(request: Request) {
  const body = await request.text();
  const result = await router.handle(body, Object.fromEntries(request.headers));
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### NestJS

```typescript
import { Controller, Post, Req, Res, RawBodyRequest } from '@nestjs/common';
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { Request, Response } from 'express';
import { PrismaService } from './prisma.service';

@Controller('webhooks')
export class WebhookController {
  private router: WebhookRouter;

  constructor(prisma: PrismaService) {
    const syncHandler = new IdentitySyncHandler(prisma);
    this.router = new WebhookRouter({
      handler: syncHandler,
      authVitalHost: process.env.AV_HOST!,
    });
  }

  @Post('authvital')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    const result = await this.router.handle(req.rawBody!, req.headers);
    res.status(result.status).json(result.body);
  }
}
```

---

## Configuring Webhooks in AuthVital

1. Go to **AuthVital Admin Panel** → **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:

| Field | Value |
|-------|-------|
| Name | `Identity Sync` |
| URL | `https://yourapp.com/api/webhooks/authvital` |

4. Subscribe to these events:

- `subject.created`
- `subject.updated`
- `subject.deleted`
- `subject.deactivated`
- `member.joined`
- `member.left`
- `member.role_changed`
- `app_access.granted`
- `app_access.revoked`
- `app_access.role_changed`

---

## Related Documentation

- [Identity Sync Overview](./index.md)
- [Prisma Schema](./prisma-schema.md)
- [Event Details](./events.md)
- [Custom Handlers](./advanced.md)
