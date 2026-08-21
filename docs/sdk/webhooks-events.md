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

## App access vs. license events — which do I listen to?

AuthVital models **access** ("can this user use the app?") and **licensing** ("does this user occupy a paid seat, and at what tier?") as two independent axes. They map to two different event families:

- **`app_access.*`** — the universal access signal. Fires for **every** app regardless of licensing mode (`FREE`, `PER_SEAT`, `TENANT_WIDE`). Subscribe to these if you provision / de-provision users in your app.
- **`license.*`** — a billing/seat overlay that only applies to **`PER_SEAT`** apps. Fires when a seat is consumed (`license.assigned`), released (`license.revoked`), or re-tiered (`license.changed`). Subscribe to these additionally if you reconcile seats, billing, or feature tiers.

They overlap only for the `PER_SEAT` grant/revoke case (a seat grant *is* an access grant), so `app_access.granted` may carry `license_type_id` / `license_type_name` for context. Elsewhere they diverge:

| Scenario | `app_access.*` | `license.*` |
| --- | :---: | :---: |
| Grant on a `FREE` app | ✅ | — (no seat) |
| Grant on a `TENANT_WIDE` app | ✅ | — (license is tenant-level) |
| Grant a seat on a `PER_SEAT` app | ✅ `granted` | ✅ `assigned` |
| Upgrade tier (basic → pro) | — | ✅ `changed` |
| Change an app role (editor → admin) | ✅ `role_changed` | — |

**Rule of thumb:** if you only sync user access, subscribe to `app_access.*`. If you also track seats/billing/tiers, add `license.*`.

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

Tenant events fire on tenant lifecycle changes. These are **system-level**
events (`event_source: system_webhook`) — delivered to system webhooks with
the `{event, timestamp, data}` wrapper shown below, and to Pub/Sub with the
standard envelope (`data` carries the same payload).

### TypeScript Types

The canonical contracts ship in `@authvital/shared` (re-exported from
`@authvital/server/pubsub`) and are compile-time enforced at every emit
site in the platform:

```typescript
import type {
  TenantCreatedEventData,
  TenantUpdatedEventData,
  TenantDeletedEventData,
  TenantSuspendedEventData,
} from '@authvital/shared';

// Shared by all tenant lifecycle events
type TenantEventBase = {
  tenant_id: string;                     // Unique tenant identifier
  name: string;                          // Display name
  slug: string;                          // URL-safe identifier
};

type TenantCreatedEventData = TenantEventBase & {
  created_at: string;                    // ISO timestamp (Tenant.createdAt)
  settings: Record<string, unknown>;     // Freeform tenant settings JSON
  created_by_sub?: string;               // Absent on super-admin creation
  owner_email?: string;                  // Owner email when known
};

type TenantUpdatedEventData = TenantEventBase & {
  changed_fields: string[];              // Which fields changed
  settings: Record<string, unknown>;     // Current settings snapshot
  previous_values?: Record<string, unknown>;
  updated_by_sub?: string;
};

type TenantDeletedEventData = TenantEventBase & {
  deleted_at: string;
  deleted_by_sub?: string;
};

// Reserved contract — the core does NOT currently emit tenant.suspended.
type TenantSuspendedEventData = TenantEventBase & {
  suspended_at: string;
  suspended_by_sub?: string;
  reason?: string;
};
```

!!! warning "Breaking change: canonical payloads"
    Earlier docs showed a `plan` field and a structured `settings` object
    (`allow_signups`, `require_mfa`, ...) — neither exists in the platform
    model and they were never sent. `settings` is the tenant's freeform
    settings JSON. Field names are now canonical (`name`/`slug`, previously
    emitted as `tenant_name`/`tenant_slug`). See the
    [upgrade guide](../getting-started/upgrading-to-broker.md) for the full
    migration table.

### `tenant.created`

Fires when a new tenant (organization) is provisioned in AuthVital.

