/**
 * @authvader/sdk - Identity Sync Handler
 * 
 * Pre-built webhook handler that syncs AuthVader identities to your local database.
 * Supports all OIDC standard claims.
 * 
 * @example Single database (shared or single-tenant)
 * ```typescript
 * import { IdentitySyncHandler, WebhookRouter } from '@authvader/sdk/server';
 * import { prisma } from './prisma';
 * 
 * const handler = new IdentitySyncHandler(prisma);
 * const router = new WebhookRouter({ handler });
 * ```
 * 
 * @example Tenant-isolated databases
 * ```typescript
 * import { IdentitySyncHandler, WebhookRouter } from '@authvader/sdk/server';
 * import { getTenantPrisma } from './db';
 * 
 * // Pass a resolver function that returns the correct client per tenant
 * const handler = new IdentitySyncHandler((tenantId) => getTenantPrisma(tenantId));
 * const router = new WebhookRouter({ handler });
 * ```
 */

import { AuthVaderEventHandler } from '../webhooks/event-interfaces';
import type {
  SubjectCreatedEvent,
  SubjectUpdatedEvent,
  SubjectDeletedEvent,
  SubjectDeactivatedEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  MemberRoleChangedEvent,
  AppAccessGrantedEvent,
  AppAccessRevokedEvent,
  AppAccessRoleChangedEvent,
} from '../webhooks/types';
import type { PrismaClientLike, PrismaClientOrResolver, IdentityCreate, IdentityUpdate } from './types';

/**
 * Extended event data interface for OIDC-compliant fields
 */
interface OidcEventData {
  sub: string;
  // Profile scope
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  middle_name?: string;
  nickname?: string;
  picture?: string;
  website?: string;
  gender?: string;
  birthdate?: string;
  zoneinfo?: string;
  locale?: string;
  // Email scope
  email?: string;
  email_verified?: boolean;
  // Phone scope
  phone_number?: string;
  phone_number_verified?: boolean;
  // Groups
  groups?: string[];
}

/**
 * Extract OIDC fields from event data
 * 
 * IMPORTANT: Only includes fields that are actually present in the event.
 * This prevents null values from overwriting existing data when events
 * don't include all fields (e.g., role_changed events may not have name fields).
 */
function extractOidcFields(data: OidcEventData): Partial<IdentityCreate> {
  const fields: Partial<IdentityCreate> = {};
  
  // Only include fields that are actually present in the event
  if (data.preferred_username !== undefined) fields.username = data.preferred_username;
  if (data.name !== undefined) fields.displayName = data.name;
  if (data.given_name !== undefined) fields.givenName = data.given_name;
  if (data.family_name !== undefined) fields.familyName = data.family_name;
  if (data.middle_name !== undefined) fields.middleName = data.middle_name;
  if (data.nickname !== undefined) fields.nickname = data.nickname;
  if (data.picture !== undefined) fields.pictureUrl = data.picture;
  if (data.website !== undefined) fields.website = data.website;
  if (data.gender !== undefined) fields.gender = data.gender;
  if (data.birthdate !== undefined) fields.birthdate = data.birthdate;
  if (data.zoneinfo !== undefined) fields.zoneinfo = data.zoneinfo;
  if (data.locale !== undefined) fields.locale = data.locale;
  if (data.email !== undefined) fields.email = data.email;
  if (data.email_verified !== undefined) fields.emailVerified = data.email_verified;
  if (data.phone_number !== undefined) fields.phone = data.phone_number;
  if (data.phone_number_verified !== undefined) fields.phoneVerified = data.phone_number_verified;
  if (data.groups !== undefined) fields.groups = data.groups;
  
  return fields;
}

/**
 * Pre-built webhook handler for syncing identities from AuthVader
 * 
 * Supports two modes:
 * 1. **Shared DB**: Pass a single Prisma client
 * 2. **Tenant-isolated DBs**: Pass a resolver function that returns the client per tenant
 * 
 * Handles:
 * - subject.created → Creates identity in local DB
 * - subject.updated → Updates identity in local DB
 * - subject.deleted → Deletes identity from local DB
 * - subject.deactivated → Marks identity as inactive
 * - member.joined → Updates identity's tenant context
 * - member.left → Clears identity's tenant context
 * - member.role_changed → Updates identity's tenant role
 * - app_access.granted → Updates identity's app role
 * - app_access.revoked → Clears identity's app role
 * - app_access.role_changed → Updates identity's app role
 */
