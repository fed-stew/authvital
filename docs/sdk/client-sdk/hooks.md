# Client SDK Hooks

> React hooks for authentication, OAuth, invitations, and more.

## useAuth Hook

The primary hook for accessing auth state and methods:

```tsx
import { useAuth } from '@authvital/sdk/client';

function Dashboard() {
  const {
    // ============ STATE ============
    isAuthenticated,   // boolean: is user logged in?
    isLoading,         // boolean: is auth state being determined?
    isSigningIn,       // boolean: is sign-in in progress?
    isSigningUp,       // boolean: is sign-up in progress?
    user,              // AuthVitalUser | null
    tenants,           // AuthVitalTenant[]
    currentTenant,     // AuthVitalTenant | null
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
    
    // ============ STATE SETTERS ============
    setAuthState,      // (user, tenants?) => void
    clearAuthState,    // () => void
  } = useAuth();

  // ...
}
```

---

## State Management

Since the Client SDK doesn't call the IDP directly, you need to update auth state after your server verifies the JWT.

### Setting Auth State (After Server Verification)

```tsx
import { useAuth } from '@authvital/sdk/client';

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
import { useAuth } from '@authvital/sdk/client';

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
import { AuthVitalProvider } from '@authvital/sdk/client';

function MyApp({ Component, pageProps }) {
  // Server passes user data via pageProps
  const { user, tenants } = pageProps;
  
  return (
    <AuthVitalProvider
      authVitalHost={process.env.NEXT_PUBLIC_AUTHVITAL_HOST!}
      clientId={process.env.NEXT_PUBLIC_AUTHVITAL_CLIENT_ID!}
      initialUser={user}
      initialTenants={tenants}
    >
      <Component {...pageProps} />
    </AuthVitalProvider>
  );
}

// In getServerSideProps:
export async function getServerSideProps(context) {
  const { getCurrentUser } = await import('@authvital/sdk');
  
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
import { useOAuth } from '@authvital/sdk/client';

function LoginPage() {
  const {
    isAuthenticated,   // boolean
    isLoading,         // boolean
    startLogin,        // (options?) => void - redirects to AuthVital login
    startSignup,       // (options?) => void - redirects to AuthVital signup
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

### useOAuth Types

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
import { useInvitation } from '@authvital/sdk/client';
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
    return <p>Loading invitation details...</p>;
  }
  
  if (error) {
    return (
      <div className="error">
        <h2>Invalid Invitation</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/login')}>Go to Login</button>
      </div>
    );
  }
  
  if (consumed) {
    return (
      <div className="success">
        <h2>Welcome to {invitation?.tenant.name}!</h2>
        <p>Your invitation has been accepted.</p>
        <button onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
      </div>
    );
  }
  
  return (
    <div className="invitation">
      {invitation && (
        <>
          <h1>You've been invited!</h1>
          <p>Join <strong>{invitation.tenant.name}</strong></p>
          <p>Role: <strong>{invitation.role}</strong></p>
          
          <button onClick={() => acceptAndLogin(token!)}>
            Accept Invitation & Sign In
          </button>
        </>
      )}
    </div>
  );
}
```

### Invitation Flow

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

## Helper Hooks

Convenience hooks for common patterns:

### useUser

```tsx
import { useUser } from '@authvital/sdk/client';

function ProfileCard() {
  const user = useUser(); // AuthVitalUser | null
  
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
import { useTenant } from '@authvital/sdk/client';

function TenantBanner() {
  const tenant = useTenant(); // AuthVitalTenant | null (current tenant)
  
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
import { useTenants } from '@authvital/sdk/client';

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

### useAuthVitalConfig

Access provider configuration values:

```tsx
import { useAuthVitalConfig } from '@authvital/sdk/client';

function CustomOAuthButton() {
  const { authVitalHost, clientId, redirectUri } = useAuthVitalConfig();
  
  // Build custom OAuth URL
  const oauthUrl = `${authVitalHost}/oauth/authorize?` + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
  });
  
  return (
    <a href={oauthUrl} className="custom-login-button">
      Sign in with AuthVital
    </a>
  );
}
```

---

## Related Documentation

- [Client SDK Overview](./index.md)
- [Components](./components.md)
- [Patterns](./patterns.md)
