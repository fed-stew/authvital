# JWT Claims Reference

> Complete reference for AuthVital JWT token structure and claims.

## Token Types

AuthVital issues three types of tokens:

| Token | Purpose | Lifetime | Contains |
|-------|---------|----------|----------|
| Access Token | API authorization | 1 hour | Full claims |
| Refresh Token | Obtain new access tokens | 7 days | Session reference |
| ID Token | User identity (OIDC) | 1 hour | Identity claims only |

## Access Token Structure

```json
{
  // ═══════════════════════════════════════════════════════════════════════════
  // STANDARD JWT CLAIMS (RFC 7519)
  // ═══════════════════════════════════════════════════════════════════════════
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "iss": "https://auth.yourapp.com",
  "aud": "your-client-id",
  "exp": 1705320000,
  "iat": 1705316400,
  "jti": "unique-token-id",

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION CONTEXT
  // amr (RFC 8176): ["pwd"] for password-only, ["pwd", "otp"] with MFA.
  // mfa_grace_expires_at only appears on tokens minted under a tenant MFA
  // grace period (policy REQUIRED, user not yet enrolled).
  // ═══════════════════════════════════════════════════════════════════════════
  "amr": ["pwd", "otp"],
  "mfa_grace_expires_at": 1735689600,

  // ═══════════════════════════════════════════════════════════════════════════
  // OIDC EMAIL CLAIM (email scope) + PROFILE (profile scope)
  // The access token currently carries given_name/family_name for `profile`.
  // Richer OIDC fields (name, picture, locale, ...) are available on the
  // ID token / userinfo, not necessarily on the access token.
  // ═══════════════════════════════════════════════════════════════════════════
  "email": "user@example.com",
  "given_name": "Jane",
  "family_name": "Smith",

  // ═══════════════════════════════════════════════════════════════════════════
  // TENANT CLAIMS (when tenant-scoped)
  // ═══════════════════════════════════════════════════════════════════════════
  "tenant_id": "tenant-uuid",
  "tenant_subdomain": "acme-corp",

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORIZATION CLAIMS (when tenant-scoped)
  // ═══════════════════════════════════════════════════════════════════════════
  "tenant_roles": ["admin"],
  "tenant_permissions": [
    "users:read",
    "users:write",
    "projects:*"
  ],
  "app_roles": ["editor"],

  // ═══════════════════════════════════════════════════════════════════════════
  // LICENSE CLAIMS (when a license applies to the current app)
  // ═══════════════════════════════════════════════════════════════════════════
  "license": {
    "type": "pro",
    "name": "Pro Plan",
    "features": ["api-access", "sso", "advanced-reports"]
  },

  // OAuth
  "scope": "openid profile email"
}
```

!!! warning "Verified against the backend token builder"
    The claims above reflect `buildAccessTokenPayload` in
    `packages/backend/src/oauth/oauth-token.service.ts`. Notable corrections to
    earlier drafts: the tenant slug claim is **`tenant_subdomain`** (not
    `tenant_slug`); roles are **`tenant_roles`** (array, not `tenant_role`); the
    effective permission set is **`tenant_permissions`** (there is no
    `app_permissions` in tokens the backend issues today). `tenant_*` /
    `app_roles` / `license` are only present on **tenant-scoped** tokens.

