# Licenses Namespace

> License management, feature checks, and seat allocation.

## Overview

The licenses namespace combines user-scoped operations (JWT auth) and admin operations (M2M) for comprehensive license management.

```typescript
const licenses = authvital.licenses;
```

---

## User-Scoped Methods (JWT Auth)

These methods use the JWT from the incoming request for authentication.

### grant()

Grant a license to a user.

```typescript
await authvital.licenses.grant(request, {
  userId: 'user-123',       // Optional: defaults to authenticated user
  applicationId: 'app-456',
  licenseTypeId: 'license-pro',
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request` | `RequestLike` | Yes | Incoming HTTP request |
| `userId` | `string` | No | User to grant license to (defaults to authenticated user) |
| `applicationId` | `string` | Yes | Application ID |
| `licenseTypeId` | `string` | Yes | License type ID to assign |

---

### revoke()

Revoke a license from a user.

```typescript
await authvital.licenses.revoke(request, {
  userId: 'user-123',
  applicationId: 'app-456',
});
```

---

### changeType()

Change a user's license type (e.g., upgrade from basic to pro).

```typescript
await authvital.licenses.changeType(request, {
  userId: 'user-123',
  applicationId: 'app-456',
  newLicenseTypeId: 'license-enterprise',
});
```

---

### listForUser()

Get all licenses for a user.

```typescript
const licenses = await authvital.licenses.listForUser(request, 'user-123');
// Or omit userId to get licenses for authenticated user:
const myLicenses = await authvital.licenses.listForUser(request);

licenses.forEach(l => {
  console.log(`${l.applicationId}: ${l.licenseTypeName}`);
});
```

---

### check()

Check if a user has a license for an application.

!!! warning "Method Signature"
    This method uses positional parameters, not an options object.

```typescript
const result = await authvital.licenses.check(
  request,           // HTTP request
  undefined,         // userId (undefined = authenticated user)
  'my-app-id'        // applicationId
);

if (result.hasLicense) {
  console.log('License type:', result.licenseType);
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request` | `RequestLike` | Yes | Incoming HTTP request |
| `userId` | `string \| undefined` | No | User to check (undefined = authenticated user) |
| `applicationId` | `string` | Yes | Application ID to check |

**Return Type:**

```typescript
interface LicenseCheckResponse {
  hasLicense: boolean;
  licenseType: string | null;
  licenseTypeName: string | null;
  features: string[];
  expiresAt?: string;
}
```

---

### hasFeature()

Check if user has a specific feature enabled in their license.

!!! warning "Method Signature"
    This method uses positional parameters, not an options object.

```typescript
const { hasFeature } = await authvital.licenses.hasFeature(
  request,           // HTTP request
  undefined,         // userId (undefined = authenticated user)
  'my-app-id',       // applicationId
  'sso'              // featureKey
);

if (hasFeature) {
  // Show SSO options
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request` | `RequestLike` | Yes | Incoming HTTP request |
| `userId` | `string \| undefined` | No | User to check |
| `applicationId` | `string` | Yes | Application ID |
| `featureKey` | `string` | Yes | Feature key to check |

---

### getUserLicenseType()

Convenience wrapper to get just the license type slug.

```typescript
const licenseType = await authvital.licenses.getUserLicenseType(
  request,
  undefined,  // userId
  'my-app-id'
);

if (licenseType === 'enterprise') {
  // Show enterprise features
}
```

---

### getAppLicensedUsers()

Get all licensed users for an app in the authenticated tenant.

```typescript
const users = await authvital.licenses.getAppLicensedUsers(request, 'my-app-id');

users.forEach(u => {
  console.log(`${u.email} - ${u.licenseType}`);
});
```

---

### countLicensedUsers()

Count licensed users for an app.

```typescript
const { count } = await authvital.licenses.countLicensedUsers(request, 'my-app-id');
console.log(`${count} users have licenses`);
```

---

### getHolders()

Get all license holders for an application.

```typescript
const holders = await authvital.licenses.getHolders(request, 'app-456');
```

---

### getAuditLog()

Get license audit log.

```typescript
const auditLog = await authvital.licenses.getAuditLog(request, {
  userId: 'user-123',      // Optional filter
  applicationId: 'app-456', // Optional filter
  limit: 50,
  offset: 0,
});
```

---

### getUsageOverview()

Get usage overview for the tenant.

```typescript
const usage = await authvital.licenses.getUsageOverview(request);
// { totalSeats, seatsAssigned, utilization, ... }
```

---

### getUsageTrends()

Get usage trends over time.

```typescript
const trends = await authvital.licenses.getUsageTrends(request, 30); // Last 30 days
// [{ date, seatsAssigned, ... }, ...]
```

---

## Admin Methods (M2M Auth)

