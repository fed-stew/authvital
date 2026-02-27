# Identity Sync Guide

> Mirror AuthVital identities to your local database for faster queries, foreign key relationships, and offline access.

---

## Table of Contents

- [Overview](#overview)
- [Terminology](#terminology)
- [Quick Start](#quick-start)
- [Prisma Schema](#prisma-schema)
- [IdentitySyncHandler](#identitysynchandler)
- [Tenant-Isolated Databases](#tenant-isolated-databases)
- [Event Handling Details](#event-handling-details)
- [Custom Event Handling](#custom-event-handling)
- [Session Cleanup](#session-cleanup)
- [Initial Sync](#initial-sync)
- [Querying Synced Identities](#querying-synced-identities)
- [Extending the Schema](#extending-the-schema)
- [Security Considerations](#security-considerations)

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

The `IdentitySyncHandler` receives webhook events from AuthVital and automatically creates, updates, or deletes identity records in your database. This keeps your local copy in sync with the authoritative data in AuthVital.

---

## Terminology

Before diving in, let's clarify some important terminology:

### Identity vs User

| Term | Meaning |
|------|--------|
| **Identity** | The AuthVital representation of a person. Contains OIDC standard claims and authentication state. |
| **User** | Your app's domain concept. You might have additional app-specific fields beyond what AuthVital provides. |

The SDK uses **Identity** because it syncs the OIDC-standard identity data from AuthVital. You can extend this with your own fields to create your "User" concept.

### isActive vs hasAppAccess

This is a **critical distinction** that trips up many developers:

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

Scenario 3: Checking access in your app
  → if (!identity.isActive) → "Your account has been deactivated"
  → if (!identity.hasAppAccess) → "You don't have access to this application"
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

Add the identity models to your `schema.prisma` file (see [full schema below](#prisma-schema)):

```prisma
model Identity {
  id            String   @id
  email         String?  @unique
  // ... see full schema below
  @@map("av_identities")
}

model IdentitySession {
  id            String   @id @default(cuid())
  identityId    String   @map("identity_id")
  // ... see full schema below
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

### Step 4: Configure Webhook in AuthVital Dashboard

1. Go to **AuthVital Admin Panel** → **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:

| Field | Value |
|-------|-------|
| Name | `Identity Sync` |
| URL | `https://yourapp.com/api/webhooks/authvital` |
| Secret | Generate a strong secret (min 32 chars) |

4. Subscribe to these events:

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

## Prisma Schema

The SDK expects this schema structure. Add it to your `schema.prisma`:

```prisma
// =============================================================================
// AuthVital Identity Sync Models
// =============================================================================
// These models mirror OIDC standard claims from AuthVital.
// Table names use "av_" prefix to distinguish from your app's tables.
// =============================================================================

model Identity {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE IDENTITY (OIDC Standard Claims - Profile Scope)
  // ═══════════════════════════════════════════════════════════════════════════
  id                String    @id                           // AuthVital subject ID (OIDC: sub claim)
  username          String?   @unique                       // Unique handle, e.g., @janesmith (OIDC: preferred_username)
  displayName       String?   @map("display_name")          // Full display name (OIDC: name)
  givenName         String?   @map("given_name")            // First name (OIDC: given_name)
  familyName        String?   @map("family_name")           // Last name (OIDC: family_name)
  middleName        String?   @map("middle_name")           // Middle name(s) (OIDC: middle_name)
  nickname          String?                                 // Casual name (OIDC: nickname)
  pictureUrl        String?   @map("picture_url")           // Profile picture URL (OIDC: picture)
  website           String?                                 // Personal website URL (OIDC: website)
  gender            String?                                 // Gender identity (OIDC: gender)
  birthdate         String?                                 // Date of birth, YYYY-MM-DD format (OIDC: birthdate)
  zoneinfo          String?                                 // IANA timezone, e.g., America/New_York (OIDC: zoneinfo)
  locale            String?                                 // Preferred locale, e.g., en-US (OIDC: locale)

  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL SCOPE
  // ═══════════════════════════════════════════════════════════════════════════
  email             String?   @unique                       // Primary email address (OIDC: email)
  emailVerified     Boolean   @default(false) @map("email_verified")  // Is email verified? (OIDC: email_verified)

  // ═══════════════════════════════════════════════════════════════════════════
  // PHONE SCOPE
  // ═══════════════════════════════════════════════════════════════════════════
  phone             String?   @unique                       // Primary phone number (OIDC: phone_number)
  phoneVerified     Boolean   @default(false) @map("phone_verified")  // Is phone verified? (OIDC: phone_number_verified)

  // ═══════════════════════════════════════════════════════════════════════════
  // TENANT CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════
  tenantId          String?   @map("tenant_id")             // Current tenant association
  appRole           String?   @map("app_role")              // Role within this app (e.g., admin, editor, viewer)
  groups            String[]  @default([])                  // Group memberships (string array)

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS FLAGS (IMPORTANT - SEE TERMINOLOGY SECTION!)
  // ═══════════════════════════════════════════════════════════════════════════
  isActive          Boolean   @default(true) @map("is_active")        // IDP-level: Can login to ANY app?
  hasAppAccess      Boolean   @default(true) @map("has_app_access")   // App-level: Has access to THIS app?

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  syncedAt          DateTime  @default(now()) @map("synced_at")       // Last sync timestamp
  createdAt         DateTime  @default(now()) @map("created_at")      // Record creation time
  updatedAt         DateTime  @updatedAt @map("updated_at")           // Last update time

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATIONSHIPS
  // ═══════════════════════════════════════════════════════════════════════════
  sessions          IdentitySession[]

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES (for common query patterns)
  // ═══════════════════════════════════════════════════════════════════════════
  @@index([tenantId])
  @@index([email])
  @@index([username])

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE NAME - Uses "av_" prefix to distinguish from your app's tables
  // ═══════════════════════════════════════════════════════════════════════════
  @@map("av_identities")
}

model IdentitySession {
  id              String    @id @default(cuid())            // Local session ID
  identityId      String    @map("identity_id")             // Foreign key to Identity
  identity        Identity  @relation(fields: [identityId], references: [id], onDelete: Cascade)

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION IDENTIFICATION
  // ═══════════════════════════════════════════════════════════════════════════
  authSessionId   String?   @map("auth_session_id")         // AuthVital's session ID (for revocation)

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  deviceInfo      String?   @map("device_info")             // Device description
  ipAddress       String?   @map("ip_address")              // Client IP address
  userAgent       String?   @map("user_agent")              // Browser/client user agent

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  createdAt       DateTime  @default(now()) @map("created_at")
  lastActiveAt    DateTime  @default(now()) @map("last_active_at")
  expiresAt       DateTime  @map("expires_at")
  revokedAt       DateTime? @map("revoked_at")              // If revoked, when

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES
  // ═══════════════════════════════════════════════════════════════════════════
  @@index([identityId])
  @@index([authSessionId])

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE NAME
  // ═══════════════════════════════════════════════════════════════════════════
  @@map("av_identity_sessions")
}
```

### OIDC Claims Reference

Here's how the schema fields map to OIDC standard claims:

| Schema Field | OIDC Claim | Scope | Description |
|--------------|------------|-------|--------------|
| `id` | `sub` | openid | Subject identifier (unique user ID) |
| `username` | `preferred_username` | profile | The user's preferred username |
| `displayName` | `name` | profile | Full name (display name) |
| `givenName` | `given_name` | profile | First/given name |
| `familyName` | `family_name` | profile | Last/family name |
| `middleName` | `middle_name` | profile | Middle name(s) |
| `nickname` | `nickname` | profile | Casual name the user prefers |
| `pictureUrl` | `picture` | profile | URL of profile picture |
| `website` | `website` | profile | User's website URL |
| `gender` | `gender` | profile | Gender identity |
| `birthdate` | `birthdate` | profile | Birthday (YYYY-MM-DD) |
| `zoneinfo` | `zoneinfo` | profile | IANA timezone string |
| `locale` | `locale` | profile | Locale preference (e.g., en-US) |
| `email` | `email` | email | Email address |
| `emailVerified` | `email_verified` | email | Is email verified? |
| `phone` | `phone_number` | phone | Phone number |
| `phoneVerified` | `phone_number_verified` | phone | Is phone verified? |
| `groups` | `groups` | (custom) | Group memberships |

---

## IdentitySyncHandler

The `IdentitySyncHandler` class automatically syncs identity data from AuthVital webhooks to your Prisma database.

### Basic Usage (Single Database)

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

### Events Handled

The `IdentitySyncHandler` automatically handles these events:

| Event | Database Action | Fields Affected |
|-------|-----------------|------------------|
| `subject.created` | `prisma.identity.create()` | All OIDC fields from payload |
| `subject.updated` | `prisma.identity.update()` | Only `changed_fields` from payload (selective update!) |
| `subject.deleted` | `prisma.identity.delete()` | Removes entire record |
| `subject.deactivated` | `prisma.identity.update()` | `isActive = false` |
| `member.joined` | `prisma.identity.update()` | `tenantId`, `appRole`, `groups` |
| `member.left` | `prisma.identity.update()` | Clears `tenantId`, `appRole`, `groups` |
| `member.role_changed` | `prisma.identity.update()` | `appRole`, `groups` |
| `app_access.granted` | `prisma.identity.update()` | `hasAppAccess = true`, `appRole` |
| `app_access.revoked` | `prisma.identity.update()` | `hasAppAccess = false`, clears `appRole` |
| `app_access.role_changed` | `prisma.identity.update()` | `appRole` |

### Selective Updates (subject.updated)

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

The handler only updates `email` and `givenName` in this case, leaving all other fields untouched. This is more efficient and prevents accidentally overwriting data.

---

## Tenant-Isolated Databases

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

### Full Example: Tenant-Isolated Setup

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

### How Tenant Resolution Works

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

## Event Handling Details

Here's exactly what happens for each event:

### subject.created

Fires when a new user registers or is created in AuthVital.

```typescript
// Incoming event payload
{
  event: 'subject.created',
  data: {
    sub: 'user-abc-123',
    email: 'jane@example.com',
    email_verified: true,
    preferred_username: 'janesmith',
    name: 'Jane Smith',
    given_name: 'Jane',
    family_name: 'Smith',
    middle_name: null,
    nickname: 'Janey',
    picture: 'https://example.com/avatar.jpg',
    website: 'https://janesmith.com',
    gender: 'female',
    birthdate: '1990-05-15',
    zoneinfo: 'America/New_York',
    locale: 'en-US',
    phone_number: '+1-555-123-4567',
    phone_number_verified: false,
    tenant_id: 'tenant-xyz',
    app_role: 'member',
    groups: ['engineering', 'frontend'],
  }
}

// Handler creates identity
await prisma.identity.create({
  data: {
    id: 'user-abc-123',
    email: 'jane@example.com',
    emailVerified: true,
    username: 'janesmith',
    displayName: 'Jane Smith',
    givenName: 'Jane',
    familyName: 'Smith',
    middleName: null,
    nickname: 'Janey',
    pictureUrl: 'https://example.com/avatar.jpg',
    website: 'https://janesmith.com',
    gender: 'female',
    birthdate: '1990-05-15',
    zoneinfo: 'America/New_York',
    locale: 'en-US',
    phone: '+1-555-123-4567',
    phoneVerified: false,
    tenantId: 'tenant-xyz',
    appRole: 'member',
    groups: ['engineering', 'frontend'],
    isActive: true,
    hasAppAccess: true,
  },
});
```

### subject.updated

Fires when user profile data changes. Only updates changed fields!

```typescript
// Incoming event payload
{
  event: 'subject.updated',
  data: {
    sub: 'user-abc-123',
    email: 'jane.smith@newcompany.com',  // Changed
    given_name: 'Jane',
    family_name: 'Smith-Johnson',         // Changed
    changed_fields: ['email', 'family_name'],  // Tells us what changed
    // ... other fields
  }
}

// Handler updates ONLY changed fields
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    email: 'jane.smith@newcompany.com',
    familyName: 'Smith-Johnson',
    syncedAt: new Date(),
  },
});
```

### subject.deleted

Fires when a user is permanently deleted from AuthVital.

```typescript
// Handler deletes identity (cascades to sessions due to onDelete: Cascade)
await prisma.identity.delete({
  where: { id: 'user-abc-123' },
});
```

### subject.deactivated

Fires when a user's account is deactivated at the IDP level (cannot log into ANY app).

```typescript
// Handler sets isActive = false
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    isActive: false,
    syncedAt: new Date(),
  },
});
```

### member.joined

Fires when a user joins a tenant/organization.

```typescript
// Incoming event payload
{
  event: 'member.joined',
  data: {
    sub: 'user-abc-123',
    tenant_id: 'tenant-xyz',
    role: 'editor',
    groups: ['design-team', 'all-hands'],
  }
}

// Handler updates tenant context
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    tenantId: 'tenant-xyz',
    appRole: 'editor',
    groups: ['design-team', 'all-hands'],
    syncedAt: new Date(),
  },
});
```

### member.left

Fires when a user leaves a tenant/organization.

```typescript
// Handler clears tenant context
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    tenantId: null,
    appRole: null,
    groups: [],
    syncedAt: new Date(),
  },
});
```

### member.role_changed

Fires when a user's role within a tenant changes.

```typescript
// Handler updates role and groups
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    appRole: 'admin',  // Promoted!
    groups: ['design-team', 'all-hands', 'leadership'],  // New groups
    syncedAt: new Date(),
  },
});
```

### app_access.granted

Fires when a user is granted access to THIS specific application.

```typescript
// Handler enables app access
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    hasAppAccess: true,
    appRole: 'viewer',  // Initial role for this app
    syncedAt: new Date(),
  },
});
```

### app_access.revoked

Fires when a user's access to THIS specific application is revoked.

```typescript
// Handler disables app access
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    hasAppAccess: false,
    appRole: null,  // Clear app role
    syncedAt: new Date(),
  },
});
```

### app_access.role_changed

Fires when a user's role within THIS application changes.

```typescript
// Handler updates app role
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    appRole: 'editor',  // Changed from 'viewer'
    syncedAt: new Date(),
  },
});
```

---

## Custom Event Handling

Need to do more than just sync? Extend `AuthVitalEventHandler` for custom logic:

```typescript
import { AuthVitalEventHandler, SyncEvent } from '@authvital/sdk/server';
import { prisma } from '../lib/prisma';
import { sendWelcomeEmail, notifySlack, provisionResources } from '../lib/services';

class MyCustomHandler extends AuthVitalEventHandler {
  // ═══════════════════════════════════════════════════════════════════════════
  // Called for EVERY event (useful for logging/metrics)
  // ═══════════════════════════════════════════════════════════════════════════
  async onEvent(event: SyncEvent) {
    console.log(`[AuthVital] Received: ${event.event}`, {
      sub: event.data.sub,
      tenant: event.data.tenant_id,
    });
    
    // Track event metrics
    await metrics.increment(`authvital.events.${event.event}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // New identity created
  // ═══════════════════════════════════════════════════════════════════════════
  async onSubjectCreated(event: SyncEvent<'subject.created'>) {
    const { data } = event;
    
    // 1. Create identity record
    await prisma.identity.create({
      data: {
        id: data.sub,
        email: data.email,
        emailVerified: data.email_verified ?? false,
        username: data.preferred_username,
        displayName: data.name,
        givenName: data.given_name,
        familyName: data.family_name,
        middleName: data.middle_name,
        nickname: data.nickname,
        pictureUrl: data.picture,
        website: data.website,
        gender: data.gender,
        birthdate: data.birthdate,
        zoneinfo: data.zoneinfo,
        locale: data.locale,
        phone: data.phone_number,
        phoneVerified: data.phone_number_verified ?? false,
        tenantId: data.tenant_id,
        appRole: data.app_role,
        groups: data.groups ?? [],
        isActive: true,
        hasAppAccess: true,
      },
    });

    // 2. Send welcome email
    if (data.email) {
      await sendWelcomeEmail({
        to: data.email,
        name: data.given_name ?? data.name ?? 'there',
      });
    }

    // 3. Create default user settings
    await prisma.userSettings.create({
      data: {
        identityId: data.sub,
        theme: 'system',
        emailNotifications: true,
        timezone: data.zoneinfo ?? 'UTC',
        locale: data.locale ?? 'en-US',
      },
    });

    // 4. Notify the team
    await notifySlack(`🎉 New user: ${data.email ?? data.preferred_username}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Identity updated
  // ═══════════════════════════════════════════════════════════════════════════
  async onSubjectUpdated(event: SyncEvent<'subject.updated'>) {
    const { data } = event;
    
    // Build update object from changed fields only
    const updateData: Record<string, any> = { syncedAt: new Date() };
    
    // Map OIDC claims to Prisma fields
    const fieldMap: Record<string, string> = {
      email: 'email',
      email_verified: 'emailVerified',
      preferred_username: 'username',
      name: 'displayName',
      given_name: 'givenName',
      family_name: 'familyName',
      middle_name: 'middleName',
      nickname: 'nickname',
      picture: 'pictureUrl',
      website: 'website',
      gender: 'gender',
      birthdate: 'birthdate',
      zoneinfo: 'zoneinfo',
      locale: 'locale',
      phone_number: 'phone',
      phone_number_verified: 'phoneVerified',
    };

    // Only update changed fields
    for (const field of data.changed_fields ?? []) {
      const prismaField = fieldMap[field];
      if (prismaField && field in data) {
        updateData[prismaField] = data[field as keyof typeof data];
      }
    }

    await prisma.identity.update({
      where: { id: data.sub },
      data: updateData,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Identity deleted
  // ═══════════════════════════════════════════════════════════════════════════
  async onSubjectDeleted(event: SyncEvent<'subject.deleted'>) {
    const { data } = event;
    
    // Option 1: Hard delete (cascades to sessions)
    await prisma.identity.delete({
      where: { id: data.sub },
    });

    // Option 2: Soft delete (if you need audit trail)
    // await prisma.identity.update({
    //   where: { id: data.sub },
    //   data: { deletedAt: new Date(), isActive: false },
    // });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Identity deactivated (IDP-level)
  // ═══════════════════════════════════════════════════════════════════════════
  async onSubjectDeactivated(event: SyncEvent<'subject.deactivated'>) {
    const { data } = event;
    
    await prisma.identity.update({
      where: { id: data.sub },
      data: {
        isActive: false,
        syncedAt: new Date(),
      },
    });

    // Revoke all active sessions
    await prisma.identitySession.updateMany({
      where: { identityId: data.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // User joined tenant
  // ═══════════════════════════════════════════════════════════════════════════
  async onMemberJoined(event: SyncEvent<'member.joined'>) {
    const { data } = event;
    
    await prisma.identity.update({
      where: { id: data.sub },
      data: {
        tenantId: data.tenant_id,
        appRole: data.role,
        groups: data.groups ?? [],
        syncedAt: new Date(),
      },
    });

    // Notify existing team members
    await notifySlack(`👋 ${data.email} joined the team!`, data.tenant_id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // User left tenant
  // ═══════════════════════════════════════════════════════════════════════════
  async onMemberLeft(event: SyncEvent<'member.left'>) {
    const { data } = event;
    
    await prisma.identity.update({
      where: { id: data.sub },
      data: {
        tenantId: null,
        appRole: null,
        groups: [],
        syncedAt: new Date(),
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // App access granted
  // ═══════════════════════════════════════════════════════════════════════════
  async onAppAccessGranted(event: SyncEvent<'app_access.granted'>) {
    const { data } = event;
    
    await prisma.identity.update({
      where: { id: data.sub },
      data: {
        hasAppAccess: true,
        appRole: data.role,
        syncedAt: new Date(),
      },
    });

    // Provision resources for new user
    await provisionResources(data.sub, data.role);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // App access revoked
  // ═══════════════════════════════════════════════════════════════════════════
  async onAppAccessRevoked(event: SyncEvent<'app_access.revoked'>) {
    const { data } = event;
    
    await prisma.identity.update({
      where: { id: data.sub },
      data: {
        hasAppAccess: false,
        appRole: null,
        syncedAt: new Date(),
      },
    });

    // Deprovision resources
    await deprovisionResources(data.sub);
  }
}

// Use the custom handler
const router = new WebhookRouter({
  handler: new MyCustomHandler(),
  authVitalHost: process.env.AV_HOST!,
});
```

### Available Event Handler Methods

```typescript
class AuthVitalEventHandler {
  // Generic (called for every event)
  onEvent(event: SyncEvent): Promise<void>
  
  // Subjects (Identities)
  onSubjectCreated(event: SyncEvent<'subject.created'>): Promise<void>
  onSubjectUpdated(event: SyncEvent<'subject.updated'>): Promise<void>
  onSubjectDeleted(event: SyncEvent<'subject.deleted'>): Promise<void>
  onSubjectDeactivated(event: SyncEvent<'subject.deactivated'>): Promise<void>
  
  // Memberships
  onMemberJoined(event: SyncEvent<'member.joined'>): Promise<void>
  onMemberLeft(event: SyncEvent<'member.left'>): Promise<void>
  onMemberRoleChanged(event: SyncEvent<'member.role_changed'>): Promise<void>
  onMemberSuspended(event: SyncEvent<'member.suspended'>): Promise<void>
  onMemberActivated(event: SyncEvent<'member.activated'>): Promise<void>
  
  // Invitations
  onInviteCreated(event: SyncEvent<'invite.created'>): Promise<void>
  onInviteAccepted(event: SyncEvent<'invite.accepted'>): Promise<void>
  onInviteDeleted(event: SyncEvent<'invite.deleted'>): Promise<void>
  onInviteExpired(event: SyncEvent<'invite.expired'>): Promise<void>
  
  // App Access
  onAppAccessGranted(event: SyncEvent<'app_access.granted'>): Promise<void>
  onAppAccessRevoked(event: SyncEvent<'app_access.revoked'>): Promise<void>
  onAppAccessRoleChanged(event: SyncEvent<'app_access.role_changed'>): Promise<void>
  
  // Licenses
  onLicenseAssigned(event: SyncEvent<'license.assigned'>): Promise<void>
  onLicenseRevoked(event: SyncEvent<'license.revoked'>): Promise<void>
  onLicenseChanged(event: SyncEvent<'license.changed'>): Promise<void>
}
```

---

## Session Cleanup

Over time, expired sessions accumulate in your database. The SDK provides utilities for cleanup.

### Programmatic Cleanup

```typescript
import { cleanupSessions } from '@authvital/sdk/server';
import { prisma } from '../lib/prisma';

// Run this via a scheduled job (cron, etc.)
async function runSessionCleanup() {
  const result = await cleanupSessions(prisma, {
    // Delete sessions that expired more than 30 days ago
    expiredOlderThanDays: 30,
    
    // Keep revoked sessions for audit trail (set true to delete them too)
    deleteRevoked: false,
    
    // Dry run - log what would be deleted without actually deleting
    dryRun: false,
  });

  console.log(`Session cleanup complete:`, {
    deletedCount: result.deletedCount,
    dryRun: result.dryRun,
  });
  
  return result;
}
```

### Cleanup Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `expiredOlderThanDays` | `number` | `30` | Delete sessions expired more than N days ago |
| `deleteRevoked` | `boolean` | `false` | Also delete revoked sessions (may lose audit trail) |
| `dryRun` | `boolean` | `false` | Log what would be deleted without actually deleting |

### Get Raw SQL for pg_cron

For PostgreSQL with pg_cron, get the raw cleanup SQL:

```typescript
import { getCleanupSQL } from '@authvital/sdk/server';

const sql = getCleanupSQL({ expiredOlderThanDays: 30 });
console.log(sql);
// DELETE FROM av_identity_sessions 
// WHERE expires_at < NOW() - INTERVAL '30 days';
```

### Schedule with pg_cron

```sql
-- Install pg_cron extension (if not already installed)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 3 AM UTC
SELECT cron.schedule(
  'cleanup-identity-sessions',           -- Job name
  '0 3 * * *',                           -- Every day at 3 AM
  $$DELETE FROM av_identity_sessions 
    WHERE expires_at < NOW() - INTERVAL '30 days'$$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- Unschedule if needed
SELECT cron.unschedule('cleanup-identity-sessions');
```

### Example: Node.js Cron Job

```typescript
import cron from 'node-cron';
import { cleanupSessions } from '@authvital/sdk/server';
import { prisma } from './lib/prisma';

// Run daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  console.log('Running session cleanup...');
  
  try {
    const result = await cleanupSessions(prisma, {
      expiredOlderThanDays: 30,
      deleteRevoked: false,
    });
    console.log(`Cleaned up ${result.deletedCount} sessions`);
  } catch (error) {
    console.error('Session cleanup failed:', error);
  }
});
```

---

## Initial Sync

For existing users in AuthVital, perform a bulk initial sync:

```typescript
// scripts/initial-sync.ts
import { createAuthVital } from '@authvital/sdk/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function initialSync() {
  const authvital = createAuthVital({
    authVitalHost: process.env.AUTHVITAL_HOST!,
    clientId: process.env.AUTHVITAL_CLIENT_ID!,
    clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  });

  console.log('Starting initial identity sync...');
  
  let cursor: string | undefined;
  let totalSynced = 0;
  
  // Paginate through all users
  do {
    const response = await authvital.admin.listSubjects({
      limit: 100,
      cursor,
    });
    
    for (const subject of response.subjects) {
      await prisma.identity.upsert({
        where: { id: subject.id },
        create: {
          id: subject.id,
          email: subject.email,
          emailVerified: subject.emailVerified ?? false,
          username: subject.preferredUsername,
          displayName: subject.name,
          givenName: subject.givenName,
          familyName: subject.familyName,
          middleName: subject.middleName,
          nickname: subject.nickname,
          pictureUrl: subject.picture,
          website: subject.website,
          gender: subject.gender,
          birthdate: subject.birthdate,
          zoneinfo: subject.zoneinfo,
          locale: subject.locale,
          phone: subject.phoneNumber,
          phoneVerified: subject.phoneNumberVerified ?? false,
          tenantId: subject.tenantId,
          appRole: subject.appRole,
          groups: subject.groups ?? [],
          isActive: !subject.deactivated,
          hasAppAccess: !subject.appAccessRevoked,
        },
        update: {
          email: subject.email,
          emailVerified: subject.emailVerified ?? false,
          username: subject.preferredUsername,
          displayName: subject.name,
          givenName: subject.givenName,
          familyName: subject.familyName,
          middleName: subject.middleName,
          nickname: subject.nickname,
          pictureUrl: subject.picture,
          website: subject.website,
          gender: subject.gender,
          birthdate: subject.birthdate,
          zoneinfo: subject.zoneinfo,
          locale: subject.locale,
          phone: subject.phoneNumber,
          phoneVerified: subject.phoneNumberVerified ?? false,
          tenantId: subject.tenantId,
          appRole: subject.appRole,
          groups: subject.groups ?? [],
          isActive: !subject.deactivated,
          hasAppAccess: !subject.appAccessRevoked,
          syncedAt: new Date(),
        },
      });
      
      totalSynced++;
    }
    
    cursor = response.nextCursor;
    console.log(`Synced ${totalSynced} identities so far...`);
    
  } while (cursor);

  console.log(`✅ Initial sync complete! Synced ${totalSynced} identities.`);
}

initialSync()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run the script:

```bash
npx ts-node scripts/initial-sync.ts
```

---

## Querying Synced Identities

Now you can query identities locally with full Prisma power:

### Basic Queries

```typescript
// Get identity by ID
const identity = await prisma.identity.findUnique({
  where: { id: userId },
});

// Get identity by email
const identity = await prisma.identity.findUnique({
  where: { email: 'jane@example.com' },
});

// Get identity by username
const identity = await prisma.identity.findUnique({
  where: { username: 'janesmith' },
});
```

### Filtering by Status

```typescript
// Get all active identities with app access
const activeUsers = await prisma.identity.findMany({
  where: {
    isActive: true,
    hasAppAccess: true,
  },
});

// Get deactivated identities
const deactivatedUsers = await prisma.identity.findMany({
  where: { isActive: false },
});

// Get identities who lost app access
const revokedUsers = await prisma.identity.findMany({
  where: {
    isActive: true,      // Still active at IDP level
    hasAppAccess: false, // But no access to this app
  },
});
```

### Filtering by Tenant

```typescript
// Get all identities in a tenant
const tenantUsers = await prisma.identity.findMany({
  where: { tenantId: 'tenant-xyz' },
});

// Get admins in a tenant
const admins = await prisma.identity.findMany({
  where: {
    tenantId: 'tenant-xyz',
    appRole: 'admin',
  },
});

// Get identities in a specific group
const engineers = await prisma.identity.findMany({
  where: {
    tenantId: 'tenant-xyz',
    groups: { has: 'engineering' },
  },
});
```

### Search by Name/Email

```typescript
// Full-text search
const results = await prisma.identity.findMany({
  where: {
    OR: [
      { displayName: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
      { username: { contains: query, mode: 'insensitive' } },
      { givenName: { contains: query, mode: 'insensitive' } },
      { familyName: { contains: query, mode: 'insensitive' } },
    ],
  },
  take: 20,
});
```

### Joining with Your App Data

```typescript
// Assuming you've added a relation to your Post model:
// model Post {
//   authorId  String
//   author    Identity @relation(fields: [authorId], references: [id])
// }

// Get identity with their posts
const identityWithPosts = await prisma.identity.findUnique({
  where: { id: userId },
  include: { 
    posts: {
      orderBy: { createdAt: 'desc' },
      take: 10,
    },
  },
});

// Get posts with author info
const posts = await prisma.post.findMany({
  include: {
    author: {
      select: {
        displayName: true,
        pictureUrl: true,
        username: true,
      },
    },
  },
});
```

### Using Timezone and Locale

```typescript
// Format dates in user's timezone
import { formatInTimeZone } from 'date-fns-tz';

const identity = await prisma.identity.findUnique({ where: { id: userId } });

const formattedDate = formatInTimeZone(
  new Date(),
  identity?.zoneinfo ?? 'UTC',
  'yyyy-MM-dd HH:mm:ss zzz'
);

// Localize messages
import { getLocale } from './i18n';

const locale = getLocale(identity?.locale ?? 'en-US');
const greeting = locale.t('greeting', { name: identity?.givenName ?? 'there' });
```

---

## Extending the Schema

Add app-specific fields to the Identity model:

```prisma
model Identity {
  // ... all the AuthVital-synced fields above ...
  
  // ═══════════════════════════════════════════════════════════════════════════
  // YOUR APP-SPECIFIC FIELDS BELOW
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Billing
  stripeCustomerId    String?   @unique @map("stripe_customer_id")
  subscriptionTier    String?   @map("subscription_tier")
  
  // Preferences (stored locally, not synced to AuthVital)
  preferences         Json      @default("{}")
  theme               String    @default("system")
  emailNotifications  Boolean   @default(true) @map("email_notifications")
  
  // Gamification
  points              Int       @default(0)
  level               Int       @default(1)
  badges              String[]  @default([])
  
  // Relationships to your domain models
  posts               Post[]
  comments            Comment[]
  orders              Order[]
  
  // ... rest of model ...
  @@map("av_identities")
}
```

### Important: Don't Duplicate AuthVital Fields!

Don't add fields that AuthVital already manages (email, name, etc.) as separate columns. Use the synced fields instead. If you need additional profile data:

1. **For OIDC standard claims** → Request it from AuthVital, they'll sync it
2. **For app-specific data** → Add it to your local schema
3. **For preferences** → Use a JSON column or separate settings table

---

## Security Considerations

### 1. Always Verify Webhook Signatures

```typescript
const router = new WebhookRouter({
  handler: syncHandler,
  authVitalHost: process.env.AV_HOST!,
});
```

The SDK automatically:
- Validates the RSA-SHA256 signature in `X-AuthVital-Signature` header (via JWKS)
- Rejects requests with invalid or missing signatures
- Protects against replay attacks using timestamps

### 2. Use HTTPS in Production

Always use HTTPS for your webhook endpoint:

```
✅ https://yourapp.com/api/webhooks/authvital
❌ http://yourapp.com/api/webhooks/authvital
```

### 3. Handle Duplicates (At-Least-Once Delivery)

Webhooks may be delivered more than once. Use idempotent operations:

```typescript
// ✅ Good: upsert is idempotent
await prisma.identity.upsert({
  where: { id: data.sub },
  create: { /* ... */ },
  update: { /* ... */ },
});

// ❌ Bad: create throws on duplicate
await prisma.identity.create({
  data: { /* ... */ },
});
```

### 4. Protect Sensitive Fields

Some synced fields may be sensitive (phone, birthdate). Ensure proper access control:

```typescript
// Don't expose all fields in public APIs
const publicProfile = {
  id: identity.id,
  displayName: identity.displayName,
  pictureUrl: identity.pictureUrl,
  // Don't include: email, phone, birthdate, etc.
};
```

### 5. Check Both Status Flags

Always check both `isActive` AND `hasAppAccess`:

```typescript
function canAccessApp(identity: Identity | null): boolean {
  if (!identity) return false;
  if (!identity.isActive) return false;      // IDP-level check
  if (!identity.hasAppAccess) return false;  // App-level check
  return true;
}
```

### 6. Audit Trail for Deletions

Consider soft-deletes for audit purposes:

```typescript
// Instead of hard delete
async onSubjectDeleted(event) {
  await prisma.identity.update({
    where: { id: event.data.sub },
    data: {
      deletedAt: new Date(),
      isActive: false,
      hasAppAccess: false,
    },
  });
}
```

---

## Troubleshooting

### Webhook Not Receiving Events

1. **Check webhook URL is correct** in AuthVital dashboard
2. **Verify secret matches** between dashboard and `AUTHVITAL_WEBHOOK_SECRET`
3. **Check firewall rules** - AuthVital IPs must be allowed
4. **Look at AuthVital webhook logs** for delivery failures

### Sync Out of Date

1. **Check `syncedAt` timestamp** to see when last synced
2. **Run initial sync script** to re-sync all identities
3. **Check for webhook failures** in AuthVital dashboard

### "Identity Not Found" Errors

This can happen if user authenticates before webhook arrives:

```typescript
// Handle race condition
const identity = await prisma.identity.findUnique({ 
  where: { id: userId } 
});

if (!identity) {
  // Identity hasn't synced yet - fetch from AuthVital API
  const subject = await authvital.admin.getSubject(userId);
  // Create locally...
}
```

---

## Related Documentation

- [Server SDK Guide](./server-sdk.md)
- [Webhooks Guide](./webhooks.md)
- [Architecture Overview](../concepts/architecture.md)
