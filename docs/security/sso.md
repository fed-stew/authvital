# Single Sign-On (SSO) Configuration

> Configure Google and Microsoft SSO for your AuthVader instance.

## Overview

AuthVader supports SSO with:
- **Google** - Google Workspace and personal accounts
- **Microsoft** - Azure AD, Microsoft 365, personal Microsoft accounts

SSO can be configured at two levels:
1. **Instance-level**: Default SSO for all tenants
2. **Tenant-level**: Custom SSO per tenant (overrides instance defaults)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           User clicks "Sign in with Google"                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  AuthVader checks tenant SSO config                                          │
│  ├─ Tenant has custom config? → Use tenant credentials                       │
│  └─ No custom config? → Use instance-level credentials                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Redirect to Google/Microsoft OAuth                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  User authenticates with Google/Microsoft                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  AuthVader receives OAuth callback                                           │
│  ├─ User exists? → Log them in                                               │
│  ├─ Email matches existing user? → Link accounts (if autoLinkExisting)       │
│  └─ New user? → Create account (if autoCreateUser)                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Google SSO Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable the **Google+ API** (for profile info)

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose user type:
   - **Internal**: Only your Google Workspace users
   - **External**: Any Google account
3. Fill in app information:
   - App name: Your app name
   - User support email: Your email
   - Authorized domains: `yourapp.com`, `yourauthvader.com`
4. Add scopes:
   - `openid`
   - `email`
   - `profile`

### 3. Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Add authorized redirect URIs:
   ```
   https://auth.yourapp.com/api/sso/google/callback
   ```
5. Save the **Client ID** and **Client Secret**

### 4. Configure in AuthVader

**Via Admin Panel:**

1. Go to **Settings** → **SSO**
2. Select **Google**
3. Enter:
   - Client ID
   - Client Secret
   - Allowed domains (optional, e.g., `yourcompany.com`)
4. Enable and save

**Via API:**

```typescript
await authvader.admin.configureSso({
  provider: 'GOOGLE',
  enabled: true,
  clientId: 'your-google-client-id',
  clientSecret: 'your-google-client-secret',
  scopes: ['openid', 'email', 'profile'],
  allowedDomains: ['yourcompany.com'], // Optional: restrict to domain
  autoCreateUser: true,   // Create new users automatically
  autoLinkExisting: true, // Link to existing accounts with same email
});
```

## Microsoft SSO Setup

### 1. Register App in Azure AD

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure:
   - Name: Your app name
   - Supported account types:
     - **Single tenant**: Only your organization
     - **Multitenant**: Any Azure AD organization
     - **Multitenant + personal**: Azure AD + personal Microsoft accounts
   - Redirect URI: `https://auth.yourapp.com/api/sso/microsoft/callback`
5. Click **Register**

### 2. Configure Authentication

1. Go to **Authentication**
2. Under **Platform configurations**, verify Web redirect URI
3. Enable **ID tokens** and **Access tokens**

### 3. Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Set description and expiration
4. Copy the **Value** immediately (shown only once!)

### 4. Note Your IDs

From **Overview** tab, note:
- **Application (client) ID**
- **Directory (tenant) ID** (if single-tenant)

### 5. Configure in AuthVader

**Via Admin Panel:**

1. Go to **Settings** → **SSO**
2. Select **Microsoft**
3. Enter:
   - Client ID (Application ID)
   - Client Secret
   - Tenant ID (optional, for single-tenant)
   - Allowed domains (optional)
4. Enable and save

**Via API:**

```typescript
await authvader.admin.configureSso({
  provider: 'MICROSOFT',
  enabled: true,
  clientId: 'your-azure-app-id',
  clientSecret: 'your-azure-client-secret',
  // For multi-tenant, use 'common' or 'organizations' or 'consumers'
  // For single-tenant, use your directory/tenant ID
  scopes: ['openid', 'email', 'profile', 'User.Read'],
  allowedDomains: ['yourcompany.com'],
  autoCreateUser: true,
  autoLinkExisting: true,
});
```

## Tenant-Level SSO

Tenants can configure their own SSO credentials:

### Use Case

- Enterprise customers with their own Azure AD
- Organizations wanting isolated identity management
- Different SSO providers per tenant

### Configuration

**Via Tenant Admin Panel:**

1. Tenant admin goes to **Settings** → **SSO**
2. Configures their own OAuth credentials
3. Can optionally enforce SSO (disable password login)

**Via API:**

```typescript
await authvader.tenants.configureSso('tenant-id', {
  provider: 'MICROSOFT',
  enabled: true,
  clientId: 'tenant-specific-azure-app-id',
  clientSecret: 'tenant-specific-secret',
  enforced: true, // Disable password login for this tenant
  allowedDomains: ['tenant-company.com'],
});
```

### Enforcement

When SSO is **enforced** for a tenant:
- Password login is disabled
- Users must use SSO
- Password reset is disabled
- Only SSO-linked users can access

```typescript
// Check if tenant has enforced SSO
const ssoConfig = await authvader.tenants.getSsoConfig('tenant-id', 'MICROSOFT');
if (ssoConfig.enforced) {
  // Hide password login, show only SSO button
}
```

