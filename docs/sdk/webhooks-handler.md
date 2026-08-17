# Event Handler Pattern

> A convenient class-based pattern for dispatching webhook events.

**See also:** [Webhooks Guide](./webhooks.md) | [Event Types](./webhooks-events.md)

!!! warning "`AuthVitalEventHandler` is not an SDK export"
    The SDK does **not** ship an `AuthVitalEventHandler` base class or a
    `WebhookRouter`. This page shows a handler pattern **you define yourself** —
    it's a nice way to organize dispatch, but the base class below is your code.
    Event **types** are real and imported from **`@authvital/shared`**. Verify
    signatures using the [Manual Verification](./webhooks-verification.md) helper.

---

## Define your own base class

Create an abstract base whose methods you override. Wire it up to your verified
endpoint via a small `dispatch(event)` that switches on `event.type`.

```typescript
import type {
  SubjectCreatedEvent,
  SubjectUpdatedEvent,
  SubjectDeletedEvent,
  SubjectDeactivatedEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  MemberRoleChangedEvent,
  MemberSuspendedEvent,
  MemberActivatedEvent,
  InviteCreatedEvent,
  InviteAcceptedEvent,
  InviteDeletedEvent,
  InviteExpiredEvent,
  AppAccessGrantedEvent,
  AppAccessRevokedEvent,
  AppAccessRoleChangedEvent,
  LicenseAssignedEvent,
  LicenseRevokedEvent,
  LicenseChangedEvent,
  WebhookEvent,
} from '@authvital/shared';

// YOUR base class (not from the SDK).
abstract class AuthVitalEventHandler {
  /** Route a verified event to the right handler. Call this from your endpoint. */
  async dispatch(event: WebhookEvent): Promise<void> {
    await this.onEvent(event);
    // ...switch on event.type and call the matching on* method below.
  }

  /**
   * Called for EVERY event before the specific handler.
   * Use for logging, metrics, or cross-cutting concerns.
   */
  async onEvent(event: WebhookEvent): Promise<void> {}

  // ─── Subject Events ────────────────────────────────────────────────
  async onSubjectCreated(event: SubjectCreatedEvent): Promise<void>;
  async onSubjectUpdated(event: SubjectUpdatedEvent): Promise<void>;
  async onSubjectDeleted(event: SubjectDeletedEvent): Promise<void>;
  async onSubjectDeactivated(event: SubjectDeactivatedEvent): Promise<void>;

  // ─── Member Events ─────────────────────────────────────────────────
  async onMemberJoined(event: MemberJoinedEvent): Promise<void>;
  async onMemberLeft(event: MemberLeftEvent): Promise<void>;
  async onMemberRoleChanged(event: MemberRoleChangedEvent): Promise<void>;
  async onMemberSuspended(event: MemberSuspendedEvent): Promise<void>;
  async onMemberActivated(event: MemberActivatedEvent): Promise<void>;

  // ─── Invitation Events ─────────────────────────────────────────────
  async onInviteCreated(event: InviteCreatedEvent): Promise<void>;
  async onInviteAccepted(event: InviteAcceptedEvent): Promise<void>;
  async onInviteDeleted(event: InviteDeletedEvent): Promise<void>;
  async onInviteExpired(event: InviteExpiredEvent): Promise<void>;

  // ─── App Access Events ─────────────────────────────────────────────
  async onAppAccessGranted(event: AppAccessGrantedEvent): Promise<void>;
  async onAppAccessRevoked(event: AppAccessRevokedEvent): Promise<void>;
  async onAppAccessRoleChanged(event: AppAccessRoleChangedEvent): Promise<void>;

  // ─── License Events ────────────────────────────────────────────────
  async onLicenseAssigned(event: LicenseAssignedEvent): Promise<void>;
  async onLicenseRevoked(event: LicenseRevokedEvent): Promise<void>;
  async onLicenseChanged(event: LicenseChangedEvent): Promise<void>;
}
```

---

## Complete Example

