# Webhook Event Types & Payloads

> Complete reference for all AuthVital webhook event types with TypeScript types and JSON payload examples.

**See also:** [Webhooks Guide](./webhooks.md) | [Event Handler Reference](./webhooks-handler.md)

---

## Subject Events

Subject events fire when users, service accounts, or machines are created, updated, or deleted.

### TypeScript Types

```typescript
interface SubjectData {
  sub: string;                                          // Subject ID
  email?: string;                                       // Email address (if applicable)
  given_name?: string;                                  // First name
  family_name?: string;                                 // Last name
  subject_type?: 'user' | 'service_account' | 'machine'; // Subject type
}

interface SubjectUpdatedData extends SubjectData {
  changed_fields: string[];  // List of fields that changed
}

// Event types
type SubjectCreatedEvent = BaseEvent<'subject.created', SubjectData>;
type SubjectUpdatedEvent = BaseEvent<'subject.updated', SubjectUpdatedData>;
type SubjectDeletedEvent = BaseEvent<'subject.deleted', SubjectData>;
type SubjectDeactivatedEvent = BaseEvent<'subject.deactivated', SubjectData>;
```

### `subject.created`

Fires when a new subject (user, service account, or machine) is created.

```json
{
  "id": "evt_01HQXYZ123ABC",
  "type": "subject.created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "sub": "usr_jane789",
    "email": "jane@example.com",
    "given_name": "Jane",
    "family_name": "Smith",
    "subject_type": "user"
  }
}
```

### `subject.updated`

Fires when a subject's profile is updated. Includes `changed_fields` array.

```json
{
  "id": "evt_01HQXYZ456DEF",
  "type": "subject.updated",
  "timestamp": "2024-01-15T11:45:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "sub": "usr_jane789",
    "email": "jane.smith@example.com",
    "given_name": "Jane",
    "family_name": "Smith",
    "subject_type": "user",
    "changed_fields": ["email"]
  }
}
```

### `subject.deleted`

Fires when a subject is permanently deleted.

```json
{
  "id": "evt_01HQXYZ789GHI",
  "type": "subject.deleted",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "sub": "usr_jane789",
    "email": "jane.smith@example.com",
    "given_name": "Jane",
    "family_name": "Smith",
    "subject_type": "user"
  }
}
```

### `subject.deactivated`

Fires when a subject is deactivated (soft delete).

```json
{
  "id": "evt_01HQXYZABCJKL",
  "type": "subject.deactivated",
  "timestamp": "2024-01-15T12:15:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "sub": "usr_jane789",
    "email": "jane.smith@example.com",
    "given_name": "Jane",
    "family_name": "Smith",
    "subject_type": "user"
  }
}
```

---

## Invitation Events

Invitation events fire during the invite lifecycle.

### TypeScript Types

```typescript
interface InviteData {
  invite_id: string;       // Invitation ID
  membership_id: string;   // Membership ID (created on acceptance)
  email: string;           // Invited email address
  tenant_roles: string[];  // Roles assigned in tenant
  invited_by_sub?: string; // Subject ID of inviter
  expires_at?: string;     // ISO timestamp of expiration
}

interface InviteAcceptedData extends InviteData {
  sub: string;             // Subject ID of accepting user
  given_name?: string;     // First name of accepting user
  family_name?: string;    // Last name of accepting user
}

// Event types
type InviteCreatedEvent = BaseEvent<'invite.created', InviteData>;
type InviteAcceptedEvent = BaseEvent<'invite.accepted', InviteAcceptedData>;
type InviteDeletedEvent = BaseEvent<'invite.deleted', InviteData>;
type InviteExpiredEvent = BaseEvent<'invite.expired', InviteData>;
```

### `invite.created`

Fires when a new invitation is sent.

