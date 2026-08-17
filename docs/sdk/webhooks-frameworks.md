# Framework Integration

> Wiring AuthVital webhooks into Express, Next.js, and NestJS — using the real,
> shipped primitives.

**See also:** [Webhooks Guide](./webhooks.md) | [Manual Verification](./webhooks-verification.md) | [Event Handler pattern](./webhooks-handler.md)

!!! info "There is no `WebhookRouter` / `AuthVitalEventHandler` in the SDK"
    The SDK does **not** ship a webhook router or an abstract event-handler base
    class, and there are no `expressHandler()` / `nextjsHandler()` /
    `fastifyHandler()` helpers. You build the endpoint from two small, real
    pieces:

    1. the `verifyWebhook` helper you copy from
       [Manual Verification](./webhooks-verification.md) (RSA-SHA256 over
       `` `${timestamp}.${rawBody}` `` against the IdP JWKS), and
    2. your own dispatch function/class (see the
       [Event Handler pattern](./webhooks-handler.md)).

    Every framework example below does exactly that. The `examples/bff-express`
    app is the reference implementation.

## What AuthVital sends

Each delivery is a `POST` with the JSON event as the body and these headers
(verified against `packages/backend/src/sync/sync-event.service.ts`):

| Header | Meaning |
|--------|---------|
| `X-AuthVital-Signature` | base64 RSA-SHA256 signature of `` `${timestamp}.${rawBody}` `` |
| `X-AuthVital-Key-Id` | `kid` of the signing key (look it up in JWKS) |
| `X-AuthVital-Timestamp` | unix seconds used in the signed input |
| `X-AuthVital-Event-Id` | unique event id (use for idempotency) |
| `X-AuthVital-Event-Type` | e.g. `subject.created` |

!!! danger "Always verify over the RAW body"
    The signature is computed over the exact bytes AuthVital sent. If a JSON
    parser re-serializes the body first, verification will fail. Use a raw-body
    reader on the webhook route only.

---

## Express.js

```typescript
import express from 'express';
import type { SyncEvent } from '@authvital/shared';
import { verifyWebhook } from './lib/verify-webhook'; // copied from Manual Verification
import { handleEvent } from './lib/event-handler';    // your own dispatcher

const app = express();

// Raw body ONLY on the webhook route. Register it before any global express.json().
app.post('/webhooks/authvital', express.raw({ type: '*/*' }), async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');

  const ok = await verifyWebhook({
    body: rawBody,
    signature: String(req.headers['x-authvital-signature'] ?? ''),
    keyId: String(req.headers['x-authvital-key-id'] ?? ''),
    timestamp: String(req.headers['x-authvital-timestamp'] ?? ''),
    authVitalHost: process.env.AV_HOST!,
    maxTimestampAge: 300,
  });

  if (!ok) {
    return res.status(400).json({ error: 'invalid signature' });
  }

  const event = JSON.parse(rawBody) as SyncEvent;
  await handleEvent(event); // your business logic
  res.status(200).json({ received: true });
});

// Global JSON parser for everything else
app.use(express.json());

app.listen(3000);
```

This mirrors `examples/bff-express/src/index.ts` (which uses `express.raw({ type: '*/*' })`
and a small `WebhookRouter` class it defines itself).

---

## Next.js (App Router)

```typescript
// app/api/webhooks/authvital/route.ts
import type { SyncEvent } from '@authvital/shared';
import { verifyWebhook } from '@/lib/verify-webhook';
import { handleEvent } from '@/lib/event-handler';

// crypto needs the Node.js runtime (not edge)
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rawBody = await request.text(); // raw bytes, not request.json()

  const ok = await verifyWebhook({
    body: rawBody,
    signature: request.headers.get('x-authvital-signature') ?? '',
    keyId: request.headers.get('x-authvital-key-id') ?? '',
    timestamp: request.headers.get('x-authvital-timestamp') ?? '',
    authVitalHost: process.env.AV_HOST!,
  });

  if (!ok) {
    return Response.json({ error: 'invalid signature' }, { status: 400 });
  }

  await handleEvent(JSON.parse(rawBody) as SyncEvent);
  return Response.json({ received: true });
}
```

## Next.js (Pages Router)

```typescript
// pages/api/webhooks/authvital.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import type { SyncEvent } from '@authvital/shared';
import { verifyWebhook } from '@/lib/verify-webhook';
import { handleEvent } from '@/lib/event-handler';

export const config = { api: { bodyParser: false } }; // we need the raw body

function readRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = await readRawBody(req);
  const ok = await verifyWebhook({
    body: rawBody,
    signature: String(req.headers['x-authvital-signature'] ?? ''),
    keyId: String(req.headers['x-authvital-key-id'] ?? ''),
    timestamp: String(req.headers['x-authvital-timestamp'] ?? ''),
    authVitalHost: process.env.AV_HOST!,
  });
  if (!ok) return res.status(400).json({ error: 'invalid signature' });

  await handleEvent(JSON.parse(rawBody) as SyncEvent);
  res.status(200).json({ received: true });
}
```

---

## NestJS

Enable raw body capture, then verify + dispatch in a controller.

```typescript
// main.ts
const app = await NestFactory.create(AppModule, { rawBody: true });
await app.listen(3000);
```

```typescript
// webhooks.controller.ts
import { Controller, Post, Req, Res, RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SyncEvent } from '@authvital/shared';
import { verifyWebhook } from './lib/verify-webhook';
import { handleEvent } from './lib/event-handler';

@Controller('webhooks')
export class WebhooksController {
  @Post('authvital')
  async handle(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';

    const ok = await verifyWebhook({
      body: rawBody,
      signature: String(req.headers['x-authvital-signature'] ?? ''),
      keyId: String(req.headers['x-authvital-key-id'] ?? ''),
      timestamp: String(req.headers['x-authvital-timestamp'] ?? ''),
      authVitalHost: process.env.AV_HOST!,
    });
    if (!ok) return res.status(400).json({ error: 'invalid signature' });

    await handleEvent(JSON.parse(rawBody) as SyncEvent);
    res.status(200).json({ received: true });
  }
}
```

Inject your services into a handler class if you need DI — see the
[Event Handler pattern](./webhooks-handler.md).

---

## Other frameworks (Fastify, Hono, Koa, …)

The recipe is identical everywhere; only the raw-body plumbing differs:

1. Read the **raw** request body as a string (disable/parse-as-buffer the JSON parser on this route).
2. Call `verifyWebhook({ body, signature, keyId, timestamp, authVitalHost })`.
3. On success, `JSON.parse` and dispatch to your handler; respond `200`. On failure respond `400`.

**Fastify** — register a buffer content-type parser:

```typescript
fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
```

**Hono** — `const rawBody = await c.req.text();`

**Koa** — use `koa-bodyparser` disabled on this route, or read `ctx.req` directly.

---

## Related Documentation

- [Webhooks Guide](./webhooks.md) — overview and quick start
- [Event Types & Payloads](./webhooks-events.md) — every event type
- [Manual Verification](./webhooks-verification.md) — the `verifyWebhook` helper
- [Event Handler pattern](./webhooks-handler.md) — building your dispatcher
- [Best Practices](./webhooks-advanced.md) — retries, idempotency, testing
