# Super Admin Guide

> Managing your AuthVader instance as a super administrator.

## Overview

Super Admins have full control over the AuthVader instance:

- Manage applications and OAuth clients
- Configure instance-wide settings
- Create and manage tenants
- View all users across tenants
- Configure SSO providers
- Manage system webhooks
- Create other super admins

## First Login

### Initial Setup

When AuthVader starts with `SUPER_ADMIN_EMAIL` configured:

1. A super admin account is created automatically
2. A password reset email is sent (or logged to console in dev)
3. Navigate to `https://your-authvader.com/admin`
4. Click "Reset Password" and check your email
5. Set a strong password
6. **Enable MFA immediately**

### Accessing Admin Panel

```
https://your-authvader.com/admin
```

Login with your super admin credentials. If MFA is required, you'll be prompted for a TOTP code.

## Dashboard

The admin dashboard shows:

- **Instance Stats**: Total users, tenants, applications
- **Recent Activity**: Latest signups, logins, events
- **System Health**: Database status, API health

## Managing Applications

### Creating an Application

1. Go to **Applications** → **Create New**
2. Configure:

| Field | Description |
|-------|-------------|
| Name | Display name (shown on login) |
| Slug | URL-safe identifier |
| Type | `SPA` (browser) or `MACHINE` (server-to-server) |
| Redirect URIs | OAuth callback URLs |
| Post-Logout URIs | Where to redirect after logout |

3. Save to generate `client_id` (and `client_secret` for MACHINE type)

### Application Settings

| Tab | Purpose |
|-----|--------|
| **General** | Name, description, type |
| **OAuth** | Redirect URIs, token TTLs |
| **Branding** | Logo, colors, links |
| **Roles** | Define application roles |
| **Licensing** | Configure license types and modes |
| **Access** | Control who can access the app |
| **Webhooks** | Per-app webhook configuration |

### Licensing Modes

| Mode | Use Case |
|------|----------|
| `FREE` | Free products, all users get access |
| `PER_SEAT` | Traditional SaaS licensing |
| `TENANT_WIDE` | Team subscriptions |

### Creating License Types

1. Go to **Application** → **Licenses** tab
2. Click **Add License Type**
3. Configure:

```typescript
{
  name: "Pro Plan",
  slug: "pro",
  description: "For growing teams",
  features: {
    "api-access": true,
    "advanced-reports": true,
    "sso": false,
    "audit-logs": false,
  },
  displayOrder: 2,
}
```

## Managing Tenants

### Viewing Tenants

**Tenants** page shows all organizations:

- Name and slug
- Member count
- Created date
- Status

### Creating a Tenant

1. Go to **Tenants** → **Create New**
2. Fill in:
   - Name: "Acme Corporation"
   - Slug: `acme-corp` (auto-generated if blank)
3. Optionally assign initial owner

### Tenant Details

Click a tenant to see:

| Tab | Content |
|-----|--------|
| **Overview** | Stats, quick actions |
| **Members** | Users in this tenant |
| **Domains** | Verified email domains |
| **Subscriptions** | License subscriptions |
| **SSO** | Tenant-specific SSO config |
| **Settings** | MFA policy, settings |

### Managing Members

From tenant details → **Members**:

- **Invite**: Send invitation to email
- **Change Role**: Owner, Admin, or Member
- **Suspend**: Temporarily disable access
- **Remove**: Remove from tenant

## Managing Users

### User List

**Users** page shows all users across tenants:

- Email and name
- Email verification status
- MFA status
- Tenant memberships

### User Details

Click a user to see:

- Profile information
- Tenant memberships
- Active sessions
- License assignments
- SSO links

### Admin Actions

| Action | Use |
|--------|-----|
| **Reset Password** | Send password reset email |
| **Disable MFA** | Emergency MFA removal |
| **Deactivate** | Disable account |
| **Delete** | Permanently remove user |

## Instance Settings

### General Settings

| Setting | Description |
|---------|-------------|
| Instance Name | Display name for your IDP |
| Sign-up Allowed | Allow public registration |
| Auto-Create Tenant | Create tenant for new signups |
| Generic Domains | Allow gmail.com, etc. |
| Single-Tenant Mode | Restrict to one tenant |

