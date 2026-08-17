# MFA

> Reading a user's multi-factor authentication status from your backend.

!!! info "There is no `authvital.mfa.*` enrollment API in the SDK"
    Earlier drafts described `authvital.mfa.setup()`, `.verifySetup()`,
    `.verifyChallenge()`, `.useBackupCode()`, `.disable()`,
    `.regenerateBackupCodes()`, etc. **The server SDK ships none of these.**
    TOTP enrollment, challenge verification and backup-code management are part of
    AuthVital's authentication flow (hosted UI + backend), not something your
    integrating app drives through the SDK.

    The **one** MFA-related thing the SDK exposes is a read-only status check over
    the M2M integration API.

## Check a user's MFA status (M2M)

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

const status = await client.integration.getUserMfaStatus({ userId: 'user-123' });
// { enabled: boolean, methods?: string[] }
```

| Method | Params | Returns |
|--------|--------|---------|
| `client.integration.getUserMfaStatus` | `{ userId }` | `{ enabled: boolean; methods?: string[] }` |

MFA is also surfaced during authentication: a login that requires a second factor
is completed inside AuthVital's OAuth flow before your `redirectUri` is ever
called, so by the time you have tokens the factor has already been satisfied.

## See also

- [Security → MFA](../../../security/mfa.md) — how MFA works end-to-end
- [Integration API (overview)](./overview.md)
