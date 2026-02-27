# AuthVital

**AuthVital is your own fully-featured identity platform**.. think Auth0 or Clerk, but self-hosted and completely under your control.

## What Is It?

Building a B2B SaaS app? You need authentication, organizations, roles, permissions, and probably licensing too. AuthVital gives you all of that in one package:

| Feature | What You Get |
|---------|--------------|
| **Authentication** | Login, signup, password reset, email verification, MFA (TOTP) |
| **Multi-Tenancy** | Users can belong to multiple organizations (tenants) |
| **Role-Based Access** | Define roles and permissions per app and per tenant |
| **Licensing** | Built-in seat-based, per-tenant, or feature-gated licensing |
| **SSO** | Google and Microsoft out of the box |
| **Webhooks** | Get notified when users sign up, join orgs, get licenses, etc. |
| **Admin Panel** | Full UI for managing everything |

## How Does It Work?

```
┌─────────────────────────────────────────────────────────────────┐
│                       YOUR APP                                   │
│  ┌─────────────┐         ┌─────────────┐        ┌─────────────┐ │
│  │   Frontend  │         │   Backend   │        │  Database   │ │
│  │   (React)   │         │  (Node.js)  │        │             │ │
│  └──────┬──────┘         └──────┬──────┘        └──────▲──────┘ │
└─────────┼───────────────────────┼──────────────────────┼────────┘
          │                       │                      │
          │ "Login with..."       │ Validate JWT         │ Sync users
          │ (OAuth redirect)      │ Check permissions    │ (webhooks)
          ▼                       ▼                      │
┌─────────────────────────────────────────────────────────────────┐
│                      AUTHVITAL                                   │
│                                                                  │
│   • Handles all auth flows (login, signup, MFA, SSO)            │
│   • Issues JWT tokens with roles, permissions, license info     │
│   • Manages tenants, memberships, invitations                   │
│   • Tracks licenses and entitlements                            │
│   • Sends webhooks when things happen                           │
└─────────────────────────────────────────────────────────────────┘
```

**The flow is simple:**
1. User clicks "Login" → Redirected to AuthVital
2. AuthVital handles auth (password, SSO, MFA, etc.)
3. User sent back to your app with a JWT token
4. Your backend validates the token using the SDK
5. The JWT contains everything: user info, tenant, roles, permissions, license

## What Does the SDK Do?

The SDK makes integrating AuthVital dead simple. Install it with:

```bash
npm install @authvital/sdk
```

### Frontend (React)

```tsx
import { AuthVitalProvider, useAuth } from '@authvital/sdk/client';

function App() {
  const { user, login, logout, isAuthenticated } = useAuth();
  
  return isAuthenticated 
    ? <h1>Welcome, {user.email}!</h1>
    : <button onClick={login}>Sign In</button>;
}
```

### Backend (Node.js)

```typescript
import { createAuthVital } from '@authvital/sdk/server';

const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST,
  clientId: process.env.AUTHVITAL_CLIENT_ID,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET,
});

// Validate tokens and get user info
const { authenticated, user } = await authvital.getCurrentUser(req);

// Check permissions right from the JWT
if (hasPermission(user, 'documents:write')) {
  // User can write documents
}

// Use built-in namespaces for common tasks
await authvital.invitations.send({ email, tenantId, roleId });
await authvital.memberships.setTenantRole({ membershipId, roleSlug });
await authvital.licenses.check(req, { applicationId });
```

### Webhooks (Keep Your DB in Sync)

```typescript
import { WebhookRouter, IdentitySyncHandler } from '@authvital/sdk/server';

// Auto-sync AuthVital users to your local database
const router = new WebhookRouter({
  authVitalHost: process.env.AUTHVITAL_HOST,
  handler: new IdentitySyncHandler(prisma),
});

app.post('/webhooks/authvital', router.expressHandler());
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | NestJS, Prisma, PostgreSQL |
| Frontend | React, Vite, Tailwind CSS |
| SDK | TypeScript (ESM + CJS) |
| Auth | OAuth 2.0, OIDC, PKCE, JWT |
| Security | bcrypt, TOTP, JOSE |

## Status

🚧 **AuthVital is in active development** — bugs may be expected as we're still rapidly adding features.

I'm building AuthVital for a specific need I have: full control over identity management that existing solutions don't provide. Expect exciting new features landing frequently!

## Roadmap

- **SDK support for other languages** - Python, Go, Rust, Java, C# (in that order)
- **Performance rewrite** - Considering Rust or Go for high-volume, low-latency scenarios
- **Federation & distributed scaling** - On the horizon
- **More licensing API endpoints** - Coming soon

## Documentation

See the [`docs/`](./docs/) folder for detailed guides:

- [Quick Start](./docs/getting-started/quick-start.md)
- [Installation](./docs/getting-started/installation.md)
- [Server SDK](./docs/sdk/server-sdk.md)
- [Client SDK](./docs/sdk/client-sdk.md)
- [Complete Setup Guide](./docs/sdk/complete-setup-guide.md)

## Contributing

All pull requests, feedback, and brutal honesty about mistakes are welcome.

PRs are 100% human-reviewed, so responses may not be instant, but they will be thoughtful.

Want to collaborate? Reach out or join the Discord.

## Special Thanks

💜 **[Interspark Inc](https://www.interspark.com)** — Supporter

## License

See [LICENSE](./LICENSE) for terms. 

**TL;DR:** Free to use in your own projects. Modifications must be open-sourced. Commercial SaaS use requires written permission.