### Branding

Configure default branding for login pages:

- Logo and icon URLs
- Primary and accent colors
- Background color/gradient
- Support, privacy, terms links

### Security Settings

| Setting | Description |
|---------|-------------|
| Super Admin MFA Required | Force MFA for all super admins |
| Default MFA Policy | Default for new tenants |

## SSO Configuration

### Instance-Level SSO

Configure SSO providers available to all tenants:

1. Go to **Settings** → **SSO**
2. Select provider (Google or Microsoft)
3. Enter OAuth credentials
4. Configure options:

| Option | Description |
|--------|-------------|
| Enabled | Activate this provider |
| Client ID | OAuth client ID |
| Client Secret | OAuth client secret |
| Allowed Domains | Restrict to email domains |
| Auto-Create User | Create new users from SSO |
| Auto-Link Existing | Link SSO to existing accounts |

### Testing SSO

After configuration:
1. Log out of admin panel
2. Go to regular login page
3. Click "Sign in with Google/Microsoft"
4. Verify the flow works

## API Keys

### Instance API Keys

Create API keys for programmatic instance access:

1. Go to **Settings** → **API Keys**
2. Click **Create Key**
3. Name it (e.g., "CI/CD Pipeline")
4. Set permissions and expiration
5. **Copy the key immediately** (shown only once!)

### Key Permissions

| Permission | Allows |
|------------|--------|
| `instance:*` | Full instance access |
| `instance:users:read` | Read user data |
| `instance:tenants:*` | Manage all tenants |
| `instance:applications:*` | Manage applications |

## System Webhooks

Configure webhooks for system-wide events:

1. Go to **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:

| Field | Description |
|-------|-------------|
| Name | Webhook identifier |
| URL | Endpoint to POST to |
| Secret | For HMAC signature |
| Events | Events to subscribe to |

### Available Events

- `subject.*` - User lifecycle
- `member.*` - Membership changes
- `invite.*` - Invitation events
- `license.*` - License assignments
- `app_access.*` - App access changes

## Managing Super Admins

### Creating Another Super Admin

1. Go to **Settings** → **Accounts**
2. Click **Add Super Admin**
3. Enter email address
4. New admin receives password reset email

### Super Admin Permissions

All super admins have equal permissions. There's no hierarchy - any super admin can:

- Create/delete other super admins
- Modify all settings
- Access all data

### Removing a Super Admin

1. Go to **Settings** → **Accounts**
2. Find the admin
3. Click **Deactivate** or **Delete**

⚠️ Cannot delete the last super admin!

## Audit Logs

Super admin actions are logged:

- Login/logout events
- Configuration changes
- User management actions
- Tenant modifications

View at **Settings** → **Audit Log**

## Security Best Practices

### ✅ Do

1. **Enable MFA** - All super admins should use MFA
2. **Use strong passwords** - 16+ characters, unique
3. **Limit super admins** - Only those who need it
4. **Review access regularly** - Audit who has admin access
5. **Use API keys carefully** - Set expiration, minimum permissions

### ❌ Don't

1. **Don't share credentials** - Each admin gets own account
2. **Don't skip MFA** - Even for "just testing"
3. **Don't use production admin for dev** - Separate environments
4. **Don't leave sessions open** - Log out when done

## Troubleshooting

### Locked Out

If you're locked out of admin:

1. Check if another super admin can reset your password
2. Use database access (emergency only):

```sql
-- Reset password to temporary value
UPDATE super_admins 
SET password_hash = '$2b$10$...',  -- bcrypt hash of temp password
    must_change_password = true
WHERE email = 'your@email.com';
```

### MFA Issues

If you can't access MFA:

1. Use backup code
2. Another super admin can disable your MFA
3. Database emergency reset:

```sql
UPDATE super_admins 
SET mfa_enabled = false,
    mfa_secret = null,
    mfa_backup_codes = '{}'
WHERE email = 'your@email.com';
```

---

## Related Documentation

- [Application Setup](./application-setup.md)
- [Security Best Practices](../security/best-practices.md)
- [Configuration Reference](../getting-started/configuration.md)
