import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LicensePoolService } from '../services/license-pool.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemWebhookService } from '../../webhooks/system-webhook.service';
import { LicenseCapacityService } from '../services/license-capacity.service';
import { AuditService } from '../../audit/audit.service';

describe('LicensePoolService - expiry (H3) & provision guard (H4)', () => {
  let service: LicensePoolService;

  const tx = {
    licenseAssignment: { findMany: jest.fn(), deleteMany: jest.fn() },
    appAccess: { updateMany: jest.fn() },
    appSubscription: { update: jest.fn() },
  };

  const prisma = {
    tenant: { findUnique: jest.fn() },
    application: { findUnique: jest.fn() },
    licenseType: { findFirst: jest.fn() },
    appSubscription: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicensePoolService,
        { provide: PrismaService, useValue: prisma },
        { provide: SystemWebhookService, useValue: { dispatch: jest.fn().mockResolvedValue(undefined) } },
        { provide: LicenseCapacityService, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();
    service = module.get(LicensePoolService);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: any) => cb(tx));
  });

  describe('expireSubscription (H3)', () => {
    it('revokes the AppAccess tied to seats before deleting assignments', async () => {
      tx.licenseAssignment.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      tx.appAccess.updateMany.mockResolvedValue({ count: 2 });
      tx.licenseAssignment.deleteMany.mockResolvedValue({ count: 2 });
      tx.appSubscription.update.mockResolvedValue({ id: 'sub1', status: 'EXPIRED' });

      await service.expireSubscription('sub1');

      expect(tx.appAccess.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            licenseAssignmentId: { in: ['a1', 'a2'] },
            status: 'ACTIVE',
          }),
          data: expect.objectContaining({ status: 'REVOKED' }),
        }),
      );
      expect(tx.licenseAssignment.deleteMany).toHaveBeenCalledWith({ where: { subscriptionId: 'sub1' } });
      expect(tx.appSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED', quantityAssigned: 0 }) }),
      );
    });

    it('skips AppAccess/assignment deletes when there are no seats, still expires', async () => {
      tx.licenseAssignment.findMany.mockResolvedValue([]);
      tx.appSubscription.update.mockResolvedValue({ id: 'sub1', status: 'EXPIRED' });

      await service.expireSubscription('sub1');

      expect(tx.appAccess.updateMany).not.toHaveBeenCalled();
      expect(tx.licenseAssignment.deleteMany).not.toHaveBeenCalled();
      expect(tx.appSubscription.update).toHaveBeenCalled();
    });
  });

  describe('provisionSubscription (H4)', () => {
    const baseArrange = (quantityAssigned: number) => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't1' });
      prisma.application.findUnique.mockResolvedValue({ id: 'app1', name: 'App', accessMode: 'ENABLED' });
      prisma.appSubscription.findFirst.mockResolvedValue({ id: 'sub1' });
      prisma.licenseType.findFirst.mockResolvedValue({ id: 'lt1', name: 'Pro' });
      prisma.appSubscription.findUnique.mockResolvedValue({ quantityAssigned });
    };

    it('rejects setting quantity below already-assigned seats', async () => {
      baseArrange(8);
      await expect(
        service.provisionSubscription({
          tenantId: 't1',
          applicationId: 'app1',
          licenseTypeId: 'lt1',
          quantityPurchased: 5,
          currentPeriodEnd: new Date(Date.now() + 1000),
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appSubscription.upsert).not.toHaveBeenCalled();
    });

    it('allows setting quantity at or above assigned seats', async () => {
      baseArrange(8);
      prisma.appSubscription.upsert.mockResolvedValue({
        id: 'sub1',
        application: { id: 'app1', name: 'App', slug: 'app' },
        licenseType: { id: 'lt1', name: 'Pro' },
        status: 'ACTIVE',
      });

      await service.provisionSubscription({
        tenantId: 't1',
        applicationId: 'app1',
        licenseTypeId: 'lt1',
        quantityPurchased: 10,
        currentPeriodEnd: new Date(Date.now() + 1000),
      } as any);

      expect(prisma.appSubscription.upsert).toHaveBeenCalled();
    });
  });
});
