# Access Control & CSRF

> Least privilege, tenant isolation, MFA requirements, and CSRF protection.

## Principle of Least Privilege

```typescript
// ✅ Grant minimum permissions needed
const viewerRole = {
  permissions: ['projects:read', 'users:read'],
};

// ❌ Avoid granting wildcard permissions
const badRole = {
  permissions: ['*'], // Full access - very dangerous
};
```

---

## Validate Tenant Access

```typescript
// ✅ Always verify tenant membership
app.get('/api/tenant/:tenantId/data', async (req, res) => {
  const { tenantId } = req.params;
  
  // Verify user belongs to this tenant
  if (req.user.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Also verify in database queries
  const data = await prisma.data.findMany({
    where: { 
      tenantId: tenantId,
      // Don't let users access other tenants' data
    },
  });
});
```

---

## MFA for Privileged Accounts

```typescript
// ✅ Require MFA for admins
await authvital.admin.updateInstanceSettings({
  superAdminMfaRequired: true,
});

// ✅ Require MFA for tenant admins
await authvital.tenants.update(tenantId, {
  mfaPolicy: 'REQUIRED',
});
```

---

## CSRF Protection

Cross-Site Request Forgery (CSRF) tricks authenticated users into making unintended requests.

### How AuthVital Protects You

| Defense | Protects Against | Enabled By Default |
|---------|------------------|--------------------|
| **SameSite Cookies** | Cross-origin form submissions | ✅ Yes (`Lax`) |
| **State Parameter** | OAuth flow hijacking | ✅ Yes |
| **Short Token Lifetimes** | Replay attacks | ✅ Yes |
| **Custom CSRF Tokens** | Non-GET forms in your app | ⚠️ You implement |

### SameSite Cookies

AuthVital sets `SameSite=Lax` by default on all session and refresh token cookies:

```typescript
// AuthVital's default cookie settings
res.cookie('auth_session', sessionToken, {
  httpOnly: true,      // No JS access
  secure: true,        // HTTPS only
  sameSite: 'lax',     // ✅ CSRF protection
  maxAge: 3600000,
});
```

**SameSite Values Explained:**

| Value | Behavior | Use Case |
|-------|----------|----------|
| `Strict` | Never sent cross-origin | Maximum security, may break OAuth redirects |
| `Lax` | Sent on top-level navigations only | ✅ Recommended for auth cookies |
| `None` | Always sent (requires `Secure`) | Cross-origin APIs, embedded widgets |

### State Parameter in OAuth

The `state` parameter prevents CSRF attacks during OAuth flows:

```typescript
// How AuthVital handles state:

// 1. Generate cryptographic state before redirect
const state = crypto.randomBytes(32).toString('hex');
sessionStorage.setItem('oauth_state', state);

// 2. Include in authorize URL
const authorizeUrl = `https://auth.provider.com/authorize?state=${state}&...`;

// 3. Validate on callback
const returnedState = urlParams.get('state');
const storedState = sessionStorage.getItem('oauth_state');

if (!returnedState || returnedState !== storedState) {
  // ❌ State mismatch - possible CSRF attack!
  throw new CSRFError('Invalid state parameter');
}

// ✅ State matches - safe to proceed
sessionStorage.removeItem('oauth_state');
```

**What state protects against:**

1. **Login CSRF** - Attacker can't log you into *their* account
2. **Session fixation** - Attacker can't hijack your OAuth callback
3. **Replay attacks** - Each flow has a unique, single-use state

### When You Need Additional CSRF Tokens

| Scenario | SameSite Enough? | Additional Token Needed? |
|----------|-----------------|-------------------------|
| AuthVital login/logout | ✅ Yes | No - handled by SDK |
| Your app's GET requests | ✅ Yes | No - GETs shouldn't mutate |
| Your app's POST/PUT/DELETE | ⚠️ Maybe | Yes - if forms exist |
| API-only (no forms) | ✅ Yes | No - use auth headers |
| Cross-origin embedded app | ❌ No | Yes - required |

### Implementing CSRF Tokens for Custom Forms

If your app has traditional HTML forms (not just API calls), add CSRF tokens:

```typescript
import crypto from 'crypto';

// Middleware: Generate CSRF token per session
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

// Middleware: Validate CSRF token on mutations
function validateCsrf(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const token = req.body._csrf || req.headers['x-csrf-token'];
    
    if (!token || token !== req.session.csrfToken) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
  }
  next();
}

app.use('/api', validateCsrf);
```

```html
<!-- Include token in forms -->
<form method="POST" action="/api/settings">
  <input type="hidden" name="_csrf" value="{{csrfToken}}">
  <input type="text" name="displayName">
  <button type="submit">Save</button>
</form>
```

```typescript
// Or send via header for AJAX requests
fetch('/api/settings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  },
  body: JSON.stringify({ displayName: 'New Name' }),
});
```

### Popular CSRF Libraries

```bash
# Express
npm install csurf  # Note: deprecated, but still works
npm install csrf-csrf  # Modern alternative

# NestJS
npm install @nestjs/csrf
```

---

## CSRF Checklist

- [ ] Using HTTPS (required for Secure cookies)
- [ ] AuthVital cookies have `SameSite=Lax` (default)
- [ ] OAuth flows use state parameter (automatic with SDK)
- [ ] Custom forms include CSRF tokens
- [ ] AJAX requests use auth headers, not cookies alone
- [ ] Cross-origin requests properly authenticated

---

## Related Documentation

- [Authentication Security](./authentication.md)
- [Infrastructure Security](./infrastructure.md)
- [Security Checklist](./checklist.md)