!!! info "`aud` / `client_id` identify the credential, not the app"
    An **Application** is a container that may hold more than one credential
    (`ApplicationClient`) — see
    [Data Models: ApplicationClient](./data-models.md#applicationclient-credential).
    The `aud` (and the `client_id` in token introspection) reflect the specific
    **credential** the token was issued through:

    - A **BFF's user token** (issued via `authorization_code` + PKCE) carries the
      **SPA** credential's `clientId` (e.g. `web-bff-client-id`).
    - The **same BFF's M2M token** (issued via `client_credentials`) carries the
      **MACHINE** credential's `clientId` (e.g. `local-machine-client-id`).

    Both trace back to the **same App** behind them — same roles, licensing, and
    branding — but they are two distinct credentials with two distinct `aud`
    values.

## Claim Reference

### Standard JWT Claims

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string | Subject - unique user identifier (UUID) |
| `iss` | string | Issuer - AuthVital URL |
| `aud` | string or string[] | Audience - the `clientId` of the specific **credential** the token was issued for |
| `exp` | number | Expiration time (Unix timestamp) |
| `iat` | number | Issued at time (Unix timestamp) |
| `jti` | string | JWT ID - unique token identifier |
| `amr` | string[] | Authentication Method References (RFC 8176): `["pwd"]` for password-only logins, `["pwd", "otp"]` when the login satisfied TOTP-based MFA. Present on access and ID tokens. |

### OIDC Profile Claims

Included when `profile` scope is requested:

| Claim | Type | Description |
|-------|------|-------------|
| `name` | string | Full display name |
| `given_name` | string | First name |
| `family_name` | string | Last name |
| `middle_name` | string | Middle name |
| `nickname` | string | Casual name |
| `picture` | string | Profile picture URL |
| `website` | string | Personal/professional URL |
| `gender` | string | Gender identity |
| `birthdate` | string | Birth date (YYYY-MM-DD) |
| `zoneinfo` | string | IANA timezone |
| `locale` | string | Language/region code |

### OIDC Email Claims

Included when `email` scope is requested:

| Claim | Type | Description |
|-------|------|-------------|
| `email` | string | Email address |
| `email_verified` | boolean | Email verification status |

### OIDC Phone Claims

Included when `phone` scope is requested:

| Claim | Type | Description |
|-------|------|-------------|
| `phone_number` | string | Phone number (E.164 format) |
| `phone_number_verified` | boolean | Phone verification status |

### Tenant Claims

Included when the token is tenant-scoped:

| Claim | Type | Description |
|-------|------|-------------|
| `tenant_id` | string | Tenant UUID |
| `tenant_subdomain` | string | Tenant subdomain (URL-safe identifier) |
| `mfa_grace_expires_at` | number | Only when minted under a tenant MFA grace period (policy `REQUIRED`, user not enrolled): Unix seconds when the grace window closes and minting will be refused. See [MFA — Enforcement at token mint](../security/mfa.md#enforcement-at-token-mint). |

### Authorization Claims

Included when the token is tenant-scoped:

| Claim | Type | Description |
|-------|------|-------------|
| `tenant_roles` | string[] | Tenant-level role slugs (owner is expanded to full permissions) |
| `tenant_permissions` | string[] | Effective permission strings for the tenant |
| `app_roles` | string[] | Application-specific role slugs (only when present) |

!!! note "`app_permissions` and `groups`"
    The SDK's `EnhancedJwtPayload` type also declares `app_permissions?` and
    `groups?`, but the backend token builder does **not** populate these on the
    tokens it currently issues — use `tenant_permissions` for authorization.

**Permission format:**
```
resource:action
resource:*        (all actions on resource)
*                 (superadmin - all permissions)
```

**Standard tenant permissions** (from `@authvital/shared` `TENANT_PERMISSIONS`,
verified against `packages/shared/src/constants/permissions.ts`):

| Permission | Owner | Admin | Billing Admin | Member |
|------------|:---:|:---:|:---:|:---:|
| `tenant:view` | ✓ | ✓ | ✓ | ✓ |
| `tenant:manage` | ✓ | ✓ | — | — |
| `tenant:delete` | ✓ | — | — | — |
| `members:view` | ✓ | ✓ | ✓ | ✓ |
| `members:invite` | ✓ | ✓ | — | — |
| `members:remove` | ✓ | ✓ | — | — |
| `members:manage-roles` | ✓ | ✓ | — | — |
| `licenses:view` | ✓ | ✓ | ✓ | ✓ |
| `licenses:manage` | ✓ | ✓ | ✓ | — |
| `licenses:provision` | ✓ | — | ✓ | — |
| `service-accounts:view` | ✓ | ✓ | — | — |
| `service-accounts:manage` | ✓ | ✓ | — | — |
| `domains:view` | ✓ | ✓ | — | — |
| `domains:manage` | ✓ | ✓ | — | — |
| `billing:view` | ✓ | ✓ | ✓ | — |
| `billing:manage` | ✓ | — | ✓ | — |
| `app-access:view` | ✓ | ✓ | ✓ | ✓ |
| `app-access:manage` | ✓ | ✓ | ✓ | — |
| `tenant:sso:manage` | ✓ | ✓ | — | — |
| `audit:view` | ✓ | ✓ | — | — |
| `audit:export` | ✓ | — | — | — |

> `audit:view` lets Owner + Admin read the tenant audit log; `audit:export`
> (CSV) is a heavier, exfil-adjacent capability granted to **Owner only** by
> default — assign it explicitly to others. Owner holds `tenant:*` (all of the
> above).

### License Claims

| Claim | Type | Description |
|-------|------|-------------|
| `license.type` | string | License type slug |
| `license.name` | string | License type display name |
| `license.features` | string[] | Enabled feature keys |

### OAuth Claim

| Claim | Type | Description |
|-------|------|-------------|
| `scope` | string | Space-delimited granted scopes |

!!! note "Session/nonce claims live on other tokens"
    `sid` is carried by the **refresh token** (session reference), and `nonce`
    appears on the **ID token** when supplied in the auth request — not on the
    access token.

## ID Token Structure

ID tokens contain identity claims only (no authorization):

```json
{
  // Standard claims
  "sub": "user-uuid",
  "iss": "https://auth.yourapp.com",
  "aud": "your-client-id",
  "exp": 1705320000,
  "iat": 1705316400,

  // OIDC claims (based on requested scopes)
  "email": "user@example.com",
  "email_verified": true,
  "given_name": "Jane",
  "family_name": "Smith",
  "name": "Jane Smith",
  "picture": "https://...",

  // Nonce (if provided in auth request)
  "nonce": "random-nonce-value"
}
```

## Refresh Token Structure

Refresh tokens are JWTs that reference a session record:

```json
{
  "sub": "user-uuid",
  "iss": "https://auth.yourapp.com",
  "aud": "your-client-id",
  "exp": 1705920000,
  "iat": 1705316400,
  "sid": "session-uuid",
  "scope": "openid profile email"
}
```

The `sid` claim points to a `RefreshToken` record in the database that tracks:
- Revocation status
- Device info
- Tenant scope

## Token Validation

### Validating Access Tokens (SDK)

Use `verifyToken` from `@authvital/server` (re-exported from `@authvital/core`).
It fetches and caches JWKS and verifies the RS256 signature, returning the
decoded `EnhancedJwtPayload`:

```typescript
import { verifyToken } from '@authvital/server';

const payload = await verifyToken(accessToken, {
  authVitalHost: 'https://auth.yourapp.com',
  // audience/issuer options as needed
});

console.log('User ID:', payload.sub);
console.log('Email:', payload.email);
console.log('Tenant:', payload.tenant_id);
console.log('Roles:', payload.tenant_roles, payload.app_roles);
console.log('Permissions:', payload.tenant_permissions);
```

In Express, the SDK also ships `authVitalMiddleware` / `requireAuth` (see
[Server SDK middleware](../sdk/server-sdk/middleware.md)) which do this for you
and attach the payload to the request.

### Manual Validation (without SDK)

```typescript
import * as jose from 'jose';

async function validateToken(token: string) {
  // Fetch JWKS
  const jwks = jose.createRemoteJWKSet(
    new URL('https://auth.yourapp.com/.well-known/jwks.json')
  );
  
  // Verify token
  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer: 'https://auth.yourapp.com',
    audience: 'your-client-id',
  });
  
  return payload;
}
```

## Scopes and Claims

| Scope | Claims Included |
|-------|----------------|
| `openid` | `sub`, `iss`, `aud`, `exp`, `iat` |
| `profile` | `name`, `given_name`, `family_name`, `picture`, `locale`, etc. |
| `email` | `email`, `email_verified` |
| `phone` | `phone_number`, `phone_number_verified` |
| `offline_access` | Enables refresh token issuance |

## TypeScript Types

The real types are exported from `@authvital/core` (and re-exported by
`@authvital/server`). Abbreviated:

```typescript
import type { EnhancedJwtPayload, JwtLicenseInfo } from '@authvital/server';

interface EnhancedJwtPayload {
  // Standard claims
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  amr?: string[];              // RFC 8176, e.g. ['pwd', 'otp']

  // OIDC profile / email (present per requested scope)
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;         // ID token / userinfo
  picture?: string;      // ID token / userinfo
  locale?: string;       // ID token / userinfo

  // Tenant context (tenant-scoped tokens)
  tenant_id?: string;
  tenant_subdomain?: string;
  mfa_grace_expires_at?: number; // only on tokens minted under an MFA grace period

  // Authorization (tenant-scoped tokens)
  tenant_roles?: string[];
  tenant_permissions?: string[];
  app_roles?: string[];
  app_permissions?: string[];  // declared, not populated by current backend
  groups?: string[];           // declared, not populated by current backend

  license?: JwtLicenseInfo;
  scope?: string;
  [key: string]: unknown;      // additional custom claims
}

interface JwtLicenseInfo {
  type: string;
  name: string;
  features: string[];
}
```

## Common Patterns

### Check if User Has Permission

```typescript
function hasPermission(user: EnhancedJwtPayload, permission: string): boolean {
  const perms = user.tenant_permissions ?? [];
  // Superadmin has all permissions
  if (perms.includes('*')) return true;
  // Exact match
  if (perms.includes(permission)) return true;
  // Wildcard (e.g., 'users:*' includes 'users:read')
  const [resource] = permission.split(':');
  return perms.includes(`${resource}:*`);
}
```

### Check if User Has Role

```typescript
function hasRole(user: EnhancedJwtPayload, role: string): boolean {
  return user.app_roles?.includes(role) ?? false;
}

function hasAnyRole(user: EnhancedJwtPayload, roles: string[]): boolean {
  return roles.some(role => user.app_roles?.includes(role));
}
```

### Check License Feature

```typescript
function hasFeature(user: EnhancedJwtPayload, feature: string): boolean {
  return user.license?.features.includes(feature) ?? false;
}
```

### Check Token Expiration

```typescript
function isTokenExpired(user: EnhancedJwtPayload): boolean {
  return Date.now() >= user.exp * 1000;
}

function getTokenTtl(user: EnhancedJwtPayload): number {
  return Math.max(0, user.exp * 1000 - Date.now());
}
```

## Token Signing

AuthVital signs tokens with **RS256** (RSA). Verified against
`packages/backend/src/oauth/key-manager.service.ts` (generates RSA key pairs) and
the discovery document (`id_token_signing_alg_values_supported: ["RS256"]`).

- **Algorithm**: RS256 (RSASSA-PKCS1-v1_5 + SHA-256)
- **Key type**: RSA
- **JWKS endpoint**: `/.well-known/jwks.json`

The same RSA keys are used to sign webhook payloads (see
[Webhook Verification](../sdk/webhooks-verification.md)).

### JWKS Response

```json
{
  "keys": [
    {
      "kty": "RSA",
      "n": "base64url-encoded-modulus",
      "e": "AQAB",
      "kid": "key-id-1",
      "use": "sig",
      "alg": "RS256"
    }
  ]
}
```

Multiple keys may be present during rotation. Validate using the `kid` header.

---

## Related Documentation

- [OAuth Flow](../concepts/oauth-flow.md)
- [Server SDK](../sdk/server-sdk/index.md)
- [Access Control](../concepts/access-control.md)
