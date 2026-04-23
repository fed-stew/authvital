# @authvital/browser

<p align="center">
  <strong>AuthVital Browser SDK for Single Page Applications</strong><br/>
  Secure, split-token authentication with in-memory storage and silent refresh
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@authvital/browser">
    <img src="https://img.shields.io/npm/v/@authvital/browser?style=flat-square" alt="npm version" />
  </a>
  <a href="https://github.com/intersparkio/authvital/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/@authvital/browser?style=flat-square" alt="license" />
  </a>
  <a href="https://bundlephobia.com/package/@authvital/browser">
    <img src="https://img.shields.io/bundlephobia/minzip/@authvital/browser?style=flat-square" alt="bundle size" />
  </a>
  <a href="https://github.com/intersparkio/authvital/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/intersparkio/authvital/ci.yml?style=flat-square" alt="CI" />
  </a>
</p>

---

## What is @authvital/browser?

`@authvital/browser` is the official browser SDK for **AuthVital** — designed specifically for Single Page Applications (SPAs). It provides a secure, developer-friendly authentication layer with enterprise-grade security patterns.

### Core Architecture

- **SPA/Browser Adapter**: Purpose-built for browser environments with full OAuth2/OIDC flow support
- **Split-Token Architecture**: Access tokens stored in memory, refresh tokens in httpOnly cookies — never localStorage
- **In-Memory Token Storage**: Tokens live in JavaScript closures, immune to XSS extraction
- **Silent Refresh**: Automatic background token renewal without user interruption

### Why This SDK?

Traditional auth libraries store tokens in `localStorage` or `sessionStorage`, making them vulnerable to XSS attacks. AuthVital's browser SDK uses a **memory-only** access token strategy combined with **httpOnly cookies** for refresh tokens, providing maximum security without sacrificing user experience.

---

## Installation

```bash
npm install @authvital/browser @authvital/core
```

```bash
# yarn
yarn add @authvital/browser @authvital/core

# pnpm
pnpm add @authvital/browser @authvital/core
```

### Peer Dependencies

React is optional. Install only if using React:

```bash
npm install react react-dom
```

---

## Quick Start

### Vanilla JavaScript / TypeScript

```typescript
import { AuthVitalClient } from '@authvital/browser';

// Initialize the client
const auth = new AuthVitalClient({
  authVitalHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  onAuthRequired: () => window.location.href = '/login',
});

// Check authentication on app load
async function initApp() {
  const isAuthenticated = await auth.checkAuth();
  
  if (isAuthenticated) {
    const user = auth.getUser();
    console.log('Welcome back', user?.email);
  } else {
    // User needs to log in
    auth.login();
  }
}

// Handle OAuth callback
async function handleCallback() {
  const result = await auth.handleCallback();
  
  if (result.success) {
    window.location.href = '/dashboard';
  } else {
    console.error('Login failed:', result.errorDescription);
  }
}

// Make authenticated API calls
const api = auth.getAxiosInstance();
const { data } = await api.get('/api/protected');
```

### React Setup (with Hooks)

```tsx
import { AuthVitalProvider, useAuth } from '@authvital/browser/react';

// App.tsx — Wrap your app with the provider
function App() {
  return (
    <AuthVitalProvider
      authVitalHost="https://auth.myapp.com"
      clientId="my-app"
      onAuthRequired={() => window.location.href = '/login'}
      onRefreshFailed={(error) => console.error('Session expired', error)}
    >
      <YourApp />
    </AuthVitalProvider>
  );
}

// Profile.tsx — Use authentication anywhere
function Profile() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  if (isLoading) return <div>Checking authentication...</div>;

  if (!isAuthenticated) {
    return (
      <div>
        <p>Please sign in to continue</p>
        <button onClick={() => login()}>Sign In</button>
        <button onClick={() => login({ screen: 'signup' })}>Sign Up</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Hello, {user?.name || user?.email}</h1>
      <button onClick={() => logout()}>Sign Out</button>
    </div>
  );
}
```

