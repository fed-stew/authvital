# Server SDK

> Complete reference for integrating AuthVital into your Node.js backend.

The Server SDK provides everything you need to integrate AuthVital authentication and authorization into your backend application.

## Overview

The AuthVital Server SDK provides:

- **JWT Validation** - Verify tokens from incoming requests with cached JWKS
- **Permission Helpers** - Zero-API-call permission checks from JWT claims
- **Namespaced APIs** - Type-safe methods for all AuthVital operations
- **OAuth Flow Utilities** - PKCE, state encoding, token exchange
- **Middleware Factories** - Ready-to-use Express and Passport.js integration
- **Identity Sync** - Webhook handlers for local database mirroring

## Installation

```bash
npm install @authvital/sdk
```

## Quick Setup

```typescript
import { createAuthVital } from '@authvital/sdk/server';

// Configure once at startup
const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
});

// Use everywhere
app.get('/api/protected', async (req, res) => {
  const { authenticated, user } = await authvital.getCurrentUser(req);
  
  if (!authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.json({ message: `Hello ${user.email}!` });
});
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `authVitalHost` | `string` | Yes | AuthVital server URL |
| `clientId` | `string` | Yes | OAuth client ID |
| `clientSecret` | `string` | Yes | OAuth client secret |
| `scope` | `string` | No | Default scopes (default: `system:admin`) |

## Documentation Structure

<div class="grid cards" markdown>

-   :material-shield-check:{ .lg .middle } **[JWT Validation](./jwt-validation.md)**

    ---

    Validate tokens, extract user claims, and check permissions without API calls.

-   :material-api:{ .lg .middle } **[Namespaces](./namespaces/overview.md)**

    ---

    Type-safe methods for invitations, memberships, licenses, and more.

-   :material-lock:{ .lg .middle } **[OAuth Flow](./oauth-flow.md)**

    ---

    PKCE utilities, URL builders, and token exchange helpers.

-   :material-middleware:{ .lg .middle } **[Middleware](./middleware.md)**

    ---

    Pre-built Express and Passport.js middleware factories.

</div>

## Environment Variables

```bash
# Required
AUTHVITAL_HOST=https://auth.yourapp.com
AUTHVITAL_CLIENT_ID=your-client-id
AUTHVITAL_CLIENT_SECRET=your-client-secret

# Optional (for OAuth flow)
AUTHVITAL_REDIRECT_URI=https://yourapp.com/callback
```

## Next Steps

1. **[JWT Validation](./jwt-validation.md)** - Learn how to validate tokens and extract user claims
2. **[Namespaces Overview](./namespaces/overview.md)** - Explore the namespaced API methods
3. **[Setup Guide](../setup/index.md)** - Full integration walkthrough
