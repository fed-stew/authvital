# Identity Sync Guide

> Mirror AuthVital identities into your own database for fast local queries,
> foreign-key relationships, and offline availability.

!!! info "There is no turnkey `IdentitySyncHandler` in the SDK"
    Earlier drafts imported `IdentitySyncHandler` and `WebhookRouter` from
    `@authvital/sdk/server`. **Those do not exist.** Identity sync is a *pattern*
    you implement with real, shipped primitives:

    1. Receive webhooks and **verify** them with the `verifyWebhook` helper from
       [Manual Verification](../webhooks-verification.md).
    2. Dispatch the verified [`SyncEvent`](../webhooks-events.md) to your own
       handler and **upsert** into your database
       (see [Building a sync handler](./sync-handler.md)).

    The `examples/bff-express` app implements exactly this (in-memory instead of
    Prisma) in `src/webhooks.ts`. The event types come from `@authvital/shared`.

---

## Why sync identities locally?

| Benefit | Description |
|---------|-------------|
| **Performance** | Query identities locally without calling AuthVital |
| **Relationships** | Foreign keys from your domain data (posts, orders, …) to identities |
| **Offline access** | Data available even if AuthVital is briefly unreachable |
| **Custom fields** | Extend the mirrored identity with app-specific columns |

## How it works

```
┌─────────────┐   signed webhook   ┌──────────────┐   upsert   ┌──────────────────┐
│  AuthVital  │ ─────────────────▶ │   Your API   │ ─────────▶ │  Your database    │
│    (IdP)    │  (SyncEvent JSON)  │ verify+route │            │  (av_identities)  │
└─────────────┘                    └──────────────┘            └──────────────────┘
```

!!! warning "Webhook payloads carry a *subset* of the profile"
    A `subject.created` event contains only `{ sub, email?, given_name?,
    family_name?, subject_type? }` — not the full OIDC profile. If you need rich
    profile data (picture, locale, phone, …) read it from the ID token at login
    or call `client.getCurrentUser()`. Don't assume webhook events include fields
    they don't (see [Event Details](./events.md) for the exact shapes).

---

## `isActive` vs `hasAppAccess`

A critical distinction when authorizing:

| Field | Level | Question | Driven by |
|-------|-------|----------|-----------|
| `isActive` | **IdP-level** | Can this person log into *any* app? | `subject.deactivated` |
| `hasAppAccess` | **App-level** | Does this person have access to *this* app? | `app_access.granted` / `app_access.revoked` |

Always check both:

```typescript
const identity = await prisma.identity.findUnique({ where: { id: userId } });
if (!identity?.isActive) throw new Error('Account deactivated');
if (!identity?.hasAppAccess) throw new Error('No access to this application');
```

---

## Quick start

### 1. Add the Prisma models

See [Prisma Schema](./prisma-schema.md), then:

```bash
npx prisma migrate dev --name add-identity-sync
```

### 2. Verify + dispatch webhooks (Express)

```typescript
import express from 'express';
import type { SyncEvent } from '@authvital/shared';
import { verifyWebhook } from './lib/verify-webhook';   // from Manual Verification
import { syncIdentityEvent } from './lib/sync-handler';  // your upsert logic

const app = express();

app.post('/webhooks/authvital', express.raw({ type: '*/*' }), async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');

  const ok = await verifyWebhook({
    body: rawBody,
    signature: String(req.headers['x-authvital-signature'] ?? ''),
    keyId: String(req.headers['x-authvital-key-id'] ?? ''),
    timestamp: String(req.headers['x-authvital-timestamp'] ?? ''),
    authVitalHost: process.env.AV_HOST!,
  });
  if (!ok) return res.status(400).json({ error: 'invalid signature' });

  await syncIdentityEvent(JSON.parse(rawBody) as SyncEvent);
  res.status(200).json({ received: true });
});
```

### 3. Subscribe the app's webhook to the right events

In the AuthVital admin UI, set the application's webhook URL and (optionally)
filter to the events you consume:

```
subject.created  subject.updated  subject.deleted  subject.deactivated
member.joined    member.left      member.role_changed
app_access.granted  app_access.revoked  app_access.role_changed
```

---

## In this section

- [Prisma Schema](./prisma-schema.md) — models to mirror identities
- [Building a sync handler](./sync-handler.md) — map real events → Prisma upserts
- [Tenant Isolation](./tenant-isolation.md) — one database per tenant
- [Event Details](./events.md) — exact payload for every event
- [Advanced](./advanced.md) — initial backfill, session cleanup, extensions

## Related

- [Webhooks Overview](../webhooks.md) · [Event Types & Payloads](../webhooks-events.md) · [Manual Verification](../webhooks-verification.md)