export class IdentitySyncHandler extends AuthVaderEventHandler {
  private readonly isResolver: boolean;

  /**
   * Create a new identity sync handler
   * 
   * @param prismaOrResolver - Either a Prisma client (shared DB) or a resolver function (tenant-isolated DBs)
   * 
   * @example Shared database
   * ```typescript
   * new IdentitySyncHandler(prisma)
   * ```
   * 
   * @example Tenant-isolated databases
   * ```typescript
   * new IdentitySyncHandler((tenantId) => getTenantPrisma(tenantId))
   * ```
   */
  constructor(private readonly prismaOrResolver: PrismaClientOrResolver) {
    super();
    this.isResolver = typeof prismaOrResolver === 'function';
  }

  /**
   * Get the Prisma client for the given tenant
   * - Shared DB mode: Returns the single client (tenantId ignored)
   * - Tenant-isolated mode: Calls resolver with tenantId
   */
  private async getClient(tenantId: string | undefined): Promise<PrismaClientLike> {
    if (this.isResolver) {
      if (!tenantId) {
        throw new Error(
          '[IdentitySyncHandler] Tenant-isolated mode requires tenant_id in webhook event. ' +
          'Ensure webhooks are configured with tenant context.'
        );
      }
      return (this.prismaOrResolver as (tenantId: string) => PrismaClientLike | Promise<PrismaClientLike>)(tenantId);
    }
    return this.prismaOrResolver as PrismaClientLike;
  }

  // ===========================================================================
  // SUBJECT EVENTS (identity lifecycle)
  // ===========================================================================

  async onSubjectCreated(event: SubjectCreatedEvent): Promise<void> {
    const prisma = await this.getClient(event.tenant_id);
    const data = event.data as unknown as OidcEventData;
    const oidcFields = extractOidcFields(data);
    
    const identityData: IdentityCreate = {
      id: data.sub,
      ...oidcFields,
      tenantId: event.tenant_id ?? null,
      isActive: true,
    };

    await prisma.identity.upsert({
      where: { id: data.sub },
      create: identityData,
      update: {
        ...oidcFields,
        syncedAt: new Date(),
      },
    });
  }

  async onSubjectUpdated(event: SubjectUpdatedEvent): Promise<void> {
    const prisma = await this.getClient(event.tenant_id);
    const data = event.data as unknown as OidcEventData & { changed_fields?: string[] };
    const oidcFields = extractOidcFields(data);
    
    const updateData: IdentityUpdate = {
      syncedAt: new Date(),
    };

    const changedFields = data.changed_fields ?? [];
    
    if (changedFields.length === 0) {
      Object.assign(updateData, oidcFields);
    } else {
      const fieldMap: Record<string, keyof typeof oidcFields> = {
        'preferred_username': 'username',
        'username': 'username',
        'name': 'displayName',
        'display_name': 'displayName',
        'given_name': 'givenName',
        'family_name': 'familyName',
        'middle_name': 'middleName',
        'nickname': 'nickname',
        'picture': 'pictureUrl',
        'website': 'website',
        'gender': 'gender',
        'birthdate': 'birthdate',
        'zoneinfo': 'zoneinfo',
        'locale': 'locale',
        'email': 'email',
        'email_verified': 'emailVerified',
        'phone_number': 'phone',
        'phone_verified': 'phoneVerified',
        'groups': 'groups',
      };

      for (const field of changedFields) {
        const mappedField = fieldMap[field];
        if (mappedField && mappedField in oidcFields) {
          (updateData as Record<string, unknown>)[mappedField] = oidcFields[mappedField as keyof typeof oidcFields];
        }
      }
    }

    await prisma.identity.upsert({
      where: { id: data.sub },
      create: {
        id: data.sub,
        ...oidcFields,
        isActive: true,
      },
      update: updateData,
    });
  }

