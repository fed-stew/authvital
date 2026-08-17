# Admin

> Instance/super-admin operations are **not** part of the server SDK.

!!! info "There is no `authvital.admin.*` namespace"
    Earlier drafts described `authvital.admin.getInstanceSettings()`,
    `.updateInstanceSettings()`, `.configureSso()`, `.disableUserMfa()`,
    `.forcePasswordReset()`, `.disableUser()`, `.revokeUserSessions()`, etc.
    **The `@authvital/server` SDK ships none of these.**

    Instance settings, instance-level SSO, and super-admin user actions are
    privileged operations performed through AuthVital's Super Admin console and
    its dedicated (super-admin-guarded) backend endpoints. They are intentionally
    **not** exposed to integrating applications via the M2M SDK.

## Where admin functionality lives

| You want to… | Use |
|--------------|-----|
| Configure instance settings / SSO defaults | AuthVital Super Admin console — [Administration → Super Admin](../../../admin/super-admin.md) |
| Create applications & clients | [Administration → Application Setup](../../../admin/application-setup.md) |
| Manage a tenant's members/roles | [Administration → Tenant Admin](../../../admin/tenant-admin.md) |

## The closest the SDK gets

The M2M **integration client** lets a trusted backend perform a bounded set of
tenant-scoped operations (memberships, roles, invitations, licenses, permission
checks). That is the supported programmatic surface — see
[Integration API (overview)](./overview.md). It is deliberately narrower than
"admin": there is no way to change instance-wide settings or act as super admin
through the SDK.

## See also

- [Integration API (overview)](./overview.md)
- [Administration](../../../admin/super-admin.md)
