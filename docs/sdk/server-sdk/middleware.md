# Middleware

> Pre-built Express and Passport.js integration.

## Express JWT Middleware

Create a ready-to-use Express middleware that validates JWTs and attaches the payload to `req.user`.

```typescript
import { createJwtMiddleware } from '@authvital/sdk/server';

const requireAuth = createJwtMiddleware({
  authVitalHost: process.env.AV_HOST!,
  audience: 'my-client-id', // Optional but recommended
});
```

### Basic Usage

```typescript
// Protect single route
app.get('/api/protected', requireAuth, (req, res) => {
  // req.user contains the full JWT payload
  console.log('User ID:', req.user.sub);
  console.log('Tenant:', req.user.tenant_id);
  console.log('Roles:', req.user.app_roles);
  
  res.json({ message: `Hello, ${req.user.email}!` });
});

// Protect entire router
const apiRouter = express.Router();
apiRouter.use(requireAuth);
apiRouter.get('/me', (req, res) => res.json(req.user));
apiRouter.get('/settings', (req, res) => { /* ... */ });

app.use('/api', apiRouter);
```

### Configuration Options

```typescript
interface JwtMiddlewareOptions {
  authVitalHost: string;    // Required: AuthVital server URL
  audience?: string;        // Optional: Expected JWT audience (client ID)
  issuer?: string;          // Optional: Override expected issuer
  algorithms?: string[];    // Optional: Allowed algorithms (default: ['RS256'])
}
```

### Error Responses

The middleware returns appropriate HTTP errors:

| Status | Error | Cause |
|--------|-------|-------|
| 401 | `No token provided` | Missing Authorization header/cookie |
| 401 | `Token expired` | JWT `exp` claim in the past |
| 401 | `Invalid token` | Bad signature, malformed JWT |
| 401 | `Invalid audience` | Token audience doesn't match |

---

## Passport.js Integration

For apps using Passport.js, get pre-configured JWT strategy options.

```typescript
import passport from 'passport';
import { Strategy as JwtStrategy } from 'passport-jwt';
import { createPassportJwtOptions } from '@authvital/sdk/server';

// Get options (fetches JWKS automatically)
const jwtOptions = await createPassportJwtOptions({
  authVitalHost: process.env.AV_HOST!,
  audience: 'my-client-id',
});

// Configure Passport
passport.use(new JwtStrategy(jwtOptions, (payload, done) => {
  // payload contains the full JWT claims
  // Optionally enrich with database lookup
  // User.findById(payload.sub).then(user => done(null, user || payload));
  
  done(null, payload);
}));

// Use in routes
app.get('/api/protected',
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    res.json({ user: req.user });
  }
);
```

### What createPassportJwtOptions() Returns

```typescript
interface PassportJwtOptions {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken();
  secretOrKeyProvider: (req, token, done) => Promise<void>;
  audience?: string;
  issuer: string;
  algorithms: ['RS256'];
}
```

!!! note "JWKS Caching"
    The `secretOrKeyProvider` automatically fetches and caches the JWKS from AuthVital for signature verification.

---

## Permission Middleware Factory

Combine with the SDK for permission-based middleware:

```typescript
import { createAuthVital, createJwtMiddleware } from '@authvital/sdk/server';

const authvital = createAuthVital({ /* config */ });
const requireAuth = createJwtMiddleware({
  authVitalHost: process.env.AV_HOST!,
});

// Create permission-checking middleware
const requireAppPermission = (permission: string) => {
  return async (req, res, next) => {
    if (!await authvital.hasAppPermission(req, permission)) {
      return res.status(403).json({
        error: 'Forbidden',
        required: permission,
      });
    }
    next();
  };
};

// Create feature-gating middleware
const requireFeature = (feature: string) => {
  return async (req, res, next) => {
    if (!await authvital.hasFeatureFromJwt(req, feature)) {
      return res.status(402).json({
        error: 'Feature requires upgrade',
        feature,
      });
    }
    next();
  };
};

// Stack middlewares
app.delete('/api/projects/:id',
  requireAuth,
  requireAppPermission('projects:delete'),
  async (req, res) => {
    await deleteProject(req.params.id);
    res.json({ deleted: true });
  }
);

app.get('/api/advanced-analytics',
  requireAuth,
  requireFeature('advanced-analytics'),
  async (req, res) => {
    res.json({ analytics: '...' });
  }
);
```

---

## Tenant Role Middleware

```typescript
const requireTenantRole = (...roles: string[]) => {
  return async (req, res, next) => {
    const tenantRoles = await authvital.getTenantRoles(req);
    const hasRole = roles.some(r => tenantRoles.includes(r));
    
    if (!hasRole) {
      return res.status(403).json({
        error: 'Forbidden',
        required: roles,
        current: tenantRoles,
      });
    }
    next();
  };
};

// Only owners and admins
app.delete('/api/team/:id',
  requireAuth,
  requireTenantRole('owner', 'admin'),
  async (req, res) => {
    // Remove team member
  }
);
```

---

## Complete Example: Protected API

```typescript
import express from 'express';
import { createAuthVital, createJwtMiddleware } from '@authvital/sdk/server';

const authvital = createAuthVital({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

const requireAuth = createJwtMiddleware({
  authVitalHost: process.env.AV_HOST!,
  audience: process.env.AV_CLIENT_ID,
});

const app = express();

// Public routes
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Protected routes
const protectedRouter = express.Router();
protectedRouter.use(requireAuth);

protectedRouter.get('/me', async (req, res) => {
  res.json({ user: req.user });
});

protectedRouter.get('/team', async (req, res) => {
  const { memberships } = await authvital.memberships.listForTenant(req);
  res.json(memberships);
});

protectedRouter.post('/invite', async (req, res) => {
  // Check permission first
  if (!await authvital.hasTenantPermission(req, 'members:invite')) {
    return res.status(403).json({ error: 'Cannot invite members' });
  }
  
  const result = await authvital.invitations.send(req, {
    email: req.body.email,
  });
  res.status(201).json(result);
});

app.use('/api', protectedRouter);

app.listen(3000);
```
