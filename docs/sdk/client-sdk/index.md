# Client SDK (React)

> React components and hooks for AuthVital authentication.

The AuthVital Client SDK provides React components and hooks for managing authentication state in your frontend application.

## Overview

The SDK handles:

- 🔐 **Authentication state management** - Track user login status
- 👤 **User data access** - Display user info, roles, permissions
- 🏢 **Multi-tenant support** - Tenant selection and switching
- 📨 **Invitation flows** - Accept and process team invitations
- 🚀 **OAuth initiation** - Start login/signup flows that redirect to AuthVital

---

## ⚠️ Important: Cookie-Based Authentication

**The Client SDK does NOT call the AuthVital IDP directly!**

Auth state is managed via **httpOnly cookies** that your server sets. This is **intentional** for XSS protection:

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │         │ Your Server │         │  AuthVital  │
│  (Client)   │         │   (API)     │         │    IDP      │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  1. Redirect to OAuth │                       │
       │──────────────────────────────────────────────>│
       │                       │                       │
       │  2. OAuth callback with code                  │
       │<──────────────────────────────────────────────│
       │                       │                       │
       │  3. POST code to your server                  │
       │──────────────────────>│                       │
       │                       │  4. Exchange code     │
       │                       │──────────────────────>│
       │                       │  5. Return JWT        │
       │                       │<──────────────────────│
       │                       │                       │
       │  6. Set httpOnly cookie + return user data    │
       │<──────────────────────│                       │
       │                       │                       │
       │  7. setAuthState(user, tenants)               │
       │  (Client updates React state)                 │
       └───────────────────────────────────────────────┘
```

**Key Points:**

- ✅ Tokens are stored in **httpOnly cookies** (set by YOUR server)
- ✅ JavaScript **cannot access** the actual JWT tokens
- ✅ Your server verifies JWTs using `getCurrentUser()` from the Server SDK
- ✅ Server passes user data to client via props or API response
- ✅ Client updates state via `setAuthState(user, tenants)`
- ❌ No `getAccessToken()` method - tokens aren't accessible from JS!

---

## Installation

```bash
npm install @authvital/sdk
```

---

## Quick Setup

```tsx
import { AuthVitalProvider, useAuth } from '@authvital/sdk/client';

function App() {
  // initialUser/initialTenants come from your server (SSR props, API call, etc.)
  const { initialUser, initialTenants } = useServerData();

  return (
    <AuthVitalProvider
      authVitalHost={import.meta.env.VITE_AUTHVITAL_HOST}
      clientId={import.meta.env.VITE_AUTHVITAL_CLIENT_ID}
      initialUser={initialUser}
      initialTenants={initialTenants}
    >
      <MyApp />
    </AuthVitalProvider>
  );
}

function MyApp() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div>
      <p>Welcome, {user?.email}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

---

## AuthVitalProvider

Wrap your app with `AuthVitalProvider` to enable authentication:

```tsx
import { AuthVitalProvider } from '@authvital/sdk/client';

function App() {
  return (
    <AuthVitalProvider
      authVitalHost="https://auth.yourapp.com"
      clientId="your-client-id"
      redirectUri="https://yourapp.com/api/auth/callback"  // Optional
      initialUser={null}                                   // From server
      initialTenants={[]}                                  // From server
      onAuthStateChange={(user) => {                       // Optional callback
        console.log('Auth state changed:', user);
      }}
    >
      <Router>
        <Routes />
      </Router>
    </AuthVitalProvider>
  );
}
```

### Provider Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `authVitalHost` | `string` | Yes | AuthVital server URL |
| `clientId` | `string` | Yes | OAuth client ID |
| `redirectUri` | `string` | No | OAuth callback URL (default: `/api/auth/callback`) |
| `scope` | `string` | No | OAuth scopes (default: `openid profile email`) |
| `initialUser` | `AuthVitalUser \| null` | No | Pre-loaded user from server |
| `initialTenants` | `AuthVitalTenant[]` | No | Pre-loaded tenants from server |
| `onAuthStateChange` | `function` | No | Callback when auth state changes |

---

## Environment Variables

```bash
# .env (Vite)
VITE_AUTHVITAL_HOST=https://auth.yourapp.com
VITE_AUTHVITAL_CLIENT_ID=your-client-id

# .env (Create React App)
REACT_APP_AUTHVITAL_HOST=https://auth.yourapp.com
REACT_APP_AUTHVITAL_CLIENT_ID=your-client-id

# .env (Next.js - client-side)
NEXT_PUBLIC_AUTHVITAL_HOST=https://auth.yourapp.com
NEXT_PUBLIC_AUTHVITAL_CLIENT_ID=your-client-id
```

!!! warning "Security"
    Never expose `CLIENT_SECRET` to the browser! The secret is only used server-side.

---

## Documentation Structure

<div class="grid cards" markdown>

-   :material-hook:{ .lg .middle } **[Hooks Reference](./hooks.md)**

    ---

    useAuth, useOAuth, useInvitation, and helper hooks.

-   :material-view-module:{ .lg .middle } **[Components](./components.md)**

    ---

    ProtectedRoute, SignUpForm, and pre-built UI components.

-   :material-code-braces:{ .lg .middle } **[Patterns](./patterns.md)**

    ---

    OAuth flow, state management, permission checks, TypeScript types.

</div>

---

## Next Steps

1. **[Hooks Reference](./hooks.md)** - Learn about useAuth and other hooks
2. **[Components](./components.md)** - Explore pre-built components
3. **[Patterns](./patterns.md)** - Common implementation patterns
4. **[Server SDK](../server-sdk/index.md)** - Server-side token verification