```json
{
  "id": "evt_01HQINV001ABC",
  "type": "invite.created",
  "timestamp": "2024-01-15T09:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "invite_id": "inv_xyz789",
    "membership_id": "mem_pending001",
    "email": "newuser@example.com",
    "tenant_roles": ["member"],
    "invited_by_sub": "usr_admin001",
    "expires_at": "2024-01-22T09:00:00.000Z"
  }
}
```

### `invite.accepted`

Fires when an invitation is accepted. Includes the accepting user's info.

```json
{
  "id": "evt_01HQINV002DEF",
  "type": "invite.accepted",
  "timestamp": "2024-01-16T14:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "invite_id": "inv_xyz789",
    "membership_id": "mem_active001",
    "email": "newuser@example.com",
    "tenant_roles": ["member"],
    "invited_by_sub": "usr_admin001",
    "expires_at": "2024-01-22T09:00:00.000Z",
    "sub": "usr_newuser001",
    "given_name": "Alex",
    "family_name": "Johnson"
  }
}
```

### `invite.deleted`

Fires when an invitation is revoked/deleted.

```json
{
  "id": "evt_01HQINV003GHI",
  "type": "invite.deleted",
  "timestamp": "2024-01-17T10:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "invite_id": "inv_another456",
    "membership_id": "mem_pending002",
    "email": "cancelled@example.com",
    "tenant_roles": ["member"],
    "invited_by_sub": "usr_admin001",
    "expires_at": "2024-01-24T10:00:00.000Z"
  }
}
```

### `invite.expired`

Fires when an invitation expires without being accepted.

```json
{
  "id": "evt_01HQINV004JKL",
  "type": "invite.expired",
  "timestamp": "2024-01-22T09:00:01.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "invite_id": "inv_expired789",
    "membership_id": "mem_pending003",
    "email": "noreply@example.com",
    "tenant_roles": ["member"],
    "invited_by_sub": "usr_admin001",
    "expires_at": "2024-01-22T09:00:00.000Z"
  }
}
```

---

## Member Events

Member events fire when users join, leave, or have their roles changed in a tenant.

### TypeScript Types

```typescript
interface MemberData {
  membership_id: string;   // Membership ID
  sub: string;             // Subject ID
  email?: string;          // Email address
  tenant_roles: string[];  // Current tenant roles
}

interface MemberJoinedData extends MemberData {
  given_name?: string;     // First name
  family_name?: string;    // Last name
}

interface MemberRoleChangedData extends MemberData {
  previous_roles: string[]; // Previous tenant roles
}

// Event types
type MemberJoinedEvent = BaseEvent<'member.joined', MemberJoinedData>;
type MemberLeftEvent = BaseEvent<'member.left', MemberData>;
type MemberRoleChangedEvent = BaseEvent<'member.role_changed', MemberRoleChangedData>;
type MemberSuspendedEvent = BaseEvent<'member.suspended', MemberData>;
type MemberActivatedEvent = BaseEvent<'member.activated', MemberData>;
```

### `member.joined`

Fires when a user joins a tenant (after accepting invite or direct assignment).

```json
{
  "id": "evt_01HQMEM001ABC",
  "type": "member.joined",
  "timestamp": "2024-01-16T14:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_active001",
    "sub": "usr_newuser001",
    "email": "newuser@example.com",
    "tenant_roles": ["member"],
    "given_name": "Alex",
    "family_name": "Johnson"
  }
}
```

### `member.left`

Fires when a user leaves or is removed from a tenant.

```json
{
  "id": "evt_01HQMEM002DEF",
  "type": "member.left",
  "timestamp": "2024-01-20T16:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_active001",
    "sub": "usr_leaving001",
    "email": "leaving@example.com",
    "tenant_roles": ["member"]
  }
}
```

### `member.role_changed`

Fires when a member's tenant roles change. Includes previous roles.

```json
{
  "id": "evt_01HQMEM003GHI",
  "type": "member.role_changed",
  "timestamp": "2024-01-18T11:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_active002",
    "sub": "usr_promoted001",
    "email": "promoted@example.com",
    "tenant_roles": ["admin", "member"],
    "previous_roles": ["member"]
  }
}
```