```json
{
  "event": "tenant.created",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "data": {
    "tenant_id": "tnt_newcorp789",
    "name": "NewCorp Industries",
    "slug": "newcorp",
    "created_at": "2024-01-15T10:00:00.000Z",
    "settings": { "theme": "dark" },
    "created_by_sub": "usr_founder001",
    "owner_email": "founder@newcorp.com"
  }
}
```

### `tenant.updated`

Fires when tenant fields change (including membership changes, reported as
`changed_fields: ["members"]`).

```json
{
  "event": "tenant.updated",
  "timestamp": "2024-01-20T14:30:00.000Z",
  "data": {
    "tenant_id": "tnt_acme123",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "changed_fields": ["name", "settings"],
    "settings": { "theme": "light" },
    "updated_by_sub": "usr_admin001"
  }
}
```

### `tenant.deleted`

Fires when a tenant is permanently removed from AuthVital (dispatched
BEFORE the row is deleted).

```json
{
  "event": "tenant.deleted",
  "timestamp": "2024-02-01T09:00:00.000Z",
  "data": {
    "tenant_id": "tnt_oldcorp456",
    "name": "Old Corp Inc",
    "slug": "old-corp",
    "deleted_at": "2024-02-01T09:00:00.000Z"
  }
}
```

### `tenant.suspended`

!!! note "Reserved — not currently emitted"
    The contract is defined for forward compatibility, but no code path in
    the core dispatches `tenant.suspended` today. Do not build workflows
    that depend on receiving it.

```json
{
  "event": "tenant.suspended",
  "timestamp": "2024-01-25T16:00:00.000Z",
  "data": {
    "tenant_id": "tnt_suspended789",
    "name": "Suspended Company",
    "slug": "suspended-co",
    "suspended_at": "2024-01-25T16:00:00.000Z",
    "suspended_by_sub": "usr_superadmin001",
    "reason": "Payment failed after 3 retry attempts"
  }
}
```

---

## Tenant App Access Events

Fire when a tenant/user is granted or revoked access to an application.
System-level events (`event_source: system_webhook`).

### TypeScript Types

```typescript
import type {
  TenantAppGrantedEventData,
  TenantAppRevokedEventData,
} from '@authvital/shared';

type TenantAppEventBase = {
  tenant_id: string;
  application_id: string;
  tenant_slug?: string;                  // Resolved at emit time
  user_email?: string;
  application_name?: string;
  application_slug?: string;
};

// tenant.app.granted covers TWO grant modes:
//  - USER-LEVEL access grant: user_id + access_type present
//  - TENANT-LEVEL subscription grant (license pool): subscription_id +
//    license_type_* + quantity_purchased present, no user_id
type TenantAppGrantedEventData = TenantAppEventBase & {
  user_id?: string;
  access_type?: 'GRANTED' | 'INVITED' | 'AUTO_FREE' | 'AUTO_TENANT' | 'AUTO_OWNER';
  granted_by_id?: string;
  license_assignment_id?: string;
  role_id?: string;
  role_name?: string;
  role_slug?: string;
  subscription_id?: string;              // Tenant-level grants only
  license_type_id?: string;
  license_type_name?: string;
  quantity_purchased?: number;
  status?: string;                       // Subscription status (e.g. 'ACTIVE')
};

type TenantAppRevokedEventData = TenantAppEventBase & {
  user_id: string;                       // Revocation is always user-level
  revoked_by_id?: string;
};
```

### `tenant.app.granted`

User-level grant example:

```json
{
  "event": "tenant.app.granted",
  "timestamp": "2024-01-16T15:00:00.000Z",
  "data": {
    "tenant_id": "tnt_acme123",
    "tenant_slug": "acme-corp",
    "user_id": "usr_jane001",
    "user_email": "jane@acme.com",
    "application_id": "app_dashboard456",
    "application_name": "Acme Dashboard",
    "application_slug": "acme-dashboard",
    "access_type": "GRANTED",
    "granted_by_id": "usr_admin001",
    "license_assignment_id": "la_001"
  }
}
```

