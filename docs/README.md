# AuthVital Documentation

> **AuthVital** is a B2B Identity Provider platform with OAuth 2.0/OIDC compliance, multi-tenancy, role-based access control, licensing, SSO, and MFA.

## 📚 Documentation Index

### Getting Started
- [Installation & Deployment](./getting-started/installation.md) - Set up AuthVital
- [Quick Start Guide](./getting-started/quick-start.md) - Integrate in 5 minutes
- [Configuration Reference](./getting-started/configuration.md) - Environment variables

### Core Concepts
- [Architecture Overview](./concepts/architecture.md) - System design & components
- [Multi-Tenancy](./concepts/multi-tenancy.md) - Tenant isolation & membership
- [OAuth 2.0 / OIDC Flows](./concepts/oauth-flow.md) - Authorization & authentication
- [Licensing System](./concepts/licensing.md) - Per-seat, tenant-wide, free modes
- [Access Control (RBAC)](./concepts/access-control.md) - Roles & permissions

### SDK Integration
- [Setup Guide](./sdk/setup/index.md) - Full integration walkthrough
- [Server SDK](./sdk/server-sdk/index.md) - Node.js/Backend integration
- [Client SDK (React)](./sdk/client-sdk/index.md) - React hooks & components
- [Identity Sync](./sdk/identity-sync/index.md) - Mirror identities to your database
- **Webhooks Documentation:**
  - [Webhooks Overview](./sdk/webhooks.md) - Getting started with webhooks
  - [Event Types & Payloads](./sdk/webhooks-events.md) - All events with TypeScript types
  - [Event Handler Reference](./sdk/webhooks-handler.md) - webhook verification & your own handler
  - [Framework Examples](./sdk/webhooks-frameworks.md) - Express, Next.js, NestJS
  - [Manual Verification](./sdk/webhooks-verification.md) - Low-level RSA verification
  - [Best Practices](./sdk/webhooks-advanced.md) - Error handling, idempotency, testing

### API Reference
- [Authentication API](./api/authentication.md) - Login, register, MFA
- [OAuth Endpoints](./api/oauth-endpoints.md) - /authorize, /token, /userinfo
- [Tenant API](./api/tenant-api.md) - Tenant & member management
- [User API](./api/user-api.md) - User management
- [Licensing API](./api/licensing-api.md) - Subscriptions & assignments

### Administration
- [Super Admin Guide](./admin/super-admin.md) - Instance administration
- [Application Setup](./admin/application-setup.md) - OAuth app configuration
- [Tenant Administration](./admin/tenant-admin.md) - Managing tenants

### Security
- [Multi-Factor Authentication](./security/mfa.md) - TOTP setup & policies
- [Single Sign-On (SSO)](./security/sso.md) - Google & Microsoft configuration
- [Security Best Practices](./security/best-practices/index.md) - Recommendations

### Reference
- [Data Models](./reference/data-models.md) - Entity relationships
- [JWT Claims](./reference/jwt-claims.md) - Token structure & scopes
- [Error Codes](./reference/error-codes.md) - Error handling reference

---

## Quick Links

| I want to... | Go to... |
|--------------|----------|
| Get a complete integration guide | [Setup Guide](./sdk/setup/index.md) |
| Integrate AuthVital into my app | [Quick Start Guide](./getting-started/quick-start.md) |
| Understand the OAuth flow | [OAuth 2.0 / OIDC Flows](./concepts/oauth-flow.md) |
| Understand webhook events | [Event Types & Payloads](./sdk/webhooks-events.md) |
| Sync users to my database | [Identity Sync Guide](./sdk/identity-sync/index.md) |
| Handle webhooks | [Webhooks Guide](./sdk/webhooks.md) |
| Configure SSO | [SSO Configuration](./security/sso.md) |
| Deploy to production | [Installation & Deployment](./getting-started/installation.md) |

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Your Application                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  React Client   │    │  Node.js API    │    │  Your Database  │         │
│  │  (@authvital/   │    │  (@authvital/   │    │  (User Sync)    │         │
│  │   sdk/client)   │    │   sdk/server)   │    │                 │         │
│  └────────┬────────┘    └────────┬────────┘    └────────▲────────┘         │
│           │                      │                      │                   │
│           │ OAuth Flow           │ JWT Validation       │ Webhooks          │
│           │                      │                      │                   │
└───────────┼──────────────────────┼──────────────────────┼───────────────────┘
            │                      │                      │
            ▼                      ▼                      │
┌─────────────────────────────────────────────────────────┴───────────────────┐
│                            AuthVital Platform                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │    OAuth     │  │   Tenants    │  │  Licensing   │  │   Webhooks   │    │
│  │   Server     │  │   & Users    │  │    Engine    │  │    System    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │     SSO      │  │     MFA      │  │    RBAC      │  │    Admin     │    │
│  │   Providers  │  │    (TOTP)    │  │   Engine     │  │    Panel     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | NestJS, Prisma, PostgreSQL |
| Frontend | React, Vite, Tailwind CSS |
| SDK | TypeScript (ESM + CJS) |
| Auth | OAuth 2.0, OIDC, PKCE, JWT |
| Security | bcrypt, TOTP (otplib), JOSE |

---

## Support

- **GitHub Issues**: Report bugs and request features
- **SDK Packages**: `npm install @authvital/server` (server/BFF) and `npm install @authvital/browser` (browser/React). There is no single `@authvital/sdk` package.
