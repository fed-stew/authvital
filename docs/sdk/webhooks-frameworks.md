# Framework Integration

> Complete webhook setup examples for Express, Next.js, and NestJS.

**See also:** [Webhooks Guide](./webhooks.md) | [Event Handler Reference](./webhooks-handler.md)

---

## Express.js

```typescript
import express from 'express';
import { WebhookRouter, AuthVaderEventHandler } from '@authvader/sdk/webhooks';

const app = express();

// Your event handler
class MyEventHandler extends AuthVaderEventHandler {
  async onSubjectCreated(event) {
    console.log('New user:', event.data.email);
  }

  async onMemberJoined(event) {
    console.log(`${event.data.email} joined with roles:`, event.data.tenant_roles);
  }
}

// Create webhook router
const webhookRouter = new WebhookRouter({
  authVaderHost: process.env.AV_HOST!, // Or set AV_HOST env var
  handler: new MyEventHandler(),
  maxTimestampAge: 300,    // 5 min replay protection
  keysCacheTtl: 3600000,   // 1 hour JWKS cache
});

// IMPORTANT: Use express.raw() for signature verification!
// The body must be the raw buffer, not parsed JSON.
app.post(
  '/webhooks/authvader',
  express.raw({ type: 'application/json' }),
  webhookRouter.expressHandler()
);

app.listen(3000, () => {
  console.log('Webhook endpoint ready at http://localhost:3000/webhooks/authvader');
});
```

### Express with Existing JSON Parser

If you have `express.json()` globally, exclude the webhook route:

```typescript
import express from 'express';
import { WebhookRouter, AuthVaderEventHandler } from '@authvader/sdk/webhooks';

const app = express();

class MyEventHandler extends AuthVaderEventHandler {
  async onSubjectCreated(event) {
    console.log('New user:', event.data.email);
  }
}

const webhookRouter = new WebhookRouter({
  authVaderHost: process.env.AV_HOST!,
  handler: new MyEventHandler(),
});

// Register webhook BEFORE global JSON parser
app.post(
  '/webhooks/authvader',
  express.raw({ type: 'application/json' }),
  webhookRouter.expressHandler()
);

// Global JSON parser for all other routes
app.use(express.json());

// Your other routes
app.get('/api/users', (req, res) => {
  // ...
});
```

---

## Next.js (App Router)

```typescript
// app/api/webhooks/authvader/route.ts
import { WebhookRouter, AuthVaderEventHandler } from '@authvader/sdk/webhooks';
import type { NextRequest } from 'next/server';

class MyEventHandler extends AuthVaderEventHandler {
  async onSubjectCreated(event) {
    console.log('New user:', event.data.email);
    // Sync to your database
  }

  async onMemberJoined(event) {
    console.log(`${event.data.given_name} joined tenant ${event.tenant_id}`);
  }

  async onLicenseAssigned(event) {
    console.log(`License ${event.data.license_type_name} assigned to ${event.data.sub}`);
  }
}

const webhookRouter = new WebhookRouter({
  authVaderHost: process.env.AV_HOST!,
  handler: new MyEventHandler(),
  maxTimestampAge: 300,
  keysCacheTtl: 3600000,
});

export async function POST(request: NextRequest) {
  return webhookRouter.nextjsHandler()(request);
}

// Use Node.js runtime for crypto operations
export const runtime = 'nodejs';
```

---

## Next.js (Pages Router)

```typescript
// pages/api/webhooks/authvader.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { WebhookRouter, AuthVaderEventHandler } from '@authvader/sdk/webhooks';

class MyEventHandler extends AuthVaderEventHandler {
  async onSubjectCreated(event) {
    console.log('New user:', event.data.email);
  }

  async onMemberJoined(event) {
    console.log(`${event.data.given_name} joined tenant`);
  }
}

const webhookRouter = new WebhookRouter({
  authVaderHost: process.env.AV_HOST!,
  handler: new MyEventHandler(),
});

// Disable body parsing for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return webhookRouter.nextjsPagesHandler()(req, res);
}
```

---

## NestJS

### Module Setup

```typescript
// src/webhooks/webhooks.module.ts
import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhookEventHandler } from './webhook-event-handler';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [WebhooksController],
  providers: [WebhookEventHandler],
})
export class WebhooksModule {}
```

### Event Handler Service

