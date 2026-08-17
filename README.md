# AuthVital

> A self-hostable, multi-tenant Identity Provider (IdP) — plus official
> TypeScript SDKs for integrating it into your apps.

## What is AuthVital?

AuthVital is a multi-tenant IdP you run yourself (Docker image included). It
provides:

- **OAuth2 / OIDC** — authorization code + PKCE, client credentials (M2M),
  refresh-token rotation, JWKS-published signing keys.
- **Multi-tenancy** — tenants (organizations), memberships, tenant roles
  (owner / admin / billing-admin / member), per-application roles and
  permissions surfaced as JWT claims (`tenant_roles`, `app_roles`,
  `app_permissions`).
- **Licensing** — per-seat license types, subscriptions, seat assignment, and
  a `license` claim minted into tokens for entitlement checks.
- **MFA with tenant-policy enforcement at token mint** — when a tenant's MFA
  policy requires enrollment, token issuance/refresh is rejected with
  `interaction_required`; the SDKs surface this as a typed
  `InteractionRequiredError` so you can restart the authorize flow.
- **Webhooks** — per-application identity-sync events (`subject.*`,
  `member.*`, `app_access.*`, `license.*`, `invite.*`), signed by the IdP and
  verifiable against its JWKS (no shared secrets).
- **Hosted admin console** — a Super Admin dashboard at `/admin` and a
  per-tenant console at `/tenant/:tenantId/*` (members, app access, licenses,
  billing, SSO, domains, audit). The SDKs deep-link into it rather than
  re-implementing management UI.

## Quick start — run the IdP

Docker is the only requirement:

```bash
cp .env.example .env                                # configure secrets
cp seed.config.example.yaml seed.config.yaml        # optional: seed users/tenants/apps
docker compose up -d
```

Then open:

- App / login: <http://localhost:8080>
- Admin dashboard: <http://localhost:8080/admin>
- API health: <http://localhost:8080/api/health>

Postgres data lives in the named volume `authvital-pgdata`:
`docker compose down` keeps it, `docker compose down -v` wipes it, and the
next `up` reseeds a fresh DB from `seed.config.yaml` (idempotent upserts).

## Packages

| Package | Purpose | Docs |
| --- | --- | --- |
| [`@authvital/browser`](./packages/sdk-browser) | SPA/browser SDK — PKCE login, in-memory access tokens, silent refresh, React hooks (`@authvital/browser/react`) | [README](./packages/sdk-browser/README.md) |
| [`@authvital/server`](./packages/sdk-server) | Server/BFF SDK — encrypted session cookies (AES-256-GCM), `OAuthFlow`, JWT verification, API + M2M integration client, Express/Next.js adapters | [README](./packages/sdk-server/README.md) |
| [`@authvital/core`](./packages/sdk-core) | Shared primitives — JWKS/JWT verification, PKCE utilities, OAuth URL builders, hosted-console deep-links (`getManagementUrls`) | [source](./packages/sdk-core/src) |

The monorepo also contains the IdP itself (`packages/backend`,
`packages/frontend`) and shared internals (`packages/contracts`,
`packages/shared`).

> **Note:** the `sdks/` directory (Python, Go, Rust, Java, .NET) contains
> **namespace placeholders only** — every entry point throws
> `NotImplemented`. Use the TypeScript SDKs today.

## Server-side usage (`@authvital/server`)

Verify an incoming access token against the IdP's JWKS, then call the
AuthVital API on the user's behalf:

```typescript
import { createServerClient, verifyToken } from '@authvital/server';

// 1. Validate the JWT (signature, issuer, audience) via JWKS
const result = await verifyToken(accessToken, {
  jwksUri: `${process.env.AV_HOST}/.well-known/jwks.json`,
  issuer: process.env.AV_HOST!,
  audience: process.env.AV_CLIENT_ID!,
});

if (!result.valid) {
  throw new Error(`Unauthorized: ${result.error}`);
}
console.log(result.payload.sub, result.payload.tenant_id);

// 2. Call the AuthVital API with the user's tokens
const client = createServerClient(
  {
    authVitalHost: process.env.AV_HOST!,
    clientId: process.env.AV_CLIENT_ID!,
    clientSecret: process.env.AV_CLIENT_SECRET!,
  },
  { accessToken, refreshToken },
);

const user = await client.getCurrentUser();

// Server-to-server (M2M) automation uses the Client Credentials grant:
const adminClient = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_MACHINE_CLIENT_ID!,
  clientSecret: process.env.AV_MACHINE_CLIENT_SECRET!,
});
const members = await adminClient.integration.listTenantMembers({ tenantId: 'tenant-123' });
```

The server SDK also ships `OAuthFlow` (PKCE code flow), `createSessionStore`
(encrypted httpOnly session cookies), and Express/Next.js middleware — see the
[`@authvital/server` README](./packages/sdk-server/README.md).

## React usage (`@authvital/browser`)

```tsx
import { AuthVitalProvider, useAuth } from '@authvital/browser/react';

// Wrap your app with the provider
function App() {
  return (
    <AuthVitalProvider
      authVitalHost="https://auth.myapp.com"
      clientId="my-app"
      onAuthRequired={() => (window.location.href = '/login')}
    >
      <Profile />
    </AuthVitalProvider>
  );
}

// Use authentication anywhere
function Profile() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  if (isLoading) return <div>Checking authentication...</div>;

  if (!isAuthenticated) {
    return <button onClick={() => login()}>Sign In</button>;
  }

  return (
    <div>
      <h1>Hello, {user?.name || user?.email}</h1>
      <button onClick={() => logout()}>Sign Out</button>
    </div>
  );
}
```

