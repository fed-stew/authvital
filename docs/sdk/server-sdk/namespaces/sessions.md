# Sessions

> How the server SDK models sessions — and what it does *not* do.

!!! info "There is no `authvital.sessions.*` device-management namespace"
    Earlier drafts described `authvital.sessions.list()`, `.revoke()`,
    `.revokeAll()`, `.logout()` for building "manage my devices" screens. **The
    server SDK does not expose a user session inventory.** What it *does* provide
    is: an encrypted session-cookie store for your own app, and OAuth token
    revocation/introspection.

## Your app's session = an encrypted cookie

The SDK's `SessionStore` encrypts the OAuth tokens (AES-256-GCM) into an httpOnly
cookie. You create it at login and validate it on each request.

```typescript
import { createSessionStore } from '@authvital/server';

const sessionStore = createSessionStore({
  secret: process.env.SESSION_SECRET!,       // >= 32 chars
  authVitalHost: process.env.AV_HOST!,
  isProduction: true,
  cookie: { name: 'app_session', sameSite: 'lax', httpOnly: true },
});

// Create on login (after OAuthFlow.handleCallback):
const session = sessionStore.createSession({
  access_token, refresh_token, expires_in, token_type: 'Bearer',
});
res.setHeader('Set-Cookie', session.setCookieHeader);

// Validate on each request:
const result = sessionStore.validateSession(req.headers.cookie);
if (result.valid && result.session) {
  const tokens = result.session.tokens; // SessionTokens
}

// Clear on logout:
res.setHeader('Set-Cookie', sessionStore.createClearCookieHeader());
```

## Revoking & introspecting tokens

On the `ServerClient` (RFC 7009 / RFC 7662):

```typescript
await client.revokeToken();                       // revoke current access token
await client.revokeToken(refreshToken, 'refresh_token');

const info = await client.introspectToken();      // { active, sub, exp, ... }
```

| Method | Params | Returns |
|--------|--------|---------|
| `client.revokeToken` | `(token?, hint?)` | `boolean` |
| `client.introspectToken` | `(token?)` | `IntrospectionResponse` |

## Listing / revoking a user's *other* sessions

The SDK has no method for this. Session/device management is an
AuthVital-account concern; direct users to AuthVital's hosted account UI, or call
the backend directly if a corresponding REST endpoint is available for your
deployment.

## See also

- [Middleware](../middleware.md) — `authVitalMiddleware` wires the session store into Express
- [Auth](./auth.md) · [Integration API (overview)](./overview.md)