  async onSubjectDeleted(event: SubjectDeletedEvent): Promise<void> {
    const prisma = await this.getClient(event.tenant_id);
    const { sub } = event.data;
    
    try {
      await prisma.identity.delete({
        where: { id: sub },
      });
    } catch {
      console.warn(`[IdentitySyncHandler] Identity ${sub} not found for deletion`);
    }
  }

  async onSubjectDeactivated(event: SubjectDeactivatedEvent): Promise<void> {
    const prisma = await this.getClient(event.tenant_id);
    const { sub } = event.data;
    
    await prisma.identity.update({
      where: { id: sub },
      data: {
        isActive: false,
        syncedAt: new Date(),
      },
    });
  }

  // ===========================================================================
  // MEMBER EVENTS (tenant context)
  // ===========================================================================

  async onMemberJoined(event: MemberJoinedEvent): Promise<void> {
    const prisma = await this.getClient(event.tenant_id);
    const data = event.data as unknown as OidcEventData & { tenant_roles?: string[] };
    const tenantId = event.tenant_id;
    const oidcFields = extractOidcFields(data);
    const primaryRole = data.tenant_roles?.[0] ?? null;

    await prisma.identity.upsert({
      where: { id: data.sub },
      create: {
        id: data.sub,
        ...oidcFields,
        tenantId: tenantId ?? null,
        appRole: primaryRole,
        isActive: true,
      },
      update: {
        ...oidcFields,
        tenantId: tenantId ?? null,
        appRole: primaryRole,
        groups: data.groups ?? [],
        syncedAt: new Date(),
      },
    });
  }

  async onMemberLeft(event: MemberLeftEvent): Promise<void> {
    const prisma = await this.getClient(event.tenant_id);
    const { sub } = event.data;
    
    await prisma.identity.update({
      where: { id: sub },
      data: {
        tenantId: null,
        appRole: null,
        groups: [],
        syncedAt: new Date(),
      },
    });
  }

  async onMemberRoleChanged(event: MemberRoleChangedEvent): Promise<void> {
    const prisma = await this.getClient(event.tenant_id);
    const data = event.data as unknown as OidcEventData & { tenant_roles?: string[] };
    const oidcFields = extractOidcFields(data);
    const primaryRole = data.tenant_roles?.[0] ?? null;

    await prisma.identity.update({
      where: { id: data.sub },
      data: {
        ...oidcFields,
        appRole: primaryRole,
        groups: data.groups ?? [],
        syncedAt: new Date(),
      },
    });
  }

  // ===========================================================================
  // APP ACCESS EVENTS (app-specific role)
  // ===========================================================================

  async onAppAccessGranted(event: AppAccessGrantedEvent): Promise<void> {
    const prisma = await this.getClient(event.tenant_id);
    const data = event.data as unknown as OidcEventData & { role_slug?: string };
    const tenantId = event.tenant_id;
    const oidcFields = extractOidcFields(data);

    await prisma.identity.upsert({
      where: { id: data.sub },
      create: {
        id: data.sub,
        ...oidcFields,
        tenantId: tenantId ?? null,
        appRole: data.role_slug ?? null,
        isActive: true,
        hasAppAccess: true,
      },
      update: {
        ...oidcFields,
        tenantId: tenantId ?? null,
        appRole: data.role_slug ?? null,
        hasAppAccess: true,
        groups: data.groups ?? [],
        syncedAt: new Date(),
      },
    });
  }

  async onAppAccessRevoked(event: AppAccessRevokedEvent): Promise<void> {
    const prisma = await this.getClient(event.tenant_id);
    const { sub } = event.data;

    await prisma.identity.update({
      where: { id: sub },
      data: {
        appRole: null,
        hasAppAccess: false,
        syncedAt: new Date(),
      },
    });
  }

  async onAppAccessRoleChanged(event: AppAccessRoleChangedEvent): Promise<void> {
    const prisma = await this.getClient(event.tenant_id);
    const data = event.data as unknown as OidcEventData & { role_slug?: string };
    const oidcFields = extractOidcFields(data);

    await prisma.identity.update({
      where: { id: data.sub },
      data: {
        ...oidcFields,
        appRole: data.role_slug ?? null,
        groups: data.groups ?? [],
        syncedAt: new Date(),
      },
    });
  }
}
