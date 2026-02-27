# Database & Identity Sync

> Set up local identity sync via webhooks to mirror AuthVital data.

---

## Why Sync Identities Locally?

| Benefit | Description |
|---------|-------------|
| **Performance** | Query identities locally without API calls |
| **Relationships** | Create foreign keys to your app data |
| **Offline Access** | Data available if AuthVital is unreachable |
| **Custom Fields** | Extend identity data with app-specific attributes |

---

## Prisma Schema

Add the identity models to your `schema.prisma`:

```prisma
// schema.prisma

/// Synced identity from AuthVital
model Identity {
  id              String    @id @map("id")
  email           String?   @unique
  name            String?
  givenName       String?   @map("given_name")
  familyName      String?   @map("family_name")
  picture         String?
  locale          String?
  timezone        String?
  
  // Status flags (see terminology below)
  isActive        Boolean   @default(true) @map("is_active")
  hasAppAccess    Boolean   @default(true) @map("has_app_access")
  
  subjectType     String    @default("user") @map("subject_type")
  tenantId        String?   @map("tenant_id")
  tenantRoles     Json      @default("[]") @map("tenant_roles")
  appPermissions  Json      @default("[]") @map("app_permissions")
  licenseType     String?   @map("license_type")
  licenseFeatures Json      @default("[]") @map("license_features")
  
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  sessions        IdentitySession[]
  // Add your app relations here:
  // posts         Post[]
  // orders        Order[]

  @@map("av_identities")
}

/// Active sessions for an identity
model IdentitySession {
  id              String    @id @default(cuid())
  identityId      String    @map("identity_id")
  identity        Identity  @relation(fields: [identityId], references: [id], onDelete: Cascade)
  jti             String    @unique
  issuedAt        DateTime  @map("issued_at")
  expiresAt       DateTime  @map("expires_at")
  ipAddress       String?   @map("ip_address")
  userAgent       String?   @map("user_agent")
  createdAt       DateTime  @default(now()) @map("created_at")

  @@index([identityId])
  @@index([expiresAt])
  @@map("av_identity_sessions")
}
```

### Run Migration

```bash
npx prisma migrate dev --name add-identity-sync
npx prisma generate
```

---

## Key Terminology

### isActive vs hasAppAccess

| Field | Level | Question it Answers |
|-------|-------|---------------------|
| `isActive` | **IDP-level** | Can this person log into ANY app? |
| `hasAppAccess` | **App-level** | Does this person have access to THIS app? |

**Always check both:**

```typescript
const identity = await prisma.identity.findUnique({ where: { id: userId } });

if (!identity?.isActive) {
  throw new ForbiddenError('Your account has been deactivated.');
}

if (!identity?.hasAppAccess) {
  throw new ForbiddenError('You do not have access to this application.');
}
```

---

## Webhook Handler Setup

### Express

```typescript
// routes/webhooks.ts
import { Router } from 'express';
import express from 'express';
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { prisma } from '../lib/prisma';

const router = Router();

const syncHandler = new IdentitySyncHandler(prisma);
const webhookRouter = new WebhookRouter({
  authVitalHost: process.env.AV_HOST!,
  handler: syncHandler,
});

// IMPORTANT: Use express.raw() to preserve raw body for signature verification
router.post(
  '/authvital',
  express.raw({ type: 'application/json' }),
  webhookRouter.expressHandler()
);

export default router;
```

**Mount before json() middleware:**

```typescript
// app.ts
import webhookRoutes from './routes/webhooks';

app.use('/webhooks', webhookRoutes); // Before json()
app.use(express.json());
```

### Next.js App Router

```typescript
// app/webhooks/authvital/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { prisma } from '@/lib/prisma';

const syncHandler = new IdentitySyncHandler(prisma);
const webhookRouter = new WebhookRouter({
  authVitalHost: process.env.AV_HOST!,
  handler: syncHandler,
});

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  try {
    await webhookRouter.handleRequest(body, headers);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 400 }
    );
  }
}
```

---

## Configure Webhook in Dashboard

1. Go to **AuthVital Admin** → **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:

| Field | Value |
|-------|-------|
| **Name** | `Identity Sync` |
| **URL** | `https://yourapp.com/webhooks/authvital` |

4. **Subscribe to events:**

```
✅ subject.created      - New user created
✅ subject.updated      - Profile updated
✅ subject.deleted      - User deleted
✅ subject.deactivated  - User deactivated

✅ member.joined        - User joined tenant
✅ member.left          - User left tenant
✅ member.role_changed  - Roles updated

✅ app_access.granted   - App access granted
✅ app_access.revoked   - App access revoked
✅ app_access.role_changed - App role changed

✅ license.assigned     - License assigned
✅ license.revoked      - License revoked
✅ license.changed      - License changed
```

---

## Events Handled Automatically

The `IdentitySyncHandler` handles these events:

| Event | Action | Fields Affected |
|-------|--------|----------------|
| `subject.created` | Create identity | All fields |
| `subject.updated` | Update identity | Only changed fields |
| `subject.deleted` | Delete identity | Removes record |
| `subject.deactivated` | Update status | `isActive = false` |
| `member.joined` | Update tenant | `tenantId`, `tenantRoles` |
| `member.left` | Clear tenant | Clears tenant fields |
| `app_access.granted` | Grant access | `hasAppAccess = true` |
| `app_access.revoked` | Revoke access | `hasAppAccess = false` |

---

## Next Steps

- [Frontend Setup](./frontend.md) - React provider and hooks
- [Identity Sync Guide](../identity-sync/index.md) - Advanced sync patterns
