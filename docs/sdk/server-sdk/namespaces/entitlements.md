# Entitlements Namespace

> Check quotas, features, and entitlements for tenant-scoped operations.

## Overview

The entitlements namespace provides the "gatekeeper" function for quota-based actions like adding team members.

```typescript
const entitlements = authvital.entitlements;
```

---

## Methods

### canPerform()

Check if a quota-based action is allowed. This is the main gatekeeper function.

```typescript
const check = await authvital.entitlements.canPerform(request, 'seats');

if (!check.allowed) {
  return res.status(403).json({
    error: check.reason,
    currentUsage: check.currentUsage,
    limit: check.limit,
  });
}

// Action allowed - proceed
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request` | `RequestLike` | Yes | Incoming HTTP request |
| `featureKey` | `string` | Yes | Quota to check (e.g., 'seats') |

**Return Type:**

```typescript
interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;       // Why it's not allowed
  currentUsage: number;
  limit?: number;        // undefined if unlimited
}
```

**Special Handling for 'seats':**

The `seats` feature key is special - it checks license seat availability:

```typescript
// Before adding a team member
const check = await authvital.entitlements.canPerform(req, 'seats');

if (!check.allowed) {
  return res.status(402).json({
    error: 'No available seats. Upgrade your subscription to add more team members.',
    seatsUsed: check.currentUsage,
    seatsTotal: check.limit,
  });
}

// Add the member...
```

---

### decrementUsage()

Decrement usage for a quota (call after removing a resource).

```typescript
// After removing a team member
const { newUsage } = await authvital.entitlements.decrementUsage(request, 'seats');
console.log(`New usage: ${newUsage}`);
```

!!! warning "Billing Integration"
    This method requires billing endpoints to be configured. It's designed for future billing integration.

---

## Complete Example: Seat Management

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// Check before inviting
app.post('/api/team/invite', async (req, res) => {
  // 1. Check seat availability
  const seatCheck = await authvital.entitlements.canPerform(req, 'seats');
  
  if (!seatCheck.allowed) {
    return res.status(402).json({
      error: 'Seat limit reached',
      message: seatCheck.reason,
      currentSeats: seatCheck.currentUsage,
      maxSeats: seatCheck.limit,
      upgradeUrl: '/billing/upgrade',
    });
  }
  
  // 2. Send invitation
  const invitation = await authvital.invitations.send(req, {
    email: req.body.email,
  });
  
  res.status(201).json(invitation);
});

// Get seat info for UI
app.get('/api/team/seats', async (req, res) => {
  const check = await authvital.entitlements.canPerform(req, 'seats');
  
  res.json({
    used: check.currentUsage,
    total: check.limit,
    available: check.limit ? check.limit - check.currentUsage : 'unlimited',
    canAddMore: check.allowed,
  });
});
```