```typescript
import { AuthVitalEventHandler } from './authvital-event-handler'; // your base class above
import type {
  WebhookEvent,
  SubjectCreatedEvent,
  SubjectUpdatedEvent,
  SubjectDeletedEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  MemberRoleChangedEvent,
  AppAccessGrantedEvent,
  AppAccessRevokedEvent,
  LicenseAssignedEvent,
  LicenseRevokedEvent,
  LicenseChangedEvent,
} from '@authvital/shared';
import { prisma } from './lib/prisma';
import { sendEmail } from './lib/email';
import { slack } from './lib/slack';

export class MyEventHandler extends AuthVitalEventHandler {
  /**
   * Global event handler - runs before specific handlers.
   * Perfect for logging and metrics.
   */
  async onEvent(event: WebhookEvent): Promise<void> {
    console.log(`[Webhook] ${event.type}`, {
      id: event.id,
      tenant_id: event.tenant_id,
      timestamp: event.timestamp,
    });
  }

  // ─── Subject Handlers ──────────────────────────────────────────────

  async onSubjectCreated(event: SubjectCreatedEvent): Promise<void> {
    const { sub, email, given_name, family_name, subject_type } = event.data;

    // Only sync human users, not service accounts or machines
    if (subject_type !== 'user') {
      console.log(`Skipping non-user subject: ${subject_type}`);
      return;
    }

    // Create user in local database
    await prisma.user.create({
      data: {
        id: sub,
        email: email!,
        firstName: given_name,
        lastName: family_name,
      },
    });

    // Send welcome email
    if (email) {
      await sendEmail({
        to: email,
        template: 'welcome',
        data: { name: given_name || 'there' },
      });
    }
  }

  async onSubjectUpdated(event: SubjectUpdatedEvent): Promise<void> {
    const { sub, email, given_name, family_name, changed_fields } = event.data;

    console.log(`User ${sub} updated fields:`, changed_fields);

    // Only update fields that changed
    const updateData: Record<string, string | undefined> = {};
    
    if (changed_fields.includes('email')) {
      updateData.email = email;
    }
    if (changed_fields.includes('given_name')) {
      updateData.firstName = given_name;
    }
    if (changed_fields.includes('family_name')) {
      updateData.lastName = family_name;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: sub },
        data: updateData,
      });
    }
  }

  async onSubjectDeleted(event: SubjectDeletedEvent): Promise<void> {
    const { sub } = event.data;

    // Soft delete: mark as deleted but keep for audit
    await prisma.user.update({
      where: { id: sub },
      data: {
        deletedAt: new Date(),
        email: `deleted-${sub}@deleted.local`, // Anonymize
      },
    });
  }

  // ─── Member Handlers ───────────────────────────────────────────────

  async onMemberJoined(event: MemberJoinedEvent): Promise<void> {
    const { membership_id, sub, email, tenant_roles, given_name, family_name } = event.data;

    // Link user to tenant
    await prisma.tenantMembership.create({
      data: {
        id: membership_id,
        userId: sub,
        tenantId: event.tenant_id,
        roles: tenant_roles,
      },
    });

    // Notify team
    await slack.postMessage({
      channel: '#team-updates',
      text: `👋 ${given_name || email} joined the team with roles: ${tenant_roles.join(', ')}`,
    });
  }

  async onMemberLeft(event: MemberLeftEvent): Promise<void> {
    const { membership_id, sub } = event.data;

    // Remove membership
    await prisma.tenantMembership.delete({
      where: { id: membership_id },
    });

    // Archive user's projects in this tenant
    await prisma.project.updateMany({
      where: {
        ownerId: sub,
        tenantId: event.tenant_id,
      },
      data: { archived: true },
    });
  }

  async onMemberRoleChanged(event: MemberRoleChangedEvent): Promise<void> {
    const { membership_id, sub, tenant_roles, previous_roles } = event.data;

    // Update roles
    await prisma.tenantMembership.update({
      where: { id: membership_id },
      data: { roles: tenant_roles },
    });

    // Log role change for audit
    await prisma.auditLog.create({
      data: {
        action: 'MEMBER_ROLE_CHANGED',
        subjectId: sub,
        tenantId: event.tenant_id,
        metadata: {
          previousRoles: previous_roles,
          newRoles: tenant_roles,
        },
      },
    });
  }

  // ─── App Access Handlers ───────────────────────────────────────────

  async onAppAccessGranted(event: AppAccessGrantedEvent): Promise<void> {
    const { membership_id, sub, role_id, role_slug, given_name, family_name } = event.data;

    // Create app-specific user record
    await prisma.appUser.upsert({
      where: { membershipId: membership_id },
      create: {
        membershipId: membership_id,
        userId: sub,
        appRoleId: role_id,
        appRoleSlug: role_slug,
      },
      update: {
        appRoleId: role_id,
        appRoleSlug: role_slug,
      },
    });

    console.log(`${given_name} ${family_name} granted ${role_slug} access`);
  }

  async onAppAccessRevoked(event: AppAccessRevokedEvent): Promise<void> {
    const { membership_id, sub } = event.data;

    // Revoke all API keys for this user
    await prisma.apiKey.updateMany({
      where: { userId: sub },
      data: { revokedAt: new Date() },
    });

    // Remove app user record
    await prisma.appUser.delete({
      where: { membershipId: membership_id },
    });
  }

  // ─── License Handlers ──────────────────────────────────────────────

  async onLicenseAssigned(event: LicenseAssignedEvent): Promise<void> {
    const { assignment_id, sub, license_type_id, license_type_name } = event.data;

    // Determine storage quota based on license
    const quotaGb = license_type_name.includes('Enterprise') ? -1 : // unlimited
                    license_type_name.includes('Pro') ? 100 : 10;

    await prisma.storageQuota.upsert({
      where: { userId: sub },
      create: {
        userId: sub,
        limitGb: quotaGb,
        licenseAssignmentId: assignment_id,
        licenseTypeId: license_type_id,
      },
      update: {
        limitGb: quotaGb,
        licenseAssignmentId: assignment_id,
        licenseTypeId: license_type_id,
      },
    });
  }

  async onLicenseRevoked(event: LicenseRevokedEvent): Promise<void> {
    const { sub } = event.data;

    // Downgrade to free tier quota
    await prisma.storageQuota.update({
      where: { userId: sub },
      data: {
        limitGb: 5, // Free tier
        licenseAssignmentId: null,
        licenseTypeId: null,
      },
    });
  }

  async onLicenseChanged(event: LicenseChangedEvent): Promise<void> {
    const {
      sub,
      license_type_id,
      license_type_name,
      previous_license_type_name,
    } = event.data;

    console.log(
      `License changed for ${sub}: ${previous_license_type_name} → ${license_type_name}`
    );

    // Re-run assignment logic with new license
    await this.onLicenseAssigned(event as LicenseAssignedEvent);
  }
}
```