### `member.suspended`

Fires when a member is suspended from a tenant.

```json
{
  "id": "evt_01HQMEM004JKL",
  "type": "member.suspended",
  "timestamp": "2024-01-19T09:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_suspended001",
    "sub": "usr_suspended001",
    "email": "suspended@example.com",
    "tenant_roles": ["member"]
  }
}
```

### `member.activated`

Fires when a suspended member is reactivated.

```json
{
  "id": "evt_01HQMEM005MNO",
  "type": "member.activated",
  "timestamp": "2024-01-21T13:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_reactivated001",
    "sub": "usr_reactivated001",
    "email": "reactivated@example.com",
    "tenant_roles": ["member"]
  }
}
```

---

## App Access Events

App access events fire when users are granted, revoked, or have their application roles changed.

### TypeScript Types

```typescript
interface AppAccessData {
  membership_id: string;  // Membership ID
  sub: string;            // Subject ID
  email?: string;         // Email address
  role_id: string;        // Application role ID
  role_name: string;      // Application role display name
  role_slug: string;      // Application role slug
}

interface AppAccessGrantedData extends AppAccessData {
  given_name?: string;    // First name
  family_name?: string;   // Last name
}

interface AppAccessRoleChangedData extends AppAccessData {
  previous_role_id: string;    // Previous role ID
  previous_role_name: string;  // Previous role display name
  previous_role_slug: string;  // Previous role slug
}

// Event types
type AppAccessGrantedEvent = BaseEvent<'app_access.granted', AppAccessGrantedData>;
type AppAccessRevokedEvent = BaseEvent<'app_access.revoked', AppAccessData>;
type AppAccessRoleChangedEvent = BaseEvent<'app_access.role_changed', AppAccessRoleChangedData>;
```

### `app_access.granted`

Fires when a user is granted access to an application.

```json
{
  "id": "evt_01HQAPP001ABC",
  "type": "app_access.granted",
  "timestamp": "2024-01-16T15:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_active001",
    "sub": "usr_newuser001",
    "email": "newuser@example.com",
    "role_id": "role_viewer001",
    "role_name": "Viewer",
    "role_slug": "viewer",
    "given_name": "Alex",
    "family_name": "Johnson"
  }
}
```

### `app_access.revoked`

Fires when a user's application access is revoked.

```json
{
  "id": "evt_01HQAPP002DEF",
  "type": "app_access.revoked",
  "timestamp": "2024-01-20T16:15:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_revoked001",
    "sub": "usr_revoked001",
    "email": "revoked@example.com",
    "role_id": "role_viewer001",
    "role_name": "Viewer",
    "role_slug": "viewer"
  }
}
```

### `app_access.role_changed`

Fires when a user's application role changes. Includes previous role info.

```json
{
  "id": "evt_01HQAPP003GHI",
  "type": "app_access.role_changed",
  "timestamp": "2024-01-18T12:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "membership_id": "mem_upgraded001",
    "sub": "usr_upgraded001",
    "email": "upgraded@example.com",
    "role_id": "role_editor001",
    "role_name": "Editor",
    "role_slug": "editor",
    "previous_role_id": "role_viewer001",
    "previous_role_name": "Viewer",
    "previous_role_slug": "viewer"
  }
}
```

---

## License Events

License events fire when licenses are assigned, revoked, or changed.

### TypeScript Types

```typescript
interface LicenseData {
  assignment_id: string;     // License assignment ID
  sub: string;               // Subject ID
  email?: string;            // Email address
  license_type_id: string;   // License type ID
  license_type_name: string; // License type display name
}

interface LicenseChangedData extends LicenseData {
  previous_license_type_id: string;   // Previous license type ID
  previous_license_type_name: string; // Previous license type name
}

// Event types
type LicenseAssignedEvent = BaseEvent<'license.assigned', LicenseData>;
type LicenseRevokedEvent = BaseEvent<'license.revoked', LicenseData>;
type LicenseChangedEvent = BaseEvent<'license.changed', LicenseChangedData>;
```

