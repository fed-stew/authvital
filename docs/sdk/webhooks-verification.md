# Manual Webhook Verification

> Low-level API for manual RSA-SHA256 signature verification.

**See also:** [Webhooks Guide](./webhooks.md) | [Framework Integration](./webhooks-frameworks.md)

---

## AuthVaderWebhooks Class

For more control over webhook handling, use the `AuthVaderWebhooks` class directly.

```typescript
import { AuthVaderWebhooks } from '@authvader/sdk/webhooks';

const webhooks = new AuthVaderWebhooks({
  authVaderHost: process.env.AV_HOST!,
  maxTimestampAge: 300,    // Optional: 5 min replay protection
  keysCacheTtl: 3600000,   // Optional: 1 hour JWKS cache
});
```

---

## Verifying a Webhook Signature

```typescript
import express from 'express';
import { AuthVaderWebhooks, WebhookVerificationError } from '@authvader/sdk/webhooks';

const app = express();
const webhooks = new AuthVaderWebhooks({
  authVaderHost: process.env.AV_HOST!,
});

app.post(
  '/webhooks/authvader',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      // Extract headers
      const signature = req.headers['x-authvader-signature'] as string;
      const keyId = req.headers['x-authvader-key-id'] as string;
      const timestamp = req.headers['x-authvader-timestamp'] as string;
      const eventId = req.headers['x-authvader-event-id'] as string;
      const eventType = req.headers['x-authvader-event-type'] as string;

      // Get raw body as string
      const body = req.body.toString('utf-8');

      // Verify signature (throws on failure)
      const event = await webhooks.verifyAndParse({
        body,
        signature,
        keyId,
        timestamp,
      });

      console.log('Verified event:', event.type, event.id);

      // Handle the event based on type
      switch (event.type) {
        case 'subject.created':
          console.log('New user:', event.data.email);
          break;
        case 'member.joined':
          console.log('Member joined:', event.data.membership_id);
          break;
        // ... handle other events
      }

      res.status(200).json({ received: true });
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        console.error('Webhook verification failed:', error.message);
        return res.status(401).json({ error: error.message });
      }
      
      console.error('Webhook processing error:', error);
      return res.status(500).json({ error: 'Internal error' });
    }
  }
);
```

---

## Manual RSA-SHA256 Verification (Without SDK)

If you can't use the SDK, here's how to verify webhooks manually:

```typescript
import crypto from 'crypto';

// 1. Fetch JWKS from AuthVader
interface JWK {
  kty: string;
  kid: string;
  n: string;  // RSA modulus (base64url)
  e: string;  // RSA exponent (base64url)
}

interface JWKS {
  keys: JWK[];
}

async function fetchJWKS(authVaderHost: string): Promise<JWKS> {
  const response = await fetch(`${authVaderHost}/.well-known/jwks.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }
  return response.json();
}

// 2. Convert JWK to PEM format
function jwkToPem(jwk: JWK): string {
  // Create RSA public key from JWK
  const key = crypto.createPublicKey({
    key: {
      kty: 'RSA',
      n: jwk.n,
      e: jwk.e,
    },
    format: 'jwk',
  });

  return key.export({ type: 'spki', format: 'pem' }) as string;
}

// 3. Verify the webhook signature
interface VerifyWebhookParams {
  body: string;      // Raw request body
  signature: string; // X-AuthVader-Signature header (base64)
  keyId: string;     // X-AuthVader-Key-Id header
  timestamp: string; // X-AuthVader-Timestamp header
  authVaderHost: string;
  maxTimestampAge?: number; // Seconds (default: 300)
}

async function verifyWebhook(params: VerifyWebhookParams): Promise<boolean> {
  const {
    body,
    signature,
    keyId,
    timestamp,
    authVaderHost,
    maxTimestampAge = 300,
  } = params;

  // Check timestamp for replay protection
  const timestampNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > maxTimestampAge) {
    throw new Error('Webhook timestamp too old or in the future');
  }

  // Fetch JWKS and find the key
  const jwks = await fetchJWKS(authVaderHost);
  const jwk = jwks.keys.find((k) => k.kid === keyId);
  if (!jwk) {
    throw new Error(`Key not found in JWKS: ${keyId}`);
  }

  // Convert to PEM
  const publicKeyPem = jwkToPem(jwk);

  // Create signature payload: "{timestamp}.{body}"
  const signaturePayload = `${timestamp}.${body}`;

  // Verify RSA-SHA256 signature
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signaturePayload);
  verifier.end();

  const signatureBuffer = Buffer.from(signature, 'base64');
  const isValid = verifier.verify(publicKeyPem, signatureBuffer);

  return isValid;
}
```

---

## Usage Example (Manual Verification)

```typescript
import express from 'express';

const app = express();

app.post(
  '/webhooks/authvader',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const isValid = await verifyWebhook({
        body: req.body.toString('utf-8'),
        signature: req.headers['x-authvader-signature'] as string,
        keyId: req.headers['x-authvader-key-id'] as string,
        timestamp: req.headers['x-authvader-timestamp'] as string,
        authVaderHost: process.env.AV_HOST!,
      });

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const event = JSON.parse(req.body.toString('utf-8'));
      console.log('Verified event:', event.type);

      // Handle event based on type
      switch (event.type) {
        case 'subject.created':
          await handleSubjectCreated(event);
          break;
        case 'member.joined':
          await handleMemberJoined(event);
          break;
        // ... other events
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook verification failed:', error);
      res.status(401).json({ error: 'Verification failed' });
    }
  }
);
```

---

## JWKS Caching

In production, cache the JWKS to avoid fetching on every request:

```typescript
class JWKSCache {
  private keys: Map<string, string> = new Map(); // kid -> PEM
  private lastFetch: number = 0;
  private ttl: number;
  private authVaderHost: string;

