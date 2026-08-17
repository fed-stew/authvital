import { ForbiddenException } from '@nestjs/common';
import { MfaComplianceGuard } from './mfa-compliance.guard';

describe('MfaComplianceGuard', () => {
  const mockMfaService = {
    checkUserMfaCompliance: jest.fn(),
  };

  const createContext = (user?: Record<string, unknown>, tenantId?: string) => {
    const request: any = {
      user,
      params: tenantId ? { tenantId } : {},
      body: {},
      query: {},
    };

    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as any,
    };
  };

  const nowSec = Math.floor(Date.now() / 1000);

  let guard: MfaComplianceGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new MfaComplianceGuard(mockMfaService as any);
  });

  it('passes when there is no authenticated user (other guards own auth)', async () => {
    const { context } = createContext(undefined, 'tenant-1');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMfaService.checkUserMfaCompliance).not.toHaveBeenCalled();
  });

  it('passes when there is no tenant context', async () => {
    const { context } = createContext({ id: 'user-1' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMfaService.checkUserMfaCompliance).not.toHaveBeenCalled();
  });

  describe('fast path (verified JWT claims, no DB hit)', () => {
    it("passes without a DB hit when amr includes 'otp'", async () => {
      const { context } = createContext(
        { id: 'user-1', amr: ['pwd', 'otp'] },
        'tenant-1',
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(mockMfaService.checkUserMfaCompliance).not.toHaveBeenCalled();
    });

    it('passes without a DB hit when a still-valid grace claim matches the token tenant', async () => {
      const { context } = createContext(
        {
          id: 'user-1',
          amr: ['pwd'],
          mfa_grace_expires_at: nowSec + 3600,
          tenant_id: 'tenant-1',
        },
        'tenant-1',
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(mockMfaService.checkUserMfaCompliance).not.toHaveBeenCalled();
    });

    it('ignores an EXPIRED grace claim and falls back to the DB check', async () => {
      mockMfaService.checkUserMfaCompliance.mockResolvedValue({
        compliant: true,
        withinGrace: false,
      });
      const { context } = createContext(
        {
          id: 'user-1',
          amr: ['pwd'],
          mfa_grace_expires_at: nowSec - 60,
          tenant_id: 'tenant-1',
        },
        'tenant-1',
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(mockMfaService.checkUserMfaCompliance).toHaveBeenCalledWith(
        'user-1',
        'tenant-1',
      );
    });

    it("ignores a grace claim minted for a DIFFERENT tenant (no cross-tenant bypass)", async () => {
      mockMfaService.checkUserMfaCompliance.mockResolvedValue({
        compliant: false,
        withinGrace: false,
        requiresSetup: true,
        mfaEnabled: false,
      });
      const { context } = createContext(
        {
          id: 'user-1',
          amr: ['pwd'],
          mfa_grace_expires_at: nowSec + 3600,
          tenant_id: 'tenant-OTHER',
        },
        'tenant-1',
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockMfaService.checkUserMfaCompliance).toHaveBeenCalledWith(
        'user-1',
        'tenant-1',
      );
    });
  });

  describe('DB fallback (org-less/legacy tokens without MFA claims)', () => {
    it('passes when the DB check says compliant', async () => {
      mockMfaService.checkUserMfaCompliance.mockResolvedValue({
        compliant: true,
        withinGrace: false,
      });
      const { context, request } = createContext({ id: 'user-1' }, 'tenant-1');
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.mfaCompliance).toEqual({
        compliant: true,
        withinGrace: false,
      });
    });

    it('passes when non-compliant but within the grace window', async () => {
      mockMfaService.checkUserMfaCompliance.mockResolvedValue({
        compliant: false,
        withinGrace: true,
        gracePeriodEndsAt: new Date(Date.now() + 86400_000),
      });
      const { context } = createContext({ id: 'user-1' }, 'tenant-1');
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('throws mfa_required when non-compliant and outside grace', async () => {
      const gracePeriodEndsAt = new Date(Date.now() - 86400_000);
      mockMfaService.checkUserMfaCompliance.mockResolvedValue({
        compliant: false,
        withinGrace: false,
        requiresSetup: true,
        mfaEnabled: false,
        message: 'MFA is required to access this organization.',
        gracePeriodEndsAt,
      });
      const { context } = createContext({ id: 'user-1' }, 'tenant-1');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new ForbiddenException({
          error: 'mfa_required',
          message: 'MFA is required to access this organization.',
          requiresSetup: true,
          mfaEnabled: false,
          gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
        }),
      );
    });
  });
});
