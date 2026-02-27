# OAuth Endpoints Reference

> OAuth 2.0 / OIDC compliant endpoints.

## Discovery Endpoint

### GET /.well-known/openid-configuration

Returns OIDC discovery document.

**Response:**

```json
{
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/oauth/authorize",
  "token_endpoint": "https://auth.example.com/api/oauth/token",
  "userinfo_endpoint": "https://auth.example.com/api/oauth/userinfo",
  "jwks_uri": "https://auth.example.com/api/oauth/jwks",
  "end_session_endpoint": "https://auth.example.com/api/oauth/logout",
  "scopes_supported": ["openid", "profile", "email", "offline_access"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "code_challenge_methods_supported": ["S256", "plain"]
}
```

---

## Authorization Endpoint

### GET /oauth/authorize

Start OAuth authorization flow.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `client_id` | string | Yes | Application client ID |
| `redirect_uri` | string | Yes | Must match registered URI |
| `response_type` | string | Yes | Must be `code` |
| `scope` | string | No | Space-separated scopes |
| `state` | string | Recommended | CSRF protection token |
| `nonce` | string | No* | ID token replay protection |
| `code_challenge` | string | Yes** | PKCE challenge |
| `code_challenge_method` | string | Yes** | `S256` or `plain` |
| `tenant` | string | No | Tenant slug or subdomain |

*Required when requesting `openid` scope for ID token.
**Required for SPA (public) clients.

**Example:**

```
GET /oauth/authorize?
  client_id=your-client-id&
  redirect_uri=https://app.example.com/callback&
  response_type=code&
  scope=openid+profile+email+offline_access&
  state=abc123&
  nonce=xyz789&
  code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
  code_challenge_method=S256&
  tenant=acme-corp
```

**Success Response:**

Redirects to `redirect_uri` with:
```
https://app.example.com/callback?
  code=authorization-code&
  state=abc123
```

**Error Response:**

Redirects to `redirect_uri` with:
```
https://app.example.com/callback?
  error=access_denied&
  error_description=User+denied+consent&
  state=abc123
```

---

## Token Endpoint

### POST /api/oauth/token

Exchange authorization code for tokens.

**Content-Type:** `application/x-www-form-urlencoded`

### Authorization Code Grant

**Request:**

```
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=authorization-code&
redirect_uri=https://app.example.com/callback&
client_id=your-client-id&
code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `grant_type` | string | Yes | `authorization_code` |
| `code` | string | Yes | Auth code from authorize |
| `redirect_uri` | string | Yes | Same as authorize request |
| `client_id` | string | Yes | Application client ID |
| `code_verifier` | string | Yes* | PKCE verifier |
| `client_secret` | string | Yes** | For confidential clients |

*Required if `code_challenge` was sent.
**Required for MACHINE type clients.

### Refresh Token Grant

**Request:**

```
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=eyJ...&
client_id=your-client-id
```

### Client Credentials Grant

For MACHINE type clients only.

**Request:**

```
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
client_id=your-client-id&
client_secret=your-client-secret&
scope=api:read+api:write
```

### Token Response

**Success (200 OK):**

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJ...",
  "id_token": "eyJ...",
  "scope": "openid profile email offline_access"
}
```

| Field | Description |
|-------|-------------|
| `access_token` | JWT for API access |
| `token_type` | Always `Bearer` |
| `expires_in` | Seconds until access token expires |
| `refresh_token` | Token for getting new access tokens |
| `id_token` | JWT with user identity (if `openid` scope) |
| `scope` | Granted scopes |

**Error (400 Bad Request):**

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code expired"
}
```

---

## UserInfo Endpoint

### GET /api/oauth/userinfo

Get user profile information.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response:**

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "email_verified": true,
  "name": "Jane Smith",
  "given_name": "Jane",
  "family_name": "Smith",
  "picture": "https://...",
  "locale": "en-US",
  "zoneinfo": "America/Los_Angeles"
}
```

Claims returned depend on requested scopes:
- `profile`: name, picture, locale, etc.
- `email`: email, email_verified

---

## JWKS Endpoint

### GET /api/oauth/jwks

Get JSON Web Key Set for verifying tokens.

**Response:**

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-id",
      "use": "sig",
      "alg": "RS256",
      "n": "0vx7agoebGcQSuuPiLJXZptN...",
      "e": "AQAB"
    }
  ]
}
```

---

## Logout Endpoint

### GET/POST /api/oauth/logout

End session and revoke tokens.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id_token_hint` | string | No | ID token for user identification |
| `post_logout_redirect_uri` | string | No | Where to redirect after |
| `state` | string | No | Passed to redirect |

**Example:**