### Protected Route Pattern

```tsx
import { useProtectedRoute } from '@authvital/browser/react';

function Dashboard() {
  const { isChecking, isAllowed, user } = useProtectedRoute({
    redirectTo: '/login',
    requiredRoles: ['admin'],
  });

  if (isChecking) return <LoadingSpinner />;
  if (!isAllowed) return null; // Redirect happens automatically

  return <div>Admin Dashboard for {user?.email}</div>;
}
```

---

## Features

### 🔒 Secure In-Memory Storage

Access tokens are stored exclusively in JavaScript memory (closures), not `localStorage` or `sessionStorage`. This makes them **inaccessible to XSS attacks** that attempt to steal tokens from browser storage.

```typescript
// Token is NOT stored here:
localStorage.getItem('access_token'); // null
sessionStorage.getItem('access_token'); // null

// Only available through the SDK:
const token = auth.getAccessToken(); // Secure, memory-only
```

### 🔄 Automatic Token Refresh

The SDK automatically refreshes access tokens before they expire. Background refresh happens seamlessly without interrupting the user.

```typescript
// Token refreshes automatically — no code needed!
// All requests queue during refresh, then retry with the new token

const response = await api.get('/api/data'); // Automatically refreshed if needed
```

### 🔌 Axios Interceptor

Drop-in authentication for your HTTP client. The Axios instance handles:

- Attaching `Authorization: Bearer <token>` headers
- Silent token refresh on 401 responses
- Request queuing during refresh
- Automatic retry after refresh

```typescript
const api = auth.getAxiosInstance();

// Just use it — auth is handled automatically
const users = await api.get('/api/users');
const updated = await api.post('/api/users', data);
```

### ⚛️ React Integration

First-class React support with hooks and context:

- `useAuth()` — Full authentication context
- `useUser()` — Current user info
- `useAccessToken()` — Access token for manual API calls
- `useIsAuthenticated()` — Boolean auth state
- `useApi()` — Pre-configured Axios instance
- `useProtectedRoute()` — Route protection with role checking
- `usePermissions()` — Permission/role-based UI control

---

## API Reference

### AuthVitalClient

The main class for managing browser authentication.

#### Constructor

```typescript
new AuthVitalClient(config: AuthVitalBrowserConfig)
```

**Configuration Options:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `authVitalHost` | `string` | ✅ | AuthVital server URL (e.g., `https://auth.myapp.com`) |
| `clientId` | `string` | ✅ | OAuth client ID for your application |
| `redirectUri` | `string` | ❌ | OAuth redirect URI (defaults to current origin + `/auth/callback`) |
| `scope` | `string` | ❌ | OAuth scopes to request (space-separated) |
| `onAuthRequired` | `() => void` | ❌ | Callback when authentication is required |
| `onRefreshFailed` | `(error: Error) => void` | ❌ | Callback when token refresh fails |
| `debug` | `boolean` | ❌ | Enable debug logging to console |

#### Methods

##### Authentication State

```typescript
// Check if user is authenticated (synchronous)
auth.isAuthenticated(): boolean

// Check auth with potential silent refresh (async)
auth.checkAuth(): Promise<boolean>

// Get current user from decoded JWT
auth.getUser(): AuthUser | null

// Fetch fresh user data from server
auth.fetchUser(): Promise<AuthUser | null>
```

##### Token Management

```typescript
// Get current access token
auth.getAccessToken(): string | null

// Manually refresh the access token
auth.refreshToken(): Promise<RefreshResult>

// Set auth state directly (after OAuth callback)
auth.setAuth(accessToken: string, expiresIn?: number): AuthUser | null

// Clear all auth state
auth.clearAuth(): void
```

##### OAuth Flow

