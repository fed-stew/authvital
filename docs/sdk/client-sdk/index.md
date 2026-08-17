# Client SDK (React)

> React provider and hooks for AuthVital authentication in Single Page Apps.

The AuthVital Client SDK (`@authvital/browser`) is a browser SDK for SPAs. Its
React integration lives at `@authvital/browser/react` and provides an
`AuthVitalProvider` plus a set of hooks.

## Overview

The SDK handles:

-  **Authentication state** — login status, current user, errors
-  **User data** — decoded from the access token (roles, permissions, license)
-  **OAuth initiation** — `login()` / `signup()` redirect to AuthVital
-  **Silent refresh** — automatic background access-token renewal
-  **Authenticated HTTP** — a ready-to-use Axios instance

---

## Architecture: split-token, not cookie-mirroring

!!! important "How the browser SDK actually stores tokens"
    `@authvital/browser` talks to the AuthVital IdP **directly** and uses a
    **split-token** model:

    - The **access token lives in memory** (a JS closure) — never
      `localStorage`/`sessionStorage`. It **is** readable from your own code via
      `useAccessToken()` / `client.getAccessToken()`.
    - The **refresh token is an httpOnly cookie** set by the IdP — not readable
      from JS.

    This is different from a BFF/cookie-session setup. If you want the server to
    hold *all* tokens in an encrypted cookie session, that's the
    [Server SDK](../server-sdk/index.md) (`@authvital/server`) — the BFF pattern —
    not this package.

The OAuth callback is handled **client-side** by the SDK
(`handleCallback()` / `useAuthCallback()`), which exchanges the authorization
code for tokens.

---

## Installation

```bash
npm install @authvital/browser
```

`react` / `react-dom` are peer dependencies (only needed for the React entry
point).

---

## Quick Setup

```tsx
import { AuthVitalProvider, useAuth } from '@authvital/browser/react';

function App() {
  return (
    <AuthVitalProvider
      authVitalHost={import.meta.env.VITE_AV_HOST}
      clientId={import.meta.env.VITE_AV_CLIENT_ID}
    >
      <MyApp />
    </AuthVitalProvider>
  );
}

function MyApp() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  if (isLoading) return <p>Loading…</p>;
  if (!isAuthenticated) return <button onClick={() => login()}>Sign In</button>;

  return (
    <div>
      <p>Welcome, {user?.email}!</p>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}
```

---

## AuthVitalProvider

```tsx
import { AuthVitalProvider } from '@authvital/browser/react';

function App() {
  return (
    <AuthVitalProvider
      authVitalHost="https://auth.yourapp.com"
      clientId="your-client-id"
      redirectUri="https://yourapp.com/auth/callback" // optional
      scope="openid profile email"                     // optional
      onAuthRequired={() => router.push('/login')}      // optional
      onLogin={(user) => console.log('logged in', user.email)} // optional
    >
      <Routes />
    </AuthVitalProvider>
  );
}
```

### Provider Props

`AuthVitalProviderProps` extends `AuthVitalBrowserConfig`:

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `authVitalHost` | `string` | Yes | AuthVital server URL |
| `clientId` | `string` | Yes | OAuth client ID |
| `redirectUri` | `string` | No | OAuth callback URL (default: current origin + `/auth/callback`) |
| `scope` | `string` | No | OAuth scopes (space-separated) |
| `debug` | `boolean` | No | Enable debug logging |
| `onAuthRequired` | `() => void` | No | Called when authentication is required |
| `onRefreshFailed` | `(error: Error) => void` | No | Called when a token refresh fails |
| `onLogin` | `(user: AuthUser) => void` | No | Called after successful login |
| `onLogout` | `() => void` | No | Called after logout |
| `initialState` | `Partial<AuthState>` | No | Initial state for SSR/hydration |

There is **no** `initialUser`, `initialTenants`, or `onAuthStateChange` prop.
(For state-change callbacks, use the [`useAuthStateChange`](./hooks.md#useauthstatechange)
hook.)

---

## Environment Variables

```bash
# .env (Vite)
VITE_AV_HOST=https://auth.yourapp.com
VITE_AV_CLIENT_ID=your-client-id

# .env (Next.js — client-side)
NEXT_PUBLIC_AV_HOST=https://auth.yourapp.com
NEXT_PUBLIC_AV_CLIENT_ID=your-client-id
```

!!! warning "Security"
    Never expose `CLIENT_SECRET` to the browser. The browser SDK is a **public
    client** and uses no secret; the secret is only for the Server SDK.

---

## Documentation Structure

<div class="grid cards" markdown>

-   :material-hook:{ .lg .middle } **[Hooks Reference](./hooks.md)**

    ---

    `useAuth`, `useProtectedRoute`, `usePermissions`, and the rest.

-   :material-view-module:{ .lg .middle } **[Components & Patterns](./components.md)**

    ---

    Route protection, role/permission gating, and small reusable components you
    build on top of the hooks.

-   :material-code-braces:{ .lg .middle } **[Patterns & Types](./patterns.md)**

    ---

    Callback handling, invitation flow, tenant switching, and TypeScript types.

</div>

---

## Next Steps

1. **[Hooks Reference](./hooks.md)** — `useAuth` and friends
2. **[Components & Patterns](./components.md)** — protecting routes with the hooks
3. **[Patterns & Types](./patterns.md)** — callbacks, invites, tenant switching
4. **[Server SDK](../server-sdk/index.md)** — server-side / BFF integration