## Domain Restrictions

Restrict SSO to specific email domains:

```typescript
// Instance-level: only allow company emails
await authvader.admin.configureSso({
  provider: 'GOOGLE',
  allowedDomains: ['yourcompany.com', 'subsidiary.com'],
  // ...
});

// Tenant-level: restrict to tenant's domain
await authvader.tenants.configureSso('tenant-id', {
  provider: 'MICROSOFT',
  allowedDomains: ['tenant-company.com'],
  // ...
});
```

If a user tries to SSO with an email outside allowed domains, they'll see an error.

## Account Linking

### Auto-Link Existing Accounts

When `autoLinkExisting: true` (default):

1. User signs in with Google/Microsoft
2. AuthVader checks for existing user with same email
3. If found, links the SSO identity to existing account
4. User can now sign in via password OR SSO

### Manual Linking

Users can link SSO accounts from their profile:

```typescript
// Get available SSO providers
const providers = await authvader.sso.getAvailableProviders();
// [{ provider: 'GOOGLE', enabled: true }, { provider: 'MICROSOFT', enabled: true }]

// Initiate linking (returns OAuth URL)
const { url } = await authvader.sso.initiateLink(req, {
  provider: 'GOOGLE',
  redirectUri: 'https://yourapp.com/settings/account',
});

// Redirect user to url
```

### Unlinking SSO

```typescript
// Remove SSO link (user must have password set)
await authvader.sso.unlink(req, {
  provider: 'GOOGLE',
});
```

## SSO Buttons

### Instance SSO Buttons

Show SSO options on login page:

```tsx
function LoginPage() {
  const { ssoProviders } = useAuthVader();

  return (
    <div>
      <LoginForm />
      
      {ssoProviders.length > 0 && (
        <>
          <Divider>or continue with</Divider>
          <SsoButtons providers={ssoProviders} />
        </>
      )}
    </div>
  );
}

function SsoButtons({ providers }) {
  const { loginWithSso } = useAuthVader();

  return (
    <div className="sso-buttons">
      {providers.includes('GOOGLE') && (
        <button onClick={() => loginWithSso('google')}>
          <GoogleIcon /> Sign in with Google
        </button>
      )}
      {providers.includes('MICROSOFT') && (
        <button onClick={() => loginWithSso('microsoft')}>
          <MicrosoftIcon /> Sign in with Microsoft
        </button>
      )}
    </div>
  );
}
```

### Tenant-Specific SSO

For tenant-scoped login pages:

```tsx
function TenantLoginPage({ tenantSlug }) {
  const [ssoConfig, setSsoConfig] = useState(null);

  useEffect(() => {
    // Fetch tenant's SSO configuration
    fetch(`/api/tenants/${tenantSlug}/sso`)
      .then(r => r.json())
      .then(setSsoConfig);
  }, [tenantSlug]);

  // If SSO is enforced, show only SSO button
  if (ssoConfig?.enforced) {
    return (
      <div>
        <h1>Sign in to {tenantSlug}</h1>
        <button onClick={() => loginWithSso(ssoConfig.provider, tenantSlug)}>
          Sign in with {ssoConfig.provider}
        </button>
      </div>
    );
  }

  // Otherwise show both options
  return (
    <div>
      <LoginForm />
      {ssoConfig?.enabled && (
        <button onClick={() => loginWithSso(ssoConfig.provider, tenantSlug)}>
          Sign in with {ssoConfig.provider}
        </button>
      )}
    </div>
  );
}
```

## Security Considerations

### ✅ Best Practices

1. **Use domain restrictions** - Only allow expected email domains
2. **Enable auto-link carefully** - Consider security implications
3. **Rotate client secrets** - Especially for Microsoft (they expire)
4. **Use internal consent** - For enterprise Google Workspace
5. **Monitor SSO usage** - Track failed attempts

### ❌ Avoid

1. **Don't share credentials** - Each tenant should have own credentials if needed
2. **Don't skip domain validation** - Prevents account takeover
3. **Don't disable MFA** - SSO doesn't replace MFA

## Troubleshooting

### "Invalid redirect URI"

1. Check redirect URI matches exactly (including trailing slashes)
2. Ensure protocol matches (https vs http)
3. For Google: Verify in Cloud Console → Credentials
4. For Microsoft: Verify in Azure → Authentication

### "Account not found"

1. Check `autoCreateUser` is enabled
2. Verify email domain is allowed
3. Check if user already exists with different email

### "Unable to link account"

1. User must have password set to unlink SSO
2. Check for existing SSO link for same provider
3. Verify email matches between accounts

### Microsoft: "AADSTS50011"

Reply URL mismatch. Ensure Azure AD registration has exact redirect URI.

### Google: "Access blocked"

1. OAuth consent screen not configured
2. App not verified (for external users)
3. Scopes not approved

---

## Related Documentation

- [MFA Configuration](./mfa.md)
- [Security Best Practices](./best-practices.md)
- [Multi-Tenancy](../concepts/multi-tenancy.md)
