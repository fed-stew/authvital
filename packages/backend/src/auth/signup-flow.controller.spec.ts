// SignUpService drags in the licensing/authorization module graph, which has
// a circular import that only resolves under Nest's DI (not under a bare jest
// module load). Mock the service deps — the spec only exercises the controller.
jest.mock('./signup.service', () => ({ SignUpService: class MockSignUpService {} }));
jest.mock('./email.service', () => ({ EmailService: class MockEmailService {} }));
jest.mock('./auth.service', () => ({ AuthService: class MockAuthService {} }));
jest.mock('../instance/instance.service', () => ({
  InstanceService: class MockInstanceService {},
}));

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignupFlowController } from './signup-flow.controller';

describe('SignupFlowController — initiateSignup fail-fast on unlaunchable apps', () => {
  const mockPrisma = {
    applicationClient: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    pendingSignup: { upsert: jest.fn() },
    domain: { findFirst: jest.fn() },
  };
  const mockSignUpService = {};
  const mockEmailService = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
  const mockAuthService = {};
  const mockInstanceService = {
    getSignupConfig: jest.fn().mockResolvedValue({ allowSignUp: true }),
  };
  const mockConfigService = {
    get: jest.fn().mockReturnValue('https://idp.example.com'),
  } as unknown as ConfigService;

  let controller: SignupFlowController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInstanceService.getSignupConfig.mockResolvedValue({ allowSignUp: true });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.pendingSignup.upsert.mockResolvedValue({ id: 'ps-1' });
    controller = new SignupFlowController(
      mockPrisma as any,
      mockSignUpService as any,
      mockEmailService as any,
      mockAuthService as any,
      mockInstanceService as any,
      mockConfigService,
    );
  });

  it('rejects BEFORE creating a PendingSignup when the app has no launchable SPA client', async () => {
    mockPrisma.applicationClient.findUnique.mockResolvedValue({
      application: { id: 'app-1', name: 'My App', clients: [] },
    });

    await expect(
      controller.initiateSignup({ email: 'user@gmail.com', clientId: 'client-1' }),
    ).rejects.toThrow(
      'This application is not configured for signup. Please contact the application administrator.',
    );
    expect(mockPrisma.pendingSignup.upsert).not.toHaveBeenCalled();
    expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('rejects an unknown clientId', async () => {
    mockPrisma.applicationClient.findUnique.mockResolvedValue(null);

    await expect(
      controller.initiateSignup({ email: 'user@gmail.com', clientId: 'nope' }),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.pendingSignup.upsert).not.toHaveBeenCalled();
  });

  it('proceeds when the app has a SPA client with an initiateLoginUri', async () => {
    mockPrisma.applicationClient.findUnique.mockResolvedValue({
      application: { id: 'app-1', name: 'My App', clients: [{ id: 'spa-1' }] },
    });

    const result = await controller.initiateSignup({
      email: 'user@gmail.com',
      clientId: 'client-1',
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.pendingSignup.upsert).toHaveBeenCalled();
    expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled();
  });

  it('keeps the direct-IdP path (no clientId) fully functional', async () => {
    const result = await controller.initiateSignup({ email: 'user@gmail.com' });

    expect(result.success).toBe(true);
    expect(mockPrisma.applicationClient.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.pendingSignup.upsert).toHaveBeenCalled();
    expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled();
  });
});
