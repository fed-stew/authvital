# Advanced Identity Sync

> Custom event handlers, session cleanup, initial sync, and schema extensions.

## Custom Event Handling

Need to do more than just sync? Extend `AuthVitalEventHandler` for custom logic:

```typescript
import { AuthVitalEventHandler } from '@authvital/sdk/webhooks';
import type { SubjectCreatedEvent, MemberJoinedEvent } from '@authvital/sdk/webhooks';
import { prisma } from '../lib/prisma';
import { sendWelcomeEmail, notifySlack, provisionResources } from '../lib/services';

class MyCustomHandler extends AuthVitalEventHandler {
  // ═══════════════════════════════════════════════════════════════════════════
  // New identity created
  // ═══════════════════════════════════════════════════════════════════════════
  async onSubjectCreated(event: SubjectCreatedEvent): Promise<void> {
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
        tenantId: event.tenant_id,
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
  // User joined tenant
  // ═══════════════════════════════════════════════════════════════════════════
  async onMemberJoined(event: MemberJoinedEvent): Promise<void> {
    const { data } = event;
    
    await prisma.identity.update({
      where: { id: data.sub },
      data: {
        tenantId: event.tenant_id,
        appRole: data.tenant_roles?.[0] ?? null,
        groups: data.groups ?? [],
        syncedAt: new Date(),
      },
    });

    // Notify existing team members
    await notifySlack(`👋 ${data.email} joined the team!`, event.tenant_id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // App access granted - provision resources
  // ═══════════════════════════════════════════════════════════════════════════
  async onAppAccessGranted(event: any): Promise<void> {
    const { data } = event;
    
    await prisma.identity.update({
      where: { id: data.sub },
      data: {
        hasAppAccess: true,
        appRole: data.role_slug,
        syncedAt: new Date(),
      },
    });

    // Provision resources for new user
    await provisionResources(data.sub, data.role_slug);
  }
}
```

### Using Your Custom Handler

```typescript
import { WebhookRouter } from '@authvital/sdk/webhooks';
import { MyCustomHandler } from './my-custom-handler';

const router = new WebhookRouter({
  handler: new MyCustomHandler(),
  authVitalHost: process.env.AV_HOST!,
});
```

---

## Session Cleanup

Clean up expired sessions periodically:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Clean up expired sessions
 * Run this as a cron job (e.g., daily)
 */
async function cleanupExpiredSessions() {
  const result = await prisma.identitySession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
    },
  });
  
  console.log(`Cleaned up ${result.count} expired/revoked sessions`);
  return result.count;
}

// Run cleanup
cleanupExpiredSessions();
```

### Cron Job Setup (Node.js)

```typescript
import cron from 'node-cron';

// Run daily at 3am
cron.schedule('0 3 * * *', async () => {
  await cleanupExpiredSessions();
});
```

---

## Initial Sync

For existing applications with users already in AuthVital, you'll need an initial sync.

### Strategy 1: API-Based Sync

Use the AuthVital API to fetch all users:

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import { PrismaClient } from '@prisma/client';

const authvital = createAuthVital({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

const prisma = new PrismaClient();

async function initialSync() {
  // Get all users from your tenant via admin API
  const users = await authvital.admin.listUsers({
    tenantId: 'your-tenant-id',
    limit: 1000,
  });
  
  for (const user of users.items) {
    await prisma.identity.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        givenName: user.givenName,
        familyName: user.familyName,
        isActive: user.isActive,
        hasAppAccess: true,
      },
      update: {
        email: user.email,
        givenName: user.givenName,
        familyName: user.familyName,
        isActive: user.isActive,
        syncedAt: new Date(),
      },
    });
  }
  
  console.log(`Synced ${users.items.length} users`);
}
```

### Strategy 2: Event Replay

Request an event replay from AuthVital support for a specific time range.

---

## Querying Synced Identities

Common query patterns:

### Get Active Users in a Tenant

```typescript
const activeUsers = await prisma.identity.findMany({
  where: {
    tenantId: 'tenant-xyz',
    isActive: true,
    hasAppAccess: true,
  },
  orderBy: { displayName: 'asc' },
});
```

### Find User by Email

```typescript
const user = await prisma.identity.findUnique({
  where: { email: 'jane@example.com' },
});
```

### Get User with Sessions

```typescript
const userWithSessions = await prisma.identity.findUnique({
  where: { id: 'user-123' },
  include: {
    sessions: {
      where: { revokedAt: null },
      orderBy: { lastActiveAt: 'desc' },
    },
  },
});
```

### Count Users by Role

```typescript
const roleCounts = await prisma.identity.groupBy({
  by: ['appRole'],
  where: {
    tenantId: 'tenant-xyz',
    isActive: true,
  },
  _count: { id: true },
});
```

---

## Extending the Schema

Add your own fields alongside the synced identity data:

```prisma
model Identity {
  // ... all the synced fields from before ...
  
  // ═══════════════════════════════════════════════════════════════════════════
  // YOUR CUSTOM FIELDS (not synced from AuthVital)
  // ═══════════════════════════════════════════════════════════════════════════
  preferences      Json?     @default("{}")           // App-specific settings
  onboardingStep   Int       @default(0)              // Track onboarding progress
  referralCode     String?   @unique                  // Custom referral system
  lastSeenAt       DateTime?                          // Track activity
  
  // ═══════════════════════════════════════════════════════════════════════════
  // YOUR RELATIONSHIPS
  // ═══════════════════════════════════════════════════════════════════════════
  posts            Post[]
  comments         Comment[]
  orders           Order[]
  
  @@map("av_identities")
}
```

### Update Custom Fields

```typescript
// Your custom fields are independent of webhook sync
await prisma.identity.update({
  where: { id: userId },
  data: {
    preferences: { theme: 'dark', fontSize: 16 },
    lastSeenAt: new Date(),
    onboardingStep: 3,
  },
});
```

---

## Security Considerations

### Validate Webhook Signatures

The `WebhookRouter` automatically validates RSA signatures. Never disable this!

### Protect Sensitive Data

```typescript
// Don't expose internal fields in API responses
const safeUser = {
  id: identity.id,
  email: identity.email,
  displayName: identity.displayName,
  pictureUrl: identity.pictureUrl,
  // DON'T include: isActive, hasAppAccess, syncedAt, etc.
};
```

### Rate Limit Your Webhook Endpoint

While AuthVital signs webhooks, add rate limiting as defense in depth:

```typescript
import rateLimit from 'express-rate-limit';

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many webhook requests',
});

app.post('/webhooks/authvital', webhookLimiter, ...);
```

---

## Related Documentation

- [Identity Sync Overview](./index.md)
- [Prisma Schema](./prisma-schema.md)
- [Event Details](./events.md)
- [Webhooks Best Practices](../webhooks-advanced.md)
