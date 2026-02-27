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
  // OIDC PROFILE CLAIMS
  // ═══════════════════════════════════════════════════════════════════════════
  "email": "user@example.com",
  "email_verified": true,
  "given_name": "Jane",
  "family_name": "Smith",
  "name": "Jane Smith",
  "picture": "https://cdn.example.com/avatars/user.jpg",
  "locale": "en-US",

  // ═══════════════════════════════════════════════════════════════════════════
  // TENANT CLAIMS (when tenant-scoped)
  // ═══════════════════════════════════════════════════════════════════════════
  "tenant_id": "tenant-uuid",
  "tenant_slug": "acme-corp",
  "tenant_role": "admin",

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORIZATION CLAIMS
  // ═══════════════════════════════════════════════════════════════════════════
  "app_roles": ["admin", "member"],
  "app_permissions": [
    "users:read",
    "users:write",
    "projects:*",
    "billing:view"
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // LICENSE CLAIMS
  // ═══════════════════════════════════════════════════════════════════════════
  "license": {
    "type": "pro",
    "name": "Pro Plan",
    "features": ["api-access", "sso", "advanced-reports"]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION CLAIMS
  // ═══════════════════════════════════════════════════════════════════════════
  "sid": "session-uuid"
}
```

## Claim Reference

### Standard JWT Claims

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string | Subject - unique user identifier (UUID) |
| `iss` | string | Issuer - AuthVital URL |
| `aud` | string or string[] | Audience - client ID(s) |
| `exp` | number | Expiration time (Unix timestamp) |
| `iat` | number | Issued at time (Unix timestamp) |
| `jti` | string | JWT ID - unique token identifier |

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

Included when token is tenant-scoped:

| Claim | Type | Description |
|-------|------|-------------|
| `tenant_id` | string | Tenant UUID |
| `tenant_slug` | string | URL-safe tenant identifier |
| `tenant_role` | string | User's role within tenant (`owner`, `admin`, `member`) |

### Authorization Claims

| Claim | Type | Description |
|-------|------|-------------|
| `app_roles` | string[] | Application-specific role slugs |
| `app_permissions` | string[] | Granted permission strings |

**Permission format:**
```
resource:action
resource:*        (all actions on resource)
*                 (superadmin - all permissions)
```

### License Claims

| Claim | Type | Description |
|-------|------|-------------|
| `license.type` | string | License type slug |
| `license.name` | string | License type display name |
| `license.features` | string[] | Enabled feature keys |

### Session Claims

| Claim | Type | Description |
|-------|------|-------------|
| `sid` | string | Session ID (refresh token reference) |
| `nonce` | string | OIDC nonce (if provided in auth request) |

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

### Validating Access Tokens

```typescript
import { createAuthVital } from '@authvital/sdk/server';

const authvital = createAuthVital({
  authVitalHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});

// Extract and validate from request
const { authenticated, user, error } = await authvital.getCurrentUser(req);

if (authenticated) {
  console.log('User ID:', user.sub);
  console.log('Email:', user.email);
  console.log('Tenant:', user.tenant_id);
  console.log('Roles:', user.app_roles);
  console.log('Permissions:', user.app_permissions);
}
```

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

```typescript
import type { EnhancedJwtPayload, JwtLicenseInfo } from '@authvital/sdk/server';

// Full access token payload type
interface EnhancedJwtPayload {
  // Standard claims
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  jti?: string;
  
  // Profile claims
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
  locale?: string;
  
  // Tenant claims
  tenant_id?: string;
  tenant_slug?: string;
  tenant_role?: string;
  
  // Authorization
  app_roles?: string[];
  app_permissions?: string[];
  
  // License
  license?: JwtLicenseInfo;
  
  // Session
  sid?: string;
  nonce?: string;
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
  // Superadmin has all permissions
  if (user.app_permissions?.includes('*')) return true;
  
  // Check exact match
  if (user.app_permissions?.includes(permission)) return true;
  
  // Check wildcard (e.g., 'users:*' includes 'users:read')
  const [resource] = permission.split(':');
  return user.app_permissions?.includes(`${resource}:*`) ?? false;
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

AuthVital uses **Ed25519** (EdDSA) for token signing:

- **Algorithm**: EdDSA
- **Curve**: Ed25519
- **Key rotation**: Every 7 days (configurable)
- **JWKS endpoint**: `/.well-known/jwks.json`

### JWKS Response

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "base64url-encoded-public-key",
      "kid": "key-id-1",
      "use": "sig",
      "alg": "EdDSA"
    },
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "base64url-encoded-public-key-previous",
      "kid": "key-id-0",
      "use": "sig",
      "alg": "EdDSA"
    }
  ]
}
```

Multiple keys may be present during rotation. Validate using `kid` header.

---

## Related Documentation

- [OAuth Flow](../concepts/oauth-flow.md)
- [Server SDK](../sdk/server-sdk/index.md)
- [Access Control](../concepts/access-control.md)
