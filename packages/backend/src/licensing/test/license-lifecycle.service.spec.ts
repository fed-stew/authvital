import { Test, TestingModule } from '@nestjs/testing';
import { LicenseLifecycleService } from '../services/license-lifecycle.service';
import { LicensePoolService } from '../services/license-pool.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('LicenseLifecycleService', () => {
  let service: LicenseLifecycleService;

  const prisma = {
    appSubscription: { findMany: jest.fn(), update: jest.fn() },
    licenseAssignment: { groupBy: jest.fn() },
    tenantLicenseUsageSnapshot: { upsert: jest.fn() },
  };
  const pool = { expireSubscription: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseLifecycleService,
        { provide: PrismaService, useValue: prisma },
        { provide: LicensePoolService, useValue: pool },
      ],
    }).compile();
    service = module.get(LicenseLifecycleService);
    jest.clearAllMocks();
  });

  describe('expireOverdueSubscriptions', () => {
    it('expires every overdue subscription and returns their ids', async () => {
      prisma.appSubscription.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      pool.expireSubscription.mockResolvedValue({});

      const ids = await service.expireOverdueSubscriptions(new Date());

      expect(pool.expireSubscription).toHaveBeenCalledTimes(2);
      expect(ids).toEqual(['s1', 's2']);
    });

    it('is resilient: one failing subscription does not abort the sweep', async () => {
      prisma.appSubscription.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      pool.expireSubscription
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({});

      const ids = await service.expireOverdueSubscriptions(new Date());

      expect(ids).toEqual(['s2']); // s1 failed and was skipped
    });
  });

  describe('reconcileAssignedCounts', () => {
    it('corrects only drifted counters', async () => {
      prisma.appSubscription.findMany.mockResolvedValue([
        { id: 's1', quantityAssigned: 5 }, // matches actual → no update
        { id: 's2', quantityAssigned: 2 }, // actual 0 → corrected
      ]);
      prisma.licenseAssignment.groupBy.mockResolvedValue([
        { subscriptionId: 's1', _count: { _all: 5 } },
      ]);

      const result = await service.reconcileAssignedCounts();

      expect(prisma.appSubscription.update).toHaveBeenCalledTimes(1);
      expect(prisma.appSubscription.update).toHaveBeenCalledWith({
        where: { id: 's2' },
        data: { quantityAssigned: 0 },
      });
      expect(result.checked).toBe(2);
      expect(result.corrected).toEqual([{ subscriptionId: 's2', from: 2, to: 0 }]);
    });
  });

  it('runSweep composes expiry + reconciliation + snapshots into one summary', async () => {
    prisma.appSubscription.findMany
      .mockResolvedValueOnce([{ id: 's1' }]) // expire query
      .mockResolvedValueOnce([{ id: 's1', quantityAssigned: 0 }]) // reconcile query
      .mockResolvedValueOnce([
        {
          id: 's1',
          tenantId: 't1',
          applicationId: 'a1',
          licenseTypeId: 'lt1',
          quantityPurchased: 10,
          quantityAssigned: 3,
          application: { name: 'App' },
          licenseType: { name: 'Pro' },
        },
      ]); // snapshot query
    pool.expireSubscription.mockResolvedValue({});
    prisma.licenseAssignment.groupBy.mockResolvedValue([]);
    prisma.tenantLicenseUsageSnapshot.upsert.mockResolvedValue({});

    const result = await service.runSweep();

    expect(result.expiredSubscriptionIds).toEqual(['s1']);
    expect(result.subscriptionsChecked).toBe(1);
    expect(result.reconciled).toEqual([]); // 0 == 0, no drift
    expect(result.snapshotsWritten).toBe(1);
    expect(prisma.tenantLicenseUsageSnapshot.upsert).toHaveBeenCalledTimes(1);
  });
});
