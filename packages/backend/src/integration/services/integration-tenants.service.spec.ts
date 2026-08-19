import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IntegrationTenantsService } from './integration-tenants.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InstanceService } from '../../instance/instance.service';

const mockPrisma = {
  applicationClient: { findUnique: jest.fn() },
  membership: { findMany: jest.fn() },
};

const mockInstanceService = {
  getBrandingConfig: jest.fn().mockResolvedValue({ initiateLoginUri: null }),
};

const CLIENT = {
  clientId: 'client-abc',
  application: { id: 'app-1', name: 'My App' },
};

const membershipRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'm-1',
  status: 'ACTIVE',
  joinedAt: new Date('2024-01-01T00:00:00Z'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  user: { id: 'user-1', email: 'u1@example.com', givenName: 'U', familyName: 'One' },
  tenant: { id: 't-1', name: 'Tenant One', slug: 'tenant-one', initiateLoginUri: null },
  membershipRoles: [{ role: { id: 'r-1', name: 'Editor', slug: 'editor' } }],
  ...overrides,
});

describe('IntegrationTenantsService - getApplicationMemberships', () => {
  let service: IntegrationTenantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationTenantsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InstanceService, useValue: mockInstanceService },
      ],
    }).compile();
    service = module.get(IntegrationTenantsService);
    jest.clearAllMocks();
    mockInstanceService.getBrandingConfig.mockResolvedValue({ initiateLoginUri: null });
    mockPrisma.applicationClient.findUnique.mockResolvedValue(CLIENT);
  });

  it('throws NotFoundException for an unknown clientId', async () => {
    mockPrisma.applicationClient.findUnique.mockResolvedValue(null);
    await expect(service.getApplicationMemberships('nope')).rejects.toThrow(NotFoundException);
  });

  it('filters by userId when provided (other users excluded server-side)', async () => {
    mockPrisma.membership.findMany.mockResolvedValue([membershipRow()]);

    const result = await service.getApplicationMemberships('client-abc', { userId: 'user-1' });

    expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          membershipRoles: { some: { role: { applicationId: 'app-1' } } },
        }),
      }),
    );
    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0].user.id).toBe('user-1');
    expect(result.totalCount).toBe(1);
  });

  it('does NOT constrain userId when omitted (all users with app roles)', async () => {
    mockPrisma.membership.findMany.mockResolvedValue([
      membershipRow(),
      membershipRow({
        id: 'm-2',
        user: { id: 'user-2', email: 'u2@example.com', givenName: 'U', familyName: 'Two' },
      }),
    ]);

    const result = await service.getApplicationMemberships('client-abc');

    const where = mockPrisma.membership.findMany.mock.calls[0][0].where;
    expect(where.userId).toBeUndefined();
    expect(result.totalCount).toBe(2);
  });

  it('combines userId with tenantId and status filters, keeping role scoping', async () => {
    mockPrisma.membership.findMany.mockResolvedValue([]);

    await service.getApplicationMemberships('client-abc', {
      userId: 'user-1',
      tenantId: 't-1',
      status: 'ACTIVE',
    });

    expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          membershipRoles: { some: { role: { applicationId: 'app-1' } } },
          status: 'ACTIVE',
          tenantId: 't-1',
          userId: 'user-1',
        },
      }),
    );
  });

  it('returns the nested wire shape (user + tenant + roles) with initiateLoginUri built', async () => {
    mockInstanceService.getBrandingConfig.mockResolvedValue({
      initiateLoginUri: 'https://login.example.com/{tenant}',
    });
    mockPrisma.membership.findMany.mockResolvedValue([membershipRow()]);

    const result = await service.getApplicationMemberships('client-abc', { userId: 'user-1' });

    expect(result.applicationId).toBe('app-1');
    expect(result.applicationName).toBe('My App');
    expect(result.clientId).toBe('client-abc');
    expect(result.memberships[0]).toMatchObject({
      id: 'm-1',
      status: 'ACTIVE',
      user: { id: 'user-1', email: 'u1@example.com' },
      tenant: {
        id: 't-1',
        slug: 'tenant-one',
        initiateLoginUri: 'https://login.example.com/tenant-one',
      },
      roles: [{ id: 'r-1', name: 'Editor', slug: 'editor' }],
    });
  });
});