### `license.assigned`

Fires when a license is assigned to a user.

```json
{
  "id": "evt_01HQLIC001ABC",
  "type": "license.assigned",
  "timestamp": "2024-01-16T15:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "assignment_id": "asgn_lic001",
    "sub": "usr_licensed001",
    "email": "licensed@example.com",
    "license_type_id": "lic_pro001",
    "license_type_name": "Pro Plan"
  }
}
```

### `license.revoked`

Fires when a license is revoked from a user.

```json
{
  "id": "evt_01HQLIC002DEF",
  "type": "license.revoked",
  "timestamp": "2024-01-25T10:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "assignment_id": "asgn_lic001",
    "sub": "usr_licensed001",
    "email": "licensed@example.com",
    "license_type_id": "lic_pro001",
    "license_type_name": "Pro Plan"
  }
}
```

### `license.changed`

Fires when a user's license type changes. Includes previous license info.

```json
{
  "id": "evt_01HQLIC003GHI",
  "type": "license.changed",
  "timestamp": "2024-01-20T14:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_myapp456",
  "data": {
    "assignment_id": "asgn_lic002",
    "sub": "usr_upgraded001",
    "email": "upgraded@example.com",
    "license_type_id": "lic_enterprise001",
    "license_type_name": "Enterprise Plan",
    "previous_license_type_id": "lic_pro001",
    "previous_license_type_name": "Pro Plan"
  }
}
```

---

## Tenant Events

Tenant events fire when organization-level changes occur in AuthVital.

### TypeScript Types

```typescript
interface TenantSettings {
  allow_signups: boolean;                    // Whether self-signup is enabled
  require_mfa: boolean;                      // Whether MFA is required for all users
  allowed_email_domains: string[];           // Restrict signups to specific domains
  session_lifetime_minutes: number;          // Session duration
  password_policy: 'standard' | 'strict';    // Password requirements
}

interface TenantData {
  tenant_id: string;                         // Unique tenant identifier
  name: string;                              // Display name
  slug: string;                              // URL-safe identifier
  plan: 'free' | 'starter' | 'pro' | 'enterprise'; // Subscription plan
  settings: TenantSettings;                  // Tenant configuration
}

interface TenantCreatedData extends TenantData {
  created_by_sub: string;                    // Subject ID of creator
  created_at: string;                        // ISO timestamp
}

interface TenantUpdatedData extends TenantData {
  changed_fields: string[];                  // Fields that changed
  previous_values: Record<string, unknown>;  // Previous field values
  updated_by_sub: string;                    // Subject ID of updater
}

interface TenantDeletedData {
  tenant_id: string;
  name: string;
  slug: string;
  deleted_by_sub: string;
  deleted_at: string;
}

interface TenantSuspendedData extends TenantData {
  suspended_by_sub: string;
  suspended_at: string;
  reason?: string;
}

// Event types
type TenantCreatedEvent = BaseEvent<'tenant.created', TenantCreatedData>;
type TenantUpdatedEvent = BaseEvent<'tenant.updated', TenantUpdatedData>;
type TenantDeletedEvent = BaseEvent<'tenant.deleted', TenantDeletedData>;
type TenantSuspendedEvent = BaseEvent<'tenant.suspended', TenantSuspendedData>;
```

### `tenant.created`

Fires when a new tenant (organization) is provisioned in AuthVital.

```json
{
  "id": "evt_01HQTNT001ABC",
  "type": "tenant.created",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "tenant_id": "tnt_newcorp789",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_newcorp789",
    "name": "NewCorp Industries",
    "slug": "newcorp",
    "plan": "pro",
    "created_by_sub": "usr_founder001",
    "created_at": "2024-01-15T10:00:00.000Z",
    "settings": {
      "allow_signups": true,
      "require_mfa": false,
      "allowed_email_domains": ["newcorp.com"],
      "session_lifetime_minutes": 480,
      "password_policy": "standard"
    }
  }
}
```

