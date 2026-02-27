# Security Best Practices

> Recommendations for securely deploying and integrating AuthVital.

## Authentication Security

### Token Storage

| Storage | Use For | ⚠️ Risk |
|---------|---------|--------|
| **Memory** | Access tokens | Lost on page refresh |
| **HttpOnly Cookie** | Refresh tokens | Requires HTTPS |
| **sessionStorage** | PKCE verifier | Cleared on tab close |
| ❌ **localStorage** | Nothing sensitive! | XSS vulnerable |

```typescript
// ✅ Good: Token in memory, refresh via httpOnly cookie
const { accessToken } = await getTokenFromAuthVital();
// Store in React state or module-level variable

// ❌ Bad: Never store tokens in localStorage
localStorage.setItem('token', accessToken); // XSS risk!
```

### PKCE for SPAs

**Always use PKCE** for browser-based applications:

```typescript
// ✅ Required for SPAs
const { codeVerifier, codeChallenge } = await generatePKCE();
const authorizeUrl = buildAuthorizeUrl({
  // ...
  codeChallenge,
  codeChallengeMethod: 'S256',
});
```

### Token Lifetimes

| Token | Recommended | Maximum |
|-------|-------------|---------|
| Access Token | 15-60 min | 1 hour |
| Refresh Token | 7 days | 30 days |
| Auth Code | 1-5 min | 10 min |

Shorter lifetimes = less window for stolen tokens.

### Validate on Server

**Never trust client-side checks alone:**

```typescript
// ✅ Server validates JWT
app.get('/api/admin', async (req, res) => {
  const { authenticated, user } = await authvital.getCurrentUser(req);
  if (!authenticated || !user.app_permissions.includes('admin:*')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // ...
});

// ❌ Don't rely only on UI hiding
// UI can be bypassed, API must enforce
```

## OAuth Security

### Redirect URI Validation

**Register specific URIs** - avoid wildcards in production:

```typescript
// ✅ Good: Specific URIs
redirectUris: [
  'https://app.example.com/callback',
  'https://app.example.com/auth/callback',
]

// ⚠️ Caution: Wildcards only for development
redirectUris: [
  'http://localhost:*/callback',
]

// ❌ Bad: Too permissive
redirectUris: [
  'https://*.example.com/*', // Could allow attacker subdomains
]
```

### State Parameter

**Always validate state** to prevent CSRF:

```typescript
// Before redirect
const state = crypto.randomUUID();
sessionStorage.setItem('oauth_state', state);

// After callback
const returnedState = urlParams.get('state');
if (returnedState !== sessionStorage.getItem('oauth_state')) {
  throw new Error('State mismatch - possible CSRF attack');
}
```

### Client Secret Protection

```bash
# ✅ Server-side only
# .env (backend)
AUTHVITAL_CLIENT_SECRET=secret_xxx

# ❌ Never in client code
# .env (frontend) - WRONG!
VITE_AUTHVITAL_CLIENT_SECRET=secret_xxx  # Exposed in browser!
```

## Infrastructure Security

### HTTPS Everywhere

```nginx
# Force HTTPS
server {
    listen 80;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    # SSL configuration...
}
```

### Secure Cookies

```typescript
// Production cookie settings
res.cookie('auth_token', token, {
  httpOnly: true,     // No JavaScript access
  secure: true,       // HTTPS only
  sameSite: 'lax',    // CSRF protection
  maxAge: 3600000,    // 1 hour
});
```

### CORS Configuration

```typescript
// ✅ Specific origins
CORS_ORIGINS=https://app.example.com,https://admin.example.com

// ❌ Never in production
CORS_ORIGINS=*  // Allows any origin!
```

### Database Security

```bash
# ✅ Strong passwords
DB_PASSWORD=long-random-string-32-chars-minimum

# ✅ Separate credentials per environment
# dev: authvital_dev / dev-password
# prod: authvital_prod / secure-prod-password

# ✅ Principle of least privilege
# App user shouldn't have DROP TABLE permissions
```

