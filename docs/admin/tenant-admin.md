# Tenant Admin Guide

> Managing your organization's AuthVader tenant.

## Overview

Tenant Admins (with `admin` role) can:

- Invite and manage members
- Configure tenant SSO settings
- Manage MFA policies
- View tenant subscription and licenses
- Configure tenant branding

## Accessing Tenant Settings

### Via Application

Your application may provide a tenant settings page. Look for:
- "Organization Settings"
- "Team Settings"
- "Admin Panel"

### Via SDK

```typescript
// Check if user is tenant admin
const { user, memberships } = await authvader.getCurrentUser(req);
const membership = memberships.find(m => m.tenantId === currentTenantId);
const isAdmin = ['owner', 'admin'].includes(membership?.role);
```

## Member Management

### Viewing Members

```typescript
// List all tenant members
const members = await authvader.memberships.list({
  tenantId: 'tenant-id',
  includeUser: true,
});
// [{ id, userId, status, role, user: { email, name, ... } }]
```

### Inviting Members

```typescript
// Send invitation
await authvader.invitations.create({
  tenantId: 'tenant-id',
  email: 'newuser@example.com',
  role: 'member', // or 'admin'
  expiresInDays: 7,
});
```

Invitee receives email with link to accept.

### Invitation States

| Status | Description |
|--------|-------------|
| `PENDING` | Waiting for user to accept |
| `ACCEPTED` | User joined the tenant |
| `EXPIRED` | Past expiration date |
| `REVOKED` | Manually cancelled |

### Managing Invitations

```typescript
// List pending invitations
const invitations = await authvader.invitations.list({
  tenantId: 'tenant-id',
  status: 'PENDING',
});

// Resend invitation
await authvader.invitations.resend('invitation-id');

// Revoke invitation
await authvader.invitations.revoke('invitation-id');
```

### Changing Member Roles

```typescript
// Change to admin
await authvader.memberships.updateRole('membership-id', {
  role: 'admin',
});

// Demote to member
await authvader.memberships.updateRole('membership-id', {
  role: 'member',
});
```

**Role Hierarchy:**
- **Owner**: Full access, can delete tenant, transfer ownership
- **Admin**: Manage members, settings, but can't delete tenant
- **Member**: Basic access, no admin functions

### Suspending Members

```typescript
// Suspend a member (blocks access without removing)
await authvader.memberships.suspend('membership-id');

// Reactivate suspended member
await authvader.memberships.reactivate('membership-id');
```

### Removing Members

```typescript
// Remove from tenant
await authvader.memberships.remove('membership-id');
```

## SSO Configuration

### Tenant-Level SSO

Configure your organization's own SSO:

```typescript
// Configure Microsoft SSO for your Azure AD
await authvader.tenants.configureSso('tenant-id', {
  provider: 'MICROSOFT',
  enabled: true,
  clientId: 'your-azure-app-id',
  clientSecret: 'your-azure-secret',
  allowedDomains: ['yourcompany.com'],
});
```

### Enforcing SSO

Disable password login, require SSO:

```typescript
await authvader.tenants.configureSso('tenant-id', {
  provider: 'MICROSOFT',
  enabled: true,
  enforced: true, // Password login disabled
  // ...
});
```

When enforced:
- Users must use SSO to log in
- Password reset is disabled
- Only SSO-linked users can access

### Viewing SSO Configuration

```typescript
const ssoConfig = await authvader.tenants.getSsoConfig('tenant-id');
// {
//   google: { enabled: false },
//   microsoft: { enabled: true, enforced: true, allowedDomains: [...] }
// }
```

## MFA Policy

### Setting MFA Requirements

```typescript
// Require MFA for all members
await authvader.tenants.update('tenant-id', {
  mfaPolicy: 'REQUIRED',
});

// Require after grace period
await authvader.tenants.update('tenant-id', {
  mfaPolicy: 'ENFORCED_AFTER_GRACE',
  mfaGracePeriodDays: 14, // 2 weeks to enable MFA
});

// Optional (default)
await authvader.tenants.update('tenant-id', {
  mfaPolicy: 'OPTIONAL',
});
```

### Viewing MFA Status

```typescript
// Get MFA status for all members
const members = await authvader.memberships.list({
  tenantId: 'tenant-id',
  includeUser: true,
});

const mfaStats = {
  total: members.length,
  enabled: members.filter(m => m.user.mfaEnabled).length,
  pending: members.filter(m => !m.user.mfaEnabled && policy === 'REQUIRED').length,
};
```

## Domain Verification

Verify your company's domain to:
- Auto-add users with matching email
- Restrict SSO to your domain
- Enable domain-based features

### Adding a Domain

