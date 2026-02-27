# SSO Namespace

> Single Sign-On operations for users (linking/unlinking accounts).

## Overview

The SSO namespace provides user-facing SSO methods for discovering providers, linking accounts, and initiating SSO login.

!!! info "SSO vs Tenants SSO"
    - **SSO namespace**: User account linking, provider discovery
    - **Tenants namespace**: Tenant-level SSO configuration (admin)

```typescript
const sso = authvital.sso;
```

---

## Provider Discovery

### getAvailableProviders()

Get available SSO providers for the instance. Use for login page buttons.

```typescript
const providers = await authvital.sso.getAvailableProviders();

// [{ provider: 'GOOGLE', enabled: true, name: 'Google' }, ...]
```

---

### getProvidersForTenant()

Get SSO providers available for a specific tenant.

```typescript
const providers = await authvital.sso.getProvidersForTenant('acme-corp');

providers.forEach(p => {
  console.log(p.provider, p.enforced ? '(required)' : '(optional)');
});
```

---

## Account Linking

### getLinkedAccounts()

Get SSO accounts linked to the current user.

```typescript
const links = await authvital.sso.getLinkedAccounts(request);

links.forEach(link => {
  console.log(`${link.provider}: ${link.email}`);
  // GOOGLE: user@gmail.com
});
```

**Return Type:**

```typescript
interface SsoLink {
  provider: 'GOOGLE' | 'MICROSOFT';
  email: string;
  displayName: string;
  avatarUrl?: string;
  linkedAt: string;
  lastUsedAt?: string;
}
```

---

### initiateLink()

Start linking an SSO provider to the current user's account.

```typescript
const { url } = await authvital.sso.initiateLink(request, {
  provider: 'GOOGLE',
  redirectUri: 'https://app.example.com/settings/account',
});

// Redirect user to `url` to complete OAuth
```

---

### unlink()

Unlink an SSO provider from the current user's account.

!!! warning "Requires password"
    User must have a password set to unlink SSO providers.

```typescript
await authvital.sso.unlink(request, 'GOOGLE');
```

---

## SSO Login URLs

### getLoginUrl()

Get the SSO login URL for a provider. Use for "Login with Google/Microsoft" buttons.

```typescript
const url = authvital.sso.getLoginUrl('GOOGLE', {
  redirectUri: 'https://app.example.com/callback',
  state: crypto.randomUUID(), // Optional CSRF protection
  tenantSlug: 'acme-corp',    // Optional tenant hint
});

// Redirect user to url
```

---

## Complete Example

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// Get available SSO providers for login page
app.get('/api/sso/providers', async (req, res) => {
  const providers = await authvital.sso.getAvailableProviders();
  res.json(providers);
});

// Get user's linked SSO accounts
app.get('/api/me/sso', async (req, res) => {
  const links = await authvital.sso.getLinkedAccounts(req);
  res.json(links);
});

// Start linking an SSO provider
app.post('/api/me/sso/link', async (req, res) => {
  const { url } = await authvital.sso.initiateLink(req, {
    provider: req.body.provider,
    redirectUri: `${process.env.APP_URL}/settings/account`,
  });
  res.json({ url });
});

// Unlink an SSO provider
app.delete('/api/me/sso/:provider', async (req, res) => {
  await authvital.sso.unlink(req, req.params.provider as 'GOOGLE' | 'MICROSOFT');
  res.json({ success: true });
});

// SSO login button handler
app.get('/auth/sso/:provider', (req, res) => {
  const url = authvital.sso.getLoginUrl(
    req.params.provider.toUpperCase() as 'GOOGLE' | 'MICROSOFT',
    {
      redirectUri: `${process.env.APP_URL}/auth/callback`,
      state: req.query.state as string,
    }
  );
  res.redirect(url);
});
```
