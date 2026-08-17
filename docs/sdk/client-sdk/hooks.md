# Client SDK Hooks

> React hooks for authentication state, protected routes, permissions, and API calls.

All hooks come from `@authvital/browser/react` and must be used inside an
`<AuthVitalProvider>`. The provider owns a single `AuthVitalClient` instance and
keeps React state in sync with it.

!!! info "Exact export surface"
    The React entrypoint exports exactly these hooks:
    `useAuth`, `useAuthVitalClient`, `useUser`, `useAccessToken`,
    `useIsAuthenticated`, `useIsLoading`, `useApi`, `useAuthStateChange`,
    `useAuthCallback`, `useProtectedRoute`, `useAuthApi`, `usePermissions`,
    `useTokenRefresh`, and `useUserPreference` — plus the `AuthVitalProvider`
    component. There is **no** `useOAuth`, `useInvitation`, `useTenant`,
    `useTenants`, or `useAuthVitalConfig` hook.

## useAuth

The primary hook. Returns the full auth context — state plus action methods.

```tsx
import { useAuth } from '@authvital/browser/react';

function Dashboard() {
  const {
    // ---- State ----
    isAuthenticated,   // boolean
    isLoading,         // boolean — initial auth check in progress
    isRefreshing,      // boolean — token refresh in progress
    user,              // AuthUser | null
    accessToken,       // string | null (in-memory)
    error,             // AuthError | null

    // ---- Actions ----
    login,             // (options?: { email?: string; screen?: 'login' | 'signup' }) => void
    signIn,            // alias for login
    signup,            // (options?: { email?: string }) => void
    signUp,            // alias for signup
    logout,            // (options?) => Promise<LogoutResult>
    signOut,           // alias for logout
    refreshToken,      // () => Promise<RefreshResult>
    checkAuth,         // () => Promise<boolean>
    handleCallback,    // (url?: string) => Promise<OAuthCallbackResult>
    getApiClient,      // () => AxiosInstance
  } = useAuth();

  if (isLoading) return <p>Checking authentication…</p>;

  if (!isAuthenticated) {
    return <button onClick={() => login()}>Sign In</button>;
  }

  return (
    <div>
      <p>Hello, {user?.name || user?.email}</p>
      <button onClick={() => logout()}>Sign Out</button>
    </div>
  );
}
```

