import { Test, TestingModule } from '@nestjs/testing';
import { AccessStatus, AccessType } from '@prisma/client';
import { AppAccessService } from './app-access.service';
import { AppAccessAutoGrantService } from './app-access-auto-grant.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemWebhookService } from '../webhooks/system-webhook.service';

const mockPrisma = {
  appAccess: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  application: { findUnique: jest.fn() },
  tenant: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
};

const mockWebhooks = { dispatch: jest.fn() };

const mockAutoGrant = {
  assignDefaultRolesIfNone: jest.fn().mockResolvedValue(new Map()),
};

const INPUT = { tenantId: 't-1', userId: 'user-1', applicationId: 'app-1' };

const createdRecord = {
  id: 'aa-1',
  ...INPUT,
  accessType: AccessType.GRANTED,
  status: AccessStatus.ACTIVE,
};

describe('AppAccessService - grantAccess default role opt-in', () => {
  let service: AppAccessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppAccessService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SystemWebhookService, useValue: mockWebhooks },
        { provide: AppAccessAutoGrantService, useValue: mockAutoGrant },
      ],
    }).compile();
    service = module.get(AppAccessService);
    jest.clearAllMocks();

    mockAutoGrant.assignDefaultRolesIfNone.mockResolvedValue(new Map());
    mockPrisma.appAccess.findUnique.mockResolvedValue(null);
    mockPrisma.appAccess.create.mockResolvedValue(createdRecord);
    mockPrisma.application.findUnique.mockResolvedValue({ name: 'App', slug: 'app' });
    mockPrisma.tenant.findUnique.mockResolvedValue({ slug: 'tenant' });
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'u@example.com' });
  });

  it('does NOT touch roles by default (explicit-role callers unaffected)', async () => {
    await service.grantAccess({ ...INPUT });

    expect(mockPrisma.appAccess.create).toHaveBeenCalled();
    expect(mockAutoGrant.assignDefaultRolesIfNone).not.toHaveBeenCalled();
  });

  it('assigns the default role when assignDefaultRole is set', async () => {
    await service.grantAccess({ ...INPUT, assignDefaultRole: true });

    expect(mockAutoGrant.assignDefaultRolesIfNone).toHaveBeenCalledWith(
      mockPrisma,
      't-1',
      ['user-1'],
      ['app-1'],
    );
  });

  it('joins the caller-managed transaction in grantAccessTx', async () => {
    const tx = {
      appAccess: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(createdRecord) },
    };

    await service.grantAccessTx(tx as never, { ...INPUT, assignDefaultRole: true });

    // Role assignment must use the SAME tx, never the root client.
    expect(mockAutoGrant.assignDefaultRolesIfNone).toHaveBeenCalledWith(tx, 't-1', ['user-1'], ['app-1']);
  });

  it('still assigns the default role on an idempotent re-grant (existing active access)', async () => {
    mockPrisma.appAccess.findUnique.mockResolvedValue({ ...createdRecord, status: AccessStatus.ACTIVE });

    await service.grantAccess({ ...INPUT, assignDefaultRole: true });

    expect(mockPrisma.appAccess.create).not.toHaveBeenCalled();
    expect(mockAutoGrant.assignDefaultRolesIfNone).toHaveBeenCalled();
  });
});