Access tokens live **in memory only** (never `localStorage`); refresh tokens
live in httpOnly cookies. See the
[`@authvital/browser` README](./packages/sdk-browser/README.md) for the
vanilla-JS client, Axios interceptors, and the full hook list.

## Examples / Local UAT

Want to see all of this working end-to-end before wiring it into your own app?
The [`examples/`](./examples) directory ships a one-command, subdomain-based,
HTTPS-everywhere UAT playground: a React SPA, a per-seat licensing SPA, and an
Express BFF, all fronted by Traefik behind `*.lvh.me` and talking to a local
AuthVital IdP.

```bash
make up                            # cold start: auto seed + certs + named volume
# make down    -> stop, KEEP data
# make fresh   -> wipe DB volume (down -v) + reseed
# make certs   -> optional: locally-TRUSTED mkcert cert (no browser warning)
```

**Docker is the only requirement — no host `npm install`/`npm run build`.**
Every image (IdP + the three example apps) builds the workspace SDKs from
source *inside* the container. On a cold `make up`, the Makefile
self-provisions everything: it copies the committed UAT seed
(`seed.config.uat.yaml`) to `seed.config.yaml` if you don't have one, mints a
TLS cert if none exists (mkcert-trusted when installed, self-signed
otherwise), and defaults the Postgres host port to `5433` so you never pass
`POSTGRES_PORT` yourself (override with `make up POSTGRES_PORT=5544` if `5433`
is taken). Then open `https://app.lvh.me`, `https://seat.lvh.me`, and
`https://bff.lvh.me`.

- **Full runbook:** [`examples/README.md`](./examples/README.md)
- **Lifecycle guide:** [`docs/local-uat.md`](./docs/local-uat.md)
- **Persona-by-persona pass/fail matrix:** [`examples/UAT-CHECKLIST.md`](./examples/UAT-CHECKLIST.md)

## Environment Variables

All AuthVital SDK environment variables use the `AV_` prefix. Front-end
frameworks add their own public-exposure prefix in front (e.g. `VITE_AV_HOST`,
`NEXT_PUBLIC_AV_HOST`).

```bash
# --- Required ---
AV_HOST=https://auth.yourapp.com       # Your AuthVital instance URL
AV_CLIENT_ID=your-client-id            # OAuth client ID (identifies your app)
AV_CLIENT_SECRET=your-client-secret    # OAuth client secret (server-side ONLY)

# --- Required when using the server SDK's session cookies ---
SESSION_SECRET=your-32-char-min-secret # Encryption key for session cookies

# --- Optional ---
AV_REDIRECT_URI=https://yourapp.com/api/auth/callback  # OAuth callback
```

| Variable | Required | Scope | Purpose |
| --- | --- | --- | --- |
| `AV_HOST` | Yes | Server + client | Base URL of your AuthVital instance. JWKS and OAuth endpoints are derived from it. |
| `AV_CLIENT_ID` | Yes | Server + client | Public OAuth client identifier. Safe to expose to the browser. |
| `AV_CLIENT_SECRET` | Server SDK (confidential/M2M clients) | **Server only** | Authenticates your backend *to AuthVital*. Never expose to the browser. Public PKCE clients omit it. |
| `SESSION_SECRET` | Server SDK only | **Server only** | Symmetric key the server SDK uses to encrypt/decrypt session cookies. |
| `AV_REDIRECT_URI` | Optional | Server | OAuth callback URL. Must exactly match the one registered for the client. |

### Env var ↔ SDK option naming

Environment variables use the `AV_` prefix and `SCREAMING_SNAKE_CASE`. The SDK
**configuration options** are `camelCase`, mapping one-to-one: `AV_HOST` →
`authVitalHost`, `AV_CLIENT_ID` → `clientId`, `AV_CLIENT_SECRET` →
`clientSecret`, `AV_REDIRECT_URI` → `redirectUri`. You wire them together
yourself — the SDK does not read `process.env` for you.

### About `SESSION_SECRET`

`SESSION_SECRET` is **not** an AuthVital credential — that's why it has no
`AV_` prefix. It belongs to *your* application. The server SDK
(`@authvital/server`) uses it as the **AES-256-GCM encryption key** for the
httpOnly session cookie that stores the user's access & refresh tokens (the
Backend-for-Frontend pattern).

- **Server-side only.** The browser only ever carries the *encrypted* cookie.
  If this key leaked to the client, an attacker could decrypt every user's
  tokens.
- **Minimum 32 characters.** It's a real symmetric encryption key. Generate
  one with `openssl rand -hex 32`.
- **How it differs from `AV_CLIENT_SECRET`.** `AV_CLIENT_SECRET` proves *your
  backend to AuthVital*. `SESSION_SECRET` is the key *your backend* uses to
  protect *its own* cookies. AuthVital never sees it.

```typescript
import { createSessionStore } from '@authvital/server';

const store = createSessionStore({
  secret: process.env.SESSION_SECRET!, // 32+ char AES-256-GCM key, server-side only
});
```

> **Never commit real secrets.** Add your `.env` file to `.gitignore`.

## Deployment

[`scripts/deploy-gcp.sh`](./scripts/deploy-gcp.sh) is an idempotent script
that provisions GCP infrastructure (Cloud SQL, Secret Manager) and deploys
the IdP to Cloud Run from the published Docker image — no local build needed.
Read the script header for prerequisites and options.

## License

**TL;DR:** Free to use in your own projects. Modifications must be
open-sourced. Commercial SaaS use requires written permission.

See [LICENSE](./LICENSE) for full terms.