### `tenant.updated`

Fires when tenant settings or plan changes. Includes `changed_fields` and `previous_values` for audit trails.

```json
{
  "id": "evt_01HQTNT002DEF",
  "type": "tenant.updated",
  "timestamp": "2024-01-20T14:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_acme123",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "plan": "enterprise",
    "changed_fields": ["plan", "settings.require_mfa"],
    "previous_values": {
      "plan": "pro",
      "settings.require_mfa": false
    },
    "updated_by_sub": "usr_admin001",
    "settings": {
      "allow_signups": true,
      "require_mfa": true,
      "allowed_email_domains": ["acme.com", "acme.io"],
      "session_lifetime_minutes": 480,
      "password_policy": "strict"
    }
  }
}
```

### `tenant.deleted`

Fires when a tenant is permanently removed from AuthVital.

```json
{
  "id": "evt_01HQTNT003GHI",
  "type": "tenant.deleted",
  "timestamp": "2024-02-01T09:00:00.000Z",
  "tenant_id": "tnt_oldcorp456",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_oldcorp456",
    "name": "Old Corp Inc",
    "slug": "old-corp",
    "deleted_by_sub": "usr_superadmin001",
    "deleted_at": "2024-02-01T09:00:00.000Z"
  }
}
```

### `tenant.suspended`

Fires when a tenant is deactivated (soft disable). Users cannot authenticate but data is preserved.

```json
{
  "id": "evt_01HQTNT004JKL",
  "type": "tenant.suspended",
  "timestamp": "2024-01-25T16:00:00.000Z",
  "tenant_id": "tnt_suspended789",
  "application_id": null,
  "data": {
    "tenant_id": "tnt_suspended789",
    "name": "Suspended Company",
    "slug": "suspended-co",
    "plan": "starter",
    "suspended_by_sub": "usr_superadmin001",
    "suspended_at": "2024-01-25T16:00:00.000Z",
    "reason": "Payment failed after 3 retry attempts",
    "settings": {
      "allow_signups": false,
      "require_mfa": false,
      "allowed_email_domains": [],
      "session_lifetime_minutes": 480,
      "password_policy": "standard"
    }
  }
}
```

---

## Application Events

Application events fire when OAuth applications are created, modified, or removed from a tenant.

### TypeScript Types

```typescript
interface ApplicationConfig {
  redirect_uris: string[];                   // Allowed redirect URIs
  post_logout_redirect_uris: string[];       // Allowed post-logout URIs
  allowed_scopes: string[];                  // Permitted OAuth scopes
  grant_types: ('authorization_code' | 'refresh_token' | 'client_credentials')[];
  token_endpoint_auth_method: 'client_secret_basic' | 'client_secret_post' | 'none';
  access_token_ttl_seconds: number;          // Access token lifetime
  refresh_token_ttl_seconds: number;         // Refresh token lifetime
}

interface ApplicationData {
  application_id: string;                    // Unique application ID
  tenant_id: string;                         // Parent tenant ID
  name: string;                              // Display name
  description?: string;                      // Optional description
  client_id: string;                         // OAuth client ID
  application_type: 'web' | 'spa' | 'native' | 'machine';
  config: ApplicationConfig;
  is_active: boolean;
}

interface ApplicationCreatedData extends ApplicationData {
  created_by_sub: string;
  created_at: string;
}

interface ApplicationUpdatedData extends ApplicationData {
  changed_fields: string[];
  previous_values: Record<string, unknown>;
  updated_by_sub: string;
}

interface ApplicationDeletedData {
  application_id: string;
  tenant_id: string;
  name: string;
  client_id: string;
  deleted_by_sub: string;
  deleted_at: string;
}

// Event types
type ApplicationCreatedEvent = BaseEvent<'application.created', ApplicationCreatedData>;
type ApplicationUpdatedEvent = BaseEvent<'application.updated', ApplicationUpdatedData>;
type ApplicationDeletedEvent = BaseEvent<'application.deleted', ApplicationDeletedData>;
```

