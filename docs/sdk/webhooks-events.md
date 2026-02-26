# Webhook Event Types & Payloads

> Complete reference for all AuthVader webhook event types with TypeScript types and JSON payload examples.

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

## Related Documentation

- [Webhooks Guide](./webhooks.md) - Overview and quick start
- [Event Handler Reference](./webhooks-handler.md) - AuthVaderEventHandler class
- [Framework Integration](./webhooks-frameworks.md) - Express, Next.js, NestJS examples
