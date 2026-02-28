import * as crypto from 'crypto';
import type { SyncEvent } from './types';

export interface WebhookHeaders {
  'x-authvital-signature'?: string;
  'x-authvital-key-id'?: string;
  'x-authvital-timestamp'?: string;
  'x-authvital-event-id'?: string;
  'x-authvital-event-type'?: string;
}

export interface WebhookHandlerOptions {
  /**
   * URL to the AuthVital JWKS endpoint
   * Example: 'https://auth.example.com/.well-known/jwks.json'
   */
  jwksUrl: string;

  /**
   * Maximum age of the timestamp in seconds (default: 300 = 5 minutes)
   * Prevents replay attacks with old signatures
   */
  maxTimestampAge?: number;

  /**
   * Cache TTL for JWKS keys in milliseconds (default: 3600000 = 1 hour)
   */
  keysCacheTtl?: number;
}

interface JwksKey {
  kid: string;
  kty: string;
  use: string;
  n: string;
  e: string;
  alg: string;
}

interface JwksResponse {
  keys: JwksKey[];
}

/**
 * Low-level webhook signature verifier
 *
 * For most use cases, use WebhookRouter + AuthVitalEventHandler instead.
 * This class is useful for advanced scenarios where you need full control
 * over event parsing and routing.
 *
 * @example
 * ```typescript
 * const verifier = new AuthVitalWebhooks({
 *   jwksUrl: 'https://auth.example.com/.well-known/jwks.json'
 * });
 *
 * app.post('/webhooks', async (req, res) => {
 *   try {
 *     const event = await verifier.verifyAndParse(req.body, req.headers);
 *     // Handle event manually...
 *     res.status(200).send('OK');
 *   } catch (err) {
 *     res.status(400).send('Invalid webhook');
 *   }
 * });
 * ```
 */
export class AuthVitalWebhooks {
  private readonly jwksUrl: string;
  private readonly maxTimestampAge: number;
  private readonly keysCacheTtl: number;
  private keysCache: Map<string, crypto.KeyObject> = new Map();
  private keysCacheExpiry: number = 0;

  constructor(options: WebhookHandlerOptions) {
    this.jwksUrl = options.jwksUrl;
    this.maxTimestampAge = options.maxTimestampAge ?? 300; // 5 minutes
    this.keysCacheTtl = options.keysCacheTtl ?? 3600000; // 1 hour
  }

  /**
   * Verify and parse a webhook payload
   *
   * @param body - The raw request body (string or object)
   * @param headers - The request headers (can pass full headers object)
   * @returns The parsed and verified event
   * @throws Error if verification fails
   */
  async verifyAndParse(
    body: string | object,
    headers: WebhookHeaders | Record<string, string | string[] | undefined>,
  ): Promise<SyncEvent> {
    // Normalize headers (Express uses lowercase)
    const normalizedHeaders = this.normalizeHeaders(headers);

    const signature = normalizedHeaders['x-authvital-signature'];
    const keyId = normalizedHeaders['x-authvital-key-id'];
    const timestamp = normalizedHeaders['x-authvital-timestamp'];

    if (!signature) {
      throw new Error('Missing X-AuthVital-Signature header');
    }
    if (!keyId) {
      throw new Error('Missing X-AuthVital-Key-Id header');
    }
    if (!timestamp) {
      throw new Error('Missing X-AuthVital-Timestamp header');
    }

    // Verify timestamp is recent (prevent replay attacks)
    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum)) {
      throw new Error('Invalid timestamp format');
    }

    const now = Math.floor(Date.now() / 1000);
    const age = now - timestampNum;

    if (age > this.maxTimestampAge) {
      throw new Error(`Timestamp too old: ${age}s (max ${this.maxTimestampAge}s)`);
    }

    if (age < -60) {
      // Allow 1 minute clock skew into the future
      throw new Error('Timestamp is in the future');
    }

    // Get the body as string
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);

    // Reconstruct the signed payload
    const signedPayload = `${timestamp}.${bodyString}`;

    // Get the public key
    const publicKey = await this.getPublicKey(keyId);

    // Verify the signature
    const isValid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(signedPayload),
      publicKey,
      Buffer.from(signature, 'base64'),
    );

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Parse and return the event
    const event = typeof body === 'string' ? JSON.parse(body) : body;
    return event as SyncEvent;
  }

  /**
   * Verify signature only (without parsing)
   * Useful if you want to handle parsing yourself
   */
  async verify(
    body: string | object,
    signature: string,
    keyId: string,
    timestamp: string,
  ): Promise<boolean> {
    try {
      const timestampNum = parseInt(timestamp, 10);
      const now = Math.floor(Date.now() / 1000);
      const age = now - timestampNum;

      if (age > this.maxTimestampAge || age < -60) {
        return false;
      }

      const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
      const signedPayload = `${timestamp}.${bodyString}`;
      const publicKey = await this.getPublicKey(keyId);

      return crypto.verify(
        'RSA-SHA256',
        Buffer.from(signedPayload),
        publicKey,
        Buffer.from(signature, 'base64'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Get a public key from the JWKS endpoint
   */
  private async getPublicKey(kid: string): Promise<crypto.KeyObject> {
    // Check cache
    const now = Date.now();
    if (this.keysCache.has(kid) && now < this.keysCacheExpiry) {
      return this.keysCache.get(kid)!;
    }

    // Fetch JWKS
    const response = await fetch(this.jwksUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.status}`);
    }

    const jwks: JwksResponse = await response.json();

    // Update cache
    this.keysCache.clear();
    this.keysCacheExpiry = now + this.keysCacheTtl;

    for (const key of jwks.keys) {
      if (key.kty === 'RSA' && key.n && key.e) {
        const publicKey = crypto.createPublicKey({
          key: {
            kty: key.kty,
            n: key.n,
            e: key.e,
          },
          format: 'jwk',
        });
        this.keysCache.set(key.kid, publicKey);
      }
    }

    // Return the requested key
    const publicKey = this.keysCache.get(kid);
    if (!publicKey) {
      throw new Error(`Key not found: ${kid}`);
    }

    return publicKey;
  }

  /**
   * Normalize headers to lowercase keys and string values
   */
  private normalizeHeaders(
    headers: WebhookHeaders | Record<string, string | string[] | undefined>,
  ): Record<string, string | undefined> {
    const normalized: Record<string, string | undefined> = {};

    for (const [key, value] of Object.entries(headers)) {
      const normalizedKey = key.toLowerCase();
      normalized[normalizedKey] = Array.isArray(value) ? value[0] : value;
    }

    return normalized;
  }

  /**
   * Clear the key cache (useful for testing or key rotation)
   */
  clearCache(): void {
    this.keysCache.clear();
    this.keysCacheExpiry = 0;
  }
}
