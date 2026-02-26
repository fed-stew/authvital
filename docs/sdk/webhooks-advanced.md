# Webhook Best Practices

> Error handling, retries, idempotency, and testing strategies.

**See also:** [Webhooks Guide](./webhooks.md) | [Event Handler Reference](./webhooks-handler.md)

---

## Error Handling & Retries

### Webhook Retry Policy

AuthVader retries failed webhooks with exponential backoff:

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1st | Immediate | 0 |
| 2nd | 1 minute | 1 min |
| 3rd | 5 minutes | 6 min |

After 3 failed attempts, the webhook is marked as failed and no further retries occur.

### What Triggers a Retry?

| Response | Retried? |
|----------|----------|
| 2xx status | ✅ No (success) |
| 4xx status | ❌ No (client error, won't retry) |
| 5xx status | ✅ Yes (server error) |
| Timeout (30s) | ✅ Yes |
| Connection error | ✅ Yes |

### Proper Response Handling

```typescript
// ✅ Success - acknowledge receipt
res.status(200).json({ received: true });

// ✅ Also valid
res.sendStatus(200);
res.sendStatus(204);

// ❌ Will NOT be retried - use for permanent failures
res.status(400).json({ error: 'Invalid event format' });
res.status(401).json({ error: 'Invalid signature' });

// ✅ WILL be retried - use for temporary failures
res.status(500).json({ error: 'Database unavailable' });
res.status(503).json({ error: 'Service temporarily unavailable' });
```

### Error Handling in Event Handlers

```typescript
class MyEventHandler extends AuthVaderEventHandler {
  async onSubjectCreated(event: SubjectCreatedEvent): Promise<void> {
    try {
      await this.processNewUser(event.data);
    } catch (error) {
      // Log the error
      console.error('Failed to process user:', error);

      // Re-throw to trigger retry (500 response)
      // Only do this for transient errors!
      if (this.isTransientError(error)) {
        throw error;
      }

      // For permanent failures, log and don't rethrow
      // (returns 200, no retry)
      await this.logFailure(event, error);
    }
  }

  private isTransientError(error: unknown): boolean {
    // Database connection errors, rate limits, etc.
    return error instanceof DatabaseConnectionError ||
           error instanceof RateLimitError;
  }
}
```

---

## Idempotency

> ⚠️ **Webhooks may be delivered more than once!** Always design handlers to be idempotent.

### Strategy 1: Use Upserts

```typescript
async onSubjectCreated(event: SubjectCreatedEvent): Promise<void> {
  // Use upsert instead of create
  await prisma.user.upsert({
    where: { id: event.data.sub },
    create: {
      id: event.data.sub,
      email: event.data.email!,
      firstName: event.data.given_name,
      lastName: event.data.family_name,
    },
    update: {
      // Update on re-delivery (idempotent)
      email: event.data.email!,
      firstName: event.data.given_name,
      lastName: event.data.family_name,
    },
  });
}
```

### Strategy 2: Track Processed Events

```typescript
async onEvent(event: WebhookEvent): Promise<void> {
  // Use the event ID for deduplication
  const eventId = event.id;

  // Check if already processed
  const existing = await prisma.processedWebhook.findUnique({
    where: { eventId },
  });

  if (existing) {
    console.log('Duplicate webhook, skipping:', eventId);
    // Don't throw - return normally (200 response)
    return;
  }

  // Mark as processing (with TTL for cleanup)
  await prisma.processedWebhook.create({
    data: {
      eventId,
      eventType: event.type,
      processedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });
}
```

### Strategy 3: Conditional Updates

```typescript
async onMemberRoleChanged(event: MemberRoleChangedEvent): Promise<void> {
  // Only update if the timestamp is newer
  await prisma.tenantMembership.updateMany({
    where: {
      id: event.data.membership_id,
      // Only update if this event is newer
      lastEventTimestamp: { lt: new Date(event.timestamp) },
    },
    data: {
      roles: event.data.tenant_roles,
      lastEventTimestamp: new Date(event.timestamp),
    },
  });
}
```

### Database Schema for Deduplication

```prisma
// schema.prisma
model ProcessedWebhook {
  eventId     String   @id
  eventType   String
  processedAt DateTime @default(now())
  expiresAt   DateTime

  @@index([expiresAt])
}
```

Cleanup job:

```typescript
// Run periodically (e.g., daily cron job)
async function cleanupOldWebhooks() {
  const result = await prisma.processedWebhook.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  console.log(`Cleaned up ${result.count} old webhook records`);
}
```

---

## Testing Webhooks

### Local Development with Tunnels

Use a tunnel service to expose your local server:

**ngrok:**
```bash
ngrok http 3000
# Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

**Cloudflare Tunnel:**
```bash
cloudflared tunnel --url http://localhost:3000
```

**localtunnel:**
```bash
npx localtunnel --port 3000
```

Then configure your webhook URL in AuthVader:
```
https://abc123.ngrok.io/webhooks/authvader
```

### Unit Testing Event Handlers

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyEventHandler } from './event-handler';
import type { SubjectCreatedEvent, MemberRoleChangedEvent } from '@authvader/sdk/webhooks';
import { prisma } from './lib/prisma';

vi.mock('./lib/prisma');

describe('MyEventHandler', () => {
  let handler: MyEventHandler;

  beforeEach(() => {
    handler = new MyEventHandler();
    vi.clearAllMocks();
  });

  describe('onSubjectCreated', () => {
    it('should create a user in the database', async () => {
      const event: SubjectCreatedEvent = {
        id: 'evt_test001',
        type: 'subject.created',
        timestamp: '2024-01-15T10:30:00.000Z',
        tenant_id: 'tnt_test',
        application_id: 'app_test',
        data: {
          sub: 'usr_test001',
          email: 'test@example.com',
          given_name: 'Test',
          family_name: 'User',
          subject_type: 'user',
        },
      };

      await handler.onSubjectCreated(event);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          id: 'usr_test001',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
        },
      });
    });

    it('should skip non-user subjects', async () => {
      const event: SubjectCreatedEvent = {
        id: 'evt_test002',
        type: 'subject.created',
        timestamp: '2024-01-15T10:30:00.000Z',
        tenant_id: 'tnt_test',
        application_id: 'app_test',
        data: {
          sub: 'svc_test001',
          subject_type: 'service_account',
        },
      };

      await handler.onSubjectCreated(event);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('onMemberRoleChanged', () => {
    it('should update roles and log audit event', async () => {
      const event: MemberRoleChangedEvent = {
        id: 'evt_test003',
        type: 'member.role_changed',
        timestamp: '2024-01-15T10:30:00.000Z',
        tenant_id: 'tnt_test',
        application_id: 'app_test',
        data: {
          membership_id: 'mem_test001',
          sub: 'usr_test001',
          email: 'test@example.com',
          tenant_roles: ['admin', 'member'],
          previous_roles: ['member'],
        },
      };

      await handler.onMemberRoleChanged(event);

      expect(prisma.tenantMembership.update).toHaveBeenCalledWith({
        where: { id: 'mem_test001' },
        data: { roles: ['admin', 'member'] },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'MEMBER_ROLE_CHANGED',
          metadata: {
            previousRoles: ['member'],
            newRoles: ['admin', 'member'],
          },
        }),
      });
    });
  });
});
```

### Integration Testing with Test Events

Create a test utility to send webhook-like requests:

```typescript
// test/webhook-test-utils.ts
import crypto from 'crypto';

interface TestWebhookParams {
  endpoint: string;
  event: Record<string, unknown>;
}

export async function sendTestWebhook(params: TestWebhookParams) {
  const { endpoint, event } = params;
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AuthVader-Event-Id': event.id as string,
      'X-AuthVader-Event-Type': event.type as string,
      'X-AuthVader-Timestamp': timestamp,
      'X-AuthVader-Key-Id': 'test-key',
      'X-AuthVader-Signature': 'test-signature', // Mock for testing
    },
    body,
  });

  return response;
}
```

### Testing with Signature Verification Disabled

For local testing, you can create a test-mode router:

```typescript
// test/test-webhook-router.ts
import { WebhookRouter, AuthVaderEventHandler } from '@authvader/sdk/webhooks';

export function createTestRouter(handler: AuthVaderEventHandler) {
  return new WebhookRouter({
    authVaderHost: 'http://localhost:9999', // Fake host
    handler,
    // In test mode, skip signature verification
    skipVerification: process.env.NODE_ENV === 'test',
  });
}
```

### E2E Testing with Supertest

```typescript
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';

describe('Webhook E2E', () => {
  beforeEach(async () => {
    // Clear test data
    await prisma.user.deleteMany();
    await prisma.processedWebhook.deleteMany();
  });

  it('should process subject.created webhook', async () => {
    const event = {
      id: 'evt_e2e_001',
      type: 'subject.created',
      timestamp: new Date().toISOString(),
      tenant_id: 'tnt_test',
      application_id: 'app_test',
      data: {
        sub: 'usr_e2e_001',
        email: 'e2e@example.com',
        given_name: 'E2E',
        family_name: 'Test',
        subject_type: 'user',
      },
    };

    const response = await request(app)
      .post('/webhooks/authvader')
      .set('Content-Type', 'application/json')
      .set('X-AuthVader-Event-Id', event.id)
      .set('X-AuthVader-Event-Type', event.type)
      .set('X-AuthVader-Timestamp', String(Math.floor(Date.now() / 1000)))
      .set('X-AuthVader-Key-Id', 'test-key')
      .set('X-AuthVader-Signature', 'test-sig')
      .send(event);

    expect(response.status).toBe(200);

    // Verify user was created
    const user = await prisma.user.findUnique({
      where: { id: 'usr_e2e_001' },
    });
    expect(user).not.toBeNull();
    expect(user?.email).toBe('e2e@example.com');
  });

  it('should handle duplicate webhooks idempotently', async () => {
    const event = {
      id: 'evt_e2e_dup',
      type: 'subject.created',
      timestamp: new Date().toISOString(),
      tenant_id: 'tnt_test',
      application_id: 'app_test',
      data: {
        sub: 'usr_e2e_dup',
        email: 'dup@example.com',
        given_name: 'Dup',
        family_name: 'Test',
        subject_type: 'user',
      },
    };

    // Send first webhook
    await request(app)
      .post('/webhooks/authvader')
      .send(event)
      .set('X-AuthVader-Event-Id', event.id);

    // Send duplicate
    const response = await request(app)
      .post('/webhooks/authvader')
      .send(event)
      .set('X-AuthVader-Event-Id', event.id);

    expect(response.status).toBe(200);

    // Should still only have one user
    const users = await prisma.user.findMany({
      where: { id: 'usr_e2e_dup' },
    });
    expect(users.length).toBe(1);
  });
});
```

---

## Monitoring & Observability

### Logging Best Practices

```typescript
import { AuthVaderEventHandler } from '@authvader/sdk/webhooks';

class MyEventHandler extends AuthVaderEventHandler {
  async onEvent(event) {
    // Structured logging
    console.log(JSON.stringify({
      level: 'info',
      message: 'Webhook received',
      event_id: event.id,
      event_type: event.type,
      tenant_id: event.tenant_id,
      timestamp: event.timestamp,
    }));
  }

  async onSubjectCreated(event) {
    const startTime = Date.now();
    
    try {
      await this.processUser(event.data);
      
      console.log(JSON.stringify({
        level: 'info',
        message: 'User created',
        event_id: event.id,
        user_id: event.data.sub,
        duration_ms: Date.now() - startTime,
      }));
    } catch (error) {
      console.log(JSON.stringify({
        level: 'error',
        message: 'User creation failed',
        event_id: event.id,
        user_id: event.data.sub,
        error: error.message,
        duration_ms: Date.now() - startTime,
      }));
      throw error;
    }
  }
}
```

### Metrics

```typescript
import { Counter, Histogram } from 'prom-client';

const webhookCounter = new Counter({
  name: 'webhooks_received_total',
  help: 'Total webhooks received',
  labelNames: ['event_type', 'status'],
});

const webhookDuration = new Histogram({
  name: 'webhook_processing_duration_seconds',
  help: 'Webhook processing duration',
  labelNames: ['event_type'],
});

class MetricsEventHandler extends AuthVaderEventHandler {
  async onEvent(event) {
    const end = webhookDuration.startTimer({ event_type: event.type });
    
    try {
      // Process will be handled by specific handler
      webhookCounter.inc({ event_type: event.type, status: 'received' });
    } finally {
      end();
    }
  }
}
```

---

## Security Considerations

### Always Verify Signatures

Never skip signature verification in production:

```typescript
// ❌ NEVER do this in production
const router = new WebhookRouter({
  handler: new MyEventHandler(),
  skipVerification: true, // DON'T!
});

// ✅ Always verify
const router = new WebhookRouter({
  authVaderHost: process.env.AV_HOST!,
  handler: new MyEventHandler(),
});
```

### Use HTTPS

Always use HTTPS for webhook endpoints in production.

### Validate Event Data

Don't trust event data blindly:

```typescript
async onSubjectCreated(event: SubjectCreatedEvent) {
  // Validate required fields
  if (!event.data.sub || !event.data.email) {
    console.error('Invalid event data:', event);
    return; // Don't throw - this is a permanent failure
  }

  // Validate email format
  if (!this.isValidEmail(event.data.email)) {
    console.error('Invalid email:', event.data.email);
    return;
  }

  // Process...
}
```

## Related Documentation

- [Webhooks Guide](./webhooks.md) - Overview and quick start
- [Event Types & Payloads](./webhooks-events.md) - All event types
- [Event Handler Reference](./webhooks-handler.md) - AuthVaderEventHandler class
- [Framework Integration](./webhooks-frameworks.md) - Express, Next.js, NestJS
- [Manual Verification](./webhooks-verification.md) - Low-level API
