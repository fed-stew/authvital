# Tenant Admin Guide

> Managing your organization's AuthVital tenant.

!!! warning "Code samples: the fluent `authvital.*` API on this page is NOT real"
    This guide predates the real SDK and shows a fictional request-scoped API
    (`authvital.getCurrentUser(req)`, `authvital.memberships.*(req, …)`,
    `authvital.invitations.*(req, …)`, `authvital.licenses.*(req, …)`,
    `authvital.tenants.*`). **None of those methods exist.** Treat every snippet
    below as illustrative pseudocode. The real equivalents (verified against
    `packages/sdk-server/src/client/integration.ts`) are:

    | Fictional call | Real approach |
    |----------------|---------------|
    | `authvital.getCurrentUser(req)` | `verifyToken(token, …)` then read claims — [JWT Validation](../sdk/server-sdk/jwt-validation.md) |
    | `authvital.memberships.listForTenant(req, …)` | `client.integration.listTenantMembers({ tenantId, status?, includeRoles? })` |
    | `authvital.memberships.getTenantRoles()` | `client.integration.getTenantRoles({ tenantId? })` |
    | `authvital.memberships.setMemberRole(req, id, slug)` | `client.integration.setMemberRole({ membershipId, roleId, applicationId })` (sets an **application** role) |
    | `authvital.invitations.send(req, …)` | `client.integration.sendInvitation({ tenantId, email, roleId, clientId? })` (`roleId` required — a TenantRole id) |
    | `authvital.invitations.listPending(req)` | `client.integration.listInvitations({ tenantId })` |
    | `authvital.invitations.resend(req, …)` | `client.integration.resendInvitation({ invitationId })` |
    | `authvital.invitations.revoke(req, id)` | `client.integration.revokeInvitation({ invitationId })` |
    | `authvital.licenses.getTenantOverview(id)` / `getUsageOverview(req)` | `client.integration.getUsageOverview({ tenantId })` |
    | `authvital.licenses.getHolders(req, appId)` | `client.integration.getLicenseHolders({ tenantId, applicationId })` |
    | `authvital.licenses.listForUser(req, userId)` | `client.integration.getUserLicenses({ userId, tenantId })` |
    | `authvital.licenses.grant(req, …)` | `client.integration.grantLicense({ userId, tenantId, applicationId, licenseTypeId })` |
    | `authvital.licenses.revoke(req, …)` | `client.integration.revokeLicense({ userId, tenantId, applicationId })` |

    **No SDK equivalent — done in the hosted console (`/tenant/:tenantId/*`) or
    via REST, not the SDK):** `authvital.tenants.configureSso(...)`,
    `authvital.tenants.getSsoConfig(...)` (SSO page → `/tenant/:id/sso`;
    `GET /api/auth/sso/providers`), tenant settings
    (`/tenant/:id/general`), **usage trends**
    (`GET /api/tenants/:id/licenses/usage-trends`, Billing page) and the
    **audit log** (`GET /api/tenants/:id/audit[/export]`, Audit page). Deep-link
    into these with the `@authvital/core` helpers
    (`getManagementUrls`/`getSsoUrl`/`getBillingUrl`/`getAuditUrl`).
    _Tenant-scoped branding is not implemented (see the
    [authorization model gap appendix](../sdk/authorization-model.md#6-gap-remediation-appendix))._

    Get the M2M client with
    `const client = createServerClient({ authVitalHost, clientId, clientSecret })`.

## Overview

Tenant Admins (with the `admin` role) manage their org in the **hosted console**
(`/tenant/:tenantId/*`). Depending on their permissions they can:

- Invite and manage members and their app roles
- Manage app/product access (including the cross-app **Access Matrix**)
- Configure tenant SSO settings and verified domains
- View subscriptions, licenses and seat **usage trends** (Billing)
- View the tenant **audit log** (`audit:view`; Owner can also export to CSV)
- Manage MFA policies

> _Tenant-scoped branding is not yet available — instance/app branding is a
> Super-Admin (platform) capability. See the
> [authorization model](../sdk/authorization-model.md)._

## Accessing Tenant Settings

### Via Application

Your application may provide a tenant settings page. Look for:
- "Organization Settings"
- "Team Settings"
- "Admin Panel"

### Via SDK

```typescript
// Check if user is tenant admin
const { user, memberships } = await authvital.getCurrentUser(req);
const membership = memberships.find(m => m.tenantId === currentTenantId);
const isAdmin = ['owner', 'admin'].includes(membership?.role);
```

## Member Management

### Viewing Members

```typescript
// List all tenant members
// tenantId is automatically extracted from the JWT
const { memberships } = await authvital.memberships.listForTenant(req, {
  status: 'ACTIVE',
  includeRoles: true,
});
// memberships: [{ id, userId, status, user: { email, name, ... }, roles }]
```

### Inviting Members

```typescript
// Send invitation
// tenantId is automatically extracted from the JWT
const { roles } = await authvital.memberships.getTenantRoles();
const memberRole = roles.find(r => r.slug === 'member');

await authvital.invitations.send(req, {
  email: 'newuser@example.com',
  roleId: memberRole?.id, // Use role ID, not slug
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
// tenantId is automatically extracted from the JWT
const { invitations } = await authvital.invitations.listPending(req);

// Resend invitation
await authvital.invitations.resend(req, {
  invitationId: 'invitation-id',
  expiresInDays: 7, // Optional: extend expiry
});

// Revoke invitation
await authvital.invitations.revoke(req, 'invitation-id');
```

### Changing Member Roles

```typescript
// PSEUDOCODE (fictional fluent API — see the warning at the top of this page).
// Real API sets an APPLICATION role:
//   client.integration.setMemberRole({ membershipId, roleId, applicationId })
await authvital.memberships.setMemberRole(req, 'membership-id', 'admin');
await authvital.memberships.setMemberRole(req, 'membership-id', 'member');
```

**Role Hierarchy:**
- **Owner**: Full access, can delete tenant, transfer ownership
- **Admin**: Manage members, settings, but can't delete tenant
- **Member**: Basic access, no admin functions

### Suspending & Removing Members

!!! note "Admin Dashboard Only"
    Member suspension and removal are currently performed through the **AuthVital Admin Dashboard**.
    
    The SDK does not include `suspend()`, `reactivate()`, or `remove()` methods for memberships.
    
    **To suspend or remove a member:**
    
    1. Go to **AuthVital Admin Panel** → **Tenants** → Select tenant
    2. Navigate to **Members** tab
    3. Click on the member → Use **Suspend** or **Remove** buttons

## SSO Configuration

### Tenant-Level SSO

Configure your organization's own SSO:

```typescript
// Configure Microsoft SSO for your Azure AD
await authvital.tenants.configureSso('tenant-id', {
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
await authvital.tenants.configureSso('tenant-id', {
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
// Get SSO config for a specific provider
const microsoftSso = await authvital.tenants.getSsoConfig('tenant-id', 'MICROSOFT');
const googleSso = await authvital.tenants.getSsoConfig('tenant-id', 'GOOGLE');

// Returns null if not configured, or:
// {
//   provider: 'MICROSOFT',
//   enabled: true,
//   enforced: true,
//   allowedDomains: ['yourcompany.com'],
//   autoCreateUser: true,
//   autoLinkExisting: true,
// }
```

## MFA Policy

### Setting MFA Requirements

```typescript
// Require MFA for all members (immediate — no grace window)
await authvital.tenants.update('tenant-id', {
  mfaPolicy: 'REQUIRED',
  mfaGracePeriodDays: 0,
});

// Require after a grace period (REQUIRED + gracePeriodDays > 0 —
// there is no separate "enforced after grace" policy value)
await authvital.tenants.update('tenant-id', {
  mfaPolicy: 'REQUIRED',
  mfaGracePeriodDays: 14, // 2 weeks to enable MFA
});

// Optional (default)
await authvital.tenants.update('tenant-id', {
  mfaPolicy: 'OPTIONAL',
});

// Other values: 'ENCOURAGED' (prompt but don't require), 'DISABLED'
```

### Viewing MFA Status

```typescript
// Get MFA status for all members
const members = await authvital.memberships.listForTenant(req, {
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

!!! note "Admin Dashboard Only"
    Domain management is currently performed through the **AuthVital Admin Dashboard**.
    
    The SDK does not include a `domains` namespace.
    
    **To manage domains:**
    
    1. Go to **AuthVital Admin Panel** → **Tenants** → Select tenant
    2. Navigate to **Domains** tab
    3. Add, verify, or configure domains from the UI

### Adding a Domain (Admin Dashboard)

1. Click **Add Domain**
2. Enter your domain (e.g., `yourcompany.com`)
3. Copy the verification DNS record

### Verifying Domain

Add the TXT record to your DNS:
```
authvital-verification=verify-token-here
```

Then click **Verify** in the Admin Dashboard.

### Auto-Join Domain

Enable automatic tenant membership for verified domains via the Admin Dashboard settings.

## License Management

### Viewing Tenant License Overview (M2M)

```typescript
// Uses M2M client credentials - no request needed
const overview = await authvital.licenses.getTenantOverview('tenant-id');
// {
//   tenantId: 'tenant-123',
//   tenantName: 'Acme Corporation',
//   totalSeatsOwned: 50,
//   totalSeatsAssigned: 35,
//   totalSeatsAvailable: 15,
//   subscriptions: [...]
// }
```

### Viewing License Assignments

```typescript
// Get all license holders for an application (uses JWT)
const holders = await authvital.licenses.getHolders(req, 'app-id');
// [{ userId, email, licenseType, assignedAt, ... }]

// Or get all licenses for a specific user
const userLicenses = await authvital.licenses.listForUser(req, 'user-id');
```

### Granting Licenses

```typescript
// Grant a license to a user (uses JWT, tenantId from token)
await authvital.licenses.grant(req, {
  userId: 'user-id',
  applicationId: 'app-id',
  licenseTypeId: 'license-type-id',
});
```

### Revoking Licenses

```typescript
// Revoke a license from a user
await authvital.licenses.revoke(req, {
  userId: 'user-id',
  applicationId: 'app-id',
});
```

### License Usage Statistics

```typescript
// Get usage overview for tenant (uses JWT)
const usage = await authvital.licenses.getUsageOverview(req);
// {
//   totalSeats: 10,
//   seatsAssigned: 7,
//   utilization: 70,
//   ...
// }

// Get usage trends over time (PSEUDOCODE — no such SDK method).
// Real: GET /api/tenants/:tenantId/licenses/usage-trends?days=30 (billing:view),
// surfaced on the hosted console Billing page (deep-link with getBillingUrl).
const trends = await authvital.licenses.getUsageTrends(req, 30); // Last 30 days
```

## Tenant Settings

### Updating Tenant Info

```typescript
await authvital.tenants.update('tenant-id', {
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
await authvital.tenants.update('tenant-id', {
  initiateLoginUri: 'https://acme.yourapp.com/login',
});
```

## Ownership Transfer

**Only the current Owner can:**

!!! note "API Endpoint - No SDK Method"
    Tenant ownership transfer is available via the REST API but not yet in the SDK.
    
    ```typescript
    // Direct API call (until SDK method is added)
    const response = await fetch(`${authVitalHost}/api/tenants/${tenantId}/transfer-ownership`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        newOwnerId: 'usr_newowner123',
      }),
    });
    ```
    
    **Required permission:** `tenant:admin` or current owner

After transfer:
- New owner becomes Owner role
- Previous owner becomes Admin role

## Audit Trail

The tenant audit log lives in the hosted console **Audit** page
(`/tenant/:tenantId/audit`) — deep-link into it with `getAuditUrl`.

!!! note "Audit Logs (real endpoints)"
    There is **no** `authvital.licenses.getAuditLog(...)` SDK method. The real,
    guarded endpoints are:

    ```typescript
    // Read the tenant audit log (paginated/filterable). Permission: audit:view.
    const res = await fetch(`${authVitalHost}/api/tenants/${tenantId}/audit`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Export to CSV. Permission: audit:export (Owner only by default).
    const csv = await fetch(`${authVitalHost}/api/tenants/${tenantId}/audit/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    ```

    Instrumented actions today cover members, invitations, app-access and
    licenses; subscription/SSO/domain/tenant-settings mutations are not yet
    recorded (see the
    [authorization model gap appendix](../sdk/authorization-model.md#6-gap-remediation-appendix)).

## Building an Admin UI

### React Admin Panel Example

```tsx
function TenantAdminPanel() {
  const { tenantId } = useCurrentTenant();
  const { user } = useAuth();
  
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
