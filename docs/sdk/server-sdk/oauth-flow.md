# OAuth Flow

> Server-side OAuth 2.0 PKCE via `OAuthFlow`, plus URL/PKCE/state helpers.

!!! warning "Import locations & non-existent helpers"
    - `OAuthFlow` is exported from **`@authvital/server`**.
    - The URL builders (`getLoginUrl`, `getSignupUrl`, …), PKCE utilities
      (`generatePKCE`, `buildAuthorizeUrl`, `buildTokenUrl`), and state helpers
      (`encodeState`, `decodeState`, …) live in **`@authvital/core`** (or
      `@authvital/core/oauth`) — they are **not** re-exported from
      `@authvital/server`.
    - There are **no** standalone `exchangeCodeForTokens()` or
      `refreshAccessToken()` functions. Use `OAuthFlow.handleCallback()` and
      `OAuthFlow.refreshTokens()`.

## OAuthFlow class (recommended)

Complete server-side authorization-code + PKCE flow.

```typescript
import { OAuthFlow } from '@authvital/server';

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET, // optional — omit for PUBLIC/PKCE clients
  redirectUri: 'https://myapp.com/api/auth/callback',
  scope: 'openid profile email',              // optional (this is the default)
});
```

### startFlow()

`async` — returns `{ authorizeUrl, state, codeVerifier }`. Store `state` and
`codeVerifier` (e.g. in httpOnly cookies) for the callback.

```typescript
app.get('/api/auth/login', async (req, res) => {
  const { authorizeUrl, state, codeVerifier } = await oauth.startFlow({
    appState: req.query.returnTo as string, // preserved through the flow
  });

  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;

  res.redirect(authorizeUrl);
});
```

### handleCallback()

Verifies `state` and exchanges the code for tokens. Signature:
`handleCallback(code, state, expectedState, codeVerifier)`.

```typescript
app.get('/api/auth/callback', async (req, res) => {
  const tokens = await oauth.handleCallback(
    req.query.code as string,
    req.query.state as string,
    req.session.oauthState!,
    req.session.codeVerifier!,
  );
  // tokens: { access_token, refresh_token?, expires_in, id_token?, token_type?, appState? }
  res.redirect(tokens.appState || '/dashboard');
});
```

### refreshTokens()

```typescript
const newTokens = await oauth.refreshTokens(refreshToken);
```

## URL builders (`@authvital/core`)

For landing pages, emails, or simple redirects (no PKCE ceremony):

```typescript
import {
  getLoginUrl,
  getSignupUrl,
  getLogoutUrl,
  getInviteAcceptUrl,
  getPasswordResetUrl,
  getAccountSettingsUrl,
} from '@authvital/core';

const loginUrl = getLoginUrl({
  authVitalHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  redirectUri: 'https://app.myapp.com/dashboard',
});

const logoutUrl = getLogoutUrl({
  authVitalHost: 'https://auth.myapp.com',
  postLogoutRedirectUri: 'https://myapp.com',
});

// getAccountSettingsUrl takes the host string directly.
// /account/settings is a real hosted-console route (verified in App.tsx).
const settingsUrl = getAccountSettingsUrl('https://auth.myapp.com');
```

## Hosted-console deep-links (`@authvital/core`)

AuthVital is **hosted-first**: the console at `/tenant/:tenantId/*` is the
canonical place your customers manage users, app access, SSO, domains, billing
and audit. Your app handles auth + gating and **deep-links into the console**
for management — never hand-assemble these paths. Use the verified helpers
(each maps to a real route in `packages/frontend/src/App.tsx`):

```typescript
import {
  getManagementUrls,
  getManagementUrl,
  getOverviewUrl,
  getMembersUrl,
  getApplicationsUrl,
  getApplicationUsersUrl,
  getAccessMatrixUrl,
  getLicensesUrl,
  getBillingUrl,
  getAuditUrl,
  getSsoUrl,
  getDomainsUrl,
  getSettingsUrl,
  getAppPickerUrl,
  getOrgPickerUrl,
  getAccountSettingsUrl,
} from '@authvital/core';

// Build them all at once:
const urls = getManagementUrls({ authVitalHost: 'https://auth.myapp.com', tenantId: 't_123' });
// urls.members -> https://auth.myapp.com/tenant/t_123/members
```