### `application.created`

Fires when a new OAuth application is registered to a tenant.

```json
{
  "id": "evt_01HQAPC001ABC",
  "type": "application.created",
  "timestamp": "2024-01-15T11:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_dashboard456",
  "data": {
    "application_id": "app_dashboard456",
    "tenant_id": "tnt_acme123",
    "name": "Acme Dashboard",
    "description": "Main customer dashboard",
    "client_id": "acme_dashboard_prod",
    "application_type": "spa",
    "is_active": true,
    "created_by_sub": "usr_admin001",
    "created_at": "2024-01-15T11:00:00.000Z",
    "config": {
      "redirect_uris": [
        "https://dashboard.acme.com/callback",
        "http://localhost:3000/callback"
      ],
      "post_logout_redirect_uris": [
        "https://dashboard.acme.com"
      ],
      "allowed_scopes": ["openid", "profile", "email"],
      "grant_types": ["authorization_code", "refresh_token"],
      "token_endpoint_auth_method": "none",
      "access_token_ttl_seconds": 3600,
      "refresh_token_ttl_seconds": 604800
    }
  }
}
```

### `application.updated`

Fires when application configuration changes (redirect URIs, scopes, etc.).

```json
{
  "id": "evt_01HQAPC002DEF",
  "type": "application.updated",
  "timestamp": "2024-01-18T15:30:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_dashboard456",
  "data": {
    "application_id": "app_dashboard456",
    "tenant_id": "tnt_acme123",
    "name": "Acme Dashboard",
    "description": "Main customer dashboard",
    "client_id": "acme_dashboard_prod",
    "application_type": "spa",
    "is_active": true,
    "changed_fields": ["config.redirect_uris", "config.allowed_scopes"],
    "previous_values": {
      "config.redirect_uris": [
        "https://dashboard.acme.com/callback",
        "http://localhost:3000/callback"
      ],
      "config.allowed_scopes": ["openid", "profile", "email"]
    },
    "updated_by_sub": "usr_admin001",
    "config": {
      "redirect_uris": [
        "https://dashboard.acme.com/callback",
        "https://staging.dashboard.acme.com/callback",
        "http://localhost:3000/callback"
      ],
      "post_logout_redirect_uris": [
        "https://dashboard.acme.com"
      ],
      "allowed_scopes": ["openid", "profile", "email", "offline_access"],
      "grant_types": ["authorization_code", "refresh_token"],
      "token_endpoint_auth_method": "none",
      "access_token_ttl_seconds": 3600,
      "refresh_token_ttl_seconds": 604800
    }
  }
}
```

### `application.deleted`

Fires when an application is removed from a tenant.

```json
{
  "id": "evt_01HQAPC003GHI",
  "type": "application.deleted",
  "timestamp": "2024-02-01T10:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": "app_legacy789",
  "data": {
    "application_id": "app_legacy789",
    "tenant_id": "tnt_acme123",
    "name": "Legacy App",
    "client_id": "acme_legacy_deprecated",
    "deleted_by_sub": "usr_admin001",
    "deleted_at": "2024-02-01T10:00:00.000Z"
  }
}
```

---

## SSO Provider Events

SSO events fire when Single Sign-On providers are configured, modified, or removed from a tenant.

### TypeScript Types