```
GET /api/oauth/logout?
  id_token_hint=eyJ...&
  post_logout_redirect_uri=https://app.example.com&
  state=abc123
```

**Response:**

Redirects to `post_logout_redirect_uri` if provided and valid, otherwise shows logout confirmation page.

---

## Revoke Token

### POST /api/oauth/revoke

Revoke a refresh token.

**Request:**

```
POST /api/oauth/revoke
Content-Type: application/x-www-form-urlencoded

token=eyJ...&
token_type_hint=refresh_token&
client_id=your-client-id
```

**Response (200 OK):**

```json
{
  "success": true
}
```

Always returns 200 (even if token was already invalid) per RFC 7009.

---

## Introspect Token

### POST /api/oauth/introspect

Check if token is valid (for resource servers).

**Request:**

```
POST /api/oauth/introspect
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <client_credentials>

token=eyJ...
```

**Response (Active):**

```json
{
  "active": true,
  "sub": "user-uuid",
  "client_id": "client-id",
  "scope": "openid profile email",
  "exp": 1705320000,
  "iat": 1705316400
}
```

**Response (Inactive):**

```json
{
  "active": false
}
```

---

## Scopes

| Scope | Description | Claims Added |
|-------|-------------|--------------|
| `openid` | Required for OIDC | `sub` |
| `profile` | User profile info | `name`, `family_name`, `given_name`, `picture`, etc. |
| `email` | User email | `email`, `email_verified` |
| `offline_access` | Get refresh token | None (enables refresh_token) |

---

## SDK Examples

The `@authvital/sdk` handles PKCE, state management, and token exchange automatically:

```bash
npm install @authvital/sdk
```

### Authorization Code Flow with PKCE

```typescript
import {
  generatePKCE,
  buildAuthorizeUrl,
  generateState,
} from '@authvital/sdk/server';

// === SERVER-SIDE (Express/Node.js) ===

// Step 1: Generate PKCE and state
app.get('/auth/login', (req, res) => {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();

  // Store in server-side session (Express session, Redis, etc.)
  req.session.pkce_verifier = codeVerifier;
  req.session.oauth_state = state;

  // Build and redirect to authorization URL
  const authorizeUrl = buildAuthorizeUrl({
    authVitalHost: 'https://auth.example.com',
    clientId: 'your-client-id',
    redirectUri: 'https://app.example.com/callback',
    codeChallenge,
    codeChallengeMethod: 'S256',
    scope: 'openid profile email offline_access',
    state,
  });

  res.redirect(authorizeUrl);
});

// === BROWSER-SIDE (SPA) ===
// If building a pure SPA without a backend session:

// Store in sessionStorage (cleared on tab close - more secure than localStorage)
sessionStorage.setItem('pkce_verifier', codeVerifier);
sessionStorage.setItem('oauth_state', state);

// Redirect to authorize URL
window.location.href = authorizeUrl;
```

### Handle Callback and Exchange Code

```typescript
import { exchangeCodeForTokens } from '@authvital/sdk/server';

// In your callback handler
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  // Verify state matches (CSRF protection)
  if (state !== req.session.oauth_state) {
    return res.status(400).json({ error: 'State mismatch' });
  }

  // Exchange code for tokens (SDK handles PKCE automatically)
  const tokens = await exchangeCodeForTokens({
    authVitalHost: process.env.AUTHVITAL_HOST!,
    clientId: process.env.AUTHVITAL_CLIENT_ID!,
    code: code as string,
    codeVerifier: req.session.pkce_verifier,
    redirectUri: 'https://app.example.com/callback',
  });

  // Set httpOnly cookie and redirect
  res.cookie('access_token', tokens.access_token, { httpOnly: true, secure: true });
  res.redirect('/dashboard');
});
```

### Token Refresh

```typescript
import { refreshAccessToken } from '@authvital/sdk/server';

const newTokens = await refreshAccessToken({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  refreshToken: storedRefreshToken,
});

// Important: Store the new refresh token (AuthVital rotates them)
storeRefreshToken(newTokens.refresh_token);
```

### Client Credentials (M2M)

```typescript
import { createAuthVital } from '@authvital/sdk/server';

// The SDK handles client_credentials automatically for M2M calls
const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
});

// For user-context operations, pass the request (JWT is extracted automatically):
const members = await authvital.memberships.listForTenant(req);

// For admin/M2M operations without user context, use the admin namespace:
const settings = await authvital.admin.getInstanceSettings();

// Or for tenant-specific M2M operations, use the licenses admin methods:
const overview = await authvital.licenses.getTenantOverview('tenant-123');
```

---

## Related Documentation

- [OAuth Flow Concepts](../concepts/oauth-flow.md)
- [JWT Claims Reference](../reference/jwt-claims.md)
- [Authentication API](./authentication.md)
