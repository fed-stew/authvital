# Authentication API Reference

> REST API endpoints for user authentication.

## Base URL

```
https://your-authvital.com/api
```

## Rate Limiting

AuthVital applies rate limiting to authentication endpoints to prevent brute-force attacks:

| Endpoint | Limit | Window | Lockout |
|----------|-------|--------|--------|
| `POST /auth/login` | 5 attempts | 15 minutes | 30 min after 10 failures |
| `POST /auth/register` | 10 requests | 1 hour | Per IP |
| `POST /auth/forgot-password` | 3 requests | 1 hour | Per email |
| `POST /mfa/challenge` | 5 attempts | 5 minutes | Per session |

### Rate Limit Headers

All responses include rate limit information:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1705320000
```

### Handling Rate Limits

```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  showError(`Too many attempts. Please wait ${retryAfter} seconds.`);
}
```

!!! warning "Additional Protection Recommended"
    While AuthVital rate-limits its own endpoints, you should also:
    
    - Rate-limit your application's API endpoints
    - Implement CAPTCHA after failed attempts
    - Monitor for distributed attacks across IPs
    - Consider geographic restrictions for sensitive operations

---

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Register new user |
| `/auth/login` | POST | Login with email/password |
| `/auth/logout` | POST | Logout current session |
| `/auth/verify-email` | POST | Verify email address |
| `/auth/resend-verification` | POST | Resend verification email |
| `/auth/forgot-password` | POST | Request password reset |
| `/auth/reset-password` | POST | Reset password with token |
| `/mfa/setup` | POST | Start MFA setup |
| `/mfa/verify` | POST | Verify MFA setup |
| `/mfa/challenge` | POST | Complete MFA challenge |
| `/mfa/disable` | POST | Disable MFA |

---

## User Registration

### POST /auth/register

Register a new user account.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "givenName": "Jane",
  "familyName": "Smith"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User's email address |
| `password` | string | Yes | See [Password Requirements](#password-requirements) below |
| `givenName` | string | No* | First name |
| `familyName` | string | No* | Last name |

*May be required based on instance settings.

### Password Requirements

| Requirement | Value | Notes |
|-------------|-------|-------|
| Minimum length | 8 characters | NIST 800-63B compliant |
| Maximum length | 128 characters | Prevents DoS via bcrypt |
| Character types | Any Unicode | No artificial complexity rules |
| Breach checking | Recommended | Integrate with HaveIBeenPwned API |

!!! tip "Password Strength Best Practices"
    AuthVital follows [NIST 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) guidelines:
    
    - ✅ Minimum 8 characters (longer is better)
    - ✅ Allow all Unicode characters including spaces
    - ✅ No arbitrary complexity rules (uppercase, symbols, etc.)
    - ✅ Check against breached password lists
    - ✅ Show password strength meter in UI
    
    **Recommended**: Integrate breach checking in your registration flow:
    ```typescript
    // Check password against HaveIBeenPwned before registration
    const isBreached = await checkHIBP(password);
    if (isBreached) {
      return res.status(400).json({ 
        error: 'This password has appeared in a data breach. Please choose another.' 
      });
    }
    ```

**Response (201 Created):**

```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "emailVerified": false,
  "givenName": "Jane",
  "familyName": "Smith",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `INVALID_REQUEST` | Missing required fields |
| 409 | `USER_ALREADY_EXISTS` | Email already registered |
| 422 | `VALIDATION_FAILED` | Password too weak, invalid email |

---

## Login

### POST /auth/login

Authenticate with email and password.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "redirectUri": "/oauth/authorize?...",
  "clientId": "optional-client-id"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User's email |
| `password` | string | Yes | User's password |
| `redirectUri` | string | No | Where to redirect after login |
| `clientId` | string | No | Application client ID |

**Response (200 OK) - No MFA:**

Sets `auth_token` cookie and redirects (302) if `redirectUri` provided, or returns:

```json
{
  "accessToken": "eyJ...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "givenName": "Jane",
    "familyName": "Smith"
  }
}
```

**Response (200 OK) - MFA Required:**

```json
{
  "mfaRequired": true,
  "mfaChallengeToken": "challenge-token",
  "redirectUri": "/oauth/authorize?...",
  "clientId": "client-id"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 401 | `ACCOUNT_DISABLED` | Account is disabled |
| 401 | `EMAIL_NOT_VERIFIED` | Email not verified |

---

## Logout

### POST /auth/logout

End the current session.

**Request:**

- Requires authentication (cookie or Bearer token)

**Response (200 OK):**

```json
{
  "success": true
}
```

Clears `auth_token` and `idp_session` cookies.

---

## Email Verification

### POST /auth/verify-email

Verify email with token from email.

**Request:**

```json
{
  "token": "verification-token-from-email"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "email": "user@example.com",
  "emailVerified": true
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `INVALID_TOKEN` | Token invalid or expired |
| 400 | `ALREADY_VERIFIED` | Email already verified |

### POST /auth/resend-verification

Resend verification email.

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Verification email sent"
}
```

---

## Password Reset

### POST /auth/forgot-password

Request a password reset email.

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "If the email exists, a reset link has been sent"
}
```

Note: Always returns success to prevent email enumeration.

### POST /auth/reset-password

Reset password with token.

**Request:**

