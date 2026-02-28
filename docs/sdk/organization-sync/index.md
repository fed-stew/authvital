# Organization Sync Guide

> Mirror AuthVital tenant, application, and SSO configuration to your local database for audit trails, billing integration, and provisioning workflows.

!!! tip "Looking for Identity Sync?"
    This guide covers **organization-level** data (tenants, apps, SSO providers).
    
    For **user-level** data (identities, sessions, memberships), see [Identity Sync](../identity-sync/index.md).

---

## Overview

### Why Sync Organization Data Locally?

| Benefit | Description |
|---------|-------------|
| **Audit Trails** | Track all tenant and app configuration changes with full history |
| **Billing Integration** | Sync tenant plan changes directly to Stripe, Paddle, or your billing system |
| **Provisioning Workflows** | Auto-create resources (databases, namespaces, storage buckets) when tenants are created |
| **Multi-Region Sync** | Replicate organization config across regions for low-latency access |
| **Compliance** | Maintain immutable records of SSO configuration changes for security audits |
| **Offline Access** | Organization data available even if AuthVital is temporarily unreachable |

### How It Works

```
┌─────────────┐    Webhook Events    ┌─────────────┐    Sync    ┌──────────────────┐
│  AuthVital  │ ─────────────────▶  │  Your API   │ ────────▶ │  Your Database   │
│    (IDP)    │                      │  (Handler)  │           │ (av_organizations│
└─────────────┘                      └─────────────┘           │  av_applications │
     │                                                         │  av_sso_providers│
     │                                                         └──────────────────┘
     │                                                                  ▲
     └───────────────────── Real-time sync via webhooks ────────────────┘
```

The `OrganizationSyncHandler` receives webhook events from AuthVital and automatically creates, updates, or deletes organization records in your database.

---

## Events Covered

Organization Sync handles three categories of events:

### Tenant Events

| Event | Description |
|-------|-------------|
| `tenant.created` | New tenant provisioned in AuthVital |
| `tenant.updated` | Tenant settings or plan changed |
| `tenant.deleted` | Tenant permanently removed |
| `tenant.suspended` | Tenant deactivated (soft disable) |

### Application Events

| Event | Description |
|-------|-------------|
| `application.created` | New application registered to tenant |
| `application.updated` | App config changed (redirect URIs, scopes, etc.) |
| `application.deleted` | Application removed from tenant |

### SSO Events

| Event | Description |
|-------|-------------|
| `sso.provider_added` | SSO provider configured for tenant |
| `sso.provider_updated` | SSO settings changed |
| `sso.provider_removed` | SSO provider disconnected |

!!! info "Event Details"
    For complete event payloads with TypeScript types and JSON examples, see [Organization Sync Events](./events.md).

---

## Quick Start

### Step 1: Add Prisma Schema

Add the organization models to your `schema.prisma` file (see [full schema](./prisma-schema.md)):

```prisma
model Organization {
  id            String   @id
  name          String
  slug          String   @unique
  plan          String   @default("free")
  // ... see full schema
  @@map("av_organizations")
}

model Application {
  id              String   @id
  organizationId  String   @map("organization_id")
  name            String
  // ... see full schema
  @@map("av_applications")
}

model SsoProvider {
  id              String   @id
  organizationId  String   @map("organization_id")
  providerType    String   @map("provider_type")
  // ... see full schema
  @@map("av_sso_providers")
}
```

Run migrations:

```bash
npx prisma migrate dev --name add-organization-sync
```

### Step 2: Create Webhook Handler

```typescript
// webhooks/authvital-org.ts
import { OrganizationSyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { prisma } from '../lib/prisma';

// Create the sync handler with your Prisma client
const syncHandler = new OrganizationSyncHandler(prisma);

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
import webhookRouter from './webhooks/authvital-org';

const app = express();

// IMPORTANT: Use raw body for webhook signature verification
app.post(
  '/webhooks/authvital/organization',
  express.raw({ type: 'application/json' }),
  webhookRouter.expressHandler()
);
```

**Next.js (App Router):**

```typescript
// app/api/webhooks/authvital/organization/route.ts
import { OrganizationSyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { prisma } from '@/lib/prisma';

const syncHandler = new OrganizationSyncHandler(prisma);
const router = new WebhookRouter({
  handler: syncHandler,
  authVitalHost: process.env.AV_HOST!,
});

export async function POST(request: Request) {
  return router.nextjsHandler()(request);
}
```

!!! tip "Combine with Identity Sync"
    You can handle both identity and organization events in a single webhook endpoint using the `CompositeHandler`:
    
    ```typescript
    import { 
      CompositeHandler, 
      IdentitySyncHandler, 
      OrganizationSyncHandler 
    } from '@authvital/sdk/server';
    
    const handler = new CompositeHandler([
      new IdentitySyncHandler(prisma),
      new OrganizationSyncHandler(prisma),
    ]);
    ```

### Step 4: Configure Webhook in AuthVital Dashboard

1. Go to **AuthVital Admin Panel** → **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:
   - **Name**: `Organization Sync`
   - **URL**: `https://yourapp.com/api/webhooks/authvital/organization`
4. Subscribe to events:

```
tenant.created
tenant.updated
tenant.deleted
tenant.suspended
application.created
application.updated
application.deleted
sso.provider_added
sso.provider_updated
sso.provider_removed
```

---

## Querying Synced Data

Once synced, you can query organization data locally:

```typescript
// Get all active organizations
const activeOrgs = await prisma.organization.findMany({
  where: { status: 'active' },
  include: {
    applications: true,
    ssoProviders: true,
  },
});

// Get organizations by plan
const enterpriseOrgs = await prisma.organization.findMany({
  where: { plan: 'enterprise' },
});

// Get organization with all relationships
const org = await prisma.organization.findUnique({
  where: { slug: 'acme-corp' },
  include: {
    applications: {
      where: { isActive: true },
    },
    ssoProviders: {
      where: { isEnabled: true },
    },
  },
});
```

---

## Documentation Structure

<div class="grid cards" markdown>

-   :material-webhook:{ .lg .middle } **[Event Details](./events.md)**

    ---

    Complete event payloads with TypeScript types and JSON examples.

-   :material-database:{ .lg .middle } **[Prisma Schema](./prisma-schema.md)**

    ---

    Full schema for Organization, Application, and SsoProvider models.

-   :material-lightbulb:{ .lg .middle } **[Use Cases](./use-cases.md)**

    ---

    Common patterns: provisioning, billing, audit logging, multi-region sync.

</div>

---

## Related Documentation

- [Identity Sync](../identity-sync/index.md) - Sync user identities
- [Webhooks Overview](../webhooks.md) - General webhook setup
- [Event Types & Payloads](../webhooks-events.md) - All webhook events
