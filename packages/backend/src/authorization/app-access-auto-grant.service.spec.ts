import { Test, TestingModule } from '@nestjs/testing';
import { AccessType } from '@prisma/client';
import { AppAccessAutoGrantService } from './app-access-auto-grant.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemWebhookService } from '../webhooks/system-webhook.service';

const mockPrisma = {
  appSubscription: { findMany: jest.fn() },
  appAccess: { createMany: jest.fn() },
  membership: { findMany: jest.fn() },
  role: { findMany: jest.fn() },
  membershipRole: { findMany: jest.fn(), createMany: jest.fn() },
  application: { findUnique: jest.fn() },
  tenant: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
};

const mockWebhooks = { dispatch: jest.fn() };

const DEFAULT_ROLE = { id: 'role-default', name: 'Member', slug: 'member', applicationId: 'app-1' };

describe('AppAccessAutoGrantService - default role assignment', () => {
  let service: AppAccessAutoGrantService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppAccessAutoGrantService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SystemWebhookService, useValue: mockWebhooks },
      ],
    }).compile();
    service = module.get(AppAccessAutoGrantService);
    jest.clearAllMocks();

    // Sensible defaults; individual tests override what they care about.
    mockPrisma.appAccess.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.membershipRole.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.membershipRole.findMany.mockResolvedValue([]);
    mockPrisma.role.findMany.mockResolvedValue([DEFAULT_ROLE]);
    mockPrisma.membership.findMany.mockResolvedValue([{ id: 'm-1', userId: 'user-1' }]);
    mockPrisma.application.findUnique.mockResolvedValue({ name: 'App', slug: 'app' });
    mockPrisma.tenant.findUnique.mockResolvedValue({ slug: 'tenant' });
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'u@example.com' });
  });

  describe('autoGrantFreeApps', () => {
    beforeEach(() => {
      mockPrisma.appSubscription.findMany.mockResolvedValue([{ applicationId: 'app-1' }]);
    });

    it('assigns the app default role when the membership has no role for that app', async () => {
      await service.autoGrantFreeApps('t-1', 'user-1', 'admin-1');

      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { applicationId: { in: ['app-1'] }, isDefault: true },
        }),
      );
      expect(mockPrisma.membershipRole.createMany).toHaveBeenCalledWith({
        data: [{ membershipId: 'm-1', roleId: 'role-default' }],
        skipDuplicates: true,
      });
    });

    it('does NOT overwrite an existing role for the app (explicit role wins)', async () => {
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membershipId: 'm-1', role: { applicationId: 'app-1' } },
      ]);

      await service.autoGrantFreeApps('t-1', 'user-1');

      expect(mockPrisma.membershipRole.createMany).not.toHaveBeenCalled();
    });

    it('grants access with no role and does not throw when no default role is configured', async () => {
      mockPrisma.role.findMany.mockResolvedValue([]);

      const count = await service.autoGrantFreeApps('t-1', 'user-1');

      expect(count).toBe(1);
      expect(mockPrisma.appAccess.createMany).toHaveBeenCalled();
      expect(mockPrisma.membershipRole.createMany).not.toHaveBeenCalled();
    });

    it('skips role assignment when the user has no membership in the tenant', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);

      await expect(service.autoGrantFreeApps('t-1', 'user-1')).resolves.toBe(1);
      expect(mockPrisma.membershipRole.createMany).not.toHaveBeenCalled();
    });
  });

  describe('autoGrantTenantWideApps', () => {
    it('assigns the default role alongside TENANT_WIDE access', async () => {
      mockPrisma.appSubscription.findMany.mockResolvedValue([{ applicationId: 'app-1' }]);

      await service.autoGrantTenantWideApps('t-1', 'user-1');

      expect(mockPrisma.membershipRole.createMany).toHaveBeenCalledWith({
        data: [{ membershipId: 'm-1', roleId: 'role-default' }],
        skipDuplicates: true,
      });
    });
  });

  describe('autoGrantOwnerAccess', () => {
    it('assigns default roles for all subscribed apps to the owner', async () => {
      mockPrisma.appSubscription.findMany.mockResolvedValue([
        { applicationId: 'app-1' },
        { applicationId: 'app-2' },
      ]);
      mockPrisma.role.findMany.mockResolvedValue([
        DEFAULT_ROLE,
        { id: 'role-d2', name: 'Viewer', slug: 'viewer', applicationId: 'app-2' },
      ]);
      mockPrisma.membership.findMany.mockResolvedValue([{ id: 'm-owner', userId: 'owner-1' }]);

      await service.autoGrantOwnerAccess('t-1', 'owner-1');

      expect(mockPrisma.membershipRole.createMany).toHaveBeenCalledWith({
        data: [
          { membershipId: 'm-owner', roleId: 'role-default' },
          { membershipId: 'm-owner', roleId: 'role-d2' },
        ],
        skipDuplicates: true,
      });
    });
  });

  describe('grantAccessToAllMembers', () => {
    it('assigns the default role only to members lacking a role for the app', async () => {
      mockPrisma.membership.findMany
        // 1st call: the grant loop's ACTIVE member lookup
        .mockResolvedValueOnce([{ userId: 'user-1' }, { userId: 'user-2' }])
        // 2nd call: the helper's membership lookup
        .mockResolvedValueOnce([
          { id: 'm-1', userId: 'user-1' },
          { id: 'm-2', userId: 'user-2' },
        ]);
      // user-1 already has an explicit role for app-1
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membershipId: 'm-1', role: { applicationId: 'app-1' } },
      ]);

      await service.grantAccessToAllMembers('t-1', 'app-1', AccessType.AUTO_TENANT);

      expect(mockPrisma.membershipRole.createMany).toHaveBeenCalledWith({
        data: [{ membershipId: 'm-2', roleId: 'role-default' }],
        skipDuplicates: true,
      });
    });
  });

  describe('assignDefaultRolesIfNone', () => {
    it('returns the newly-assigned roles keyed by user:app', async () => {
      const assigned = await service.assignDefaultRolesIfNone(
        mockPrisma as never,
        't-1',
        ['user-1'],
        ['app-1'],
      );

      expect(assigned.get('user-1:app-1')).toEqual({
        id: 'role-default',
        name: 'Member',
        slug: 'member',
      });
    });

    it('is a no-op for empty inputs', async () => {
      const assigned = await service.assignDefaultRolesIfNone(mockPrisma as never, 't-1', [], []);
      expect(assigned.size).toBe(0);
      expect(mockPrisma.role.findMany).not.toHaveBeenCalled();
    });
  });
});
