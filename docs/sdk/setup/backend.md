# Backend Setup

> Set up OAuth routes and protected middleware for Express or Next.js.

---

## Express Setup

### OAuth Routes

Create OAuth routes for handling the authentication flow:

```typescript
// routes/auth.ts
import { Router } from 'express';
import { OAuthFlow } from '@authvital/sdk/server';
import { authvital } from '../lib/authvital';

const router = Router();

// Initialize OAuth flow helper
const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  redirectUri: process.env.OAUTH_REDIRECT_URI!,
  scope: 'openid profile email',
});

/**
 * GET /api/auth/login
 * Initiates OAuth 2.0 PKCE flow
 */
router.get('/login', (req, res) => {
  const { authorizeUrl, state, codeVerifier } = oauth.startFlow();

  // Store state and verifier in session (for CSRF + PKCE validation)
  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;

  // Optional: Store where to redirect after login
  if (req.query.returnTo) {
    req.session.returnTo = req.query.returnTo as string;
  }

  res.redirect(authorizeUrl);
});

/**
 * GET /api/auth/callback
 * Handles OAuth callback from AuthVital
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('OAuth error:', error, req.query.error_description);
      return res.redirect('/login?error=' + error);
    }

    const tokens = await oauth.handleCallback(
      code as string,
      state as string,
      req.session.oauthState,
      req.session.codeVerifier
    );

    // Clear OAuth session data
    delete req.session.oauthState;
    delete req.session.codeVerifier;

    // Set access token as httpOnly cookie (XSS-safe!)
    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000, // 1 hour
      path: '/',
    });

    if (tokens.refresh_token) {
      res.cookie('refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });
    }

    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);

  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/login?error=callback_failed');
  }
});

/**
 * GET /api/auth/me
 * Returns current user data
 */
router.get('/me', async (req, res) => {
  const { authenticated, user, error } = await authvital.getCurrentUser(req);

  if (!authenticated) {
    return res.status(401).json({ 
      authenticated: false, 
      error: error || 'Not authenticated' 
    });
  }

  res.json({
    authenticated: true,
    user: {
      id: user.sub,
      email: user.email,
      name: user.name || `${user.given_name || ''} ${user.family_name || ''}`.trim(),
      picture: user.picture,
      tenantId: user.tenant_id,
      tenantRoles: user.tenant_roles || [],
      appPermissions: user.app_permissions || [],
      license: user.license,
    },
  });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });

  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.json({ success: true });
  });
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  try {
    const tokens = await oauth.refreshTokens(refreshToken);

    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000,
      path: '/',
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    res.status(401).json({ error: 'Refresh failed' });
  }
});

export default router;
```

### Wire Up Express App

```typescript
// app.ts
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';

const app = express();

app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 10 * 60 * 1000, // 10 minutes (for OAuth flow)
  },
}));

app.use('/api/auth', authRoutes);

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

---

## Next.js Setup (App Router)

### Login Route

```typescript
// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { OAuthFlow } from '@authvital/sdk/server';

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  redirectUri: process.env.OAUTH_REDIRECT_URI!,
});

export async function GET(request: Request) {
  const { authorizeUrl, state, codeVerifier } = oauth.startFlow();

  const cookieStore = await cookies();
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });
  cookieStore.set('code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get('returnTo');
  if (returnTo) {
    cookieStore.set('auth_return_to', returnTo, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: '/',
    });
  }

  return NextResponse.redirect(authorizeUrl);
}
```

### Callback Route

```typescript
// app/api/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { OAuthFlow } from '@authvital/sdk/server';

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  redirectUri: process.env.OAUTH_REDIRECT_URI!,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get('oauth_state')?.value;
  const codeVerifier = cookieStore.get('code_verifier')?.value;
  const returnTo = cookieStore.get('auth_return_to')?.value || '/dashboard';

  try {
    const tokens = await oauth.handleCallback(
      code!,
      state!,
      savedState,
      codeVerifier
    );

    const response = NextResponse.redirect(new URL(returnTo, request.url));

    response.cookies.set('access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60,
      path: '/',
    });

    if (tokens.refresh_token) {
      response.cookies.set('refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      });
    }

    response.cookies.delete('oauth_state');
    response.cookies.delete('code_verifier');
    response.cookies.delete('auth_return_to');

    return response;

  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/login?error=callback_failed', request.url));
  }
}
```

### Me Route

```typescript
// app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authvital } from '@/lib/authvital';

export async function GET(request: NextRequest) {
  const { authenticated, user, error } = await authvital.getCurrentUser(request);

  if (!authenticated) {
    return NextResponse.json(
      { authenticated: false, error: error || 'Not authenticated' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.sub,
      email: user.email,
      name: user.name || `${user.given_name || ''} ${user.family_name || ''}`.trim(),
      picture: user.picture,
      tenantId: user.tenant_id,
      tenantRoles: user.tenant_roles || [],
      appPermissions: user.app_permissions || [],
      license: user.license,
    },
  });
}
```

### Logout Route

```typescript
// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('access_token');
  response.cookies.delete('refresh_token');
  return response;
}
```

---

## Protected Middleware

See [Common Patterns](./patterns.md) for reusable middleware examples.

---

## Next Steps

- [Database & Identity Sync](./database.md) - Set up local identity sync
- [Frontend Setup](./frontend.md) - React provider and hooks
