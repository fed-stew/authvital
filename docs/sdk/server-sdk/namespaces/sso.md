# SSO

> Single Sign-On is handled by AuthVital — not by the server SDK.

!!! info "There is no `authvital.sso.*` namespace"
    Earlier drafts described `authvital.sso.getAvailableProviders()`,
    `.getLinkedAccounts()`, `.initiateLink()`, `.unlink()`, `.getLoginUrl()`,
    etc. **The `@authvital/server` SDK exposes none of these.**

    Enterprise SSO (Google, Microsoft, and tenant-level SSO enforcement) is
    implemented entirely inside AuthVital. Because your app authenticates users
    via the standard OAuth/OIDC redirect ([`OAuthFlow`](../oauth-flow.md)), SSO
    "just works": if a tenant enforces SSO, AuthVital performs the upstream IdP
    handshake during the authorize step and your app still only ever receives
    standard tokens at its `redirectUri`. There is nothing SSO-specific for your
    integration to call.

## What you actually do

Nothing SSO-specific. Run the normal login flow:

```typescript
import { OAuthFlow } from '@authvital/server';

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  redirectUri: 'https://app.example.com/auth/callback',
});

const { authorizeUrl } = await oauth.startFlow();
// Redirect the user; AuthVital decides whether to show password, SSO, or both.
```

## Managing SSO configuration

Configuring providers, enforcement and account linking is done by administrators
in AuthVital (and its backend REST endpoints), documented under:

- [Security → SSO](../../../security/sso.md)
- [Administration → Tenant Admin](../../../admin/tenant-admin.md)

These are administrative surfaces, not SDK methods.

## See also

- [OAuth Flow](../oauth-flow.md) · [Auth](./auth.md)
