# Organization Sync

> Mirror **tenant, application, and SSO** lifecycle changes into your own systems
> using AuthVital's **system webhooks**.

!!! warning "This uses the *system webhook*, and there's no SDK handler for it"
    Two things earlier drafts got wrong:

    1. **The events are real.** `tenant.*`, `application.*`, and `sso.*` events
       are emitted by AuthVital's **system webhook** (source of truth:
       `packages/backend/src/webhooks/system-webhook.service.ts`,
       `SYSTEM_WEBHOOK_EVENTS`). This is a **separate** channel from the
       per-application *sync events* used by [Identity Sync](../identity-sync/index.md).
    2. **`OrganizationSyncHandler` / `WebhookRouter` / `CompositeHandler` are not
       shipped.** You verify and dispatch these yourself, just like every other
       webhook.

    The payloads, headers, and signing scheme below are what the backend actually
    sends — the older `plan` / `settings` / `previous_values` / `attribute_mapping`
    payloads were fictional.

## Two webhook channels, don't mix them up

| | Sync events (Identity/Org data) | **System webhook (this page)** |
|---|---|---|
| Configured by | Per **application** (app owner) | **Super admin**, global |
| Events | `subject.*`, `member.*`, `app_access.*`, `invite.*`, `license.*` | `tenant.*`, `tenant.app.*`, `application.*`, `sso.*` |
| Envelope | `{ id, type, timestamp, tenant_id, application_id, data }` | `{ event, timestamp, data }` |
| Signature header | `X-AuthVital-Signature` | `X-Webhook-Signature` |
| Key id header | `X-AuthVital-Key-Id` | `X-Webhook-Key-Id` |
| Signed input | `` `${timestamp}.${rawBody}` `` | **the raw body only** |
| Retries | Yes (5 attempts, backoff) | **No** — fire-and-forget (delivery + `failureCount` logged) |

Both sign with RSA-SHA256 using the same JWKS keys (`/.well-known/jwks.json`).

## The real event catalog

From `SYSTEM_WEBHOOK_EVENTS`:

```
tenant.created  tenant.updated  tenant.deleted  tenant.suspended
tenant.app.granted  tenant.app.revoked
application.created  application.updated  application.deleted
sso.provider_added  sso.provider_updated  sso.provider_removed
```

!!! note "`tenant.suspended` is declared but not currently emitted"
    It's in the subscribable list and typed, but no backend code dispatches it
    today. Subscribe if you like, but don't rely on receiving it yet.

See [Event Details](./events.md) for the exact `data` of each.

## Delivery & headers

Each delivery is a `POST` (JSON body) with:

| Header | Meaning |
|--------|---------|
| `X-Webhook-Signature` | base64 RSA-SHA256 of the **raw body** |
| `X-Webhook-Key-Id` | signing key `kid` (look up in JWKS) |
| `X-Webhook-Event` | e.g. `tenant.created` |
| `X-Webhook-Timestamp` | ISO 8601 timestamp (also inside the body) |

Plus any custom headers configured on the webhook. Timeout is 30s.

## Verifying a system webhook

Signing here is over the **raw body only** (not `timestamp.body`), so it needs its
own verifier (the [`verifyWebhook` helper](../webhooks-verification.md) is for the
`X-AuthVital-*` sync webhook):

```typescript
import crypto from 'crypto';

interface JWK { kty: string; kid: string; n: string; e: string }

async function getKey(host: string, kid: string) {
  const { keys } = await fetch(`${host}/.well-known/jwks.json`).then((r) => r.json());
  const jwk = (keys as JWK[]).find((k) => k.kid === kid);
  if (!jwk) throw new Error(`Unknown kid ${kid}`);
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

export async function verifySystemWebhook(params: {
  rawBody: string; signature: string; keyId: string; authVitalHost: string;
}): Promise<boolean> {
  const key = await getKey(params.authVitalHost, params.keyId);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(params.rawBody);          // raw body only
  return verifier.verify(key, params.signature, 'base64');
}
```

## Endpoint (Express)

```typescript
import express from 'express';

app.post('/webhooks/authvital/system', express.raw({ type: '*/*' }), async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
  const ok = await verifySystemWebhook({
    rawBody,
    signature: String(req.headers['x-webhook-signature'] ?? ''),
    keyId: String(req.headers['x-webhook-key-id'] ?? ''),
    authVitalHost: process.env.AV_HOST!,
  });
  if (!ok) return res.status(400).json({ error: 'invalid signature' });

  const { event, data } = JSON.parse(rawBody);
  await handleSystemEvent(event, data); // your dispatcher
  res.status(200).json({ received: true });
});
```

!!! danger "No automatic retries"
    Unlike sync events, a failed system-webhook delivery is **not** retried.
    Make your handler resilient (queue the work, respond 2xx fast) if you can't
    afford to miss an event.

## Configuring the webhook

System webhooks are managed by a **super admin** (the controller is guarded by
`SuperAdminGuard`). Create/update them via the super-admin API/console with a
URL and the subset of events you want. They are global, not per-tenant.

## In this section

- [Event Details](./events.md) — real payload for every event
- [Use Cases](./use-cases.md) — provisioning, billing, audit
- [Prisma Schema](./prisma-schema.md) — honest tables for what's actually delivered

## Related

- [Identity Sync](../identity-sync/index.md) — the per-application sync webhook
- [Webhook Event Types](../webhooks-events.md)