```json
{
  "token": "reset-token-from-email",
  "password": "newSecurePassword123"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Password has been reset"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `INVALID_TOKEN` | Token invalid or expired |
| 422 | `WEAK_PASSWORD` | Password doesn't meet requirements |

---

## Multi-Factor Authentication

### POST /mfa/setup

Start MFA setup (requires authentication).

**Response (200 OK):**

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCodeUrl": "data:image/png;base64,...",
  "otpauthUrl": "otpauth://totp/AuthVital:user@example.com?secret=...",
  "backupCodes": [
    "12345678",
    "87654321",
    "..."
  ]
}
```

### POST /mfa/verify

Complete MFA setup by verifying first code.

**Request:**

```json
{
  "code": "123456"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "mfaEnabled": true
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `MFA_CODE_INVALID` | Invalid TOTP code |
| 400 | `MFA_ALREADY_ENABLED` | MFA already enabled |

### POST /mfa/challenge

Complete MFA challenge during login.

**Request:**

```json
{
  "challengeToken": "challenge-token-from-login",
  "code": "123456"
}
```

Or with backup code:

```json
{
  "challengeToken": "challenge-token-from-login",
  "backupCode": "12345678"
}
```

**Response (200 OK):**

Sets `auth_token` cookie and returns:

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "idToken": "eyJ...",
  "expiresIn": 3600
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `MFA_CODE_INVALID` | Invalid TOTP code |
| 400 | `MFA_CHALLENGE_EXPIRED` | Challenge token expired |
| 400 | `BACKUP_CODE_INVALID` | Invalid backup code |

### POST /mfa/disable

Disable MFA (requires authentication + current code).

**Request:**

```json
{
  "code": "123456"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "mfaEnabled": false
}
```

### POST /mfa/regenerate-backup-codes

Get new backup codes (requires authentication + current code).

**Request:**

```json
{
  "code": "123456"
}
```

**Response (200 OK):**

```json
{
  "backupCodes": [
    "new-code-1",
    "new-code-2",
    "..."
  ]
}
```

---

## Get Current User

### GET /auth/me

Get current authenticated user.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response (200 OK):**

```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "emailVerified": true,
  "givenName": "Jane",
  "familyName": "Smith",
  "pictureUrl": "https://...",
  "mfaEnabled": true,
  "createdAt": "2024-01-15T10:30:00Z",
  "memberships": [
    {
      "tenantId": "tenant-uuid",
      "tenantName": "Acme Corp",
      "tenantSlug": "acme-corp",
      "role": "admin",
      "status": "ACTIVE"
    }
  ]
}
```

---

## SDK Examples

Use the `@authvital/sdk` package for type-safe, easy integration:

```bash
npm install @authvital/sdk
```

### Registration

```typescript
import { createAuthVital } from '@authvital/sdk/server';

const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
});

// Register a new user
app.post('/api/auth/register', async (req, res) => {
  const user = await authvital.auth.register({
    email: req.body.email,
    password: req.body.password,
    givenName: req.body.givenName,
    familyName: req.body.familyName,
  });
  res.json(user);
});
```

### Login with MFA Support

```typescript
app.post('/api/auth/login', async (req, res) => {
  const result = await authvital.auth.login({
    email: req.body.email,
    password: req.body.password,
  });

  if ('mfaRequired' in result && result.mfaRequired) {
    // User needs to complete MFA challenge
    res.json({ 
      mfaRequired: true, 
      challengeToken: result.mfaChallengeToken 
    });
  } else {
    // Login successful - set cookie and return user
    res.cookie('access_token', result.accessToken, { httpOnly: true, secure: true });
    res.json({ user: result.user });
  }
});
```

### Complete MFA Challenge

```typescript
app.post('/api/auth/mfa-challenge', async (req, res) => {
  const tokens = await authvital.mfa.verifyChallenge({
    challengeToken: req.body.challengeToken,
    code: req.body.code,
  });
  
  res.cookie('access_token', tokens.accessToken, { httpOnly: true, secure: true });
  res.json({ success: true });
});
```

### MFA Setup

```typescript
// Start MFA setup
app.post('/api/mfa/setup', async (req, res) => {
  const setup = await authvital.mfa.setup(req);
  res.json({
    qrCodeUrl: setup.qrCodeUrl,
    secret: setup.secret,
  });
});

// Verify and enable MFA
app.post('/api/mfa/verify', async (req, res) => {
  const result = await authvital.mfa.verifySetup(req, {
    code: req.body.code,
  });
  res.json({ mfaEnabled: result.mfaEnabled });
});
```

### Password Reset

```typescript
// Request password reset
app.post('/api/auth/forgot-password', async (req, res) => {
  await authvital.auth.forgotPassword(req.body.email);
  res.json({ success: true });
});

// Reset password with token
app.post('/api/auth/reset-password', async (req, res) => {
  await authvital.auth.resetPassword({
    token: req.body.token,
    password: req.body.password,
  });
  res.json({ success: true });
});
```

### Get Current User

```typescript
app.get('/api/me', async (req, res) => {
  const user = await authvital.users.getCurrentUser(req);
  res.json(user);
});
```

---

## Related Documentation

- [OAuth Endpoints](./oauth-endpoints.md)
- [MFA Guide](../security/mfa.md)
- [Server SDK](../sdk/server-sdk/index.md)
