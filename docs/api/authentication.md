# Authentication API Reference

> REST API endpoints for user authentication.

## Base URL

```
https://your-authvital.com/api
```

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
| `password` | string | Yes | Password (min 8 chars) |
| `givenName` | string | No* | First name |
| `familyName` | string | No* | Last name |

*May be required based on instance settings.

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

## Code Examples

### JavaScript

```javascript
// Register
const response = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securePassword123',
    givenName: 'Jane',
    familyName: 'Smith',
  }),
});

// Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // Important for cookies
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securePassword123',
  }),
});

const result = await loginResponse.json();

if (result.mfaRequired) {
  // Show MFA input, then...
  await fetch('/api/mfa/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      challengeToken: result.mfaChallengeToken,
      code: userEnteredCode,
    }),
  });
}
```

### cURL

```bash
# Register
curl -X POST https://auth.example.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securePassword123"}'

# Login
curl -X POST https://auth.example.com/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"user@example.com","password":"securePassword123"}'

# Get current user
curl https://auth.example.com/api/auth/me \
  -H "Authorization: Bearer eyJ..."
```

---

## Related Documentation

- [OAuth Endpoints](./oauth-endpoints.md)
- [MFA Guide](../security/mfa.md)
- [Server SDK](../sdk/server-sdk.md)
