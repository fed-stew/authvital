# JWT Validation

> Verify tokens and read user claims on the server.

!!! warning "No `validateRequest` / `getCurrentUser(req)` / `hasAppPermission` on the SDK"
    Earlier drafts documented request-scoped helpers like
    `authvital.validateRequest(req)`, `authvital.getCurrentUser(req)` returning
    `{ authenticated, user, error }`, and claim helpers such as
    `authvital.hasTenantPermission(req, …)`. **None of those exist.**

    The real primitives are `verifyToken()` and `decodeToken()` (re-exported from
    `@authvital/core`). Claim-based permission checks are a couple of lines you
    write against the decoded payload (shown below). `ServerClient.getCurrentUser()`
    exists too, but takes **no** request and returns `User | null` (it calls
    `GET /api/users/me` with the client's stored access token).

## verifyToken()

Cryptographically verifies a JWT against the IdP's JWKS.

```typescript
import { verifyToken } from '@authvital/server';

const result = await verifyToken(accessToken, {
  jwksUri: `${process.env.AV_HOST}/.well-known/jwks.json`,
  issuer: process.env.AV_HOST,       // optional but recommended
  audience: process.env.AV_CLIENT_ID, // optional but recommended
});

if (!result.valid) {
  // result.error is a string describing why
  throw new Error(`Invalid token: ${result.error}`);
}

const claims = result.payload; // verified JwtPayload
```

### VerifyOptions

```typescript
interface VerifyOptions {
  jwksUri: string;                 // required
  issuer?: string;
  audience?: string | string[];
  clockTolerance?: number;         // seconds, default 0
  maxAge?: number;                 // seconds (iat check)
  jwksClient?: JWKSClient;         // reuse a cached client instead of jwksUri
}
```

### VerifyResult

```typescript
type VerifyResult =
  | { valid: true; payload: JwtPayload }
  | { valid: false; error: string };
```

### A reusable request validator

The SDK doesn't ship one, so wrap `verifyToken` yourself (this mirrors the
`bff-express` example):

```typescript
import { verifyToken } from '@authvital/server';

async function validateRequest(accessToken: string | null) {
  if (!accessToken) return { valid: false as const, reason: 'no token' };
  const result = await verifyToken(accessToken, {
    jwksUri: `${process.env.AV_HOST}/.well-known/jwks.json`,
    issuer: process.env.AV_HOST,
    audience: process.env.AV_CLIENT_ID,
  });
  return result.valid
    ? { valid: true as const, claims: result.payload }
    : { valid: false as const, reason: result.error };
}
```

## decodeToken()

Decodes a JWT **without** verifying the signature — for inspecting claims when
you've already verified elsewhere (or for debugging). Never authorize on this
alone.

```typescript
import { decodeToken } from '@authvital/server';

const decoded = decodeToken(token); // { header, payload } | null
if (decoded) {
  console.log(decoded.header.alg, decoded.payload.sub);
}
```

## JWKSClient

For high-throughput services, reuse a cached JWKS client instead of re-passing
`jwksUri` every call:

```typescript
import { JWKSClient, verifyToken } from '@authvital/server';

const jwksClient = new JWKSClient({ jwksUri: `${process.env.AV_HOST}/.well-known/jwks.json` });

const result = await verifyToken(token, {
  jwksClient,
  issuer: process.env.AV_HOST,
  audience: process.env.AV_CLIENT_ID,
});
```

## JWT claims structure

```typescript
interface EnhancedJwtPayload {
  // Identity
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;

  // Tenant (if scoped)
  tenant_id?: string;
  tenant_subdomain?: string;

  // Authorization
  tenant_roles?: string[];
  tenant_permissions?: string[];
  app_roles?: string[];
  app_permissions?: string[];

  // License
  license?: { type: string; name: string; features: string[] };

  // Standard JWT claims
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
}
```

## Claim-based permission checks (write these yourself)

There are **no** `hasAppPermission` / `hasTenantPermission` / `hasFeatureFromJwt`
methods in the SDK. They're trivial to implement against the decoded payload —
this is exactly what the `bff-express` example does:

```typescript
import type { EnhancedJwtPayload } from '@authvital/shared';

export function hasAppPermission(claims: EnhancedJwtPayload | null, permission: string): boolean {
  return Boolean(claims?.app_permissions?.includes(permission));
}

export function hasAppRole(claims: EnhancedJwtPayload | null, role: string): boolean {
  return Boolean(claims?.app_roles?.includes(role));
}

export function hasTenantPermission(claims: EnhancedJwtPayload | null, permission: string): boolean {
  return Boolean(claims?.tenant_permissions?.includes(permission));
}

export function hasFeatureFromJwt(claims: EnhancedJwtPayload | null, feature: string): boolean {
  return Boolean(claims?.license?.features?.includes(feature));
}
```

!!! tip "Need an authoritative, live check?"
    JWT-based checks reflect the claims baked into the token at issue time. For a
    real-time server-to-server check that isn't bound to a specific token, use the
    [integration client](./namespaces/overview.md): `client.integration.checkPermission(...)`,
    `checkFeature(...)`, or `getUserPermissions(...)`.

## Complete example (Express, session middleware)

```typescript
import { verifyToken } from '@authvital/server';

app.get('/api/analytics/advanced', requireAuth(), async (req, res) => {
  const token = req.authVital!.accessToken;

  const result = await verifyToken(token, {
    jwksUri: `${process.env.AV_HOST}/.well-known/jwks.json`,
    issuer: process.env.AV_HOST,
    audience: process.env.AV_CLIENT_ID,
  });
  if (!result.valid) return res.status(401).json({ error: result.error });

  const claims = result.payload as any;
  if (!claims.license?.features?.includes('advanced-analytics')) {
    return res.status(402).json({ error: 'Feature requires Pro license' });
  }
  if (!claims.app_permissions?.includes('analytics:view')) {
    return res.status(403).json({ error: 'Missing permission: analytics:view' });
  }

  res.json(await fetchAdvancedAnalytics(claims.tenant_id));
});
```
