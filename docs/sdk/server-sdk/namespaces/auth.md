# Auth (login & account flows)

> How authentication actually works with the `@authvital/server` SDK.

!!! info "There is no `authvital.auth.*` namespace"
    Earlier drafts described `createAuthVital(...).auth.register()`, `.login()`,
    `.verifyEmail()`, `.forgotPassword()`, etc. **The server SDK does not expose
    password-authentication methods.** AuthVital is an OAuth 2.0 / OIDC identity
    provider: your app never handles the user's password. Instead you redirect the
    user to AuthVital and complete an **Authorization Code + PKCE** flow with the
    real primitive: [`OAuthFlow`](../oauth-flow.md).

    The username/password, email-verification and password-reset **REST
    endpoints do exist** on the backend (they power AuthVital's own hosted login
    UI) and are documented under [API Reference → Authentication](../../../api/authentication.md).
    They are not wrapped by the SDK.

## The real login flow: `OAuthFlow`

```typescript
import { OAuthFlow } from '@authvital/server';

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  // clientSecret is OPTIONAL — omit it for public/PKCE clients
  redirectUri: 'https://app.example.com/auth/callback',
  scope: 'openid profile email',
});

// 1. Kick off login — store state + codeVerifier, redirect to authorizeUrl
app.get('/api/auth/login', async (_req, res) => {
  const { authorizeUrl, state, codeVerifier } = await oauth.startFlow({ appState: '/' });
  // Persist { state, codeVerifier } in a short-lived, encrypted, httpOnly cookie.
  res.setHeader('Set-Cookie', serializeFlowCookie({ state, codeVerifier }));
  res.redirect(authorizeUrl);
});

// 2. Handle the callback — verify state, exchange the code for tokens
app.get('/api/auth/callback', async (req, res) => {
  const flow = readFlowCookie(req.headers.cookie); // { state, codeVerifier }
  const tokens = await oauth.handleCallback(
    String(req.query.code),
    String(req.query.state),
    flow.state,
    flow.codeVerifier,
  );
  // tokens = { access_token, refresh_token?, expires_in, id_token?, appState? }
  // Store them in an encrypted session cookie (see the Sessions page).
  res.redirect(tokens.appState || '/');
});
```

`OAuthFlow` methods (verified against `packages/sdk-server/src/oauth/oauth-flow.ts`):

| Method | Signature | Returns |
|--------|-----------|---------|
| `startFlow` | `({ appState? })` | `{ authorizeUrl, state, codeVerifier }` |
| `handleCallback` | `(code, state, expectedState, codeVerifier)` | `{ access_token, refresh_token?, expires_in, id_token?, token_type?, appState? }` |
| `refreshTokens` | `(refreshToken)` | `{ access_token, refresh_token?, expires_in, ... }` |

## Logout

Revoke the token (RFC 7009) and clear the session cookie:

```typescript
const client = createServerClient(
  { authVitalHost: process.env.AV_HOST!, clientId: process.env.AV_CLIENT_ID!, clientSecret: '' },
  tokens,
);
await client.revokeToken();               // best-effort revoke at the IdP
res.setHeader('Set-Cookie', sessionStore.createClearCookieHeader());
```

## Reading the current user

Once you have a session, use the user-scoped convenience method:

```typescript
const user = await client.getCurrentUser(); // GET /api/users/me -> User | null
```

## See also

- [OAuth Flow](../oauth-flow.md) — full PKCE reference
- [Integration API (overview)](./overview.md) — server-to-server (M2M) methods
- [API Reference → Authentication](../../../api/authentication.md) — the raw REST endpoints
- Working example: `examples/bff-express` (public PKCE client, no secret)