| Helper | Route |
|--------|-------|
| `getManagementUrl` / `getManagementUrls(...).root` | `/tenant/:tenantId` (→ overview) |
| `getOverviewUrl` | `/tenant/:tenantId/overview` |
| `getMembersUrl` | `/tenant/:tenantId/members` |
| `getApplicationsUrl` | `/tenant/:tenantId/applications` |
| `getApplicationUsersUrl` | `/tenant/:tenantId/applications/:appId` |
| `getAccessMatrixUrl` | `/tenant/:tenantId/access-matrix` |
| `getLicensesUrl` | `/tenant/:tenantId/licenses` |
| `getBillingUrl` | `/tenant/:tenantId/billing` |
| `getAuditUrl` | `/tenant/:tenantId/audit` |
| `getSsoUrl` | `/tenant/:tenantId/sso` |
| `getDomainsUrl` | `/tenant/:tenantId/domains` |
| `getSettingsUrl` | `/tenant/:tenantId/general` (tenant settings) |
| `getAppPickerUrl(host, { tenant?, tenantName? })` | `/auth/app-picker` (switch app) |
| `getOrgPickerUrl(host, { clientId?, redirectUri? })` | `/auth/org-picker` (switch org) |
| `getAccountSettingsUrl(host)` | `/account/settings` (per-user account) |

> `getManagementUrls(...)` returns `{ root, overview, members, applications,
> accessMatrix, licenses, billing, audit, sso, domains, settings }`.

## State helpers (`@authvital/core`)

```typescript
import { encodeState, decodeState } from '@authvital/core';

const state = encodeState(csrfNonce, '/dashboard?tab=settings');
const payload = decodeState(state); // { csrf, appState } | null
```

For stateless PKCE (carry the verifier inside the state):

```typescript
import { encodeStateWithVerifier, decodeStateWithVerifier } from '@authvital/core';

// NOTE: two args only — (csrf, codeVerifier). No appState/encryption params.
const state = encodeStateWithVerifier(csrf, codeVerifier);
const decoded = decodeStateWithVerifier(state); // { csrf, codeVerifier } | null
```

## Low-level PKCE utilities (`@authvital/core`)

```typescript
import { generatePKCE, buildAuthorizeUrl, buildTokenUrl } from '@authvital/core';

const { codeVerifier, codeChallenge } = await generatePKCE();

const authorizeUrl = buildAuthorizeUrl({
  authVitalHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  redirectUri: 'https://yourapp.com/callback',
  codeChallenge,
  state: 'random-state',
  scope: 'openid profile email',
});
```

To exchange the code yourself, POST to `buildTokenUrl(authVitalHost)` with
`grant_type=authorization_code`, `code`, `code_verifier`, `client_id`,
`redirect_uri` (and `client_secret` for confidential clients) — or just use
`OAuthFlow.handleCallback()`, which does exactly this.

## Complete example: Express OAuth routes

```typescript
import { OAuthFlow } from '@authvital/server';
import { getLogoutUrl } from '@authvital/core';
import express from 'express';
import session from 'express-session';

const app = express();
app.use(session({ /* config */ }));

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET,
  redirectUri: `${process.env.APP_URL}/api/auth/callback`,
});

app.get('/api/auth/login', async (req, res) => {
  const { authorizeUrl, state, codeVerifier } = await oauth.startFlow({
    appState: req.query.returnTo as string,
  });
  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;
  res.redirect(authorizeUrl);
});

app.get('/api/auth/callback', async (req, res) => {
  try {
    const tokens = await oauth.handleCallback(
      req.query.code as string,
      req.query.state as string,
      req.session.oauthState!,
      req.session.codeVerifier!,
    );
    delete req.session.oauthState;
    delete req.session.codeVerifier;

    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokens.expires_in * 1000,
    });
    res.redirect(tokens.appState || '/dashboard');
  } catch (error) {
    res.redirect('/login?error=auth_failed');
  }
});

app.get('/api/auth/logout', (req, res) => {
  res.clearCookie('access_token');
  const logoutUrl = getLogoutUrl({
    authVitalHost: process.env.AV_HOST!,
    postLogoutRedirectUri: process.env.APP_URL!,
  });
  res.redirect(logoutUrl);
});
```

!!! tip "Higher-level option"
    If you'd rather not hand-roll cookie storage, use the
    [session middleware](./middleware.md) (`authVitalMiddleware` /
    `createSessionStore`), which manages encrypted session cookies and refresh
    for you.
