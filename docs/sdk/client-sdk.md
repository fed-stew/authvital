# Client SDK (React)

> Complete guide for integrating AuthVader into React applications.

## Overview

The AuthVader Client SDK provides React components and hooks for managing authentication state in your frontend application. It's designed for React/Next.js apps and handles:

- 🔐 **Authentication state management** - Track user login status
- 👤 **User data access** - Display user info, roles, permissions
- 🏢 **Multi-tenant support** - Tenant selection and switching
- 📨 **Invitation flows** - Accept and process team invitations
- 🚀 **OAuth initiation** - Start login/signup flows that redirect to AuthVader

---

## ⚠️ IMPORTANT: Cookie-Based Authentication

**The Client SDK does NOT call the AuthVader IDP directly!**

Auth state is managed via **httpOnly cookies** that your server sets. This is **intentional** for XSS protection:

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │         │ Your Server │         │  AuthVader  │
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
npm install @authvader/sdk
```

---

## Quick Setup

```tsx
import { AuthVaderProvider, useAuth } from '@authvader/sdk/client';

function App() {
  // initialUser/initialTenants come from your server (SSR props, API call, etc.)
  const { initialUser, initialTenants } = useServerData();

  return (
    <AuthVaderProvider
      authVaderHost={import.meta.env.VITE_AUTHVADER_HOST}
      clientId={import.meta.env.VITE_AUTHVADER_CLIENT_ID}
      initialUser={initialUser}
      initialTenants={initialTenants}
    >
      <MyApp />
    </AuthVaderProvider>
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

## AuthVaderProvider

Wrap your app with `AuthVaderProvider` to enable authentication:

```tsx
import { AuthVaderProvider } from '@authvader/sdk/client';

function App() {
  return (
    <AuthVaderProvider
      authVaderHost="https://auth.yourapp.com"
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
    </AuthVaderProvider>
  );
}
```

### Provider Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `authVaderHost` | `string` | Yes | AuthVader server URL |
| `clientId` | `string` | Yes | OAuth client ID |
| `redirectUri` | `string` | No | OAuth callback URL (default: `/api/auth/callback`) |
| `scope` | `string` | No | OAuth scopes (default: `openid profile email`) |
| `initialUser` | `AuthVaderUser \| null` | No | Pre-loaded user from server |
| `initialTenants` | `AuthVaderTenant[]` | No | Pre-loaded tenants from server |
| `onAuthStateChange` | `function` | No | Callback when auth state changes |

---

## useAuth Hook

The primary hook for accessing auth state and methods:

```tsx
import { useAuth } from '@authvader/sdk/client';

function Dashboard() {
  const {
    // ============ STATE ============
    isAuthenticated,   // boolean: is user logged in?
    isLoading,         // boolean: is auth state being determined?
    isSigningIn,       // boolean: is sign-in in progress?
    isSigningUp,       // boolean: is sign-up in progress?
    user,              // AuthVaderUser | null
    tenants,           // AuthVaderTenant[]
    currentTenant,     // AuthVaderTenant | null
    error,             // string | null
    
    // ============ AUTH METHODS (redirect to OAuth) ============
    login,             // (email?, password?) => Promise<LoginResult>
    signIn,            // alias for login
    signUp,            // (data?) => Promise<SignUpResult>
    signOut,           // () => Promise<void>
    logout,            // alias for signOut
    
    // ============ TENANT METHODS ============
    setActiveTenant,   // (tenantId: string) => void
    switchTenant,      // (tenantId: string) => void (alias)
    
    // ============ SESSION METHODS (no-ops, server handles) ============
    refreshToken,      // () => Promise<void> - server refreshes via cookies
    checkAuth,         // () => Promise<boolean>
    
    // ============ STATE SETTERS (NEW!) ============
    setAuthState,      // (user, tenants?) => void
    clearAuthState,    // () => void
  } = useAuth();

  // ...
}
```

---

## State Management

Since the Client SDK doesn't call the IDP directly, you need to update auth state after your server verifies the JWT:

### Setting Auth State (After Server Verification)

```tsx
import { useAuth } from '@authvader/sdk/client';

// After OAuth callback - your callback route handler
function AuthCallbackPage() {
  const { setAuthState } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    async function handleCallback() {
      // 1. Your server exchanges the code and verifies the JWT
      const response = await fetch('/api/auth/callback', {
        method: 'POST',
        body: JSON.stringify({ code: getCodeFromUrl() }),
        credentials: 'include', // Important for cookies!
      });
      
      const { user, tenants } = await response.json();
      
      // 2. Update client-side state with verified user data
      setAuthState(user, tenants);
      
      // 3. Redirect to dashboard
      navigate('/dashboard');
    }
    
    handleCallback();
  }, []);
  
  return <p>Signing you in...</p>;
}
```

### Clearing Auth State (On Logout)

```tsx
import { useAuth } from '@authvader/sdk/client';

function LogoutButton() {
  const { clearAuthState, logout } = useAuth();
  
  const handleLogout = async () => {
    // 1. Tell your server to clear the httpOnly cookies
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    
    // 2. Clear client-side state
    clearAuthState();
    
    // OR use the built-in logout which does both:
    await logout();
  };
  
  return <button onClick={handleLogout}>Sign Out</button>;
}
```

### Hydrating State on Page Load (SSR/Next.js)

```tsx
// pages/_app.tsx (Next.js)
import { AuthVaderProvider } from '@authvader/sdk/client';

function MyApp({ Component, pageProps }) {
  // Server passes user data via pageProps
  const { user, tenants } = pageProps;
  
  return (
    <AuthVaderProvider
      authVaderHost={process.env.NEXT_PUBLIC_AUTHVADER_HOST!}
      clientId={process.env.NEXT_PUBLIC_AUTHVADER_CLIENT_ID!}
      initialUser={user}
      initialTenants={tenants}
    >
      <Component {...pageProps} />
    </AuthVaderProvider>
  );
}

// In getServerSideProps:
export async function getServerSideProps(context) {
  const { getCurrentUser } = await import('@authvader/sdk');
  
  // Server verifies the JWT from cookies
  const { user, tenants } = await getCurrentUser(context.req);
  
  return {
    props: {
      user: user || null,
      tenants: tenants || [],
    },
  };
}
```

---

## useOAuth Hook

For custom OAuth flow control:

```tsx
import { useOAuth } from '@authvader/sdk/client';

function LoginPage() {
  const {
    isAuthenticated,   // boolean
    isLoading,         // boolean
    startLogin,        // (options?) => void - redirects to AuthVader login
    startSignup,       // (options?) => void - redirects to AuthVader signup
    logout,            // () => Promise<void>
  } = useOAuth({
    redirectUri: '/api/auth/callback', // optional, has default
  });
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="login-buttons">
      <button onClick={() => startLogin()}>
        Sign In
      </button>
      
      <button onClick={() => startLogin({ state: 'custom-state-value' })}>
        Sign In (with custom state)
      </button>
      
      <button onClick={() => startSignup()}>
        Create Account
      </button>
      
      <button onClick={() => startSignup({ inviteToken: 'abc123' })}>
        Accept Invitation
      </button>
    </div>
  );
}
```

### useOAuth Options

```typescript
interface UseOAuthOptions {
  redirectUri?: string;  // Override default callback URL
}

interface StartLoginOptions {
  state?: string;        // Custom state parameter
  prompt?: 'login' | 'consent' | 'select_account';
}

interface StartSignupOptions {
  state?: string;
  inviteToken?: string;  // Pre-fill invitation token
}
```

---

## useInvitation Hook

Complete invitation handling flow:

```tsx
import { useInvitation } from '@authvader/sdk/client';
import { useParams, useNavigate } from 'react-router-dom';

function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const {
    // ============ STATE ============
    invitation,       // InvitationDetails | null
    isLoading,        // boolean
    error,            // string | null
    consumed,         // boolean - Has the invite been consumed?
    hasPendingInvite, // boolean - Is there a stored invite token?
    
    // ============ METHODS ============
    fetchInvitation,  // (token: string) => Promise<InvitationDetails>
    acceptAndLogin,   // (token: string) => void - Stores token, starts OAuth
    consumeInvite,    // (token: string) => Promise<ConsumeResult>
  } = useInvitation({
    onConsumed: (result) => {
      console.log('Invitation consumed!', result);
      navigate('/dashboard');
    },
    onError: (error) => {
      console.error('Invitation error:', error);
    },
  });
  
  // Fetch invitation details on mount
  useEffect(() => {
    if (token) {
      fetchInvitation(token);
    }
  }, [token, fetchInvitation]);
  
  if (isLoading) {
    return (
      <div className="loading">
        <p>Loading invitation details...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="error">
        <h2>Invalid Invitation</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/login')}>
          Go to Login
        </button>
      </div>
    );
  }
  
  if (consumed) {
    return (
      <div className="success">
        <h2>Welcome to {invitation?.tenant.name}!</h2>
        <p>Your invitation has been accepted.</p>
        <button onClick={() => navigate('/dashboard')}>
          Go to Dashboard
        </button>
      </div>
    );
  }
  
  return (
    <div className="invitation">
      {invitation && (
        <>
          <h1>You've been invited!</h1>
          
          <div className="invite-details">
            <p>You've been invited to join <strong>{invitation.tenant.name}</strong></p>
            
            {invitation.invitedBy && (
              <p>Invited by: {invitation.invitedBy.name}</p>
            )}
            
            <p>Role: <strong>{invitation.role}</strong></p>
            <p>Email: {invitation.email}</p>
            <p>Expires: {new Date(invitation.expiresAt).toLocaleDateString()}</p>
          </div>
          
          <div className="actions">
            <button 
              className="primary"
              onClick={() => acceptAndLogin(token!)}
            >
              Accept Invitation & Sign In
            </button>
            
            <button 
              className="secondary"
              onClick={() => navigate('/')}
            >
              Decline
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

### Invitation Flow Explained

The invitation flow has multiple steps:

```
1. User clicks invite link → /invite/{token}
2. fetchInvitation(token) → Shows invite details
3. User clicks "Accept"
4. acceptAndLogin(token):
   a. Stores token in sessionStorage
   b. Redirects to OAuth login/signup
5. After OAuth, your callback:
   a. Checks for pending invite token
   b. Calls consumeInvite(token)
   c. User is added to tenant
6. onConsumed callback fires
7. Redirect to dashboard
```

### Handling Pending Invites in Your Callback

```tsx
// In your /api/auth/callback page or route
function AuthCallback() {
  const { hasPendingInvite, consumeInvite, setAuthState } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    async function processCallback() {
      // 1. Exchange code on your server
      const response = await fetch('/api/auth/callback', {
        method: 'POST',
        body: JSON.stringify({ code: getCodeFromUrl() }),
        credentials: 'include',
      });
      
      const { user, tenants } = await response.json();
      setAuthState(user, tenants);
      
      // 2. Check for pending invitation
      if (hasPendingInvite) {
        const token = sessionStorage.getItem('pendingInviteToken');
        if (token) {
          await consumeInvite(token);
          sessionStorage.removeItem('pendingInviteToken');
        }
      }
      
      navigate('/dashboard');
    }
    
    processCallback();
  }, []);
  
  return <p>Processing...</p>;
}
```

### useInvitation Types

```typescript
interface InvitationDetails {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  invitedBy: {
    name: string;
  } | null;
}

