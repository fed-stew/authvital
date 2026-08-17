# Users

> Reading the current user and a user's MFA status.

!!! info "There is no fluent `authvital.users.*` namespace"
    Earlier drafts described `authvital.users.updateCurrentUser()`,
    `.changePassword()`, `.getSessions()`, `.deleteAccount()`, etc. **The server
    SDK does not expose those methods.** Profile editing, password changes and
    account deletion are handled by AuthVital's hosted account UI and the backend
    REST API — not by the SDK.

    What the SDK **does** give you is:

    - `client.getCurrentUser()` — the signed-in user's profile
    - `client.integration.getUserMfaStatus({ userId })` — MFA status (M2M)

## Get the current user

`getCurrentUser()` lives directly on the `ServerClient` and uses the session's
user access token.

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient(
  { authVitalHost: process.env.AV_HOST!, clientId: process.env.AV_CLIENT_ID!, clientSecret: '' },
  tokens, // SessionTokens from the validated session cookie
);

const user = await client.getCurrentUser(); // GET /api/users/me -> User | null
if (!user) {
  return res.status(401).json({ error: 'Unauthorized' });
}
res.json(user);
```

Prefer reading identity attributes straight from the verified JWT claims when you
can — it avoids a network round-trip:

```typescript
import { verifyToken } from '@authvital/server';

const { valid, payload } = await verifyToken(tokens.accessToken, {
  jwksUri: `${process.env.AV_HOST}/.well-known/jwks.json`,
  issuer: process.env.AV_HOST,
  audience: process.env.AV_CLIENT_ID,
});
// payload.sub, payload.email, payload.given_name, ...
```

## Get a user's MFA status (M2M)

```typescript
const { enabled, methods } = await client.integration.getUserMfaStatus({
  userId: 'user-123',
});
```

| Method | Params | Returns |
|--------|--------|---------|
| `client.getCurrentUser()` | – | `User \| null` |
| `client.integration.getUserMfaStatus` | `{ userId }` | `{ enabled: boolean; methods?: string[] }` |

## Profile edits, password changes, account deletion

These are **not** part of the SDK. Options:

1. Send users to AuthVital's hosted account pages, or
2. Call the backend REST endpoints yourself with `client.get()/post()/patch()`
   (see [API Reference → User API](../../../api/user-api.md) for the real routes).

## See also

- [Auth](./auth.md) · [MFA](./mfa.md) · [Integration API (overview)](./overview.md)
