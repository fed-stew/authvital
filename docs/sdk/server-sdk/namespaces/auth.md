# Auth Namespace

> Authentication operations (register, login, password reset).

## Overview

The auth namespace provides methods for user authentication flows. Most methods don't require authentication.

```typescript
const auth = authvital.auth;
```

---

## Registration

### register()

Register a new user.

```typescript
const user = await authvital.auth.register({
  email: 'user@example.com',
  password: 'secure-password',
  givenName: 'John',       // Optional
  familyName: 'Doe',       // Optional
});

console.log(user);
// { id: 'user-123', email: 'user@example.com', emailVerified: false, ... }
```

---

## Login

### login()

Login with email and password. May return MFA challenge if user has MFA enabled.

```typescript
const result = await authvital.auth.login({
  email: 'user@example.com',
  password: 'password',
  redirectUri: 'https://app.example.com/callback', // Optional
  clientId: 'my-app', // Optional
});

// Check if MFA is required
if ('mfaRequired' in result && result.mfaRequired) {
  // Redirect to MFA challenge
  res.json({
    mfaRequired: true,
    challengeToken: result.mfaChallengeToken,
  });
} else {
  // Login successful
  res.cookie('access_token', result.accessToken, { httpOnly: true });
  res.json({ user: result.user });
}
```

**Return Types:**

```typescript
// Normal login response
interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    givenName?: string;
    familyName?: string;
  };
}

// MFA required response
interface MfaRequiredResponse {
  mfaRequired: true;
  mfaChallengeToken: string;
  redirectUri?: string;
  clientId?: string;
}
```

---

## Email Verification

### verifyEmail()

Verify email with token from verification email.

```typescript
const result = await authvital.auth.verifyEmail('verification-token');

console.log(result);
// { success: true, email: 'user@example.com', emailVerified: true }
```

---

### resendVerificationEmail()

Resend verification email.

```typescript
await authvital.auth.resendVerificationEmail('user@example.com');
```

---

## Password Reset

### forgotPassword()

Request password reset email. Always returns success to prevent email enumeration.

```typescript
await authvital.auth.forgotPassword('user@example.com');
// Email sent (or not, if email doesn't exist - but we don't reveal that)
```

---

### resetPassword()

Reset password with token from email.

```typescript
await authvital.auth.resetPassword({
  token: 'reset-token-from-email',
  password: 'new-secure-password',
});
```

---

## Complete Example

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const user = await authvital.auth.register({
      email: req.body.email,
      password: req.body.password,
      givenName: req.body.firstName,
      familyName: req.body.lastName,
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const result = await authvital.auth.login({
    email: req.body.email,
    password: req.body.password,
  });
  
  if ('mfaRequired' in result && result.mfaRequired) {
    res.json({
      mfaRequired: true,
      challengeToken: result.mfaChallengeToken,
    });
  } else {
    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
    res.json({ user: result.user });
  }
});

// Verify email
app.post('/api/auth/verify-email', async (req, res) => {
  const result = await authvital.auth.verifyEmail(req.body.token);
  res.json(result);
});

// Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
  await authvital.auth.forgotPassword(req.body.email);
  res.json({ success: true }); // Always success to prevent enumeration
});

// Reset password
app.post('/api/auth/reset-password', async (req, res) => {
  await authvital.auth.resetPassword({
    token: req.body.token,
    password: req.body.password,
  });
  res.json({ success: true });
});
```
