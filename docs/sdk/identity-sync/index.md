# Identity Sync Guide

> Mirror AuthVital identities to your local database for faster queries, foreign key relationships, and offline access.

!!! tip "Quick Start?"
    For basic identity sync setup, see [Database & Identity Sync](../setup/database.md) in the Setup Guide.
    
    This section covers **advanced patterns** including:
    - Full OIDC-compliant Prisma schema
    - Tenant-isolated databases
    - Custom event handlers
    - Session cleanup
    - Initial sync strategies

---

## Overview

### Why Sync Identities Locally?

| Benefit | Description |
|---------|-------------|
| **Performance** | Query identities locally without API calls to AuthVital |
| **Relationships** | Create foreign keys to your app data (posts, orders, comments, etc.) |
| **Offline Access** | Data available even if AuthVital is temporarily unreachable |
| **Custom Fields** | Extend identity data with app-specific attributes |
| **Complex Queries** | Join identities with your domain models in a single query |

### How It Works

```
┌─────────────┐    Webhook Events    ┌─────────────┐    Sync    ┌─────────────────┐
│  AuthVital  │ ─────────────────▶  │  Your API   │ ────────▶ │  Your Database  │
│    (IDP)    │                      │  (Handler)  │           │ (av_identities) │
└─────────────┘                      └─────────────┘           └─────────────────┘
     │                                                                 ▲
     │                                                                 │
     └──────────────────── Real-time sync via webhooks ────────────────┘
```

The `IdentitySyncHandler` receives webhook events from AuthVital and automatically creates, updates, or deletes identity records in your database.

---

## Terminology

### Identity vs User

| Term | Meaning |
|------|--------|
| **Identity** | The AuthVital representation of a person. Contains OIDC standard claims and authentication state. |
| **User** | Your app's domain concept. You might have additional app-specific fields beyond what AuthVital provides. |

The SDK uses **Identity** because it syncs the OIDC-standard identity data from AuthVital. You can extend this with your own fields to create your "User" concept.

### isActive vs hasAppAccess

This is a **critical distinction**:

| Field | Level | Question it Answers | Set By |
|-------|-------|---------------------|--------|
| `isActive` | **IDP-level** | "Can this person log into ANY application?" | `subject.deactivated` event |
| `hasAppAccess` | **App-level** | "Does this person have access to THIS specific app?" | `app_access.revoked` event |

**Example scenarios:**

```
Scenario 1: Employee leaves company
  → Admin deactivates their AuthVital account
  → subject.deactivated event fires
  → isActive = false
  → User cannot log into ANY apps

Scenario 2: User loses access to specific app
  → Admin revokes their access to "Sales Dashboard" app
  → app_access.revoked event fires
  → hasAppAccess = false (for this app only)
  → User can still log into other apps they have access to
```

**Best practice:** Always check BOTH fields when authorizing:

```typescript
const identity = await prisma.identity.findUnique({ where: { id: userId } });

if (!identity?.isActive) {
  throw new ForbiddenError('Your account has been deactivated.');
}

if (!identity?.hasAppAccess) {
  throw new ForbiddenError('You do not have access to this application.');
}

// User is active AND has access to this app - proceed!
```

---

## Quick Start

### Step 1: Add Prisma Schema

Add the identity models to your `schema.prisma` file (see [full schema](./prisma-schema.md)):

```prisma
model Identity {
  id            String   @id
  email         String?  @unique
  // ... see full schema
  @@map("av_identities")
}

model IdentitySession {
  id            String   @id @default(cuid())
  identityId    String   @map("identity_id")
  // ... see full schema
  @@map("av_identity_sessions")
}
```

Run migrations:

```bash
npx prisma migrate dev --name add-identity-sync
```

### Step 2: Create Webhook Handler

```typescript
// webhooks/authvital.ts
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { prisma } from '../lib/prisma';

// Create the sync handler with your Prisma client
const syncHandler = new IdentitySyncHandler(prisma);

// Create the webhook router
const router = new WebhookRouter({
  handler: syncHandler,
  authVitalHost: process.env.AV_HOST!,
});

export default router;
```

### Step 3: Mount Webhook Endpoint

**Express:**

```typescript
import express from 'express';
import webhookRouter from './webhooks/authvital';

const app = express();

// IMPORTANT: Use raw body for webhook signature verification
app.post(
  '/webhooks/authvital',
  express.raw({ type: 'application/json' }),
  webhookRouter.expressHandler()
);
```

**Next.js (App Router):**

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
  return router.nextjsHandler()(request);
}
```

### Step 4: Configure Webhook in AuthVital Dashboard

1. Go to **AuthVital Admin Panel** → **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:
   - **Name**: `Identity Sync`
   - **URL**: `https://yourapp.com/api/webhooks/authvital`
4. Subscribe to events:

```
subject.created
subject.updated
subject.deleted
subject.deactivated
member.joined
member.left
member.role_changed
app_access.granted
app_access.revoked
app_access.role_changed
```

---

## Documentation Structure

<div class="grid cards" markdown>

-   :material-database:{ .lg .middle } **[Prisma Schema](./prisma-schema.md)**

    ---

    Full OIDC-compliant schema with field mappings.

-   :material-sync:{ .lg .middle } **[Sync Handler](./sync-handler.md)**

    ---

    IdentitySyncHandler class usage and configuration.

-   :material-domain:{ .lg .middle } **[Tenant Isolation](./tenant-isolation.md)**

    ---

    Multi-tenant database setup patterns.

-   :material-webhook:{ .lg .middle } **[Event Details](./events.md)**

    ---

    What each event does and how it's handled.

-   :material-cog:{ .lg .middle } **[Advanced](./advanced.md)**

    ---

    Custom handlers, session cleanup, initial sync.

</div>

---

## Related Documentation

- [Webhooks Overview](../webhooks.md)
- [Event Types & Payloads](../webhooks-events.md)
- [Database Setup (Quick Start)](../setup/database.md)
