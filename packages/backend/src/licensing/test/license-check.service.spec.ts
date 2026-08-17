import { Test, TestingModule } from '@nestjs/testing';
import { LicenseCheckService } from '../services/license-check.service';
import { PrismaService } from '../../prisma/prisma.service';

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + 30 * DAY);
const past = () => new Date(Date.now() - DAY);

const mockPrisma = {
  appAccess: { findUnique: jest.fn(), findMany: jest.fn() },
  application: { findUnique: jest.fn(), findMany: jest.fn() },
  licenseAssignment: { findUnique: jest.fn(), findMany: jest.fn() },
  appSubscription: { findFirst: jest.fn(), findMany: jest.fn() },
};

describe('LicenseCheckService - period enforcement (H1)', () => {
  let service: LicenseCheckService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseCheckService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(LicenseCheckService);
    jest.clearAllMocks();
  });

  const armPerSeat = (currentPeriodEnd: Date, status = 'ACTIVE') => {
    mockPrisma.appAccess.findUnique.mockResolvedValue({ status: 'ACTIVE', accessType: 'GRANTED' });
    mockPrisma.application.findUnique.mockResolvedValue({ id: 'app1', name: 'App', licensingMode: 'PER_SEAT' });
    mockPrisma.licenseAssignment.findUnique.mockResolvedValue({
      applicationId: 'app1',
      subscription: {
        status,
        currentPeriodEnd,
        licenseType: { slug: 'pro', name: 'Pro', features: { sso: true } },
      },
    });
  };

  it('DENIES a PER_SEAT seat when the subscription period has ended', async () => {
    armPerSeat(past());
    const result = await service.checkLicense('t1', 'u1', 'app1');
    expect(result.hasLicense).toBe(false);
    expect(result.reason).toMatch(/period has ended/i);
  });

  it('ALLOWS a PER_SEAT seat while the period is still current', async () => {
    armPerSeat(future());
    const result = await service.checkLicense('t1', 'u1', 'app1');
    expect(result.hasLicense).toBe(true);
    expect(result.licenseType).toBe('pro');
  });

  it('bulk check DENIES an expired PER_SEAT subscription', async () => {
    mockPrisma.appAccess.findMany.mockResolvedValue([{ applicationId: 'app1', status: 'ACTIVE' }]);
    mockPrisma.application.findMany.mockResolvedValue([{ id: 'app1', licensingMode: 'PER_SEAT' }]);
    mockPrisma.licenseAssignment.findMany.mockResolvedValue([
      {
        applicationId: 'app1',
        subscription: {
          status: 'ACTIVE',
          currentPeriodEnd: past(),
          licenseType: { slug: 'pro', name: 'Pro', features: {} },
        },
      },
    ]);
    mockPrisma.appSubscription.findMany.mockResolvedValue([]);

    const result = await service.checkLicensesBulk('t1', 'u1', ['app1']);
    expect(result['app1'].hasLicense).toBe(false);
    expect(result['app1'].reason).toMatch(/period has ended/i);
  });

  it('bulk check FREE/TENANT_WIDE query filters on currentPeriodEnd', async () => {
    mockPrisma.appAccess.findMany.mockResolvedValue([{ applicationId: 'app2', status: 'ACTIVE' }]);
    mockPrisma.application.findMany.mockResolvedValue([{ id: 'app2', licensingMode: 'TENANT_WIDE' }]);
    // Expired sub filtered out at the query level → resolves to empty.
    mockPrisma.appSubscription.findMany.mockResolvedValue([]);

    const result = await service.checkLicensesBulk('t1', 'u1', ['app2']);
    expect(result['app2'].hasLicense).toBe(false);
    // Assert the query actually constrained on currentPeriodEnd.
    const where = mockPrisma.appSubscription.findMany.mock.calls[0][0].where;
    expect(where.currentPeriodEnd).toBeDefined();
    expect(where.currentPeriodEnd.gt).toBeInstanceOf(Date);
  });
});