interface ConsumeResult {
  success: boolean;
  tenantId: string;
  userId: string;
}

interface UseInvitationOptions {
  onConsumed?: (result: ConsumeResult) => void;
  onError?: (error: string) => void;
}
```

---

## useAuthVaderConfig Hook

Access provider configuration values:

```tsx
import { useAuthVaderConfig } from '@authvader/sdk/client';

function CustomOAuthButton() {
  const { authVaderHost, clientId, redirectUri } = useAuthVaderConfig();
  
  // Build custom OAuth URL
  const oauthUrl = `${authVaderHost}/oauth/authorize?` + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
  });
  
  return (
    <a href={oauthUrl} className="custom-login-button">
      Sign in with AuthVader
    </a>
  );
}
```

### Config Values

```typescript
interface AuthVaderConfig {
  authVaderHost: string;   // e.g., "https://auth.yourapp.com"
  clientId: string;        // OAuth client ID
  redirectUri: string;     // OAuth callback URL
  scope: string;           // OAuth scopes
}
```

---

## Helper Hooks

Convenience hooks for common patterns:

### useUser

```tsx
import { useUser } from '@authvader/sdk/client';

function ProfileCard() {
  const user = useUser(); // AuthVaderUser | null
  
  if (!user) return null;
  
  return (
    <div className="profile-card">
      {user.imageUrl && <img src={user.imageUrl} alt={user.fullName || ''} />}
      <h3>{user.fullName || user.email}</h3>
      <p>{user.email}</p>
    </div>
  );
}
```

### useTenant

```tsx
import { useTenant } from '@authvader/sdk/client';

