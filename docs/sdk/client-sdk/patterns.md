# Client SDK Patterns & Types

> OAuth callback handling, invitations, tenant switching, and TypeScript types.

## OAuth flow (handled client-side)

With `@authvital/browser`, the authorization-code exchange happens **in the
browser** — you don't need a server round-trip for it (that's the BFF pattern,
which is the [Server SDK](../server-sdk/index.md)).

1. **User clicks login** -> `useAuth().login()` (or `client.login()`).
2. **Redirect to AuthVital** -> user authenticates on the hosted pages.
3. **Callback** -> AuthVital redirects to your `redirectUri` with a `code`.
4. **SDK exchanges the code** -> `handleCallback()` / `useAuthCallback()` swaps
   the code for tokens and stores the access token in memory (refresh token is an
   httpOnly cookie set by the IdP).
5. **State updates** -> `isAuthenticated` flips to `true`, `user` is available.

### Callback route

```tsx
import { useAuthCallback } from '@authvital/browser/react';

function AuthCallbackPage() {
  const { isProcessing, error } = useAuthCallback({
    onSuccess: () => router.push('/dashboard'),
    onError: (err) => console.error('Auth failed', err),
  });

  if (isProcessing) return <p>Signing you in…</p>;
  if (error) return <p>Login failed: {error.description}</p>;
  return null;
}
```

Prefer imperative control? Call the client directly:

```tsx
import { useAuthVitalClient } from '@authvital/browser/react';

const client = useAuthVitalClient();
const result = await client.handleCallback(); // defaults to window.location.href
if (result.success) {
  router.push('/dashboard');
}
```

---

## Invitations

There is no `useInvitation` hook. Invitation acceptance is just an OAuth login
carrying the invite token — AuthVital validates and consumes it during login:

```tsx
import { useAuthVitalClient } from '@authvital/browser/react';

function AcceptInvite({ token }: { token: string }) {
  const client = useAuthVitalClient();
  return (
    <button onClick={() => client.login({ inviteToken: token })}>
      Accept Invitation & Sign In
    </button>
  );
}
```

If you need to *display* invitation details, or list/revoke invitations, do it
**server-side** with the Server SDK integration client
(`client.integration.listInvitations`, `sendInvitation`, `revokeInvitation`).

---

## Tenant switching

An access token is scoped to one tenant, and the browser SDK has **no in-place
tenant switch** — switching tenants means a fresh login with a `tenantHint`
(commonly combined with navigating to the tenant's subdomain):

```tsx
import { useAuthVitalClient } from '@authvital/browser/react';

const client = useAuthVitalClient();
client.login({ tenantHint: 'acme' }); // re-login scoped to the "acme" tenant
```

The current tenant is available on the user object as `user.tenantId` /
`user.tenantSubdomain`.

---

## TypeScript types

```typescript
import type {
  AuthUser,
  AuthState,
  AuthError,
  AuthorizationOptions,
  OAuthCallbackResult,
  LoginResult,
  LogoutResult,
  RefreshResult,
} from '@authvital/browser';

import type {
  AuthVitalProviderProps,
  AuthContextValue,
  UseAuthReturn,
} from '@authvital/browser/react';
```

### AuthUser

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

There is no separate `AuthVitalUser` / `AuthVitalTenant` type, and no `tenants`
array on the context — tenant context is carried on `AuthUser` for the currently
active tenant.

### AuthContextValue (returned by `useAuth`)

```typescript
interface AuthContextValue {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  error: AuthError | null;

  // Actions
  login: (options?: AuthorizationOptions) => void;
  signIn: (options?: AuthorizationOptions) => void;   // alias
  signup: (options?: AuthorizationOptions) => void;
  signUp: (options?: AuthorizationOptions) => void;    // alias
  logout: () => Promise<LogoutResult>;
  signOut: () => Promise<LogoutResult>;                // alias
  refreshToken: () => Promise<RefreshResult>;
  checkAuth: () => Promise<boolean>;
  handleCallback: (url?: string) => Promise<OAuthCallbackResult>;
  getApiClient: () => import('axios').AxiosInstance;
}
```

### AuthorizationOptions

```typescript
interface AuthorizationOptions {
  email?: string;
  screen?: 'login' | 'signup';
  state?: string;        // custom state (bypasses auto-CSRF)
  inviteToken?: string;  // team invitation token
  tenantHint?: string;   // pre-select a tenant
}
```

---

## Related Documentation

- [Client SDK Overview](./index.md)
- [Hooks Reference](./hooks.md)
- [Components & Gating Patterns](./components.md)
- [Server SDK](../server-sdk/index.md) — server-side / BFF integration
- [OAuth Flow](../../concepts/oauth-flow.md)