Tenant-level subscription grant example (no `user_id`):

```json
{
  "event": "tenant.app.granted",
  "timestamp": "2024-01-16T15:00:00.000Z",
  "data": {
    "tenant_id": "tnt_acme123",
    "application_id": "app_dashboard456",
    "application_name": "Acme Dashboard",
    "subscription_id": "sub_001",
    "license_type_id": "lt_pro",
    "license_type_name": "Pro",
    "quantity_purchased": 10,
    "status": "ACTIVE"
  }
}
```

### `tenant.app.revoked`

```json
{
  "event": "tenant.app.revoked",
  "timestamp": "2024-01-20T16:00:00.000Z",
  "data": {
    "tenant_id": "tnt_acme123",
    "tenant_slug": "acme-corp",
    "user_id": "usr_jane001",
    "user_email": "jane@acme.com",
    "application_id": "app_legacy789",
    "application_name": "Legacy App",
    "application_slug": "legacy-app",
    "revoked_by_id": "usr_admin001"
  }
}
```

---

## Application Events

Application events fire when OAuth applications are created, modified, or
removed. Applications are **instance-scoped** in AuthVital (not owned by a
tenant), so `tenant_id` is always `null` on these payloads.

### TypeScript Types

```typescript
import type {
  ApplicationCreatedEventData,
  ApplicationUpdatedEventData,
  ApplicationDeletedEventData,
  ApplicationClientConfig,
  ApplicationLicensingInfo,
} from '@authvital/shared';

type ApplicationClientConfig = {
  redirect_uris: string[];
  post_logout_redirect_uris: string[];
  initiate_login_uri: string | null;
  access_token_ttl_seconds: number | null;
  refresh_token_ttl_seconds: number | null;
};

type ApplicationLicensingInfo = {
  mode: string;                          // 'FREE' | 'PER_SEAT' | 'TENANT_WIDE'
  allow_mixed: boolean;
  default_seat_count: number | null;
  auto_provision_on_signup: boolean;
  auto_grant_to_owner: boolean;
};

type ApplicationEventBase = {
  application_id: string;
  tenant_id: null;                       // Always null — instance-scoped
  name: string;
  slug: string;
  client_id: string | null;              // First client; null if none yet
  application_type: string;              // Access mode, e.g. 'AUTOMATIC'
  is_active: boolean;
  description?: string | null;
};

type ApplicationCreatedEventData = ApplicationEventBase & {
  created_at: string;
  config: ApplicationClientConfig;       // First client's OAuth config
  licensing: ApplicationLicensingInfo;
};

type ApplicationUpdatedEventData = ApplicationEventBase & {
  changed_fields: string[];
  previous_values: Record<string, unknown>;
  licensing: ApplicationLicensingInfo;
  // No config block — config changes surface via changed_fields/previous_values
};

type ApplicationDeletedEventData = {
  application_id: string;
  tenant_id: null;
  name: string;
  slug: string;
  client_id: string | null;
  deleted_at: string;
};
```

### `application.created`

Fires when a new OAuth application is registered.

```json
{
  "event": "application.created",
  "timestamp": "2024-01-15T11:00:00.000Z",
  "data": {
    "application_id": "app_dashboard456",
    "tenant_id": null,
    "name": "Acme Dashboard",
    "description": "Main customer dashboard",
    "slug": "acme-dashboard",
    "client_id": "acme_dashboard_prod",
    "application_type": "AUTOMATIC",
    "is_active": true,
    "created_at": "2024-01-15T11:00:00.000Z",
    "config": {
      "redirect_uris": [
        "https://dashboard.acme.com/callback",
        "http://localhost:3000/callback"
      ],
      "post_logout_redirect_uris": ["https://dashboard.acme.com"],
      "initiate_login_uri": null,
      "access_token_ttl_seconds": 3600,
      "refresh_token_ttl_seconds": 604800
    },
    "licensing": {
      "mode": "FREE",
      "allow_mixed": false,
      "default_seat_count": 5,
      "auto_provision_on_signup": true,
      "auto_grant_to_owner": true
    }
  }
}
```

