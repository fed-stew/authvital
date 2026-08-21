/**
 * System Event Payload Contract Tests
 *
 * Proves every emitter constructs payloads satisfying the CANONICAL
 * contract in @authvital/shared (system-events.types.ts):
 *
 *  - COMPILE-TIME: dispatch<T>() is generic over SystemEventDataOf<T>, so
 *    the real emit sites are enforced by tsc. This spec adds `satisfies`
 *    fixtures replicating each inline emitter's exact shape (a drift here
 *    means the canonical type moved — update the emitter too), and calls
 *    the pure application payload builders directly (real production code).
 *
 *  - RUNTIME: asserts the key fields are actually present on constructed
 *    payloads.
 */
import { Logger } from '@nestjs/common';
import type {
  SsoProviderRemovedEventData,
  SystemEventDataOf,
  TenantAppGrantedEventData,
} from '@authvital/shared';
import {
  buildApplicationCreatedPayload,
  buildApplicationDeletedPayload,
  buildApplicationStatusChangedPayload,
  buildApplicationUpdatedPayload,
} from '../super-admin/services/admin-applications.helpers';
import { TenantsService } from '../tenants/tenants.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemWebhookService } from './system-webhook.service';
import { AuditService } from '../audit/audit.service';

// =============================================================================
// Application payload builders (real production code, runtime-checked)
// =============================================================================