```typescript
interface SsoProviderConfig {
  client_id: string;                        // OAuth client ID for the provider
  issuer?: string;                          // OIDC issuer URL (for OIDC/SAML)
  authorization_endpoint?: string;          // OAuth authorization URL
  token_endpoint?: string;                  // OAuth token URL
  userinfo_endpoint?: string;               // OIDC userinfo URL
  domains: string[];                        // Email domains that trigger this SSO
  attribute_mapping: Record<string, string>; // Map provider claims to AuthVital claims
}

interface SsoProviderData {
  provider_id: string;                      // Unique provider ID
  tenant_id: string;                        // Parent tenant ID
  provider_type: 'google' | 'microsoft' | 'okta' | 'saml' | 'oidc';
  display_name: string;                     // Display name for login UI
  is_enabled: boolean;                      // Whether SSO is active
  config: SsoProviderConfig;
}

interface SsoProviderAddedData extends SsoProviderData {
  created_by_sub: string;
  created_at: string;
}

interface SsoProviderUpdatedData extends SsoProviderData {
  changed_fields: string[];
  previous_values: Record<string, unknown>;
  updated_by_sub: string;
}

interface SsoProviderRemovedData {
  provider_id: string;
  tenant_id: string;
  provider_type: string;
  display_name: string;
  removed_by_sub: string;
  removed_at: string;
}

// Event types
type SsoProviderAddedEvent = BaseEvent<'sso.provider_added', SsoProviderAddedData>;
type SsoProviderUpdatedEvent = BaseEvent<'sso.provider_updated', SsoProviderUpdatedData>;
type SsoProviderRemovedEvent = BaseEvent<'sso.provider_removed', SsoProviderRemovedData>;
```

### `sso.provider_added`

Fires when an SSO provider is configured for a tenant.

```json
{
  "id": "evt_01HQSSO001ABC",
  "type": "sso.provider_added",
  "timestamp": "2024-01-16T09:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "provider_id": "sso_google001",
    "tenant_id": "tnt_acme123",
    "provider_type": "google",
    "display_name": "Sign in with Google",
    "is_enabled": true,
    "created_by_sub": "usr_admin001",
    "created_at": "2024-01-16T09:00:00.000Z",
    "config": {
      "client_id": "123456789.apps.googleusercontent.com",
      "domains": ["acme.com"],
      "attribute_mapping": {
        "email": "email",
        "given_name": "given_name",
        "family_name": "family_name",
        "picture": "picture"
      }
    }
  }
}
```

### `sso.provider_updated`

Fires when SSO provider settings change.

```json
{
  "id": "evt_01HQSSO002DEF",
  "type": "sso.provider_updated",
  "timestamp": "2024-01-20T11:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "provider_id": "sso_google001",
    "tenant_id": "tnt_acme123",
    "provider_type": "google",
    "display_name": "Sign in with Google Workspace",
    "is_enabled": true,
    "changed_fields": ["display_name", "config.domains"],
    "previous_values": {
      "display_name": "Sign in with Google",
      "config.domains": ["acme.com"]
    },
    "updated_by_sub": "usr_admin001",
    "config": {
      "client_id": "123456789.apps.googleusercontent.com",
      "domains": ["acme.com", "acme.io"],
      "attribute_mapping": {
        "email": "email",
        "given_name": "given_name",
        "family_name": "family_name",
        "picture": "picture"
      }
    }
  }
}
```

### `sso.provider_removed`

Fires when an SSO provider is disconnected from a tenant.

```json
{
  "id": "evt_01HQSSO003GHI",
  "type": "sso.provider_removed",
  "timestamp": "2024-02-01T14:00:00.000Z",
  "tenant_id": "tnt_acme123",
  "application_id": null,
  "data": {
    "provider_id": "sso_okta001",
    "tenant_id": "tnt_acme123",
    "provider_type": "okta",
    "display_name": "Okta SSO",
    "removed_by_sub": "usr_admin001",
    "removed_at": "2024-02-01T14:00:00.000Z"
  }
}
```

---

## Related Documentation

- [Webhooks Guide](./webhooks.md) - Overview and quick start
- [Event Handler Reference](./webhooks-handler.md) - AuthVitalEventHandler class
- [Framework Integration](./webhooks-frameworks.md) - Express, Next.js, NestJS examples
- [Organization Sync](./organization-sync/index.md) - Sync tenant, app, and SSO config locally
