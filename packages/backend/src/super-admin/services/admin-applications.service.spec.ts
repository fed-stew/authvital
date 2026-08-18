import { BadRequestException } from '@nestjs/common';
import { AdminApplicationsService } from './admin-applications.service';

describe('AdminApplicationsService — signup participation guards', () => {
  const mockPrisma = {
    application: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    applicationClient: {
      findFirst: jest.fn(),
    },
    licenseType: { findUnique: jest.fn() },
  };
  const mockRolesService = {};
  const mockClientsService = { toPublicClient: jest.fn((c: any) => c) };
  const mockSystemWebhookService = { dispatch: jest.fn().mockResolvedValue(undefined) };

  let service: AdminApplicationsService;

  const existingApp = {
    id: 'app-1',
    name: 'My App',
    slug: 'my-app',
    isActive: true,
    autoProvisionOnSignup: false,
    defaultLicenseTypeId: 'lt-1',
    accessMode: 'AUTOMATIC',
    licensingMode: 'FREE',
    webhookUrl: null,
    webhookEnabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminApplicationsService(
      mockPrisma as any,
      mockRolesService as any,
      mockClientsService as any,
      mockSystemWebhookService as any,
    );
  });

  describe('createApplication', () => {
    it('rejects enabling signup without a SPA credential', async () => {
      await expect(
        service.createApplication({
          name: 'New App',
          autoProvisionOnSignup: true,
          defaultLicenseTypeId: 'lt-1',
        }),
      ).rejects.toThrow(
        "Configure an Initiate Login URI on the application's SPA credential before enabling signup",
      );
    });

    it('rejects enabling signup when the SPA credential has no initiateLoginUri', async () => {
      await expect(
        service.createApplication({
          name: 'New App',
          autoProvisionOnSignup: true,
          defaultLicenseTypeId: 'lt-1',
          client: { type: 'SPA', redirectUris: ['https://app.example.com/cb'] },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateApplication', () => {
    beforeEach(() => {
      // First findUnique loads the container; the post-update reload also uses
      // findUnique, so return an includes-shaped row on every call.
      mockPrisma.application.findUnique.mockResolvedValue({
        ...existingApp,
        clients: [],
        roles: [],
        licenseTypes: [],
      });
      mockPrisma.application.update.mockResolvedValue(existingApp);
    });

    it('rejects enabling signup when no SPA client has an initiateLoginUri', async () => {
      mockPrisma.applicationClient.findFirst.mockResolvedValue(null);

      await expect(
        service.updateApplication('app-1', { autoProvisionOnSignup: true }),
      ).rejects.toThrow(
        "Configure an Initiate Login URI on the application's SPA credential before enabling signup",
      );
      expect(mockPrisma.applicationClient.findFirst).toHaveBeenCalledWith({
        where: { applicationId: 'app-1', type: 'SPA', initiateLoginUri: { not: null } },
        select: { id: true },
      });
      expect(mockPrisma.application.update).not.toHaveBeenCalled();
    });

    it('allows enabling signup when a SPA client has an initiateLoginUri', async () => {
      mockPrisma.applicationClient.findFirst.mockResolvedValue({ id: 'spa-1' });

      await expect(
        service.updateApplication('app-1', { autoProvisionOnSignup: true }),
      ).resolves.toBeDefined();
      expect(mockPrisma.application.update).toHaveBeenCalled();
    });

    it('does not re-check when signup participation is already enabled', async () => {
      mockPrisma.application.findUnique.mockResolvedValue({
        ...existingApp,
        autoProvisionOnSignup: true,
        clients: [],
        roles: [],
        licenseTypes: [],
      });

      await expect(
        service.updateApplication('app-1', { autoProvisionOnSignup: true }),
      ).resolves.toBeDefined();
      expect(mockPrisma.applicationClient.findFirst).not.toHaveBeenCalled();
    });
  });
});
