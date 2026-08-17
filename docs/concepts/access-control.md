# Access Control (RBAC)

> Role-based access control with fine-grained permissions.

!!! warning "Code samples: the `authvital.permissions.*` / `authvital.roles.*` API is not real"
    The RBAC model described here is accurate, but the SDK snippets use a fluent
    API that **does not exist**. Real equivalents:

    - `authvital.permissions.check` -> `client.integration.checkPermission({ userId, tenantId, permission })` (or read the `tenant_permissions` claim via `verifyToken`)
    - `authvital.permissions.checkMany` -> `client.integration.checkPermissions({ userId, tenantId, permissions })` (returns `{ results, allAllowed }` -- **ALL-of**, there is no `anyAllowed`)
    - `authvital.memberships.setMemberRole` -> `client.integration.setMemberRole({ membershipId, roleId, applicationId })` (sets an **application** role; `roleId` = an app Role id)
    - `authvital.invitations.send` -> `client.integration.sendInvitation({ tenantId, email, roleId, clientId? })` (`roleId` is a **required** TenantRole id)
    - **Role create/update (`authvital.roles.*`) is NOT in the SDK** -- roles are managed via the admin console / REST.

    `client` = `createServerClient({ authVitalHost, clientId, clientSecret })`.
    See [Permissions namespace](../sdk/server-sdk/namespaces/permissions.md).

## Overview

AuthVital implements a flexible **Role-Based Access Control (RBAC)** system with:

- **Tenant Roles**: Built-in roles for tenant management (Owner, Admin, Member)
- **Application Roles**: Custom roles per application with permissions
- **Permissions**: Fine-grained access control strings
- **App Access**: Control which users can access which applications

## Role Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AuthVital RBAC System                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TENANT LEVEL                          APPLICATION LEVEL                     │
│  ─────────────                         ─────────────────                     │
│                                                                              │
│  ┌──────────┐                          ┌──────────────┐                     │
│  │  Owner   │ ─ Full tenant control    │  App Admin   │ ─ Full app access   │
│  └────┬─────┘                          └──────┬───────┘                     │
│       │                                       │                              │
│  ┌────▼─────┐                          ┌──────▼───────┐                     │
│  │  Admin   │ ─ Manage members/roles   │  Manager     │ ─ Create/edit       │
│  └────┬─────┘                          └──────┬───────┘                     │
│       │                                       │                              │
│  ┌────▼─────┐                          ┌──────▼───────┐                     │
│  │  Member  │ ─ Basic access           │  Viewer      │ ─ Read-only         │
│  └──────────┘                          └──────────────┘                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tenant Roles

Built-in roles that control tenant-level permissions:

| Role | Permissions |
|------|-------------|
| **Owner** | Full access, delete tenant, manage billing, transfer ownership |
| **Admin** | Manage members, roles, SSO, settings (except delete/billing) |
| **Member** | Basic access to tenant resources |

### Default Tenant Roles

These are created automatically for each tenant:

```typescript
const DEFAULT_TENANT_ROLES = [
  {
    slug: 'owner',
    name: 'Owner',
    description: 'Full access to tenant',
    isDefault: false,
    permissions: ['tenant:*'],
  },
  {
    slug: 'admin',
    name: 'Admin',
    description: 'Manage members and settings',
    isDefault: false,
    permissions: [
      'tenant:read',
      'tenant:members:*',
      'tenant:settings:*',
      'tenant:sso:*',
    ],
  },
  {
    slug: 'member',
    name: 'Member',
    description: 'Basic tenant access',
    isDefault: true, // Assigned to new members
    permissions: ['tenant:read'],
  },
];
```

## Application Roles

Custom roles defined per application:

```typescript
// Example: Project Management App roles
const appRoles = [
  {
    slug: 'admin',
    name: 'Administrator',
    description: 'Full application access',
    permissions: [
      'projects:*',
      'users:*',
      'settings:*',
      'billing:*',
    ],
  },
  {
    slug: 'manager',
    name: 'Project Manager',
    description: 'Create and manage projects',
    permissions: [
      'projects:create',
      'projects:read',
      'projects:update',
      'projects:delete',
      'projects:members:*',
      'users:read',
    ],
  },
  {
    slug: 'member',
    name: 'Team Member',
    description: 'Work on assigned projects',
    permissions: [
      'projects:read',
      'projects:tasks:*',
      'users:read',
    ],
  },
  {
    slug: 'viewer',
    name: 'Viewer',
    description: 'Read-only access',
    permissions: [
      'projects:read',
      'users:read',
    ],
  },
];
```

## Permissions

### Format

Permissions use a `resource:action` format:

```
resource:action
resource:sub-resource:action
resource:*              (all actions)
*                       (superadmin - all permissions)
```

### Examples