```typescript
// Redirect to login page
auth.login(options?: AuthorizationOptions): void

// Redirect to signup page
auth.signup(options?: AuthorizationOptions): void

// Handle OAuth callback (exchange code for tokens)
auth.handleCallback(url?: string): Promise<OAuthCallbackResult>

// Logout and clear session
auth.logout(options?: { postLogoutRedirectUri?: string }): Promise<LogoutResult>
```

##### HTTP Clients

```typescript
// Get Axios instance with automatic auth
auth.getAxiosInstance(): AxiosInstance

// Create authenticated fetch wrapper
auth.createFetch(): (input: RequestInfo, init?: RequestInit) => Promise<Response>
```

##### Events

```typescript
// Subscribe to auth events
const unsubscribe = auth.onEvent((event) => {
  console.log('Auth event:', event.type, event.payload);
});

// Clean up
unsubscribe();
```

**Event Types:**
- `auth:login` — User logged in
- `auth:logout` — User logged out
- `auth:refresh` — Token refreshed
- `auth:refresh-failed` — Refresh failed
- `auth:error` — Authentication error

### TokenStore

The internal token store manages access tokens in memory. You typically don't interact with this directly — use `AuthVitalClient` instead.

```typescript
import { 
  setAccessToken, 
  getAccessToken, 
  clearTokens,
  isTokenExpired 
} from '@authvital/browser';

// Only use these for advanced scenarios
setAccessToken(token, expiresInSeconds);
const token = getAccessToken();
clearTokens();
const expired = isTokenExpired(bufferSeconds);
```

### HTTP Interceptor

Create standalone interceptors for existing Axios instances:

```typescript
import { createAxiosInstance, attachAuthVitalInterceptors } from '@authvital/browser';

// Option 1: Create new instance
const api = createAxiosInstance({
  authVitalHost: 'https://auth.myapp.com',
  getAccessToken: () => auth.getAccessToken(),
  refreshAccessToken: () => auth.refreshToken().then(r => r.accessToken),
  onAuthError: () => window.location.href = '/login',
});

// Option 2: Attach to existing instance
import axios from 'axios';
const existing = axios.create({ baseURL: '/api' });

attachAuthVitalInterceptors(existing, {
  authVitalHost: 'https://auth.myapp.com',
  getAccessToken: () => auth.getAccessToken(),
  refreshAccessToken: () => auth.refreshToken().then(r => r.accessToken),
});
```

### React Hooks

#### useAuth()

Main hook providing full authentication context.

```typescript
const {
  // State
  isAuthenticated,
  isLoading,
  isRefreshing,
  user,
  accessToken,
  error,
  
  // Actions
  login,
  signup,
  logout,
  refreshToken,
  checkAuth,
  handleCallback,
  getApiClient,
} = useAuth();
```

#### useUser()

Get current user info only.

```typescript
const user = useUser();
// user: { id, email, name, givenName, familyName, picture, tenantRoles, tenantPermissions, ... }
```

#### useAccessToken()

Get access token for manual API calls.

```typescript
const token = useAccessToken();
// Use with fetch or custom clients
fetch('/api/data', { headers: { Authorization: `Bearer ${token}` }});
```

#### useIsAuthenticated()

Simple boolean check.

```typescript
const isAuthenticated = useIsAuthenticated();
```

#### useApi()

Get the pre-configured Axios instance.

```typescript
const api = useApi();
const { data } = await api.get('/api/users');
```

#### useProtectedRoute()

Protected route logic with optional role checking.

```typescript
const { isChecking, isAllowed, user } = useProtectedRoute({
  redirectTo: '/login',
  requiredRoles: ['admin', 'moderator'],
});
```

#### usePermissions()

Check user permissions and roles.

```typescript
const {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  hasAnyRole,
  permissions,
  roles,
} = usePermissions();

// Usage
if (hasPermission('users:create')) { ... }
if (hasAnyRole(['admin', 'superuser'])) { ... }
```