!!! note "`login()` triggers a full-page OAuth redirect"
    `login()` / `signup()` don't return a promise — they redirect the browser to
    the AuthVital authorize endpoint. The result is delivered back to your
    callback route, where you call `handleCallback()` (or use
    [`useAuthCallback`](#useauthcallback)).

### The `user` object (`AuthUser`)

```typescript
interface AuthUser {
  id: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  tenantId?: string;
  tenantSubdomain?: string;
  tenantRoles?: string[];
  tenantPermissions?: string[];
  license?: { type: string; name: string; features: string[] };
}
```

`user` is decoded from the in-memory access token — there is no separate
`tenants` array or `currentTenant` on the context. The active tenant is whatever
tenant the current token was issued for (`user.tenantId` /
`user.tenantSubdomain`).

## useAuthVitalClient

Escape hatch to the underlying `AuthVitalClient`. Use this when you need client
methods the context doesn't surface — most importantly, `login()` with
`inviteToken` or `tenantHint` (the context's `login()` only accepts
`email`/`screen`).

```tsx
import { useAuthVitalClient } from '@authvital/browser/react';

function InviteAcceptButton({ token }: { token: string }) {
  const client = useAuthVitalClient();

  // Invitation acceptance = start the OAuth flow WITH the invite token.
  // AuthVital consumes it during login and adds the user to the tenant.
  return (
    <button onClick={() => client.login({ inviteToken: token })}>
      Accept Invitation & Sign In
    </button>
  );
}
```

`AuthorizationOptions` (accepted by `client.login()` / `client.signup()`):

```typescript
interface AuthorizationOptions {
  email?: string;
  screen?: 'login' | 'signup';
  state?: string;        // custom state (bypasses auto-CSRF)
  inviteToken?: string;  // team invitation token
  tenantHint?: string;   // pre-select a tenant for multi-tenant login
}
```

## Invitations

There is no `useInvitation` hook and no client-side "consume invite" call. The
whole flow runs through the OAuth redirect:

1. User opens your invite landing page, e.g. `/invite?token=…`.
2. You call `client.login({ inviteToken })` (see above).
3. AuthVital validates + consumes the token during login and adds the user to
   the tenant.
4. The user lands back on your callback route already a member.

If you need to *display* invitation details or list/revoke invitations, that is a
**server-side** operation via the Server SDK's integration client
(`client.integration.listInvitations`, `sendInvitation`, `revokeInvitation`) —
see the [Server SDK](../server-sdk/index.md).

## Tenant switching

There is no in-place tenant switch on the browser SDK — an access token is scoped
to a single tenant, so switching tenants means starting a **fresh login** with a
`tenant_hint`:

```tsx
import { useAuthVitalClient } from '@authvital/browser/react';

function TenantSwitcher({ targetSubdomain }: { targetSubdomain: string }) {
  const client = useAuthVitalClient();
  // Re-login scoped to the target tenant. In a subdomain-per-tenant setup you
  // typically also navigate to that tenant's subdomain first.
  return (
    <button onClick={() => client.login({ tenantHint: targetSubdomain })}>
      Switch tenant
    </button>
  );
}
```

## useUser

Current user only (shorthand for `useAuth().user`).

```tsx
import { useUser } from '@authvital/browser/react';

function ProfileCard() {
  const user = useUser(); // AuthUser | null
  if (!user) return null;
  return (
    <div>
      {user.picture && <img src={user.picture} alt={user.name || ''} />}
      <h3>{user.name || user.email}</h3>
      <p>{user.email}</p>
    </div>
  );
}
```

## useAccessToken

The in-memory access token, for manual API calls.

```tsx
import { useAccessToken } from '@authvital/browser/react';

const token = useAccessToken(); // string | null
fetch('/api/data', { headers: { Authorization: `Bearer ${token}` } });
```

## useIsAuthenticated / useIsLoading

Boolean shorthands.

```tsx
import { useIsAuthenticated, useIsLoading } from '@authvital/browser/react';

const isAuthenticated = useIsAuthenticated();
const isLoading = useIsLoading();
```

## useApi

The pre-configured Axios instance (attaches the bearer token, refreshes on 401,
queues concurrent requests during refresh).

```tsx
import { useApi } from '@authvital/browser/react';

function Users() {
  const api = useApi();
  useEffect(() => {
    api.get('/api/users').then((r) => setUsers(r.data));
  }, [api]);
}
```

## useAuthApi

Wraps a call in loading/error/data state.

```tsx
import { useAuthApi } from '@authvital/browser/react';

function Profile() {
  const { callApi, isLoading, error, data } = useAuthApi();

  useEffect(() => {
    callApi(async (api) => {
      const { data } = await api.get('/api/users/me');
      return data;
    });
  }, [callApi]);

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;
  return <div>{data?.name}</div>;
}
```

## useAuthCallback

Processes the OAuth callback on mount — use it on your callback route.

```tsx
import { useAuthCallback } from '@authvital/browser/react';

function AuthCallbackPage() {
  const { isProcessing, error, user } = useAuthCallback({
    onSuccess: (user) => router.push('/dashboard'),
    onError: (err) => console.error('Auth failed', err),
    redirectTo: '/dashboard', // optional
  });

  if (isProcessing) return <Loading />;
  if (error) return <Error message={error.description} />;
  return null;
}
```

## useProtectedRoute

Redirects to `redirectTo` when the user isn't authenticated. Optional
`requiredRoles` are checked against the user's **tenant roles**.

```tsx
import { useProtectedRoute } from '@authvital/browser/react';

function AdminPage() {
  const { isChecking, isAllowed, user } = useProtectedRoute({
    redirectTo: '/login',
    requiredRoles: ['admin'],
  });

  if (isChecking) return <Loading />;
  if (!isAllowed) return null; // redirect happens automatically
  return <div>Admin dashboard for {user?.email}</div>;
}
```

## usePermissions

Claim-based permission/role checks against the current token. These read from
`user.tenantPermissions` / `user.tenantRoles` — no network call.

```tsx
import { usePermissions } from '@authvital/browser/react';

function AdminPanel() {
  const {
    hasPermission,      // (permission: string) => boolean
    hasAnyPermission,   // (permissions: string[]) => boolean
    hasAllPermissions,  // (permissions: string[]) => boolean
    hasRole,            // (role: string) => boolean
    hasAnyRole,         // (roles: string[]) => boolean
    permissions,        // string[]
    roles,              // string[]
  } = usePermissions();

  if (!hasPermission('admin:access')) return <AccessDenied />;
  return <>{hasAnyRole(['admin', 'owner']) && <AdminNav />}</>;
}
```

## useTokenRefresh

Manual refresh control.

```tsx
import { useTokenRefresh } from '@authvital/browser/react';

const { refresh, isRefreshing, lastRefreshed, error } = useTokenRefresh();
await refresh();
```

## useAuthStateChange

Subscribe to auth-state transitions (analytics, logging, etc.).

```tsx
import { useAuthStateChange } from '@authvital/browser/react';

useAuthStateChange((event) => {
  analytics.track('auth_state_change', {
    from: event.previous.isAuthenticated,
    to: event.current.isAuthenticated,
    trigger: event.trigger,
  });
});
```

## useUserPreference

A small `localStorage`-backed preference store, namespaced per user. Safe because
it stores UI preferences, not tokens.

```tsx
import { useUserPreference } from '@authvital/browser/react';

const [theme, setTheme] = useUserPreference('theme', 'light');
```

---

## Related Documentation

- [Client SDK Overview](./index.md)
- [Components](./components.md)
- [Patterns & Types](./patterns.md)
- [Server SDK](../server-sdk/index.md)
