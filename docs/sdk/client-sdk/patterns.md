# Client SDK Patterns

> OAuth flow, state management, and TypeScript types.

## OAuth Flow

### How Cookie-Based Auth Works

1. **User clicks "Login"** → Client calls `startLogin()` or `login()`
2. **Redirect to AuthVital** → User authenticates on AuthVital's hosted pages
3. **OAuth callback** → AuthVital redirects to your `redirectUri` with `code`
4. **Your server exchanges code** → Server SDK's `exchangeCode()` gets JWT
5. **Server sets httpOnly cookie** → JWT stored securely, inaccessible to JS
6. **Server returns user data** → JSON response with user/tenants
7. **Client updates state** → `setAuthState(user, tenants)`

### Example Server Callback (Express)

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import { OAuthFlow } from '@authvital/sdk/server';

const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
});

const oauth = new OAuthFlow({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  redirectUri: 'https://yourapp.com/api/auth/callback',
});

app.post('/api/auth/callback', async (req, res) => {
  const { code, codeVerifier } = req.body;
  
  // 1. Exchange code for tokens
  const tokens = await oauth.exchangeCode(code, codeVerifier);
  
  // 2. Set httpOnly cookies
  res.cookie('access_token', tokens.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
  
  res.cookie('refresh_token', tokens.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  
  // 3. Get user data from the token
  const { user } = await authvital.getCurrentUser(req);
  
  // 4. Get user's tenants
  const { memberships } = await authvital.memberships.listTenantsForUser(req);
  
  res.json({ 
    user,
    tenants: memberships.map(m => m.tenant),
  });
});
```

### Example Server Callback (Next.js API Route)

```typescript
// pages/api/auth/callback.ts
import { createAuthVital, OAuthFlow } from '@authvital/sdk/server';
import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
});

const oauth = new OAuthFlow({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  redirectUri: 'https://yourapp.com/api/auth/callback',
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { code, codeVerifier } = req.body;
  const tokens = await oauth.exchangeCode(code, codeVerifier);
  
  // Set cookies
  res.setHeader('Set-Cookie', [
    serialize('access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    }),
    serialize('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    }),
  ]);
  
  const { user } = await authvital.getCurrentUser(req);
  const { memberships } = await authvital.memberships.listTenantsForUser(req);
  
  res.json({ 
    user,
    tenants: memberships.map(m => m.tenant),
  });
}
```

---

## Handling Pending Invites in Callback

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

---

## TypeScript Types

```typescript
import type {
  AuthVitalUser,
  AuthVitalTenant,
  AuthVitalProviderProps,
  AuthContextValue,
  InvitationDetails,
} from '@authvital/sdk/client';
```

### AuthVitalUser

```typescript
interface AuthVitalUser {
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

### AuthVitalTenant

```typescript
interface AuthVitalTenant {
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
  user: AuthVitalUser | null;
  tenants: AuthVitalTenant[];
  currentTenant: AuthVitalTenant | null;
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
  setAuthState: (user: AuthVitalUser | null, tenants?: AuthVitalTenant[]) => void;
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

### AuthVitalConfig

```typescript
interface AuthVitalConfig {
  authVitalHost: string;   // e.g., "https://auth.yourapp.com"
  clientId: string;        // OAuth client ID
  redirectUri: string;     // OAuth callback URL
  scope: string;           // OAuth scopes
}
```

---

## Auth Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT-SIDE (React)                              │
├─────────────────────────────────────────────────────────────────────────┤
│  1. User clicks login                                                   │
│  2. useAuth().login() or useOAuth().startLogin()                        │
│  3. Redirect to AuthVital IDP                                           │
│                                  ↓                                      │
│  4. User authenticates on AuthVital                                     │
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

- [Client SDK Overview](./index.md)
- [Hooks Reference](./hooks.md)
- [Components](./components.md)
- [Server SDK](../server-sdk/index.md) - Server-side token verification
- [OAuth Flow](../../concepts/oauth-flow.md) - Detailed OAuth implementation guide