```typescript
await authvader.domains.create({
  tenantId: 'tenant-id',
  domain: 'yourcompany.com',
});
// Returns verification record to add to DNS
```

### Verifying Domain

Add TXT record to DNS:
```
authvader-verification=verify-token-here
```

Then verify:

```typescript
await authvader.domains.verify('domain-id');
// { verified: true, verifiedAt: '2024-01-15T...' }
```

### Auto-Join Domain

Enable automatic tenant membership for verified domains:

```typescript
await authvader.domains.update('domain-id', {
  autoJoin: true,
  defaultRole: 'member',
});
```

New users with `@yourcompany.com` email automatically join.

## License Management

### Viewing Subscription

```typescript
const subscription = await authvader.subscriptions.get({
  tenantId: 'tenant-id',
  applicationId: 'app-id',
});
// {
//   licenseType: { name: 'Pro', features: {...} },
//   quantityPurchased: 10,
//   status: 'ACTIVE',
//   currentPeriodEnd: '2024-12-31T...'
// }
```

### Viewing License Assignments

```typescript
const assignments = await authvader.licenses.list({
  tenantId: 'tenant-id',
  applicationId: 'app-id',
});
// [{ userId, user: { email, name }, assignedAt, assignedBy }]
```

### Assigning Licenses

```typescript
// Assign to user
await authvader.licenses.assign({
  tenantId: 'tenant-id',
  applicationId: 'app-id',
  userId: 'user-id',
});
```

### Unassigning Licenses

```typescript
// Free up a seat
await authvader.licenses.unassign({
  tenantId: 'tenant-id',
  applicationId: 'app-id',
  userId: 'user-id',
});
```

### License Statistics

```typescript
const stats = await authvader.licenses.getStats({
  tenantId: 'tenant-id',
  applicationId: 'app-id',
});
// {
//   purchased: 10,
//   assigned: 7,
//   available: 3
// }
```

## Tenant Settings

### Updating Tenant Info

```typescript
await authvader.tenants.update('tenant-id', {
  name: 'New Company Name',
  settings: {
    timezone: 'America/New_York',
    language: 'en',
  },
});
```

### Custom Login URL

Configure where users are sent to log in:

```typescript
await authvader.tenants.update('tenant-id', {
  initiateLoginUri: 'https://acme.yourapp.com/login',
});
```

## Ownership Transfer

**Only the current Owner can:**

```typescript
// Transfer ownership to another admin
await authvader.tenants.transferOwnership({
  tenantId: 'tenant-id',
  newOwnerId: 'user-id', // Must be existing admin
});
```

After transfer:
- New owner becomes Owner role
- Previous owner becomes Admin role

## Audit Trail

View recent activity in your tenant:

```typescript
const events = await authvader.audit.list({
  tenantId: 'tenant-id',
  limit: 50,
});
// [
//   { action: 'member.invited', actor: {...}, target: {...}, timestamp: '...' },
//   { action: 'sso.configured', actor: {...}, timestamp: '...' },
//   ...
// ]
```

## Building an Admin UI

### React Admin Panel Example

```tsx
function TenantAdminPanel() {
  const { tenantId } = useCurrentTenant();
  const { user } = useAuthVader();
  
  // Check admin access
  const membership = user.memberships.find(m => m.tenantId === tenantId);
  const isAdmin = ['owner', 'admin'].includes(membership?.role);
  
  if (!isAdmin) {
    return <AccessDenied message="Admin access required" />;
  }
  
  return (
    <Tabs>
      <Tab label="Members">
        <MemberList tenantId={tenantId} />
        <InviteMemberForm tenantId={tenantId} />
      </Tab>
      
      <Tab label="Security">
        <SsoConfiguration tenantId={tenantId} />
        <MfaPolicySettings tenantId={tenantId} />
      </Tab>
      
      {membership.role === 'owner' && (
        <Tab label="Settings">
          <TenantSettings tenantId={tenantId} />
          <DangerZone tenantId={tenantId} />
        </Tab>
      )}
    </Tabs>
  );
}
```

## Best Practices

### ✅ Do

1. **Keep at least 2 admins** - Avoid single point of failure
2. **Enable MFA for admins** - Protect privileged accounts
3. **Verify your domain** - Better security, auto-join
4. **Review members regularly** - Remove inactive users
5. **Use SSO when possible** - Centralize identity

### ❌ Don't

1. **Don't make everyone admin** - Least privilege principle
2. **Don't skip MFA for admins** - High-value targets
3. **Don't ignore inactive invitations** - Clean up or resend
4. **Don't transfer ownership carelessly** - Hard to reverse

---

## Related Documentation

- [Super Admin Guide](./super-admin.md)
- [SSO Configuration](../security/sso.md)
- [MFA Guide](../security/mfa.md)
- [Access Control](../concepts/access-control.md)
