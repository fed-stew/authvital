# Client SDK Components

> Pre-built React components for authentication flows.

## Protected Routes

### Using ProtectedRoute Component

```tsx
import { ProtectedRoute } from '@authvital/sdk/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <AuthVitalProvider {...config}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />
          <Route path="/pricing" element={<Pricing />} />
          
          {/* Protected routes */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          
          {/* Role-protected route */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute requiredRoles={['admin', 'owner']}>
                <AdminPanel />
              </ProtectedRoute>
            } 
          />
          
          {/* Permission-protected route */}
          <Route 
            path="/users" 
            element={
              <ProtectedRoute requiredPermissions={['users:read']}>
                <UserList />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </BrowserRouter>
    </AuthVitalProvider>
  );
}
```

### ProtectedRoute Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Content to render when authorized |
| `requiredRoles` | `string[]` | Roles required (ANY match) |
| `requiredPermissions` | `string[]` | Permissions required (ALL match) |
| `fallback` | `ReactNode` | Custom loading component |
| `unauthorizedComponent` | `ReactNode` | Shown when access denied |

### Custom Protected Route

```tsx
import { useAuth } from '@authvital/sdk/client';
import { Navigate, useLocation } from 'react-router-dom';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, login } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    // Save location for redirect after login
    sessionStorage.setItem('redirectAfterLogin', location.pathname);
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
```

---

## Permission & Role Checks

### Direct Permission Check

```tsx
import { useAuth } from '@authvital/sdk/client';

function AdminFeature() {
  const { user, currentTenant } = useAuth();
  
  // Check tenant role
  const isAdmin = currentTenant?.role === 'admin' || currentTenant?.role === 'owner';

  if (!isAdmin) {
    return <p>You don't have permission to access this feature.</p>;
  }

  return <UserManagementPanel />;
}
```

### HasRole Component

```tsx
function HasRole({ 
  role, 
  children,
  fallback = null,
}: { 
  role: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { currentTenant } = useAuth();
  
  const roles = Array.isArray(role) ? role : [role];
  const hasRole = currentTenant && roles.includes(currentTenant.role);
  
  if (!hasRole) return <>{fallback}</>;
  return <>{children}</>;
}

// Usage
<HasRole role={['admin', 'owner']} fallback={<DisabledButton />}>
  <DeleteUserButton />
</HasRole>
```

---

## License & Feature Checks

!!! note
    License information should be checked server-side and passed to the client via the user object. The client SDK doesn't have direct access to license data.

### Check License Type

```tsx
function PremiumFeature() {
  const { user } = useAuth();
  
  // Assuming your server includes license info in the user object
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

### FeatureGate Component

```tsx
function FeatureGate({ 
  feature, 
  children,
  fallback,
}: { 
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { user } = useAuth();
  const hasFeature = user?.license?.features?.includes(feature);

  if (!hasFeature) {
    return fallback || (
      <div className="feature-locked">
        <p>Upgrade to unlock {feature}</p>
        <a href="/pricing">View Plans</a>
      </div>
    );
  }

  return <>{children}</>;
}

// Usage
<FeatureGate feature="advanced-reports">
  <ReportBuilder />
</FeatureGate>
```

---

## Pre-Built Form Components

### SignUpForm

```tsx
import { SignUpForm } from '@authvital/sdk/client';

function SignUpPage() {
  return (
    <SignUpForm 
      onSuccess={(user) => {
        console.log('Signed up:', user);
        navigate('/dashboard');
      }}
      onError={(error) => {
        console.error('Signup failed:', error);
      }}
      fields={['email', 'password', 'givenName', 'familyName']}
    />
  );
}
```

### CompleteSignupForm

For completing signup after invitation:

```tsx
import { CompleteSignupForm } from '@authvital/sdk/client';

function CompleteSignupPage() {
  const { token } = useParams(); // Invitation token from URL

  return (
    <CompleteSignupForm 
      invitationToken={token}
      onSuccess={(user) => {
        navigate('/dashboard');
      }}
    />
  );
}
```

### VerifyEmail

```tsx
import { VerifyEmail } from '@authvital/sdk/client';

function VerifyEmailPage() {
  const { token } = useParams();

  return (
    <VerifyEmail 
      token={token}
      onSuccess={() => navigate('/dashboard')}
      onError={(error) => console.error(error)}
    />
  );
}
```

---

## Error Handling

```tsx
function Dashboard() {
  const { error, isAuthenticated, clearAuthState } = useAuth();

  if (error) {
    return (
      <div className="error">
        <h2>Authentication Error</h2>
        <p>{error}</p>
        <button onClick={() => {
          clearAuthState();
          window.location.href = '/login';
        }}>
          Try Again
        </button>
      </div>
    );
  }

  // ...
}
```

---

## Related Documentation

- [Client SDK Overview](./index.md)
- [Hooks Reference](./hooks.md)
- [Patterns](./patterns.md)
