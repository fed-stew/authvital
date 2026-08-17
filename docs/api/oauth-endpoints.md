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
  "token_endpoint": "https://auth.example.com/oauth/token",
  "userinfo_endpoint": "https://auth.example.com/oauth/userinfo",
  "jwks_uri": "https://auth.example.com/.well-known/jwks.json",
  "revocation_endpoint": "https://auth.example.com/oauth/revoke",
  "introspection_endpoint": "https://auth.example.com/oauth/introspect",
  "end_session_endpoint": "https://auth.example.com/oauth/logout",
  "check_session_iframe": "https://auth.example.com/oauth/check-session",
  "scopes_supported": ["openid", "profile", "email", "offline_access"],
  "response_types_supported": ["code"],
  "response_modes_supported": ["query"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "code_challenge_methods_supported": ["S256"]
}
```

!!! note "Endpoint paths are NOT under `/api`"
    OAuth endpoints live at `/oauth/*` and discovery at `/.well-known/*` — the
    backend explicitly **excludes** these from its global `/api` prefix
    (`main.ts`). Only `S256` PKCE is supported (no `plain`), and public clients
    authenticate with PKCE (there is no `none` auth method advertised).

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

### POST /oauth/token

Exchange authorization code for tokens.

**Content-Type:** `application/x-www-form-urlencoded`

### Authorization Code Grant

**Request:**

```
POST /oauth/token
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
**Required for a MACHINE credential.

!!! note "Which credential handles which grant"
    `authorization_code` (+ PKCE) is served by an app's **SPA credential**;
    `client_credentials` is served by its **MACHINE credential**. A single App
    (container) may hold both — a BFF holds a SPA credential for user login and a
    MACHINE credential for server-to-server. See
    [Data Models: ApplicationClient](../reference/data-models.md#applicationclient-credential).

### Refresh Token Grant

**Request:**

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=eyJ...&
client_id=your-client-id
```

### Client Credentials Grant

For a **MACHINE credential** only (not a SPA credential).

**Request:**

```
POST /oauth/token
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

### GET /oauth/userinfo

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

### GET /.well-known/jwks.json

Get the JSON Web Key Set (RSA public keys) for verifying tokens.

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

### GET/POST /oauth/logout

End session and revoke tokens.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id_token_hint` | string | No | ID token for user identification |
| `post_logout_redirect_uri` | string | No | Where to redirect after |
| `state` | string | No | Passed to redirect |

**Example:**

```
GET /oauth/logout?
  id_token_hint=eyJ...&
  post_logout_redirect_uri=https://app.example.com&
  state=abc123
```

**Response:**

Redirects to `post_logout_redirect_uri` if provided and valid, otherwise shows logout confirmation page.

---

## Revoke Token

### POST /oauth/revoke

Revoke a refresh token.

**Request:**

```
POST /oauth/revoke
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

### POST /oauth/introspect

Check if token is valid (for resource servers).

**Request:**

```
POST /oauth/introspect
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

## Using the SDK

The real server SDK (`@authvital/server`) wraps this flow with the **`OAuthFlow`**
class — it generates PKCE + state, builds the authorize URL, and exchanges the
code. (There are no `generatePKCE` / `buildAuthorizeUrl` / `exchangeCodeForTokens`
/ `refreshAccessToken` / `createAuthVital` free functions.)

```bash
npm install @authvital/server
```

### Authorization Code + PKCE (Express)

```typescript
import { OAuthFlow } from '@authvital/server';

const flow = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  redirectUri: 'https://app.example.com/callback',
  // clientSecret is optional — omit it for public (PKCE) clients
});

// Step 1: start the flow
app.get('/auth/login', (req, res) => {
  const { authorizeUrl, state, codeVerifier } = flow.startFlow({
    // appState is round-tripped back to you on callback
    appState: { returnTo: '/dashboard' },
  });
  req.session.oauth_state = state;
  req.session.pkce_verifier = codeVerifier;
  res.redirect(authorizeUrl);
});

// Step 2: handle the callback
app.get('/callback', async (req, res) => {
  const { tokens, appState } = await flow.handleCallback(
    String(req.query.code),
    String(req.query.state),
    req.session.oauth_state,      // expected state (CSRF check)
    req.session.pkce_verifier,    // PKCE verifier
  );
  res.cookie('access_token', tokens.access_token, { httpOnly: true, secure: true });
  res.redirect(appState?.returnTo ?? '/dashboard');
});
```

### Token refresh

```typescript
const newTokens = await flow.refreshTokens(storedRefreshToken);
// AuthVital rotates refresh tokens — persist the new one:
storeRefreshToken(newTokens.refresh_token);
```

### Client Credentials (M2M)

Use `createServerClient` — its `.integration.*` methods obtain and cache an M2M
token automatically (there is no `authvital.memberships`/`admin`/`licenses`
fluent namespace):

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

const { memberships } = await client.integration.listTenantMembers({ tenantId: 'tenant-123' });
```

See [Server SDK: OAuth Flow](../sdk/server-sdk/oauth-flow.md) and the
[integration namespace overview](../sdk/server-sdk/namespaces/overview.md).

### Integration API authorization (deny-by-default)

The Integration API (`/api/integration/*`) is exclusively M2M
(`client_credentials`) and is **deny-by-default**. A valid M2M token is
*necessary but not sufficient* — every request must **also** (a) carry the
required scope and (b) be authorized for the tenant it targets.

> **These settings live on the MACHINE credential of an app.**
> `m2mTrustedAllTenants`, `m2mTenantGrants`, and the allowed scopes are
> properties of the app's **MACHINE credential** (`ApplicationClient`), not the
> App container and not any sibling SPA credential. The SPA credential of the
> same app (used for `authorization_code` + PKCE login) is unaffected by M2M
> authorization.

!!! warning "Breaking change — existing MACHINE clients are denied until configured"
    After upgrading and running the DB migration, **all existing MACHINE clients
    are deny-by-default**. Until a client is given `allowed_scopes` **and**
    either "trusted for all tenants" or explicit per-tenant grants, it will
    receive empty-scope tokens and `403` on every integration call. The old
    implicit `system:admin` default is **gone**. The bundled `examples`
    `backend-api` client is seeded with `m2m_trusted_all_tenants: true` and
    `allowed_scopes: [integration:read, integration:write]`, so the Web BFF keeps
    working after `make fresh`.

#### Scope enforcement

The token endpoint now validates the requested `scope` against the
application's configured **Allowed Scopes**:

- Requesting a scope **not** in the allow-list → `400 invalid_scope`.
- Requesting **no** scope → the token receives the app's **full** allowed-scope
  set. (The SDK's `client.integration.*` requests no explicit scope, so it
  automatically receives the app's allowed scopes.)

Two scopes gate the integration endpoints:

| Scope | Grants access to |
|-------|------------------|
| `integration:read` | All read endpoints, plus permission / feature / seat checks |
| `integration:write` | Mutations: invite, revoke/resend invitation, grant/revoke/change-license, set-member-role |

#### Tenant authorization

Each integration endpoint checks that the client is authorized for the tenant it
targets. Authorization is granted two ways on a **MACHINE credential**:

- **Trusted for all tenants** (`m2mTrustedAllTenants`) — for first-party
  operator backends; grants access to *every* tenant.
- **Explicit per-tenant grants** (`m2mTenantGrants`) — the client may only act
  on the listed tenants.

Special cases:

- **Cross-tenant endpoints** that target no single tenant — `user-tenants`,
  `user-mfa-status`, and `application-memberships` (without a `tenantId`) —
  **require "trusted for all tenants"**.
- **Tenant-agnostic endpoints** — `roles/:clientId`, `tenant-roles` — require
  only the scope (no tenant authorization).

#### Possible errors

| Status | Error | Meaning |
|--------|-------|---------|
| `400` | `invalid_scope: ...` | Requested a scope outside the app's Allowed Scopes |
| `403` | `insufficient_scope: requires [...]` | Token lacks the scope the endpoint needs |
| `403` | `M2M client is not authorized for tenant '<id>'` | No trusted-all and no grant for that tenant |
| `403` | `M2M client is not authorized for cross-tenant access` | Cross-tenant endpoint without trusted-all |

Configure all of the above per application — see
[Application Setup: M2M Authorization](../admin/application-setup.md#m2m-authorization-machine-credentials).

---

## Related Documentation

- [OAuth Flow Concepts](../concepts/oauth-flow.md)
- [JWT Claims Reference](../reference/jwt-claims.md)
- [Authentication API](./authentication.md)
