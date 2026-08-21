# Organization Sync Prisma Schema

> Tables sized to what the **system webhook actually delivers** (see
> [Events](./events.md)). No SDK reads these — you own the dispatcher that fills
> them. Only include columns you can actually populate.

!!! warning "Don't model fields that aren't sent"
    The system webhook does **not** deliver tenant `plan`/`settings`, SSO
    `attribute_mapping`, or application OAuth `grant_types`/`scopes` as first-class
    fields. `application.created` does include a nested `config`
    (redirect URIs, token TTLs, …) and `licensing` object — store those as JSON if
    you need them.

## Organization (tenant)

```prisma
model Organization {
  id         String   @id                        // tenant_id
  name       String                              // event data `name`
  slug       String   @unique                    // tenant_slug
  ownerEmail String?  @map("owner_email")
  status     String   @default("active")         // set to "deleted" on tenant.deleted
  syncedAt   DateTime @default(now()) @map("synced_at")

  applications Application[]
  @@map("av_organizations")
}
```

## Application

Applications are global in AuthVital (`tenant_id` is `null` in the event), so the
FK to `Organization` is optional.

```prisma
model Application {
  id              String   @id                    // application_id
  organizationId  String?  @map("organization_id") // usually null (global apps)
  organization    Organization? @relation(fields: [organizationId], references: [id])
  name            String
  description     String?
  slug            String
  clientId        String   @map("client_id")
  applicationType String?  @map("application_type") // accessMode
  isActive        Boolean  @default(true) @map("is_active")
  config          Json?                            // redirect_uris, token TTLs, ...
  licensing       Json?                            // app licensing settings
  syncedAt        DateTime @default(now()) @map("synced_at")

  @@map("av_applications")
}
```

## SSO provider

```prisma
model SsoProvider {
  id           String   @id                        // provider_id (slug)
  providerType String   @map("provider_type")
  displayName  String?  @map("display_name")
  isEnabled    Boolean  @default(true) @map("is_enabled")
  syncedAt     DateTime @default(now()) @map("synced_at")

  @@map("av_sso_providers")
}
```

## Optional: audit log

```prisma
model OrgAuditLog {
  id            String   @id @default(cuid())
  event         String
  tenantId      String?  @map("tenant_id")
  applicationId String?  @map("application_id")
  changedFields String[] @default([]) @map("changed_fields")
  payload       Json
  receivedAt    DateTime @default(now()) @map("received_at")

  @@index([tenantId])
  @@map("av_org_audit_log")
}
```

Run the migration:

```bash
npx prisma migrate dev --name add-organization-sync
npx prisma generate
```

## Related

- [Overview](./index.md) · [Events](./events.md) · [Use Cases](./use-cases.md)
