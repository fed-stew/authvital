import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

// Isolate the unit: the authorization/sync barrels pull in a module import
// cycle that only bites when loaded outside a full Nest bootstrap. We only
// need the injection tokens here, so stub the barrels.
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

import { LicenseAssignmentService } from '../services/license-assignment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LicensePoolService } from '../services/license-pool.service';
import { AppAccessService } from '../../authorization';
import { SyncEventService } from '../../sync';
import { AuditService } from '../../audit/audit.service';
import { UserAlreadyHasLicenseError } from '../types';

/**
 * Covers M1 (AppAccess folded into the grant/revoke transaction) and
 * M2 (concurrent-race P2002 surfaces as UserAlreadyHasLicenseError, not a 500).
 */
describe('LicenseAssignmentService - grant/revoke atomicity', () => {
  let service: LicenseAssignmentService;

  const tx = {
    appSubscription: { updateMany: jest.fn() },
    licenseAssignment: { create: jest.fn(), delete: jest.fn(), update: jest.fn() },
  };

  const prisma = {
    licenseAssignment: { findUnique: jest.fn() },
    appSubscription: { findUnique: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'a@b.c' }) },
    application: { findUnique: jest.fn().mockResolvedValue({ name: 'App' }) },
    licenseAuditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn((cb: any) => cb(tx)),
  };

  const appAccess = {
    grantAccessTx: jest.fn(),
    revokeAccessTx: jest.fn(),
    dispatchAccessGrantedEvent: jest.fn().mockResolvedValue(undefined),
    dispatchAccessRevokedEvent: jest.fn().mockResolvedValue(undefined),
  };

  const sync = { emit: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  const subscription = {
    id: 'sub1',
    licenseTypeId: 'lt1',
    quantityPurchased: 10,
    quantityAssigned: 0,
    licenseType: { id: 'lt1', name: 'Pro', slug: 'pro', features: {} },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseAssignmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: LicensePoolService, useValue: {} },
        { provide: AppAccessService, useValue: appAccess },
        { provide: SyncEventService, useValue: sync },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(LicenseAssignmentService);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: any) => cb(tx));
    prisma.user.findUnique.mockResolvedValue({ email: 'a@b.c' });
    prisma.application.findUnique.mockResolvedValue({ name: 'App' });
  });

  const arm = () => {
    prisma.licenseAssignment.findUnique.mockResolvedValue(null); // no existing license
    prisma.appSubscription.findUnique.mockResolvedValue(subscription);
    tx.appSubscription.updateMany.mockResolvedValue({ count: 1 });
  };

  const grantInput = {
    tenantId: 't1', userId: 'u1', applicationId: 'app1',
    licenseTypeId: 'lt1', assignedById: 'admin1',
  };

  it('grants the seat AND the entitlement inside one transaction', async () => {
    arm();
    tx.licenseAssignment.create.mockResolvedValue({
      id: 'la1', userId: 'u1', applicationId: 'app1',
      assignedAt: new Date(), assignedById: 'admin1',
      subscription: { licenseTypeId: 'lt1', licenseType: { name: 'Pro', slug: 'pro', features: {} } },
    });
    appAccess.grantAccessTx.mockResolvedValue({ record: {}, shouldDispatch: true });

    await service.grantLicense(grantInput as any);

    // AppAccess write happened with the SAME tx client and the new seat id.
    expect(appAccess.grantAccessTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ licenseAssignmentId: 'la1', applicationId: 'app1' }),
    );
    // Event dispatched only AFTER commit.
    expect(appAccess.dispatchAccessGrantedEvent).toHaveBeenCalledWith(
      expect.objectContaining({ licenseAssignmentId: 'la1' }),
    );
  });

  it('translates a concurrent P2002 into UserAlreadyHasLicenseError (409), not a raw 500', async () => {
    arm();
    tx.licenseAssignment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.grantLicense(grantInput as any)).rejects.toBeInstanceOf(
      UserAlreadyHasLicenseError,
    );
    // No event fired because the txn rolled back.
    expect(appAccess.dispatchAccessGrantedEvent).not.toHaveBeenCalled();
  });

  it('revokes the entitlement inside the same txn as the seat release', async () => {
    prisma.licenseAssignment.findUnique.mockResolvedValue({ id: 'la1', subscriptionId: 'sub1' });
    tx.licenseAssignment.delete.mockResolvedValue({});
    tx.appSubscription.updateMany.mockResolvedValue({ count: 1 });
    appAccess.revokeAccessTx.mockResolvedValue({ record: {}, shouldDispatch: true });

    await service.revokeLicense({ tenantId: 't1', userId: 'u1', applicationId: 'app1' } as any);

    expect(appAccess.revokeAccessTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ tenantId: 't1', userId: 'u1', applicationId: 'app1' }),
    );
    expect(appAccess.dispatchAccessRevokedEvent).toHaveBeenCalled();
  });

  it('emits license.changed on a tier change, with previous -> new type (M3)', async () => {
    prisma.licenseAssignment.findUnique.mockResolvedValue({
      id: 'la1',
      subscriptionId: 'sub1',
      licenseTypeName: 'Standard',
      subscription: { licenseTypeId: 'lt-old', licenseType: { name: 'Standard' } },
    });
    prisma.appSubscription.findUnique.mockResolvedValue({
      id: 'sub2',
      licenseTypeId: 'lt-new',
      quantityPurchased: 10,
      quantityAssigned: 0,
      licenseType: { id: 'lt-new', name: 'Pro' },
    });
    tx.appSubscription.updateMany.mockResolvedValue({ count: 1 });
    tx.licenseAssignment.update.mockResolvedValue({
      id: 'la1', userId: 'u1', applicationId: 'app1',
      assignedAt: new Date(), assignedById: 'admin1',
      subscription: { licenseTypeId: 'lt-new', licenseType: { name: 'Pro', slug: 'pro', features: {} } },
    });

    await service.changeLicenseType({
      tenantId: 't1', userId: 'u1', applicationId: 'app1',
      newLicenseTypeId: 'lt-new', assignedById: 'admin1',
    } as any);

    expect(sync.emit).toHaveBeenCalledWith(
      'license.changed',
      't1',
      'app1',
      expect.objectContaining({
        assignment_id: 'la1',
        sub: 'u1',
        license_type_id: 'lt-new',
        license_type_name: 'Pro',
        previous_license_type_id: 'lt-old',
        previous_license_type_name: 'Standard',
      }),
    );
  });
});