  constructor(authVaderHost: string, ttlMs: number = 3600000) {
    this.authVaderHost = authVaderHost;
    this.ttl = ttlMs;
  }

  async getPublicKey(keyId: string): Promise<string> {
    // Refresh cache if expired
    if (Date.now() - this.lastFetch > this.ttl) {
      await this.refresh();
    }

    const pem = this.keys.get(keyId);
    if (!pem) {
      // Key not found, try refreshing
      await this.refresh();
      const refreshedPem = this.keys.get(keyId);
      if (!refreshedPem) {
        throw new Error(`Key not found: ${keyId}`);
      }
      return refreshedPem;
    }

    return pem;
  }

  private async refresh(): Promise<void> {
    const jwks = await fetchJWKS(this.authVaderHost);
    this.keys.clear();
    
    for (const jwk of jwks.keys) {
      this.keys.set(jwk.kid, jwkToPem(jwk));
    }
    
    this.lastFetch = Date.now();
  }
}

// Usage
const jwksCache = new JWKSCache(process.env.AV_HOST!, 3600000);

async function verifyWithCache(params: Omit<VerifyWebhookParams, 'authVaderHost'>) {
  const { body, signature, keyId, timestamp, maxTimestampAge = 300 } = params;

  // Check timestamp
  const timestampNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > maxTimestampAge) {
    throw new Error('Webhook timestamp too old');
  }

  // Get public key from cache
  const publicKeyPem = await jwksCache.getPublicKey(keyId);

  // Verify signature
  const signaturePayload = `${timestamp}.${body}`;
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signaturePayload);
  verifier.end();

  return verifier.verify(publicKeyPem, Buffer.from(signature, 'base64'));
}
```

---

## Python Example

```python
import hashlib
import time
from typing import Any
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend
import jwt
import base64

class AuthVaderWebhookVerifier:
    def __init__(self, authvader_host: str, max_timestamp_age: int = 300):
        self.authvader_host = authvader_host
        self.max_timestamp_age = max_timestamp_age
        self._jwks_cache = None
        self._jwks_cache_time = 0
        self._cache_ttl = 3600  # 1 hour

    def _fetch_jwks(self) -> dict:
        """Fetch JWKS from AuthVader."""
        now = time.time()
        if self._jwks_cache and (now - self._jwks_cache_time) < self._cache_ttl:
            return self._jwks_cache

        url = f"{self.authvader_host}/.well-known/jwks.json"
        response = requests.get(url)
        response.raise_for_status()
        self._jwks_cache = response.json()
        self._jwks_cache_time = now
        return self._jwks_cache

    def _get_public_key(self, key_id: str):
        """Get public key from JWKS by key ID."""
        jwks = self._fetch_jwks()
        for key in jwks.get('keys', []):
            if key.get('kid') == key_id:
                return jwt.algorithms.RSAAlgorithm.from_jwk(key)
        raise ValueError(f"Key not found: {key_id}")

    def verify(self, body: str, signature: str, key_id: str, timestamp: str) -> bool:
        """Verify webhook signature."""
        # Check timestamp for replay protection
        ts = int(timestamp)
        now = int(time.time())
        if abs(now - ts) > self.max_timestamp_age:
            raise ValueError("Timestamp too old or in the future")

        # Get public key
        public_key = self._get_public_key(key_id)

        # Create signature payload
        payload = f"{timestamp}.{body}".encode('utf-8')

        # Decode signature
        sig_bytes = base64.b64decode(signature)

        # Verify RSA-SHA256 signature
        try:
            public_key.verify(
                sig_bytes,
                payload,
                padding.PKCS1v15(),
                hashes.SHA256()
            )
            return True
        except Exception:
            return False

    def verify_and_parse(self, body: str, signature: str, key_id: str, timestamp: str) -> dict:
        """Verify signature and parse event."""
        if not self.verify(body, signature, key_id, timestamp):
            raise ValueError("Invalid signature")
        
        import json
        return json.loads(body)


# Flask example
from flask import Flask, request, jsonify

app = Flask(__name__)
verifier = AuthVaderWebhookVerifier(os.environ['AV_HOST'])

@app.route('/webhooks/authvader', methods=['POST'])
def handle_webhook():
    try:
        event = verifier.verify_and_parse(
            body=request.get_data(as_text=True),
            signature=request.headers.get('X-AuthVader-Signature'),
            key_id=request.headers.get('X-AuthVader-Key-Id'),
            timestamp=request.headers.get('X-AuthVader-Timestamp'),
        )
        
        print(f"Verified event: {event['type']}")
        
        if event['type'] == 'subject.created':
            handle_subject_created(event)
        elif event['type'] == 'member.joined':
            handle_member_joined(event)
        # ... handle other events
        
        return jsonify({'received': True})
    except ValueError as e:
        return jsonify({'error': str(e)}), 401
```

---

## Related Documentation

- [Webhooks Guide](./webhooks.md) - Overview and quick start
- [Event Types & Payloads](./webhooks-events.md) - All event types
- [Framework Integration](./webhooks-frameworks.md) - Express, Next.js, NestJS
- [Best Practices](./webhooks-advanced.md) - Error handling, testing