```typescript
// Common permission patterns
const permissions = [
  // Basic CRUD
  'users:read',
  'users:create',
  'users:update',
  'users:delete',
  
  // Nested resources
  'projects:tasks:create',
  'projects:tasks:delete',
  'projects:members:invite',
  'projects:members:remove',
  
  // Wildcards
  'projects:*',          // All project actions
  'billing:*',           // All billing actions
  'settings:*',          // All settings actions
  
  // Admin-level
  '*',                   // Superadmin - all permissions
];
```

### Permission Inheritance

Wildcards include all sub-permissions:

```
projects:* includes:
  - projects:read
  - projects:create
  - projects:update
  - projects:delete
  - projects:tasks:*
  - projects:members:*
```

## Data Model

```mermaid
erDiagram
    Application ||--o{ Role : "defines"
    Role ||--o{ RolePermission : "grants"
    Permission ||--o{ RolePermission : "granted by"
    Membership ||--o{ MembershipRole : "has"
    Role ||--o{ MembershipRole : "assigned via"
    AppAccess ||--o{ AppAccessRole : "has"
    Role ||--o{ AppAccessRole : "assigned via"
    
    Role {
        string id PK
        string name
        string slug
        string applicationId FK
        string description
        boolean isDefault
    }
    
    Permission {
        string id PK
        string key
        string name
        string description
    }
    
    MembershipRole {
        string membershipId FK
        string roleId FK
    }
    
    AppAccess {
        string id PK
        string userId FK
        string tenantId FK
        string applicationId FK
    }
```

## App Access

Control which users can access which applications:

### Access Modes

| Mode | Description |
|------|-------------|
| `AUTOMATIC` | All tenant members automatically get access |
| `MANUAL_AUTO_GRANT` | Manual control, but new members get access by default |
| `MANUAL_NO_DEFAULT` | Manual control, new members must be explicitly granted |
| `DISABLED` | No new access grants (existing access preserved) |

### Managing Access

App access is managed through the **AuthVital Admin Dashboard** or via the **Invitations API**:

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({ authVitalHost, clientId, clientSecret });

// Grant access via invitation (M2M integration client)
const { sub, expiresAt } = await client.integration.sendInvitation({
  tenantId: 'tenant-id',
  email: 'user@example.com',
  givenName: 'John',
  familyName: 'Doe',
  roleId: 'role-admin',  // Optional: assign app role
});

// List members with their app access (for this application's clientId)
const { memberships } = await client.integration.listUserMemberships({
  status: 'ACTIVE',
});
```

!!! note "Admin Dashboard for Direct Access Management"
    For directly granting, revoking, or updating app access without invitations,
    use the AuthVital Admin Dashboard under **Tenants → [Tenant] → Applications**.

## SDK Usage

### Check Permission

```typescript
// Server-side (M2M integration client). userId + tenantId come from the
// verified access-token claims (sub / tenant_id).
const { allowed } = await client.integration.checkPermission({
  userId,
  tenantId,
  permission: 'projects:delete',
});

if (!allowed) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

### Check Multiple Permissions

```typescript
// Check multiple permissions at once. Returns { results, allAllowed }
// (ALL-of semantics — there is no anyAllowed).
const { results, allAllowed } = await client.integration.checkPermissions({
  userId,
  tenantId,
  permissions: ['projects:read', 'projects:update'],
});
// results: { 'projects:read': true, 'projects:update': false }

// ALL permissions (must have all) — use the returned flag
const hasAll = allAllowed;

// ANY permission (must have at least one) — derive from results
const hasAny = Object.values(results).some(v => v);
```

### Check Role

```typescript
// From JWT claims
const hasRole = user.app_roles.includes('admin');

// Check any of multiple roles
const isAdminOrManager = ['admin', 'manager'].some(
  role => user.app_roles.includes(role)
);
```

## Middleware Examples

### Express Permission Middleware

The Server SDK ships a real `requirePermission` guard that checks ALL listed
permissions via the M2M integration endpoint (it reads the user + tenant from
the session token for you):

```typescript
import { requireAuth, requirePermission } from '@authvital/server/middleware/express';

app.delete('/api/projects/:id',
  requireAuth(),
  requirePermission('projects:delete'),
  deleteProjectHandler
);
```

### NestJS Permission Guard

```typescript
// decorator
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata('permissions', permissions);

// guard
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<string[]>(
      'permissions',
      context.getHandler()
    );
    
    if (!required?.length) return true;
    
    const { user } = context.switchToHttp().getRequest();
    const userPerms = user.app_permissions || [];
    
    return required.every(perm => 
      userPerms.includes(perm) || 
      userPerms.includes('*') ||
      userPerms.includes(perm.split(':')[0] + ':*')
    );
  }
}

// usage
@Delete(':id')
@RequirePermissions('projects:delete')
async deleteProject(@Param('id') id: string) {
  // ...
}
```

