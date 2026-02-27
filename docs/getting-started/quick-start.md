# Quick Start Guide

> Get AuthVital integrated into your application in under 5 minutes.

## Prerequisites

- Node.js 18+ 
- An AuthVital instance running (see [Installation](./installation.md))
- An OAuth application created in AuthVital Admin Panel

## Step 1: Install the SDK

```bash
npm install @authvital/sdk
# or
yarn add @authvital/sdk
# or
pnpm add @authvital/sdk
```

## Step 2: Get Your Credentials

From the AuthVital Admin Panel, create an application and note:

| Credential | Example | Where to find |
|------------|---------|---------------|
| `AUTHVITAL_HOST` | `https://auth.yourcompany.com` | Your AuthVital URL |
| `CLIENT_ID` | `a1b2c3d4-e5f6-...` | Application → Settings |
| `CLIENT_SECRET` | `secret_xyz...` | Application → Settings (server only) |

## Step 3: Server-Side Setup (Node.js/Express)

### 3a. Configure the SDK

```typescript
// lib/authvital.ts
import { createAuthVital } from '@authvital/sdk/server';

export const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
});
```

### 3b. Protect Your API Routes

```typescript
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { authvital } from '../lib/authvital';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { authenticated, user, error } = await authvital.getCurrentUser(req);
  
  if (!authenticated) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: error || 'Authentication required' 
    });
  }
  
  // Attach user to request for downstream handlers
  req.user = user;
  next();
}
```

### 3c. Use in Your Routes

```typescript
// routes/api.ts
import express from 'express';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

// Public route
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Protected route
router.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.sub,
    email: req.user.email,
    name: `${req.user.given_name} ${req.user.family_name}`,
    tenant: req.user.tenant_id,
    roles: req.user.app_roles,
    permissions: req.user.app_permissions,
  });
});

// Permission-protected route
router.post('/admin/users', requireAuth, async (req, res) => {
  const { allowed } = await authvital.permissions.check(req, {
    permission: 'users:write',
  });
  
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Handle admin action...
});

export default router;
```

## Step 4: Client-Side Setup (React)

### 4a. Wrap Your App with AuthVitalProvider

```tsx
// App.tsx
import { AuthVitalProvider } from '@authvital/sdk/client';
import { Dashboard } from './pages/Dashboard';

export function App() {
  return (
    <AuthVitalProvider
      authVitalHost={import.meta.env.VITE_AUTHVITAL_HOST}
      clientId={import.meta.env.VITE_AUTHVITAL_CLIENT_ID}
    >
      <Dashboard />
    </AuthVitalProvider>
  );
}
```

### 4b. Use the Auth Hook

```tsx
// pages/Dashboard.tsx
import { useAuthVital } from '@authvital/sdk/client';

export function Dashboard() {
  const { 
    user, 
    isAuthenticated, 
    isLoading, 
    login, 
    logout 
  } = useAuthVital();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div>
        <h1>Welcome to MyApp</h1>
        <button onClick={login}>Sign In</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Welcome, {user.given_name}!</h1>
      <p>Email: {user.email}</p>
      <p>Tenant: {user.tenant_id}</p>
      <button onClick={logout}>Sign Out</button>
    </div>
  );
}
```

### 4c. Protect Routes

```tsx
// components/ProtectedRoute.tsx
import { ProtectedRoute } from '@authvital/sdk/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute requiredPermissions={['admin:access']}>
              <AdminPanel />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}
```

## Step 5: Environment Variables

### Server (.env)

```bash
AUTHVITAL_HOST=https://auth.yourcompany.com
AUTHVITAL_CLIENT_ID=your-client-id
AUTHVITAL_CLIENT_SECRET=your-client-secret
```

### Client (.env)

```bash
VITE_AUTHVITAL_HOST=https://auth.yourcompany.com
VITE_AUTHVITAL_CLIENT_ID=your-client-id
# Never expose CLIENT_SECRET to the client!
```

## Complete Example

Here's a minimal full-stack example:

### Server (Express)

```typescript
// server.ts
import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuthVital } from '@authvital/sdk/server';

const app = express();
app.use(cookieParser());
app.use(express.json());

const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
});

// Auth middleware
const requireAuth = async (req, res, next) => {
  const { authenticated, user } = await authvital.getCurrentUser(req);
  if (!authenticated) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
};

// Routes
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/tenants', requireAuth, async (req, res) => {
  const tenants = await authvital.memberships.listUserTenants(req);
  res.json({ tenants });
});

app.listen(3001, () => console.log('API running on :3001'));
```

### Client (React)

```tsx
// main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthVitalProvider, useAuthVital } from '@authvital/sdk/client';

function App() {
  const { user, isAuthenticated, login, logout } = useAuthVital();

  if (!isAuthenticated) {
    return <button onClick={login}>Login with AuthVital</button>;
  }

  return (
    <div>
      <p>Hello, {user.email}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AuthVitalProvider
    authVitalHost="https://auth.yourcompany.com"
    clientId="your-client-id"
  >
    <App />
  </AuthVitalProvider>
);
```

## What's Next?

| Topic | Link |
|-------|------|
| Understand the OAuth flow | [OAuth 2.0 / OIDC Flows](../concepts/oauth-flow.md) |
| Sync users to your database | [User Sync Guide](../sdk/user-sync.md) |
| Handle real-time events | [Webhooks Guide](../sdk/webhooks.md) |
| Check permissions & licenses | [Server SDK](../sdk/server-sdk.md) |
| Set up SSO | [SSO Configuration](../security/sso.md) |

## Troubleshooting

### "Invalid redirect URI"

Ensure your redirect URI is registered in the AuthVital Admin Panel under your application's settings.

### "CORS error"

Add your frontend origin to "Allowed Web Origins" in your application settings.

### "Token validation failed"

1. Check `AUTHVITAL_HOST` matches your AuthVital URL exactly
2. Ensure `CLIENT_ID` and `CLIENT_SECRET` are correct
3. Verify the JWT hasn't expired

---

*Need help? Check the [full documentation index](../README.md) or open an issue.*
