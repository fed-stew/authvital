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
| `/signup/verify` | GET/POST | Verify email address (token) |
| `/signup/resend` | POST | Resend verification email |
| `/auth/forgot-password` | POST | Request password reset |
| `/auth/reset-password` | POST | Reset password with token |
| `/auth/mfa/status` | GET | Current MFA status |
| `/auth/mfa/setup` | POST | Start MFA setup |
| `/auth/mfa/enable` | POST | Verify code & enable MFA |
| `/auth/mfa/verify` | POST | Complete MFA login challenge |
| `/auth/mfa/disable` | DELETE | Disable MFA |
| `/auth/mfa/backup-codes` | POST | Regenerate backup codes |

!!! note "Verified against the backend"
    Paths above are verified against the NestJS controllers (all under the global
    `/api` prefix). Email verification lives on the **signup** controller
    (`/api/signup/*`), and MFA endpoints live under **`/api/auth/mfa/*`**
    (`disable` is a `DELETE`).

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

### POST /signup/verify

Verify email with the token from the verification email. (A `GET /signup/verify?token=...`
variant exists for email-link clicks.)

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

### POST /signup/resend

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

### POST /auth/mfa/setup

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

### POST /auth/mfa/enable

Complete MFA setup by verifying the first code (enables MFA).

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

### POST /auth/mfa/verify

Complete the MFA challenge during login. (The login response returns an
`mfaChallengeToken` when MFA is required — see `POST /auth/login`.)

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

### DELETE /auth/mfa/disable

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

### POST /auth/mfa/backup-codes

Regenerate backup codes (requires authentication + current code). There is also a
`GET /auth/mfa/status` endpoint that returns whether MFA is enabled.

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

## Using the SDK

!!! warning "There is no `@authvital/sdk` auth namespace"
    These endpoints are the **hosted authentication surface** (login, register,
    MFA, password reset). The server SDK (`@authvital/server`) does **not** wrap
    them with an `authvital.auth.*` / `authvital.mfa.*` API — user login is meant
    to happen through AuthVital's hosted UI + the OAuth flow, not by proxying
    these endpoints from your backend.

What the SDK actually gives you:

- **`OAuthFlow`** (`@authvital/server`) to drive the Authorization-Code + PKCE
  login flow — see [Server SDK: OAuth Flow](../sdk/server-sdk/oauth-flow.md).
- **`verifyToken`** / **`authVitalMiddleware`** to validate the resulting tokens.
- **`createServerClient(...).integration.*`** (M2M) for server-to-server calls.

If you genuinely need to call the REST endpoints above directly (e.g. a fully
custom auth UI), call them with any HTTP client against `${AV_HOST}/api/...` using
the exact paths documented on this page. Don't expect an SDK helper for them.

---

## Related Documentation

- [OAuth Endpoints](./oauth-endpoints.md)
- [MFA Guide](../security/mfa.md)
- [Server SDK](../sdk/server-sdk/index.md)
