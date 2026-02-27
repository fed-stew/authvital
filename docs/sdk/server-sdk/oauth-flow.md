# OAuth Flow

> PKCE utilities, URL builders, and token exchange helpers.

## Overview

The SDK provides comprehensive OAuth 2.0 utilities for implementing server-side authentication flows with PKCE.

---

## OAuthFlow Class (Recommended)

For complete server-side OAuth with PKCE:

```typescript
import { OAuthFlow } from '@authvital/sdk/server';

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  redirectUri: 'https://myapp.com/api/auth/callback',
});
```

### startFlow()

Start the OAuth authorization flow.

```typescript
app.get('/api/auth/login', (req, res) => {
  const { authorizeUrl, state, codeVerifier } = oauth.startFlow({
    appState: req.query.returnTo, // Optional - gets passed through OAuth
  });
  
  // Store for callback verification
  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;
  
  res.redirect(authorizeUrl);
});
```

### handleCallback()

Complete the OAuth flow by exchanging the authorization code for tokens.

```typescript
app.get('/api/auth/callback', async (req, res) => {
  const tokens = await oauth.handleCallback(
    req.query.code as string,
    req.query.state as string,
    req.session.oauthState,
    req.session.codeVerifier
  );
  
  // tokens includes: access_token, refresh_token, id_token, appState
  
  // Set cookies
  res.cookie('access_token', tokens.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  
  // Redirect to app state or dashboard
  res.redirect(tokens.appState || '/dashboard');
});
```

---

## URL Builders

For landing pages, emails, or simple redirects (no PKCE ceremony):

### getLoginUrl()

```typescript
import { getLoginUrl } from '@authvital/sdk/server';

const loginUrl = getLoginUrl({
  authVitalHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  redirectUri: 'https://app.myapp.com/dashboard',
  tenantHint: 'acme-corp', // Optional
});
```

### getSignupUrl()

```typescript
import { getSignupUrl } from '@authvital/sdk/server';

const signupUrl = getSignupUrl({
  authVitalHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  redirectUri: 'https://app.myapp.com/onboarding',
  email: 'user@example.com', // Optional - pre-fill
});
```

### getLogoutUrl()

```typescript
import { getLogoutUrl } from '@authvital/sdk/server';

const logoutUrl = getLogoutUrl({
  authVitalHost: 'https://auth.myapp.com',
  postLogoutRedirectUri: 'https://myapp.com',
});
```

### getInviteAcceptUrl()

```typescript
import { getInviteAcceptUrl } from '@authvital/sdk/server';

const inviteUrl = getInviteAcceptUrl({
  authVitalHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  inviteToken: 'abc123xyz',
});
```

### getPasswordResetUrl()

```typescript
import { getPasswordResetUrl } from '@authvital/sdk/server';

const resetUrl = getPasswordResetUrl({
  authVitalHost: 'https://auth.myapp.com',
  token: 'reset-token',
});
```

### getAccountSettingsUrl()

```typescript
import { getAccountSettingsUrl } from '@authvital/sdk/server';

const settingsUrl = getAccountSettingsUrl({
  authVitalHost: 'https://auth.myapp.com',
});
```

---

## State Management

### encodeState() / decodeState()

Encode CSRF token and app state into the OAuth state parameter:

```typescript
import { encodeState, decodeState } from '@authvital/sdk/server';

// Encode
const state = encodeState(csrfNonce, '/dashboard?tab=settings');

// Later, decode
const payload = decodeState(state);
// { csrf: 'abc123', appState: '/dashboard?tab=settings' }
```

### encodeStateWithVerifier() / decodeStateWithVerifier()

Include the PKCE code verifier in the state (for stateless auth):

```typescript
import { encodeStateWithVerifier, decodeStateWithVerifier } from '@authvital/sdk/server';

// Encode (with encryption)
const state = encodeStateWithVerifier(csrf, codeVerifier, appState, encryptionKey);

// Decode
const { csrf, codeVerifier, appState } = decodeStateWithVerifier(state, encryptionKey);
```

---

## Low-Level PKCE Utilities

For custom OAuth implementations:

### generatePKCE()

```typescript
import { generatePKCE } from '@authvital/sdk/server';

const { codeVerifier, codeChallenge } = await generatePKCE();
```

### buildAuthorizeUrl()

```typescript
import { buildAuthorizeUrl } from '@authvital/sdk/server';

const authorizeUrl = buildAuthorizeUrl({
  authVitalHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  redirectUri: 'https://yourapp.com/callback',
  codeChallenge,
  state: 'random-state',
});
```

### exchangeCodeForTokens()

```typescript
import { exchangeCodeForTokens } from '@authvital/sdk/server';

const tokens = await exchangeCodeForTokens({
  authVitalHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  code: 'authorization-code',
  codeVerifier,
  redirectUri: 'https://yourapp.com/callback',
});
```

### refreshAccessToken()

```typescript
import { refreshAccessToken } from '@authvital/sdk/server';

const newTokens = await refreshAccessToken({
  authVitalHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  refreshToken: 'current-refresh-token',
});
```

---

## Complete Example: Express OAuth Routes

```typescript
import { OAuthFlow, getLogoutUrl } from '@authvital/sdk/server';
import express from 'express';
import session from 'express-session';

const app = express();
app.use(session({ /* config */ }));

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  redirectUri: `${process.env.APP_URL}/api/auth/callback`,
});

// Start login
app.get('/api/auth/login', (req, res) => {
  const { authorizeUrl, state, codeVerifier } = oauth.startFlow({
    appState: req.query.returnTo as string,
  });
  
  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;
  
  res.redirect(authorizeUrl);
});

// OAuth callback
app.get('/api/auth/callback', async (req, res) => {
  try {
    const tokens = await oauth.handleCallback(
      req.query.code as string,
      req.query.state as string,
      req.session.oauthState!,
      req.session.codeVerifier!
    );
    
    // Clear session state
    delete req.session.oauthState;
    delete req.session.codeVerifier;
    
    // Set httpOnly cookies
    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokens.expires_in * 1000,
    });
    
    if (tokens.refresh_token) {
      res.cookie('refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    }
    
    res.redirect(tokens.appState || '/dashboard');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/login?error=auth_failed');
  }
});

// Logout
app.get('/api/auth/logout', (req, res) => {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  
  const logoutUrl = getLogoutUrl({
    authVitalHost: process.env.AV_HOST!,
    postLogoutRedirectUri: process.env.APP_URL!,
  });
  
  res.redirect(logoutUrl);
});
```