function TenantBanner() {
  const tenant = useTenant(); // AuthVaderTenant | null (current tenant)
  
  if (!tenant) return null;
  
  return (
    <div className="tenant-banner">
      {tenant.imageUrl && <img src={tenant.imageUrl} alt={tenant.name} />}
      <span>{tenant.name}</span>
      <span className="role">{tenant.role}</span>
    </div>
  );
}
```

### useTenants

```tsx
import { useTenants } from '@authvader/sdk/client';

function TenantSwitcher() {
  const { tenants, currentTenant, switchTenant } = useTenants();
  
  if (tenants.length <= 1) return null;
  
  return (
    <select
      value={currentTenant?.id || ''}
      onChange={(e) => switchTenant(e.target.value)}
    >
      {tenants.map((tenant) => (
        <option key={tenant.id} value={tenant.id}>
          {tenant.name}
        </option>
      ))}
    </select>
  );
}
```

---

## OAuth Flow

### How Cookie-Based Auth Works

1. **User clicks "Login"** → Client calls `startLogin()` or `login()`
2. **Redirect to AuthVader** → User authenticates on AuthVader's hosted pages
3. **OAuth callback** → AuthVader redirects to your `redirectUri` with `code`
4. **Your server exchanges code** → Server SDK's `exchangeCode()` gets JWT
5. **Server sets httpOnly cookie** → JWT stored securely, inaccessible to JS
6. **Server returns user data** → JSON response with user/tenants
7. **Client updates state** → `setAuthState(user, tenants)`

### Example Server Callback (Express)

```typescript
import { exchangeCode, getCurrentUser } from '@authvader/sdk';

