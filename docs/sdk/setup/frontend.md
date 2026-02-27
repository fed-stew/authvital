# Frontend Setup

> Set up React provider and authentication hooks.

---

## Important: Cookie-Based Auth

**The Client SDK does NOT call the AuthVital IDP directly!**

Auth state is managed via **httpOnly cookies** that your server sets. This is intentional for XSS protection.

```
User clicks login → Redirects to AuthVital → Returns with code
                                            ↓
                         Your server exchanges code for tokens
                                            ↓
                         Your server sets httpOnly cookies
                                            ↓
                         Frontend calls /api/auth/me
                                            ↓
                         React state updated via setAuthState()
```

---

## Provider Setup

### Next.js App Router

```tsx
// app/providers.tsx
'use client';

import { AuthVitalProvider } from '@authvital/sdk/client';

interface ProvidersProps {
  children: React.ReactNode;
  initialUser?: any | null;
  initialTenants?: any[];
}

export function Providers({
  children,
  initialUser = null,
  initialTenants = [],
}: ProvidersProps) {
  return (
    <AuthVitalProvider
      authVitalHost={process.env.NEXT_PUBLIC_AV_HOST!}
      clientId={process.env.NEXT_PUBLIC_AV_CLIENT_ID!}
      initialUser={initialUser}
      initialTenants={initialTenants}
    >
      {children}
    </AuthVitalProvider>
  );
}
```

### Root Layout with Server-Side User

```tsx
// app/layout.tsx
import { cookies } from 'next/headers';
import { Providers } from './providers';
import { authvital } from '@/lib/authvital';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialUser = null;
  let initialTenants = [];

  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (accessToken) {
    try {
      const mockReq = {
        cookies: { access_token: accessToken },
        headers: {},
      };

      const { authenticated, user } = await authvital.getCurrentUser(mockReq as any);

      if (authenticated && user) {
        initialUser = {
          id: user.sub,
          email: user.email,
          name: user.name || `${user.given_name || ''} ${user.family_name || ''}`.trim(),
          picture: user.picture,
          tenantId: user.tenant_id,
          tenantRoles: user.tenant_roles || [],
          appPermissions: user.app_permissions || [],
          license: user.license,
        };
      }
    } catch (error) {
      console.error('Error loading initial user:', error);
    }
  }

  return (
    <html lang="en">
      <body>
        <Providers initialUser={initialUser} initialTenants={initialTenants}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

---

## useAuth Hook

Access auth state and methods in your components:

```tsx
import { useAuth } from '@authvital/sdk/client';

function Dashboard() {
  const {
    // State
    isAuthenticated,
    isLoading,
    user,
    tenants,
    currentTenant,
    error,
    
    // Auth methods (redirect to OAuth)
    login,
    logout,
    
    // Tenant methods
    setActiveTenant,
    
    // State setters (for server-verified data)
    setAuthState,
    clearAuthState,
  } = useAuth();

  // ...
}
```

---

## User Menu Component

```tsx
// components/UserMenu.tsx
'use client';

import { useAuth } from '@authvital/sdk/client';
import { useState } from 'react';

export function UserMenu() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return <div className="animate-pulse h-8 w-8 rounded-full bg-gray-200" />;
  }

  if (!isAuthenticated) {
    return (
      <a
        href="/api/auth/login"
        className="px-4 py-2 bg-blue-600 text-white rounded-lg"
      >
        Sign In
      </a>
    );
  }

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2">
        {user?.picture ? (
          <img src={user.picture} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
            {user?.email?.[0].toUpperCase()}
          </div>
        )}
        <span>{user?.name || user?.email}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1">
          <div className="px-4 py-2 text-sm text-gray-500">{user?.email}</div>
          <hr />
          <a href="/settings" className="block px-4 py-2 text-sm hover:bg-gray-100">
            Settings
          </a>
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Protected Route Component

```tsx
// components/ProtectedRoute.tsx
'use client';

import { useAuth } from '@authvital/sdk/client';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permissions?: string[];
  roles?: string[];
  licenseFeature?: string;
}

export function ProtectedRoute({
  children,
  permissions = [],
  roles = [],
  licenseFeature,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(`/api/auth/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  // Check permissions
  if (permissions.length > 0) {
    const userPerms = user?.appPermissions || [];
    const hasAll = permissions.every(p => userPerms.includes(p));
    if (!hasAll) {
      return (
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p>You don't have permission to view this page.</p>
        </div>
      );
    }
  }

  // Check roles
  if (roles.length > 0) {
    const userRoles = user?.tenantRoles || [];
    const hasRole = roles.some(r => userRoles.includes(r));
    if (!hasRole) {
      return (
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p>This page requires a specific role.</p>
        </div>
      );
    }
  }

  // Check license feature
  if (licenseFeature) {
    const features = user?.license?.features || [];
    if (!features.includes(licenseFeature)) {
      return (
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold text-amber-600">Upgrade Required</h1>
          <p>This feature requires a different license plan.</p>
        </div>
      );
    }
  }

  return <>{children}</>;
}
```

**Usage:**

```tsx
// app/admin/page.tsx
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function AdminPage() {
  return (
    <ProtectedRoute roles={['admin', 'owner']}>
      <h1>Admin Dashboard</h1>
    </ProtectedRoute>
  );
}
```

---

## Next Steps

- [Common Patterns](./patterns.md) - Permission checks, license gates
- [Client SDK Reference](../client-sdk/index.md) - Complete API reference