These methods use the SDK's client credentials for backend-to-backend calls.

### getTenantOverview()

Get full license overview for a tenant.

```typescript
const overview = await authvital.licenses.getTenantOverview('tenant-123');

console.log(`Using ${overview.totalSeatsAssigned} of ${overview.totalSeatsOwned} seats`);
```

---

### getUserLicenses() (Admin)

Get all license assignments for a user in a tenant.

```typescript
const licenses = await authvital.licenses.getUserLicenses('tenant-123', 'user-456');

licenses.forEach(l => {
  console.log(`Has ${l.licenseTypeName} for ${l.applicationId}`);
});
```

---

### getTenantSubscriptions()

Get all subscriptions (license inventory) for a tenant.

```typescript
const subscriptions = await authvital.licenses.getTenantSubscriptions('tenant-123');

subscriptions.forEach(sub => {
  console.log(`${sub.applicationName}: ${sub.quantityAvailable} seats available`);
});
```

---

### getMembersWithLicenses()

Get all tenant members with their license assignments.

```typescript
const members = await authvital.licenses.getMembersWithLicenses('tenant-123');

members.forEach(member => {
  console.log(`${member.user.email} has ${member.licenses.length} licenses`);
});
```

---

### getAvailableLicenseTypes()

Get available license types for tenant provisioning.

```typescript
const available = await authvital.licenses.getAvailableLicenseTypes('tenant-123');

available.forEach(type => {
  if (type.hasSubscription) {
    console.log(`Already have: ${type.name}`);
  } else {
    console.log(`Can add: ${type.name}`);
  }
});
```

---

### grantToUser() (M2M)

Grant a license using M2M authentication.

```typescript
const assignment = await authvital.licenses.grantToUser({
  tenantId: 'tenant-123',
  userId: 'user-456',
  applicationId: 'app-789',
  licenseTypeId: 'pro-license',
});
```

---

### revokeFromUser() (M2M)

Revoke a license using M2M authentication.

```typescript
await authvital.licenses.revokeFromUser({
  tenantId: 'tenant-123',
  userId: 'user-456',
  applicationId: 'app-789',
});
```

---

### changeUserType() (M2M)

Change a user's license type using M2M authentication.

```typescript
const newAssignment = await authvital.licenses.changeUserType({
  tenantId: 'tenant-123',
  userId: 'user-456',
  applicationId: 'app-789',
  newLicenseTypeId: 'enterprise-license',
});
```

---

### grantBulk()

Bulk grant licenses to multiple users.

```typescript
const results = await authvital.licenses.grantBulk([
  { tenantId: 'tenant-123', userId: 'user-1', applicationId: 'app-789', licenseTypeId: 'pro' },
  { tenantId: 'tenant-123', userId: 'user-2', applicationId: 'app-789', licenseTypeId: 'pro' },
]);

results.forEach(r => {
  console.log(`${r.userId}: ${r.success ? 'Success' : r.error}`);
});
```

---

### revokeBulk()

Bulk revoke licenses from multiple users.

```typescript
const result = await authvital.licenses.revokeBulk([
  { tenantId: 'tenant-123', userId: 'user-1', applicationId: 'app-789' },
  { tenantId: 'tenant-123', userId: 'user-2', applicationId: 'app-789' },
]);

console.log(`Revoked ${result.revokedCount} licenses`);
result.failures.forEach(f => console.error(`Failed: ${f.error}`));
```

---

## Complete Example: License Management

```typescript
import { createAuthVital } from '@authvital/sdk/server';
import express from 'express';

const authvital = createAuthVital({ /* config */ });
const app = express();

// Check user's license
app.get('/api/license', async (req, res) => {
  const result = await authvital.licenses.check(req, undefined, 'my-app-id');
  
  if (!result.hasLicense) {
    return res.status(402).json({
      error: 'No license',
      upgradeUrl: '/pricing',
    });
  }
  
  res.json({
    type: result.licenseType,
    features: result.features,
  });
});

// Feature gate middleware
const requireFeature = (feature: string) => async (req, res, next) => {
  const { hasFeature } = await authvital.licenses.hasFeature(
    req, undefined, 'my-app-id', feature
  );
  
  if (!hasFeature) {
    return res.status(402).json({
      error: `Feature '${feature}' requires upgrade`,
    });
  }
  
  next();
};

app.get('/api/advanced-report', requireFeature('advanced-analytics'), (req, res) => {
  // Only accessible if user has 'advanced-analytics' feature
  res.json({ report: '...' });
});

// Admin: List licensed users
app.get('/api/admin/licensed-users', async (req, res) => {
  const users = await authvital.licenses.getAppLicensedUsers(req, 'my-app-id');
  res.json(users);
});
```