## Secret Management

### Environment Variables

```bash
# ✅ Use secret managers in production
# - Google Secret Manager
# - AWS Secrets Manager
# - HashiCorp Vault
# - Doppler

# ❌ Don't commit secrets
.env          # In .gitignore
.env.local    # In .gitignore
```

### Key Rotation

```bash
# Rotate signing keys periodically (AuthVital does this automatically)
KEY_ROTATION_INTERVAL_SECONDS=604800  # 7 days

# ⚠️ Rotating SIGNING_KEY_SECRET invalidates all tokens!
# Plan for this: users will need to re-login
```

### Webhook Secrets

```typescript
// ✅ Always verify webhook signatures
const router = new WebhookRouter({
  handler: myHandler,
  secret: process.env.AUTHVITAL_WEBHOOK_SECRET!, // Required!
});

// ❌ Never skip signature verification
app.post('/webhooks', (req, res) => {
  // Missing signature check = anyone can call this!
  handleEvent(req.body);
});
```

## Access Control

### Principle of Least Privilege

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

### Validate Tenant Access

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

### MFA for Privileged Accounts

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

## Logging & Monitoring

### Security Events to Log

| Event | Priority | Action |
|-------|----------|--------|
| Failed login attempts | High | Alert after N failures |
| Password changes | Medium | Notify user |
| MFA changes | High | Notify user |
| Admin actions | High | Audit log |
| Permission changes | Medium | Audit log |
| Token revocations | Medium | Log with context |

```typescript
// Log security events
app.post('/api/auth/login', async (req, res) => {
  const result = await authvital.auth.login(req.body);
  
  if (!result.success) {
    logger.warn('Failed login attempt', {
      email: req.body.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
    });
  }
});
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// ✅ Rate limit auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later',
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
```

### Alerting

```typescript
// Alert on suspicious patterns
const ALERT_THRESHOLDS = {
  failedLoginsPerHour: 10,
  passwordResetsPerDay: 3,
  newDevicesPerWeek: 5,
};

async function checkSecurityAlerts(userId: string) {
  const failedLogins = await getFailedLoginCount(userId, '1 hour');
  
  if (failedLogins > ALERT_THRESHOLDS.failedLoginsPerHour) {
    await notifySecurityTeam('Possible brute force', { userId, failedLogins });
    await lockAccount(userId);
  }
}
```

## Input Validation

### Sanitize User Input

```typescript
import { escape } from 'lodash';

// ✅ Sanitize before storing/displaying
const safeName = escape(userInput.name);

// ✅ Use parameterized queries (Prisma does this automatically)
const user = await prisma.user.findUnique({
  where: { email: userEmail }, // Safe from SQL injection
});

// ❌ Never concatenate user input into queries
// const user = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
```

### Validate Email Format

```typescript
// ✅ Validate email format
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// In NestJS, use class-validator
class RegisterDto {
  @IsEmail()
  email: string;
  
  @MinLength(8)
  password: string;
}
```

## Checklist

### Before Production

- [ ] HTTPS enabled with valid certificate
- [ ] `COOKIE_SECURE=true`
- [ ] Strong `SIGNING_KEY_SECRET` (32+ bytes)
- [ ] Secrets in secret manager, not env files
- [ ] CORS restricted to specific origins
- [ ] Rate limiting on auth endpoints
- [ ] Logging enabled for security events
- [ ] MFA required for admin accounts
- [ ] Webhook signatures validated
- [ ] Client secrets not exposed to browsers

### Ongoing

- [ ] Monitor failed login attempts
- [ ] Review admin access regularly
- [ ] Rotate secrets periodically
- [ ] Update dependencies for security patches
- [ ] Review webhook endpoints for security
- [ ] Audit permission changes
- [ ] Test incident response procedures

---

## Related Documentation

- [MFA Configuration](./mfa.md)
- [SSO Configuration](./sso.md)
- [Configuration Reference](../getting-started/configuration.md)