---

## Minimal Example

You only need to override the methods you care about:

```typescript
import { AuthVitalEventHandler } from './authvital-event-handler';
import type { SubjectCreatedEvent, MemberJoinedEvent } from '@authvital/shared';

export class MinimalHandler extends AuthVitalEventHandler {
  async onSubjectCreated(event: SubjectCreatedEvent) {
    console.log('New user:', event.data.email);
  }

  async onMemberJoined(event: MemberJoinedEvent) {
    console.log('Member joined:', event.data.membership_id);
  }
}
```

---

## Wiring the handler to a verified endpoint

There is no `WebhookRouter`. Verify the signature, then hand the parsed event to
your handler's `dispatch()`:

```typescript
import express from 'express';
import type { WebhookEvent } from '@authvital/shared';
import { verifyWebhook } from './verify-webhook'; // see Manual Verification
import { MyEventHandler } from './event-handler';

const handler = new MyEventHandler();
const app = express();

app.post('/webhooks/authvital', express.raw({ type: 'application/json' }), async (req, res) => {
  const raw = req.body.toString('utf-8');
  const ok = await verifyWebhook({
    body: raw,
    signature: req.headers['x-authvital-signature'] as string,
    keyId: req.headers['x-authvital-key-id'] as string,
    timestamp: req.headers['x-authvital-timestamp'] as string,
    authVitalHost: process.env.AV_HOST!,
  });
  if (!ok) return res.status(401).json({ error: 'invalid signature' });

  await handler.dispatch(JSON.parse(raw) as WebhookEvent);
  res.status(200).json({ received: true });
});
```

---

## Related Documentation

- [Webhooks Guide](./webhooks.md) - Overview and quick start
- [Event Types & Payloads](./webhooks-events.md) - All event types
- [Framework Integration](./webhooks-frameworks.md) - Express, Next.js, NestJS
