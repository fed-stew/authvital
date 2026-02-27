# MFA Namespace

> Multi-factor authentication setup, verification, and management.

## Overview

The MFA namespace provides methods for setting up and managing TOTP-based two-factor authentication.

```typescript
const mfa = authvital.mfa;
```

---

## Setup Flow

### 1. setup()

Start MFA setup for the authenticated user. Returns TOTP secret and QR code.

```typescript
const setup = await authvital.mfa.setup(request);

console.log(setup);
// {
//   secret: 'JBSWY3DPEHPK3PXP',
//   qrCodeUrl: 'data:image/png;base64,...',
//   otpauthUrl: 'otpauth://totp/...',
//   backupCodes: ['12345678', '23456789', ...]
// }
```

!!! warning "Don't send backup codes until verified!"
    Wait until `verifySetup()` succeeds before showing backup codes to the user.

---

### 2. verifySetup()

Complete MFA setup by verifying the first TOTP code.

```typescript
const result = await authvital.mfa.verifySetup(request, {
  code: '123456',
});

if (result.success) {
  // MFA is now enabled! Show backup codes.
}
```

---

## Login Flow

### verifyChallenge()

Complete MFA challenge during login. Called after login returns `mfaRequired: true`.

```typescript
const tokens = await authvital.mfa.verifyChallenge({
  challengeToken: 'challenge-token-from-login',
  code: '123456',
});

// Set tokens as cookies
res.cookie('access_token', tokens.accessToken, { httpOnly: true });
res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true });
```

---

### useBackupCode()

Use a backup code to complete MFA challenge. Each code can only be used once.

```typescript
const result = await authvital.mfa.useBackupCode({
  challengeToken: 'challenge-token-from-login',
  backupCode: '12345678',
});

console.log(`${result.remainingCodes} backup codes remaining`);
```

---

## Management

### disable()

Disable MFA for the authenticated user. Requires current TOTP code.

```typescript
const result = await authvital.mfa.disable(request, {
  code: '123456',
});

if (result.success) {
  console.log('MFA disabled');
}
```

---

### regenerateBackupCodes()

Regenerate backup codes (invalidates old ones). Requires current TOTP code.

```typescript
const { backupCodes } = await authvital.mfa.regenerateBackupCodes(request, {
  code: '123456',
});

console.log('New backup codes:', backupCodes);
```

---

### getStatus()

Get MFA status for a user (admin operation).

```typescript
const status = await authvital.mfa.getStatus('user-123');

console.log(status);
// {
//   mfaEnabled: true,
//   mfaVerifiedAt: '2024-01-15T10:30:00Z',
//   backupCodesRemaining: 8
// }
```

---

## Complete Example: MFA Setup Flow

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// In-memory cache for pending MFA setups (use Redis in production!)
const pendingSetups = new Map<string, { secret: string; backupCodes: string[] }>();

// Start MFA setup
app.post('/api/mfa/setup', async (req, res) => {
  const { user } = await authvital.getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const setup = await authvital.mfa.setup(req);
  
  // Store backup codes for later (after verification succeeds)
  pendingSetups.set(user.sub, {
    secret: setup.secret,
    backupCodes: setup.backupCodes,
  });
  
  // Don't send backup codes yet - only after verification!
  res.json({
    qrCodeUrl: setup.qrCodeUrl,
    secret: setup.secret, // For manual entry
  });
});

// Verify first code and enable MFA
app.post('/api/mfa/verify', async (req, res) => {
  const { user } = await authvital.getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const result = await authvital.mfa.verifySetup(req, {
    code: req.body.code,
  });
  
  if (result.success) {
    // Now retrieve the stored backup codes
    const pending = pendingSetups.get(user.sub);
    pendingSetups.delete(user.sub); // Clean up
    
    res.json({
      mfaEnabled: true,
      backupCodes: pending?.backupCodes ?? [], // Show these ONCE
    });
  } else {
    res.status(400).json({ error: 'Invalid code' });
  }
});

// Complete MFA challenge during login
app.post('/api/mfa/challenge', async (req, res) => {
  try {
    const tokens = await authvital.mfa.verifyChallenge({
      challengeToken: req.body.challengeToken,
      code: req.body.code,
    });
    
    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(401).json({ error: 'Invalid MFA code' });
  }
});

// Disable MFA
app.post('/api/mfa/disable', async (req, res) => {
  const result = await authvital.mfa.disable(req, {
    code: req.body.code,
  });
  res.json(result);
});
```
