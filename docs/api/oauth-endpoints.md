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

## Code Examples

### Authorization Code Flow with PKCE (JavaScript)

```javascript
// Step 1: Generate PKCE
function generatePKCE() {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return { verifier, challenge };
}

// Step 2: Redirect to authorize
const { verifier, challenge } = await generatePKCE();
sessionStorage.setItem('pkce_verifier', verifier);
sessionStorage.setItem('oauth_state', state);

const authorizeUrl = new URL('https://auth.example.com/oauth/authorize');
authorizeUrl.searchParams.set('client_id', CLIENT_ID);
authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authorizeUrl.searchParams.set('response_type', 'code');
authorizeUrl.searchParams.set('scope', 'openid profile email offline_access');
authorizeUrl.searchParams.set('state', state);
authorizeUrl.searchParams.set('code_challenge', challenge);
authorizeUrl.searchParams.set('code_challenge_method', 'S256');

window.location.href = authorizeUrl.toString();

// Step 3: Handle callback
const params = new URLSearchParams(window.location.search);
const code = params.get('code');
const returnedState = params.get('state');

if (returnedState !== sessionStorage.getItem('oauth_state')) {
  throw new Error('State mismatch');
}

// Step 4: Exchange code for tokens
const response = await fetch('https://auth.example.com/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: sessionStorage.getItem('pkce_verifier'),
  }),
});

const tokens = await response.json();
// { access_token, refresh_token, id_token, expires_in }
```

### cURL Examples

```bash
# Exchange code for tokens
curl -X POST https://auth.example.com/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=auth-code" \
  -d "redirect_uri=https://app.example.com/callback" \
  -d "client_id=your-client-id" \
  -d "code_verifier=your-verifier"

# Refresh tokens
curl -X POST https://auth.example.com/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=eyJ..." \
  -d "client_id=your-client-id"

# Client credentials (machine-to-machine)
curl -X POST https://auth.example.com/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=your-client-id" \
  -d "client_secret=your-secret" \
  -d "scope=api:read"
```

---

## Related Documentation

- [OAuth Flow Concepts](../concepts/oauth-flow.md)
- [JWT Claims Reference](../reference/jwt-claims.md)
- [Authentication API](./authentication.md)