## React Integration

!!! warning "⚠️ UI Components Are For Display Only"
    The `HasPermission` and `HasRole` components below control **UI visibility only**.
    
    **They do NOT enforce security!** An attacker can bypass these by calling your API directly.
    
    **You MUST also enforce permissions server-side** using the Express/NestJS middleware shown above.
    
    ```
    UI Components = "Should I show this button?"
    Server Middleware = "Is this request allowed?" ← Security enforcement
    ```

### Permission Component

```tsx
function HasPermission({ 
  permission, 
  children, 
  fallback = null 
}: {
  permission: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { user } = useAuth();
  
  const permissions = Array.isArray(permission) ? permission : [permission];
  const userPerms = user?.app_permissions || [];
  
  const hasPermission = permissions.every(perm => 
    userPerms.includes(perm) ||
    userPerms.includes('*') ||
    userPerms.includes(perm.split(':')[0] + ':*')
  );
  
  return hasPermission ? <>{children}</> : <>{fallback}</>;
}

// Usage
<HasPermission 
  permission="users:delete"
  fallback={<span>Not authorized</span>}
>
  <DeleteUserButton />
</HasPermission>
```

### Role Component

```tsx
function HasRole({ 
  role, 
  children,
  fallback = null
}: {
  role: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { user } = useAuth();
  
  const roles = Array.isArray(role) ? role : [role];
  const hasRole = roles.some(r => user?.app_roles?.includes(r));
  
  return hasRole ? <>{children}</> : <>{fallback}</>;
}

// Usage
<HasRole role={['admin', 'manager']}>
  <AdminPanel />
</HasRole>
```

### usePermissions Hook

```tsx
function usePermissions() {
  const { user } = useAuth();
  const userPerms = user?.app_permissions || [];
  
  const can = useCallback((permission: string) => {
    return userPerms.includes(permission) ||
           userPerms.includes('*') ||
           userPerms.includes(permission.split(':')[0] + ':*');
  }, [userPerms]);
  
  const canAll = useCallback((permissions: string[]) => {
    return permissions.every(can);
  }, [can]);
  
  const canAny = useCallback((permissions: string[]) => {
    return permissions.some(can);
  }, [can]);
  
  return { can, canAll, canAny, permissions: userPerms };
}

// Usage
function ProjectActions({ projectId }) {
  const { can } = usePermissions();
  
  return (
    <div>
      {can('projects:update') && <EditButton />}
      {can('projects:delete') && <DeleteButton />}
      {can('projects:members:invite') && <InviteButton />}
    </div>
  );
}
```

## Admin: Managing Roles

### Create / Update Custom Roles

!!! note "Role management is not in the Server SDK"
    Creating and updating application roles (name, slug, permissions) is an
    admin operation. Use the **AuthVital Admin Console**, or call the REST API
    directly with an M2M token. There is no `client.integration` method for
    creating or editing roles.

### Assign Role to User

```typescript
// Assign a member an APPLICATION role (M2M integration client).
// roleId = an app Role id (from getApplicationRoles); applicationId = its app.
await client.integration.setMemberRole({
  membershipId: 'membership-id',
  roleId: 'app-role-id',
  applicationId: 'application-id',
});
```

!!! info "Authoritative Validation"
    Role changes are governed by a strict hierarchy enforced by the IDP:
    - Only owners and admins can change roles
    - Admins cannot promote anyone to owner
    - The IDP performs the final authoritative check

## JWT Claims

Roles and permissions are included in the JWT:

```json
{
  "sub": "user-id",
  "tenant_id": "tenant-id",
  "tenant_role": "admin",
  "app_roles": ["manager", "member"],
  "app_permissions": [
    "projects:create",
    "projects:read",
    "projects:update",
    "projects:members:*",
    "users:read"
  ]
}
```

## Best Practices

### ✅ Do

1. **Use descriptive permission names** - `projects:tasks:create` > `pt:c`
2. **Group by resource** - `projects:*`, `users:*`
3. **Least privilege** - Grant minimum permissions needed
4. **Audit role changes** - Log who changed what
5. **Test permissions** - Include in integration tests

### ❌ Don't

1. **Don't use `*` liberally** - Reserved for true superadmins
2. **Don't hardcode roles** - Use permissions instead
3. **Don't skip server validation** - UI checks are not enough
4. **Don't forget default roles** - New users need baseline access

---

## Related Documentation

- [Multi-Tenancy](./multi-tenancy.md)
- [Licensing System](./licensing.md)
- [Server SDK](../sdk/server-sdk/index.md)
- [JWT Claims](../reference/jwt-claims.md)