app.post('/api/auth/callback', async (req, res) => {
  const { code } = req.body;
  
  // 1. Exchange code for tokens
  const { accessToken, refreshToken } = await exchangeCode(code);
  
  // 2. Set httpOnly cookies
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
  
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  
  // 3. Return user data for client state
  const { user, tenants } = await getCurrentUser(req);
  
  res.json({ user, tenants });
});
```

### Example Server Callback (Next.js API Route)

```typescript
// pages/api/auth/callback.ts
import { exchangeCode, getCurrentUser } from '@authvader/sdk';
import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { code } = req.body;
  
  const { accessToken, refreshToken } = await exchangeCode(code);
  
  // Set cookies
  res.setHeader('Set-Cookie', [
    serialize('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    }),
    serialize('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    }),
  ]);
  
  const { user, tenants } = await getCurrentUser(req);
  
  res.json({ user, tenants });
}
```

---

## Protected Routes

### Using ProtectedRoute Component

```tsx
import { ProtectedRoute } from '@authvader/sdk/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <AuthVaderProvider {...config}>
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
    </AuthVaderProvider>
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
import { useAuth } from '@authvader/sdk/client';
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
import { useAuth } from '@authvader/sdk/client';

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

### Permission Component

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

> **Note:** License information should be checked server-side and passed to the client via the user object. The client SDK doesn't have direct access to license data.

### Check License Type (if included in user data)

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

## Pre-Built Components

### SignUpForm

```tsx
import { SignUpForm } from '@authvader/sdk/client';

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
import { CompleteSignupForm } from '@authvader/sdk/client';

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
import { VerifyEmail } from '@authvader/sdk/client';

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

## TypeScript Types

```typescript
import type {
  AuthVaderUser,
  AuthVaderTenant,
  AuthVaderProviderProps,
  AuthContextValue,
  InvitationDetails,
} from '@authvader/sdk/client';
```

### AuthVaderUser

```typescript
interface AuthVaderUser {
  id: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  fullName: string | null;
  imageUrl?: string | null;
  isAnonymous: boolean;
  createdAt?: string;
  updatedAt?: string;
}
```

### AuthVaderTenant

```typescript
interface AuthVaderTenant {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  role: string;  // "owner", "admin", "member", etc.
}
```

### AuthContextValue

```typescript
interface AuthContextValue {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  isSigningUp: boolean;
  user: AuthVaderUser | null;
  tenants: AuthVaderTenant[];
  currentTenant: AuthVaderTenant | null;
  error: string | null;
  
  // Auth methods (redirect to OAuth)
  login: (email?: string, password?: string) => Promise<LoginResult>;
  signIn: (email?: string, password?: string) => Promise<LoginResult>;
  signUp: (data?: SignUpData) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>;
  
  // Tenant methods
  setActiveTenant: (tenantId: string) => void;
  switchTenant: (tenantId: string) => void;
  
  // Session methods (no-ops, server handles)
  refreshToken: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  
  // State setters
  setAuthState: (user: AuthVaderUser | null, tenants?: AuthVaderTenant[]) => void;
  clearAuthState: () => void;
}
```

### InvitationDetails

```typescript
interface InvitationDetails {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  invitedBy: {
    name: string;
  } | null;
}
```

---

## Environment Variables

```bash
# .env (Vite)
VITE_AUTHVADER_HOST=https://auth.yourapp.com
VITE_AUTHVADER_CLIENT_ID=your-client-id

# .env (Create React App)
REACT_APP_AUTHVADER_HOST=https://auth.yourapp.com
REACT_APP_AUTHVADER_CLIENT_ID=your-client-id

# .env (Next.js - client-side)
NEXT_PUBLIC_AUTHVADER_HOST=https://auth.yourapp.com
NEXT_PUBLIC_AUTHVADER_CLIENT_ID=your-client-id
```

**⚠️ Never expose `CLIENT_SECRET` to the browser! The secret is only used server-side.**

---

## Summary: The Auth Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT-SIDE (React)                              │
├─────────────────────────────────────────────────────────────────────────┤
│  1. User clicks login                                                   │
│  2. useAuth().login() or useOAuth().startLogin()                        │
│  3. Redirect to AuthVader IDP                                           │
│                                  ↓                                      │
│  4. User authenticates on AuthVader                                     │
│                                  ↓                                      │
│  5. Redirect back to YOUR callback URL with `code`                      │
│                                  ↓                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                         SERVER-SIDE (Your API)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  6. POST code to your /api/auth/callback                                │
│  7. Server calls exchangeCode(code) → gets JWT                          │
│  8. Server sets httpOnly cookies (access_token, refresh_token)          │
│  9. Server calls getCurrentUser() → gets user data                      │
│ 10. Server returns { user, tenants } JSON                               │
│                                  ↓                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                         CLIENT-SIDE (React)                              │
├─────────────────────────────────────────────────────────────────────────┤
│ 11. setAuthState(user, tenants) → updates React context                 │
│ 12. isAuthenticated = true, user is available!                          │
│ 13. Redirect to dashboard                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Remember:**
- ✅ JS can see user data (name, email, roles)
- ❌ JS cannot see JWT tokens (httpOnly cookies)
- ✅ All API calls automatically include cookies
- ✅ Server verifies JWT on every request

---

## Related Documentation

- [Server SDK](./server-sdk.md) - Server-side token verification & user retrieval
- [OAuth Flow](../concepts/oauth-flow.md) - Detailed OAuth implementation guide
- [Quick Start Guide](../getting-started/quick-start.md) - Get started in 5 minutes
