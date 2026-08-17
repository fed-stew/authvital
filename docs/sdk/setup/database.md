# Database & Identity Sync

> Mirror AuthVital identities into your database via verified webhooks.

!!! info "There is no `IdentitySyncHandler` / `WebhookRouter` to import"
    Earlier drafts imported those from `@authvital/sdk/server` — they don't
    exist. Identity sync is a small pattern you implement: **verify** each
    webhook with the [`verifyWebhook` helper](../webhooks-verification.md), then
    **upsert** with your own [dispatcher](../identity-sync/sync-handler.md). The
    `examples/bff-express` app shows the full flow. For the deep dive see the
    [Identity Sync Guide](../identity-sync/index.md).

---

## Why sync locally?

| Benefit | Description |
|---------|-------------|
| **Performance** | Query identities locally without calling AuthVital |
| **Relationships** | Foreign keys from your data to identities |
| **Offline access** | Data available if AuthVital is briefly unreachable |
| **Custom fields** | Extend the identity with app-specific columns |

---

## Prisma schema

A minimal starting point (see [full schema](../identity-sync/prisma-schema.md)):

```prisma
model Identity {
  id            String    @id
  email         String?   @unique
  givenName     String?   @map("given_name")
  familyName    String?   @map("family_name")
  subjectType   String    @default("user") @map("subject_type")

  // Status flags (see terminology below)
  isActive      Boolean   @default(true) @map("is_active")
  hasAppAccess  Boolean   @default(true) @map("has_app_access")

  // Tenant context (from member.* events; tenant_roles is an array of slugs)
  tenantId      String?   @map("tenant_id")
  tenantRoles   Json      @default("[]") @map("tenant_roles")
  appRole       String?   @map("app_role") // from app_access.* events

  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  @@map("av_identities")
}
```

!!! warning "Webhooks populate a subset of columns"
    Add richer profile columns (picture, locale, phone, …) only if you also
    backfill them from the ID token or `client.getCurrentUser()` — the sync
    events don't carry them. See [Event Details](../identity-sync/events.md).

Run the migration:

```bash
npx prisma migrate dev --name add-identity-sync
npx prisma generate
```

---

## `isActive` vs `hasAppAccess`

| Field | Level | Question | Driven by |
|-------|-------|----------|-----------|
| `isActive` | IdP-level | Can they log into *any* app? | `subject.deactivated` |
| `hasAppAccess` | App-level | Can they use *this* app? | `app_access.granted/revoked` |

```typescript
const identity = await prisma.identity.findUnique({ where: { id: userId } });
if (!identity?.isActive) throw new Error('Account deactivated');
if (!identity?.hasAppAccess) throw new Error('No access to this application');
```

---

## Webhook endpoint (Express)

Verify the raw body, then dispatch to your upsert logic.

```typescript
// routes/webhooks.ts
import express, { Router } from 'express';
import type { SyncEvent } from '@authvital/shared';
import { verifyWebhook } from '../lib/verify-webhook';    // from Manual Verification
import { syncIdentityEvent } from '../lib/sync-handler';  // your dispatcher

const router = Router();

router.post('/authvital', express.raw({ type: '*/*' }), async (req, res) => {
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

export default router;
```

Mount it **before** any global `express.json()` so the raw body survives:

```typescript
app.use('/webhooks', webhookRoutes);
app.use(express.json());
```

For Next.js / NestJS / other frameworks, see
[Framework Integration](../webhooks-frameworks.md).

---

## Configure the webhook in AuthVital

1. **AuthVital Admin** → your application → **Webhooks**.
2. Set the URL, e.g. `https://yourapp.com/webhooks/authvital`.
3. Optionally filter to the events you consume (wildcards like `subject.*` are supported):

```
subject.created  subject.updated  subject.deleted  subject.deactivated
member.joined    member.left      member.role_changed
app_access.granted  app_access.revoked  app_access.role_changed
license.assigned license.revoked  license.changed
```

---

## Events you'll typically handle

| Event | Action | Fields set |
|-------|--------|-----------|
| `subject.created` | upsert identity | `email`, `givenName`, `familyName` |
| `subject.updated` | update changed fields | per `changed_fields` |
| `subject.deleted` | delete | – |
| `subject.deactivated` | update | `isActive = false` |
| `member.joined` | update | `tenantId`, `tenantRoles` |
| `member.left` | update | clear tenant fields |
| `member.role_changed` | update | `tenantRoles` |
| `app_access.granted` | update | `hasAppAccess = true`, `appRole` |
| `app_access.revoked` | update | `hasAppAccess = false` |

Full mapping in [Building a Sync Handler](../identity-sync/sync-handler.md).

---

## Next steps

- [Frontend Setup](./frontend.md) — React provider and hooks
- [Identity Sync Guide](../identity-sync/index.md) — schema, events, tenant isolation, backfill
