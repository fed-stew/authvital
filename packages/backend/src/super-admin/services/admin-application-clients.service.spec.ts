import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminApplicationClientsService } from './admin-application-clients.service';

describe('AdminApplicationClientsService — initiateLoginUri guards', () => {
  const mockPrisma = {
    applicationClient: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    application: { findUnique: jest.fn() },
  };

  const mockConfigService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  let service: AdminApplicationClientsService;

  const spaInput = (initiateLoginUri?: string) => ({
    type: 'SPA' as const,
    redirectUris: ['https://app.example.com/callback'],
    ...(initiateLoginUri ? { initiateLoginUri } : {}),
  });

  const clientRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'row-1',
    applicationId: 'app-1',
    clientId: 'client-1',
    type: 'SPA',
    clientSecret: null,
    redirectUris: ['https://app.example.com/callback'],
    postLogoutRedirectUris: [],
    allowedWebOrigins: [],
    initiateLoginUri: 'https://app.example.com/api/auth/login',
    accessTokenTtl: 900,
    refreshTokenTtl: 2592000,
    m2mTrustedAllTenants: false,
    m2mAllowedScopes: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (mockConfigService.get as jest.Mock).mockReturnValue('https://idp.example.com');
    service = new AdminApplicationClientsService(mockPrisma as any, mockConfigService);
    mockPrisma.applicationClient.create.mockImplementation(({ data }: any) =>
      Promise.resolve(clientRow(data)),
    );
    mockPrisma.applicationClient.update.mockImplementation(({ data }: any) =>
      Promise.resolve(clientRow(data)),
    );
  });

  describe('create (createClientRow)', () => {
    it('rejects an initiateLoginUri on the exact IdP host', async () => {
      await expect(
        service.createClientRow('app-1', spaInput('https://idp.example.com/api/auth/login')),
      ).rejects.toThrow(
        "initiateLoginUri must point to your application's host, not the AuthVital instance itself",
      );
      expect(mockPrisma.applicationClient.create).not.toHaveBeenCalled();
    });

    it('accepts an initiateLoginUri on the application host', async () => {
      await expect(
        service.createClientRow('app-1', spaInput('https://app.example.com/api/auth/login')),
      ).resolves.toBeDefined();
    });

    it('accepts a {tenant} placeholder host', async () => {
      await expect(
        service.createClientRow('app-1', spaInput('https://{tenant}.myapp.example.com/api/auth/login')),
      ).resolves.toBeDefined();
    });

    it('accepts a subdomain of the IdP host (sibling apps are legitimate)', async () => {
      await expect(
        service.createClientRow('app-1', spaInput('https://portal.idp.example.com/api/auth/login')),
      ).resolves.toBeDefined();
    });

    it('does not reject when BASE_URL is unset', async () => {
      (mockConfigService.get as jest.Mock).mockReturnValue(undefined);
      await expect(
        service.createClientRow('app-1', spaInput('https://idp.example.com/api/auth/login')),
      ).resolves.toBeDefined();
    });
  });

  describe('updateClient', () => {
    beforeEach(() => {
      mockPrisma.applicationClient.findUnique.mockResolvedValue(clientRow());
    });

    it('rejects setting an initiateLoginUri on the exact IdP host', async () => {
      await expect(
        service.updateClient('app-1', 'client-1', {
          initiateLoginUri: 'https://idp.example.com/api/auth/login',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.applicationClient.update).not.toHaveBeenCalled();
    });

    it('accepts setting an initiateLoginUri on the application host', async () => {
      await expect(
        service.updateClient('app-1', 'client-1', {
          initiateLoginUri: 'https://other.example.com/api/auth/login',
        }),
      ).resolves.toBeDefined();
    });

    it('blocks clearing initiateLoginUri while the app participates in signup', async () => {
      mockPrisma.application.findUnique.mockResolvedValue({ autoProvisionOnSignup: true });
      await expect(
        service.updateClient('app-1', 'client-1', { initiateLoginUri: null }),
      ).rejects.toThrow(/signup enabled/i);
      expect(mockPrisma.applicationClient.update).not.toHaveBeenCalled();
    });

    it('allows clearing initiateLoginUri when signup participation is disabled', async () => {
      mockPrisma.application.findUnique.mockResolvedValue({ autoProvisionOnSignup: false });
      await expect(
        service.updateClient('app-1', 'client-1', { initiateLoginUri: null }),
      ).resolves.toBeDefined();
    });
  });
});
