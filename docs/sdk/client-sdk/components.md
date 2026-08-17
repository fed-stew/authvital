# Client SDK Components & Gating Patterns

> Route protection and role/permission gating built on the real hooks.

!!! important "The SDK ships hooks, not pre-built UI components"
    `@authvital/browser/react` exports the `AuthVitalProvider` and a set of hooks
    — it does **not** ship `ProtectedRoute`, `SignUpForm`, `CompleteSignupForm`,
    or `VerifyEmail` components. The small components below are examples you write
    yourself on top of the hooks. (Signup/email-verification are handled on
    AuthVital's hosted pages via the OAuth redirect — see
    [Patterns & Types](./patterns.md).)

## Protecting a route

The idiomatic approach is the `useProtectedRoute` hook, which redirects
unauthenticated users and optionally checks tenant roles.

```tsx
import { useProtectedRoute } from '@authvital/browser/react';

function Dashboard() {
  const { isChecking, isAllowed, user } = useProtectedRoute({
    redirectTo: '/login',
  });

  if (isChecking) return <LoadingSpinner />;
  if (!isAllowed) return null; // redirect happens automatically

  return <div>Welcome, {user?.email}</div>;
}
```

### A reusable `RequireAuth` wrapper

If you prefer a wrapper component (e.g. for React Router), build one from
`useAuth`:

```tsx
import { useAuth } from '@authvital/browser/react';
import { Navigate, useLocation } from 'react-router-dom';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
```

!!! note "Type-only exports"
    The React entry point exports the *type* `RequireAuthProps` (and
    `AuthCallbackProps`) for convenience, but there is no bundled `RequireAuth`
    or `AuthCallback` component — you implement them as shown here.

---

## Role & permission gating

Use `usePermissions()`, which reads the current token's tenant roles/permissions
(no network call).

```tsx
import { usePermissions } from '@authvital/browser/react';

function AdminArea() {
  const { hasRole, hasPermission } = usePermissions();

  if (!hasRole('admin') && !hasRole('owner')) {
    return <p>You don't have permission to access this feature.</p>;
  }

  return <UserManagementPanel />;
}
```

### A `HasRole` gate component

```tsx
import { usePermissions } from '@authvital/browser/react';

function HasRole({
  role,
  children,
  fallback = null,
}: {
  role: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasAnyRole } = usePermissions();
  const roles = Array.isArray(role) ? role : [role];
  return hasAnyRole(roles) ? <>{children}</> : <>{fallback}</>;
}

// Usage
<HasRole role={['admin', 'owner']} fallback={<DisabledButton />}>
  <DeleteUserButton />
</HasRole>
```

### A `HasPermission` gate component

```tsx
import { usePermissions } from '@authvital/browser/react';

function HasPermission({
  permission,
  children,
  fallback = null,
}: {
  permission: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasPermission, hasAllPermissions } = usePermissions();
  const ok = Array.isArray(permission)
    ? hasAllPermissions(permission)
    : hasPermission(permission);
  return ok ? <>{children}</> : <>{fallback}</>;
}
```

---

## License & feature checks

License info is carried on the decoded user object (`user.license`), populated
from the JWT `license` claim.

```tsx
import { useUser } from '@authvital/browser/react';

function PremiumFeature() {
  const user = useUser();
  const isPro = user?.license?.type === 'pro' || user?.license?.type === 'enterprise';

  if (!isPro) {
    return (
      <div className="upgrade-prompt">
        <p>This feature requires Pro or Enterprise.</p>
        <a href="/pricing">Upgrade Now</a>
      </div>
    );
  }
  return <AdvancedAnalytics />;
}
```

### A `FeatureGate` component

```tsx
import { useUser } from '@authvital/browser/react';

function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const user = useUser();
  const hasFeature = user?.license?.features?.includes(feature) ?? false;
  if (!hasFeature) {
    return <>{fallback ?? <a href="/pricing">Upgrade to unlock {feature}</a>}</>;
  }
  return <>{children}</>;
}
```

---

## Signup & email verification

There are no client components for these. `signup()` (or `login({ screen:
'signup' })`) redirects to AuthVital's hosted signup, and email verification is
handled there too. Invitation acceptance is
`client.login({ inviteToken })` — see [Patterns & Types](./patterns.md).

---

## Error handling

```tsx
import { useAuth } from '@authvital/browser/react';

function Dashboard() {
  const { error, login } = useAuth();

  if (error) {
    return (
      <div className="error">
        <h2>Authentication Error</h2>
        <p>{error.message}</p>
        <button onClick={() => login()}>Try Again</button>
      </div>
    );
  }
  // ...
}
```

Note that `error` is an `AuthError` object (`{ code, message, originalError? }`),
not a bare string.

---

## Related Documentation

- [Client SDK Overview](./index.md)
- [Hooks Reference](./hooks.md)
- [Patterns & Types](./patterns.md)
