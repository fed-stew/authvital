# Authentication Security

> Token storage, PKCE, token lifetimes, and server-side validation.

## Token Storage

| Storage | Use For | ⚠️ Risk |
|---------|---------|--------|
| **Memory** | Access tokens | Lost on page refresh |
| **HttpOnly Cookie** | Refresh tokens | Requires HTTPS |
| **sessionStorage** | PKCE verifier | Cleared on tab close |
| ❌ **localStorage** | Nothing sensitive! | XSS vulnerable |

```typescript
// ✅ Good: Token in memory, refresh via httpOnly cookie
// After OAuth callback, your server exchanges the code:
const tokens = await exchangeCodeForTokens({
  authVitalHost: process.env.AV_HOST!,
  code: authorizationCode,
  codeVerifier,
  redirectUri,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});
// Store accessToken in React state or module-level variable (NOT localStorage!)

// ❌ Bad: Never store tokens in localStorage
localStorage.setItem('token', accessToken); // XSS risk!
```

---

## PKCE for SPAs

**Always use PKCE** for browser-based applications:

```typescript
import { generatePKCE, buildAuthorizeUrl } from '@authvital/sdk/server';

// ✅ Required for SPAs
const { codeVerifier, codeChallenge } = await generatePKCE();
const authorizeUrl = buildAuthorizeUrl({
  // ...
  codeChallenge,
  codeChallengeMethod: 'S256',
});
```

PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks:

1. **Generate verifier**: Random 43-128 character string
2. **Create challenge**: SHA256 hash of verifier, base64url encoded
3. **Send challenge**: Include in authorize request
4. **Verify on exchange**: AuthVital verifies your verifier matches the challenge

---

## Token Lifetimes

| Token | Recommended | Maximum |
|-------|-------------|---------|
| Access Token | 15-60 min | 1 hour |
| Refresh Token | 7 days | 30 days |
| Auth Code | 1-5 min | 10 min |

**Shorter lifetimes = smaller window for stolen tokens.**

---

## Validate on Server

**Never trust client-side checks alone:**

```typescript
// ✅ Server validates JWT and permissions
app.get('/api/admin', async (req, res) => {
  const { authenticated, user } = await authvital.getCurrentUser(req);
  if (!authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Use SDK's wildcard-aware permission check
  if (!await authvital.hasAppPermission(req, 'admin:*')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // ...
});

// ❌ Don't rely only on UI hiding
// UI can be bypassed, API must enforce
```

---

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

---

## Related Documentation

- [OAuth Security](./oauth.md)
- [Access Control](./access-control.md)
- [Security Checklist](./checklist.md)