```typescript
// src/webhooks/webhook-event-handler.ts
import { Injectable } from '@nestjs/common';
import { AuthVaderEventHandler } from '@authvader/sdk/webhooks';
import type {
  SubjectCreatedEvent,
  MemberJoinedEvent,
  LicenseAssignedEvent,
} from '@authvader/sdk/webhooks';
import { UsersService } from '../users/users.service';

@Injectable()
export class WebhookEventHandler extends AuthVaderEventHandler {
  constructor(private readonly usersService: UsersService) {
    super();
  }

  async onSubjectCreated(event: SubjectCreatedEvent): Promise<void> {
    await this.usersService.create({
      id: event.data.sub,
      email: event.data.email!,
      firstName: event.data.given_name,
      lastName: event.data.family_name,
    });
  }

  async onMemberJoined(event: MemberJoinedEvent): Promise<void> {
    await this.usersService.assignToTenant(
      event.data.sub,
      event.tenant_id,
      event.data.tenant_roles
    );
  }

  async onLicenseAssigned(event: LicenseAssignedEvent): Promise<void> {
    await this.usersService.assignLicense(
      event.data.sub,
      event.data.license_type_id
    );
  }
}
```

### Controller

```typescript
// src/webhooks/webhooks.controller.ts
import { Controller, Post, Req, Res, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { WebhookRouter } from '@authvader/sdk/webhooks';
import { WebhookEventHandler } from './webhook-event-handler';

@Controller('webhooks')
export class WebhooksController {
  private readonly webhookRouter: WebhookRouter;

  constructor(
    private readonly eventHandler: WebhookEventHandler,
    private readonly configService: ConfigService
  ) {
    this.webhookRouter = new WebhookRouter({
      authVaderHost: this.configService.getOrThrow('AV_HOST'),
      handler: this.eventHandler,
      maxTimestampAge: 300,
      keysCacheTtl: 3600000,
    });
  }

  @Post('authvader')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response
  ) {
    return this.webhookRouter.expressHandler()(req, res);
  }
}
```

### Enable Raw Body in Main

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body for webhook signature verification
  });
  
  await app.listen(3000);
}
bootstrap();
```

---

## Fastify

```typescript
import Fastify from 'fastify';
import { WebhookRouter, AuthVaderEventHandler } from '@authvader/sdk/webhooks';

const fastify = Fastify({
  logger: true,
});

class MyEventHandler extends AuthVaderEventHandler {
  async onSubjectCreated(event) {
    console.log('New user:', event.data.email);
  }
}

const webhookRouter = new WebhookRouter({
  authVaderHost: process.env.AV_HOST!,
  handler: new MyEventHandler(),
});

// Register raw body content type parser
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => {
    done(null, body);
  }
);

fastify.post('/webhooks/authvader', async (request, reply) => {
  return webhookRouter.fastifyHandler()(request, reply);
});

fastify.listen({ port: 3000 }, (err, address) => {
  if (err) throw err;
  console.log(`Webhook endpoint ready at ${address}/webhooks/authvader`);
});
```

---

## Hono

```typescript
import { Hono } from 'hono';
import { WebhookRouter, AuthVaderEventHandler } from '@authvader/sdk/webhooks';

const app = new Hono();

class MyEventHandler extends AuthVaderEventHandler {
  async onSubjectCreated(event) {
    console.log('New user:', event.data.email);
  }
}

const webhookRouter = new WebhookRouter({
  authVaderHost: process.env.AV_HOST!,
  handler: new MyEventHandler(),
});

app.post('/webhooks/authvader', async (c) => {
  return webhookRouter.honoHandler()(c);
});

export default app;
```

---

## Koa

```typescript
import Koa from 'koa';
import Router from '@koa/router';
import { WebhookRouter, AuthVaderEventHandler } from '@authvader/sdk/webhooks';

const app = new Koa();
const router = new Router();

class MyEventHandler extends AuthVaderEventHandler {
  async onSubjectCreated(event) {
    console.log('New user:', event.data.email);
  }
}

const webhookRouter = new WebhookRouter({
  authVaderHost: process.env.AV_HOST!,
  handler: new MyEventHandler(),
});

router.post('/webhooks/authvader', async (ctx) => {
  return webhookRouter.koaHandler()(ctx);
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(3000, () => {
  console.log('Webhook endpoint ready at http://localhost:3000/webhooks/authvader');
});
```

---

## Related Documentation

- [Webhooks Guide](./webhooks.md) - Overview and quick start
- [Event Types & Payloads](./webhooks-events.md) - All event types
- [Manual Verification](./webhooks-verification.md) - Low-level API
- [Best Practices](./webhooks-advanced.md) - Error handling, testing