describe('application.* payload builders (canonical contract)', () => {
  const appRow = {
    id: 'app-1',
    name: 'Dashboard',
    slug: 'dashboard',
    description: 'Main dashboard',
    accessMode: 'AUTOMATIC',
    createdAt: new Date('2026-08-21T00:00:00.000Z'),
    licensingMode: 'FREE',
    allowMixedLicensing: false,
    defaultSeatCount: 5,
    autoProvisionOnSignup: true,
    autoGrantToOwner: true,
  };
  const clientRow = {
    clientId: 'client-1',
    redirectUris: ['https://app.example.com/cb'],
    postLogoutRedirectUris: ['https://app.example.com'],
    initiateLoginUri: null,
    accessTokenTtl: 3600,
    refreshTokenTtl: 604800,
  };

  it('buildApplicationCreatedPayload satisfies ApplicationCreatedEventData', () => {
    const payload = buildApplicationCreatedPayload(appRow, clientRow);

    expect(payload).toMatchObject({
      application_id: 'app-1',
      tenant_id: null,
      name: 'Dashboard',
      slug: 'dashboard',
      client_id: 'client-1',
      application_type: 'AUTOMATIC',
      is_active: true,
      created_at: '2026-08-21T00:00:00.000Z',
    });
    expect(payload.config.redirect_uris).toEqual(['https://app.example.com/cb']);
    expect(payload.licensing).toEqual({
      mode: 'FREE',
      allow_mixed: false,
      default_seat_count: 5,
      auto_provision_on_signup: true,
      auto_grant_to_owner: true,
    });
  });

  it('buildApplicationCreatedPayload coerces a missing client to nulls', () => {
    const payload = buildApplicationCreatedPayload(appRow, undefined);

    expect(payload.client_id).toBeNull();
    expect(payload.config).toEqual({
      redirect_uris: [],
      post_logout_redirect_uris: [],
      initiate_login_uri: null,
      access_token_ttl_seconds: null,
      refresh_token_ttl_seconds: null,
    });
  });

  it('buildApplicationUpdatedPayload satisfies ApplicationUpdatedEventData', () => {
    const payload = buildApplicationUpdatedPayload({
      applicationId: 'app-1',
      result: { ...appRow, isActive: true },
      clientId: undefined, // canonical requires string | null
      changedFields: ['name'],
      previousValues: { name: 'Old Dashboard' },
    });

    expect(payload.client_id).toBeNull();
    expect(payload.changed_fields).toEqual(['name']);
    expect(payload.previous_values).toEqual({ name: 'Old Dashboard' });
    expect(payload.licensing.mode).toBe('FREE');
  });

  it('buildApplicationStatusChangedPayload includes the licensing block (canonical addition)', () => {
    const payload = buildApplicationStatusChangedPayload(appRow, 'client-1', false);

    expect(payload.is_active).toBe(false);
    expect(payload.changed_fields).toEqual(['is_active']);
    expect(payload.previous_values).toEqual({ is_active: true });
    // Previously missing on enable/disable toggles — now canonical-required
    expect(payload.licensing).toBeDefined();
    expect(payload.licensing.auto_grant_to_owner).toBe(true);
  });

  it('buildApplicationDeletedPayload satisfies ApplicationDeletedEventData', () => {
    const payload = buildApplicationDeletedPayload(appRow, 'app-1', undefined);

    expect(payload).toMatchObject({
      application_id: 'app-1',
      tenant_id: null,
      name: 'Dashboard',
      slug: 'dashboard',
      client_id: null,
    });
    expect(payload.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// =============================================================================
// TenantsService — real emitter, dispatch args captured
// =============================================================================

describe('TenantsService system event payloads (canonical contract)', () => {
  const tenantRow = {
    id: 'tenant-1',
    name: 'Acme',
    slug: 'acme',
    settings: { theme: 'dark' },
    createdAt: new Date('2026-08-21T00:00:00.000Z'),
    updatedAt: new Date('2026-08-21T00:00:00.000Z'),
    memberships: [{ user: { id: 'user-1', email: 'owner@acme.com' } }],
  };

  const mockPrisma = {
    tenant: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    tenantRole: { findUnique: jest.fn() },
    appSubscription: { count: jest.fn() },
  };
  const mockWebhooks = { dispatch: jest.fn() };
  const mockAudit = { log: jest.fn() };

  let service: TenantsService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    mockWebhooks.dispatch.mockResolvedValue(undefined);
    mockAudit.log.mockResolvedValue(undefined);
    service = new TenantsService(
      mockPrisma as unknown as PrismaService,
      mockWebhooks as unknown as SystemWebhookService,
      mockAudit as unknown as AuditService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('createTenant dispatches a canonical tenant.created payload', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null); // slug free
    mockPrisma.tenantRole.findUnique.mockResolvedValue(null);
    mockPrisma.tenant.create.mockResolvedValue(tenantRow);

    await service.createTenant({ name: 'Acme', slug: 'acme' } as any, 'user-1');

    // Compile-time proof happens at the emit site (generic dispatch); here
    // we assert the runtime shape actually carries the canonical fields.
    expect(mockWebhooks.dispatch).toHaveBeenCalledWith('tenant.created', {
      tenant_id: 'tenant-1',
      name: 'Acme',
      slug: 'acme',
      created_at: '2026-08-21T00:00:00.000Z',
      settings: { theme: 'dark' },
      created_by_sub: 'user-1',
      owner_email: 'owner@acme.com',
    });
  });

  it('deleteTenant dispatches a canonical tenant.deleted payload', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      ...tenantRow,
      _count: { memberships: 0 },
    });
    mockPrisma.appSubscription.count.mockResolvedValue(0);
    mockPrisma.tenant.delete.mockResolvedValue(tenantRow);

    await service.deleteTenant('tenant-1');

    expect(mockWebhooks.dispatch).toHaveBeenCalledWith(
      'tenant.deleted',
      expect.objectContaining({
        tenant_id: 'tenant-1',
        name: 'Acme',
        slug: 'acme',
        deleted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
  });
});

// =============================================================================
// Per-emitter compile-time fixtures (`satisfies` — drift here fails tsc)
//
// These replicate the EXACT shapes the remaining inline emit sites build.
// The real sites are enforced by the generic dispatch signature; these
// fixtures document + lock the contract per emitter in one place.
// =============================================================================

describe('inline emitter shapes satisfy canonical contracts', () => {
  it('app-access.service tenant.app.granted (user-level grant)', () => {
    const payload = {
      tenant_id: 'tenant-1',
      tenant_slug: 'acme',
      user_id: 'user-1',
      user_email: 'user@acme.com',
      application_id: 'app-1',
      application_name: 'Dashboard',
      application_slug: 'dashboard',
      access_type: 'GRANTED',
      granted_by_id: 'admin-1',
      license_assignment_id: 'la-1',
    } satisfies SystemEventDataOf<'tenant.app.granted'>;
    expect(payload.user_id).toBe('user-1');
  });

  it('app-access-auto-grant.service tenant.app.granted (role auto-grant)', () => {
    const payload = {
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      application_id: 'app-1',
      access_type: 'AUTO_FREE',
      role_id: 'role-1',
      role_name: 'Member',
      role_slug: 'member',
    } satisfies SystemEventDataOf<'tenant.app.granted'>;
    expect(payload.role_slug).toBe('member');
  });

  it('license-pool.service tenant.app.granted (tenant-level subscription grant — no user)', () => {
    const payload: TenantAppGrantedEventData = {
      subscription_id: 'sub-1',
      tenant_id: 'tenant-1',
      application_id: 'app-1',
      application_name: 'Dashboard',
      license_type_id: 'lt-1',
      license_type_name: 'Pro',
      quantity_purchased: 10,
      status: 'ACTIVE',
    };
    expect(payload.user_id).toBeUndefined();
    expect(payload.subscription_id).toBe('sub-1');
  });

  it('app-access.service tenant.app.revoked', () => {
    const payload = {
      tenant_id: 'tenant-1',
      tenant_slug: 'acme',
      user_id: 'user-1',
      application_id: 'app-1',
      application_name: 'Dashboard',
      application_slug: 'dashboard',
      revoked_by_id: 'admin-1',
    } satisfies SystemEventDataOf<'tenant.app.revoked'>;
    expect(payload.user_id).toBe('user-1');
  });

  it('admin-sso.service sso.provider_* shapes', () => {
    const added = {
      provider_id: 'GOOGLE',
      tenant_id: null,
      provider_type: 'GOOGLE',
      display_name: 'GOOGLE',
      is_enabled: true,
    } satisfies SystemEventDataOf<'sso.provider_added'>;

    const updated = {
      provider_id: 'GOOGLE',
      tenant_id: null,
      provider_type: 'GOOGLE',
      changed_fields: ['enabled'],
    } satisfies SystemEventDataOf<'sso.provider_updated'>;

    const removed: SsoProviderRemovedEventData = {
      provider_id: 'OKTA',
      tenant_id: null,
      provider_type: 'OKTA',
      removed_at: new Date().toISOString(),
    };

    expect(added.is_enabled).toBe(true);
    expect(updated.changed_fields).toContain('enabled');
    expect(removed.removed_at).toMatch(/^\d{4}/);
  });

  it('admin-tenant-members.service tenant.updated (members change)', () => {
    const payload = {
      tenant_id: 'tenant-1',
      name: 'Acme',
      slug: 'acme',
      changed_fields: ['members'],
      settings: {},
    } satisfies SystemEventDataOf<'tenant.updated'>;
    expect(payload.changed_fields).toEqual(['members']);
  });
});
