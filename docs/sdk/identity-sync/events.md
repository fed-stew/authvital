# Identity Sync Events

> Detailed information about what each event does and how it's handled.

## Subject Events

Subject events fire when identity lifecycle changes occur at the IDP level.

### subject.created

Fires when a new user registers or is created in AuthVital.

```typescript
// Incoming event payload
{
  event: 'subject.created',
  data: {
    sub: 'user-abc-123',
    email: 'jane@example.com',
    email_verified: true,
    preferred_username: 'janesmith',
    name: 'Jane Smith',
    given_name: 'Jane',
    family_name: 'Smith',
    middle_name: null,
    nickname: 'Janey',
    picture: 'https://example.com/avatar.jpg',
    website: 'https://janesmith.com',
    gender: 'female',
    birthdate: '1990-05-15',
    zoneinfo: 'America/New_York',
    locale: 'en-US',
    phone_number: '+1-555-123-4567',
    phone_number_verified: false,
    tenant_id: 'tenant-xyz',
    app_role: 'member',
    groups: ['engineering', 'frontend'],
  }
}

// Handler creates identity
await prisma.identity.create({
  data: {
    id: 'user-abc-123',
    email: 'jane@example.com',
    emailVerified: true,
    username: 'janesmith',
    displayName: 'Jane Smith',
    givenName: 'Jane',
    familyName: 'Smith',
    // ... all other OIDC fields
    tenantId: 'tenant-xyz',
    appRole: 'member',
    groups: ['engineering', 'frontend'],
    isActive: true,
    hasAppAccess: true,
  },
});
```

---

### subject.updated

Fires when user profile data changes. **Only updates changed fields!**

```typescript
// Incoming event payload
{
  event: 'subject.updated',
  data: {
    sub: 'user-abc-123',
    email: 'jane.smith@newcompany.com',  // Changed
    given_name: 'Jane',
    family_name: 'Smith-Johnson',         // Changed
    changed_fields: ['email', 'family_name'],  // Tells us what changed
    // ... other fields
  }
}

// Handler updates ONLY changed fields
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    email: 'jane.smith@newcompany.com',
    familyName: 'Smith-Johnson',
    syncedAt: new Date(),
  },
});
```

---

### subject.deleted

Fires when a user is permanently deleted from AuthVital.

```typescript
// Handler deletes identity (cascades to sessions due to onDelete: Cascade)
await prisma.identity.delete({
  where: { id: 'user-abc-123' },
});
```

---

### subject.deactivated

Fires when a user's account is deactivated at the IDP level (cannot log into ANY app).

```typescript
// Handler sets isActive = false
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    isActive: false,
    syncedAt: new Date(),
  },
});
```

---

## Member Events

Member events fire when a user's relationship with a tenant changes.

### member.joined

Fires when a user joins a tenant/organization.

```typescript
// Incoming event payload
{
  event: 'member.joined',
  data: {
    sub: 'user-abc-123',
    tenant_id: 'tenant-xyz',
    role: 'editor',
    groups: ['design-team', 'all-hands'],
  }
}

// Handler updates tenant context
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    tenantId: 'tenant-xyz',
    appRole: 'editor',
    groups: ['design-team', 'all-hands'],
    syncedAt: new Date(),
  },
});
```

---

### member.left

Fires when a user leaves a tenant/organization.

```typescript
// Handler clears tenant context
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    tenantId: null,
    appRole: null,
    groups: [],
    syncedAt: new Date(),
  },
});
```

---

### member.role_changed

Fires when a user's role within a tenant changes.

```typescript
// Handler updates role and groups
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    appRole: 'admin',  // Promoted!
    groups: ['design-team', 'all-hands', 'leadership'],  // New groups
    syncedAt: new Date(),
  },
});
```

---

## App Access Events

App access events fire when a user's access to YOUR SPECIFIC APPLICATION changes.

### app_access.granted

Fires when a user is granted access to THIS specific application.

```typescript
// Handler enables app access
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    hasAppAccess: true,
    appRole: 'viewer',  // Initial role for this app
    syncedAt: new Date(),
  },
});
```

---

### app_access.revoked

Fires when a user's access to THIS specific application is revoked.

```typescript
// Handler disables app access
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    hasAppAccess: false,
    appRole: null,  // Clear app role
    syncedAt: new Date(),
  },
});
```

---

### app_access.role_changed

Fires when a user's role within THIS application changes.

```typescript
// Handler updates app role
await prisma.identity.update({
  where: { id: 'user-abc-123' },
  data: {
    appRole: 'editor',  // Changed from 'viewer'
    syncedAt: new Date(),
  },
});
```

---

## Event Summary

| Event | Affects | Key Fields |
|-------|---------|------------|
| `subject.created` | New identity | All OIDC fields |
| `subject.updated` | Existing identity | Only `changed_fields` |
| `subject.deleted` | Identity record | Deletes record |
| `subject.deactivated` | Identity status | `isActive = false` |
| `member.joined` | Tenant membership | `tenantId`, `appRole`, `groups` |
| `member.left` | Tenant membership | Clears tenant fields |
| `member.role_changed` | Tenant role | `appRole`, `groups` |
| `app_access.granted` | App access | `hasAppAccess = true`, `appRole` |
| `app_access.revoked` | App access | `hasAppAccess = false` |
| `app_access.role_changed` | App role | `appRole` |

---

## Related Documentation

- [Identity Sync Overview](./index.md)
- [Sync Handler](./sync-handler.md)
- [Custom Event Handlers](./advanced.md)
- [Webhook Event Types](../webhooks-events.md)