#### useAuthCallback()

Handle OAuth callback in a component.

```typescript
const { isProcessing, error, user } = useAuthCallback({
  onSuccess: (user) => router.push('/dashboard'),
  onError: (err) => console.error('Auth failed', err),
  redirectTo: '/dashboard',
});
```

#### useTokenRefresh()

Manual token refresh control.

```typescript
const { refresh, isRefreshing, lastRefreshed, error } = useTokenRefresh();

// Refresh on demand
await refresh();
```

---

## Security

### Why In-Memory Storage?

Traditional browser storage mechanisms have security flaws:

| Storage | XSS Vulnerable | Persists After Refresh | Secure |
|---------|---------------|------------------------|--------|
| `localStorage` | ✅ Yes | ✅ Yes | ❌ No |
| `sessionStorage` | ✅ Yes | ❌ No | ❌ No |
| **Memory (this SDK)** | ❌ **No** | ❌ **No** | ✅ **Yes** |

By storing access tokens exclusively in JavaScript closures:

1. **XSS attacks cannot extract tokens** — there's no `localStorage.getItem()` to call
2. **Tokens are lost on page refresh** — forces validation via refresh token rotation
3. **Short-lived tokens** — 15-60 minute expiration limits exposure window

### XSS Protection

The SDK implements multiple XSS protection layers:

```typescript
// Attack scenario: XSS injects malicious script
// This WILL NOT work against AuthVital tokens:

const stolen = localStorage.getItem('access_token'); // null — not stored here
const stolen2 = document.cookie; // no access_token cookie — httpOnly

// Tokens only exist in SDK memory, inaccessible to injected scripts
```

### Token Rotation

The split-token architecture ensures security through rotation:

1. **Access Token** — Short-lived (15-60 min), memory-only, used for API calls
2. **Refresh Token** — Long-lived (days/weeks), httpOnly cookie, used for renewal

When the access token expires:

```
┌─────────────┐        ┌─────────────────┐        ┌──────────────┐
│   Browser   │ ──────▶│  AuthVital API  │───────▶│  New Access  │
│  (no token) │  POST  │  /auth/refresh  │        │   Token      │
└─────────────┘        └─────────────────┘        └──────────────┘
                              │
                              │ Cookie: refresh_token (httpOnly)
                              ▼
                        Validates & rotates
                        refresh token
```

Each refresh generates a **new refresh token**, invalidating the old one. This prevents replay attacks and enables session revocation.

### Additional Security Recommendations

```typescript
// 1. Always use HTTPS in production
const auth = new AuthVitalClient({
  authVitalHost: 'https://auth.myapp.com', // Never HTTP
});

// 2. Configure CSP headers to prevent XSS
// Content-Security-Policy: default-src 'self'; script-src 'self'

// 3. Validate state parameter in OAuth flow
auth.login({ state: generateSecureRandom() });

// 4. Use short access token expiration
// Configure on AuthVital server: 15 minutes recommended

// 5. Enable debug only in development
const auth = new AuthVitalClient({
  debug: process.env.NODE_ENV === 'development',
});
```

---

## TypeScript Support

Full TypeScript definitions included:

```typescript
import type { 
  AuthVitalBrowserConfig,
  AuthUser,
  AuthState,
  LoginResult,
  LogoutResult,
  RefreshResult,
  AuthorizationOptions,
  OAuthCallbackResult,
  AuthEvent,
  AuthEventListener,
} from '@authvital/browser';

import type { AuthContextValue, AuthVitalProviderProps } from '@authvital/browser/react';
```

---

## License

MIT © [Interspark](https://github.com/intersparkio)

---

<p align="center">
  <a href="https://github.com/intersparkio/authvital">GitHub</a> •
  <a href="https://docs.authvital.com">Documentation</a> •
  <a href="https://github.com/intersparkio/authvital/issues">Issues</a>
</p>