### `application.updated`

Fires when application configuration changes, including enable/disable
toggles (`changed_fields: ["is_active"]`).

```json
{
  "event": "application.updated",
  "timestamp": "2024-01-18T15:30:00.000Z",
  "data": {
    "application_id": "app_dashboard456",
    "tenant_id": null,
    "name": "Acme Dashboard",
    "description": "Main customer dashboard",
    "slug": "acme-dashboard",
    "client_id": "acme_dashboard_prod",
    "application_type": "AUTOMATIC",
    "is_active": true,
    "changed_fields": ["name"],
    "previous_values": { "name": "Old Dashboard" },
    "licensing": {
      "mode": "FREE",
      "allow_mixed": false,
      "default_seat_count": 5,
      "auto_provision_on_signup": true,
      "auto_grant_to_owner": true
    }
  }
}
```

### `application.deleted`

Fires when an application is removed (with all associated data).

```json
{
  "event": "application.deleted",
  "timestamp": "2024-02-01T10:00:00.000Z",
  "data": {
    "application_id": "app_legacy789",
    "tenant_id": null,
    "name": "Legacy App",
    "slug": "legacy-app",
    "client_id": "acme_legacy_deprecated",
    "deleted_at": "2024-02-01T10:00:00.000Z"
  }
}
```

---

## SSO Provider Events

SSO events fire when Single Sign-On providers are configured, modified, or
removed. Providers are **instance-scoped** (`tenant_id` always `null`), and
`provider_id` is the provider enum key (e.g. `GOOGLE`) — not a row id.

### TypeScript Types

```typescript
import type {
  SsoProviderAddedEventData,
  SsoProviderUpdatedEventData,
  SsoProviderRemovedEventData,
} from '@authvital/shared';

type SsoProviderEventBase = {
  provider_id: string;                   // Provider enum key, e.g. 'GOOGLE'
  tenant_id: null;                       // Always null — instance-scoped
  provider_type: string;                 // Same enum key as provider_id today
};

type SsoProviderAddedEventData = SsoProviderEventBase & {
  display_name: string;
  is_enabled: boolean;
};

type SsoProviderUpdatedEventData = SsoProviderEventBase & {
  changed_fields: string[];
};

type SsoProviderRemovedEventData = SsoProviderEventBase & {
  removed_at: string;
};
```

### `sso.provider_added`

Fires when an SSO provider is configured (upserts are reported as adds).

```json
{
  "event": "sso.provider_added",
  "timestamp": "2024-01-16T09:00:00.000Z",
  "data": {
    "provider_id": "GOOGLE",
    "tenant_id": null,
    "provider_type": "GOOGLE",
    "display_name": "GOOGLE",
    "is_enabled": true
  }
}
```

### `sso.provider_updated`

Fires when SSO provider settings change.

```json
{
  "event": "sso.provider_updated",
  "timestamp": "2024-01-20T11:00:00.000Z",
  "data": {
    "provider_id": "GOOGLE",
    "tenant_id": null,
    "provider_type": "GOOGLE",
    "changed_fields": ["enabled", "allowedDomains"]
  }
}
```

### `sso.provider_removed`

Fires when an SSO provider is deleted.

```json
{
  "event": "sso.provider_removed",
  "timestamp": "2024-02-01T14:00:00.000Z",
  "data": {
    "provider_id": "OKTA",
    "tenant_id": null,
    "provider_type": "OKTA",
    "removed_at": "2024-02-01T14:00:00.000Z"
  }
}
```

---

## Related Documentation

- [Webhooks Guide](./webhooks.md) - Overview and quick start
- [Event Handler Reference](./webhooks-handler.md) - event handler pattern (your own class)
- [Framework Integration](./webhooks-frameworks.md) - Express, Next.js, NestJS examples
- [Organization Sync](./organization-sync/index.md) - Sync tenant, app, and SSO config locally
