import { ForbiddenException } from '@nestjs/common';

// The controller transitively imports license-assignment.service, whose
// authorization/sync barrel imports trigger a module cycle when loaded outside
// a full Nest bootstrap. We instantiate the controller with mocks, so stub the
// barrels (same pattern as license-assignment.atomicity.spec).
jest.mock('../../authorization', () => ({
  AppAccessService: class AppAccessService {},
}));
jest.mock('../../sync', () => ({
  SyncEventService: class SyncEventService {},
  SYNC_EVENT_TYPES: {
    APP_ACCESS_REVOKED: 'app_access.revoked',
    LICENSE_CHANGED: 'license.changed',
  },
}));

import { TenantLicensesController } from '../controllers/tenant-licenses.controller';

/**
 * Focuses on the controller's security contract:
 * - tenantId ALWAYS comes from the URL param, never the request body.
 * - subscription-scoped routes reject subscriptions from another tenant (IDOR).
 */
describe('TenantLicensesController', () => {
  const pool = {
    findById: jest.fn(),
    updateQuantity: jest.fn(),
    cancelSubscription: jest.fn(),
  };
  const assignments = { grantLicense: jest.fn() };
  const bulk = { grantLicensesBulk: jest.fn(), revokeLicensesBulk: jest.fn() };
  const usage = { getUsageTrends: jest.fn() };

  let controller: TenantLicensesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TenantLicensesController(
      pool as any,
      assignments as any,
      bulk as any,
      usage as any,
    );
  });

  const req = { user: { sub: 'admin-1' } };

  it('grant forces tenantId from the URL and sets assignedById from the caller', () => {
    controller.grant(
      'url-tenant',
      { userId: 'u1', applicationId: 'app1', licenseTypeId: 'lt1' } as any,
      req,
    );
    expect(assignments.grantLicense).toHaveBeenCalledWith({
      tenantId: 'url-tenant',
      userId: 'u1',
      applicationId: 'app1',
      licenseTypeId: 'lt1',
      assignedById: 'admin-1',
    });
  });

  it('grantBulk injects the URL tenantId into every assignment (ignores any body tenantId)', () => {
    controller.grantBulk(
      'url-tenant',
      {
        assignments: [
          // Attacker tries to smuggle another tenant in the body:
          { userId: 'u1', applicationId: 'app1', licenseTypeId: 'lt1', tenantId: 'evil' } as any,
          { userId: 'u2', applicationId: 'app1', licenseTypeId: 'lt1' } as any,
        ],
      },
      req,
    );
    const passed = bulk.grantLicensesBulk.mock.calls[0][0];
    expect(passed).toHaveLength(2);
    expect(passed.every((a: any) => a.tenantId === 'url-tenant')).toBe(true);
    expect(passed.every((a: any) => a.assignedById === 'admin-1')).toBe(true);
  });

  it('revokeBulk injects the URL tenantId into every revocation', () => {
    controller.revokeBulk('url-tenant', {
      revocations: [{ userId: 'u1', applicationId: 'app1', tenantId: 'evil' } as any],
    });
    const passed = bulk.revokeLicensesBulk.mock.calls[0][0];
    expect(passed[0].tenantId).toBe('url-tenant');
  });

  it('updateQuantity rejects a subscription from another tenant (IDOR)', async () => {
    pool.findById.mockResolvedValue({ id: 'sub1', tenantId: 'other-tenant' });
    await expect(
      controller.updateQuantity('url-tenant', 'sub1', { quantityPurchased: 5 } as any, req),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(pool.updateQuantity).not.toHaveBeenCalled();
  });

  it('updateQuantity proceeds when the subscription belongs to the tenant and threads the actor', async () => {
    pool.findById.mockResolvedValue({ id: 'sub1', tenantId: 'url-tenant' });
    pool.updateQuantity.mockResolvedValue({ id: 'sub1', quantityPurchased: 5 });
    await controller.updateQuantity('url-tenant', 'sub1', { quantityPurchased: 5 } as any, req);
    expect(pool.updateQuantity).toHaveBeenCalledWith('sub1', 5, 'admin-1');
  });

  it('cancel rejects a subscription from another tenant (IDOR)', async () => {
    pool.findById.mockResolvedValue({ id: 'sub1', tenantId: 'other-tenant' });
    await expect(controller.cancel('url-tenant', 'sub1', req)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(pool.cancelSubscription).not.toHaveBeenCalled();
  });
});
