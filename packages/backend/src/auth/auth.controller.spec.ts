import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';

describe('AuthController — GET /auth/login fallback', () => {
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('https://idp.example.com'),
    get: jest.fn().mockReturnValue('https://idp.example.com'),
  } as unknown as ConfigService;

  let controller: AuthController;
  let res: { redirect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(
      {} as any, // authService
      {} as any, // authFlowService
      {} as any, // prisma
      {} as any, // mfaService
      {} as any, // oauthSessionService
      {} as any, // keyService
      mockConfigService,
    );
    res = { redirect: jest.fn() };
  });

  it('302s a bare GET to the hosted login page instead of a JSON 404', () => {
    const req = { originalUrl: '/api/auth/login' } as any;

    controller.loginPage(req, res as any);

    expect(res.redirect).toHaveBeenCalledWith(302, '/auth/login');
  });

  it('preserves the incoming query string across the redirect', () => {
    const req = {
      originalUrl: '/api/auth/login?tenant=acme&redirect_uri=%2Foauth%2Fauthorize',
    } as any;

    controller.loginPage(req, res as any);

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      '/auth/login?tenant=acme&redirect_uri=%2Foauth%2Fauthorize',
    );
  });
});

describe('AuthController — logout revocation', () => {
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('https://idp.example.com'),
    get: jest.fn().mockReturnValue('https://idp.example.com'),
  } as unknown as ConfigService;

  const mockOauthSessionService = {
    verifyRefreshTokenJwt: jest.fn(),
    revokeSession: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    revokeAllUserSessions: jest.fn().mockResolvedValue({ success: true, count: 2 }),
  };

  const mockPrisma = {
    applicationClient: { findMany: jest.fn().mockResolvedValue([]) },
  };

  let controller: AuthController;
  let res: {
    clearCookie: jest.Mock;
    redirect: jest.Mock;
    setHeader: jest.Mock;
    send: jest.Mock;
  };

  const buildReq = (overrides: Record<string, unknown> = {}) =>
    ({
      cookies: {},
      ...overrides,
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(
      {} as any, // authService
      {} as any, // authFlowService
      mockPrisma as any,
      {} as any, // mfaService
      mockOauthSessionService as any,
      {} as any, // keyService
      mockConfigService,
    );
    res = {
      clearCookie: jest.fn(),
      redirect: jest.fn(),
      setHeader: jest.fn(),
      send: jest.fn(),
    };
  });

  describe('POST /auth/logout', () => {
    it('revokes the session behind the refresh_token cookie with reason LOGOUT', async () => {
      mockOauthSessionService.verifyRefreshTokenJwt.mockResolvedValue({
        sid: 'sid-1',
        sub: 'u1',
        aud: 'client-1',
        scope: 'openid',
      });

      const result = await controller.logout(
        buildReq({ cookies: { refresh_token: 'refresh-jwt' } }),
        res as any,
      );

      expect(mockOauthSessionService.revokeSession).toHaveBeenCalledWith(
        'sid-1',
        'LOGOUT',
      );
      // Response shape stays backward compatible.
      expect(result).toEqual({
        success: true,
        redirect_uri: null,
        loggedUser: null,
      });
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', expect.anything());
    });

    it('tolerates an invalid refresh_token cookie silently (still clears cookies)', async () => {
      mockOauthSessionService.verifyRefreshTokenJwt.mockRejectedValue(
        new Error('bad token'),
      );

      const result = await controller.logout(
        buildReq({ cookies: { refresh_token: 'garbage' } }),
        res as any,
      );

      expect(mockOauthSessionService.revokeSession).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(res.clearCookie).toHaveBeenCalledTimes(3);
    });

    it('skips revocation entirely when no refresh_token cookie is present', async () => {
      const result = await controller.logout(buildReq(), res as any);

      expect(mockOauthSessionService.verifyRefreshTokenJwt).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('everywhere: true revokes ALL of the authenticated user\'s sessions with reason LOGOUT', async () => {
      await controller.logout(
        buildReq({ user: { id: 'u1', email: 'u@example.com' } }),
        res as any,
        undefined,
        true,
      );

      expect(mockOauthSessionService.revokeAllUserSessions).toHaveBeenCalledWith(
        'u1',
        undefined,
        'LOGOUT',
      );
    });

    it('everywhere: true is a no-op for anonymous callers', async () => {
      await controller.logout(buildReq(), res as any, undefined, true);

      expect(mockOauthSessionService.revokeAllUserSessions).not.toHaveBeenCalled();
    });
  });

  describe('GET /auth/logout/redirect', () => {
    it('revokes the cookie session and redirects to a registered origin', async () => {
      mockOauthSessionService.verifyRefreshTokenJwt.mockResolvedValue({
        sid: 'sid-9',
        sub: 'u1',
        aud: 'client-1',
        scope: 'openid',
      });
      mockPrisma.applicationClient.findMany.mockResolvedValue([
        {
          redirectUris: ['https://app.example.com/callback'],
          postLogoutRedirectUris: [],
          initiateLoginUri: null,
        },
      ]);

      await controller.logoutRedirect(
        'https://app.example.com/goodbye',
        buildReq({ cookies: { refresh_token: 'refresh-jwt' } }),
        res as any,
      );

      expect(mockOauthSessionService.revokeSession).toHaveBeenCalledWith(
        'sid-9',
        'LOGOUT',
      );
      expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/goodbye');
    });

    it('matches a {tenant} placeholder registered on initiateLoginUri', async () => {
      mockPrisma.applicationClient.findMany.mockResolvedValue([
        {
          redirectUris: [],
          postLogoutRedirectUris: [],
          initiateLoginUri: 'https://{tenant}.myapp.io/api/auth/login',
        },
      ]);

      await controller.logoutRedirect(
        'https://acme.myapp.io/logged-out',
        buildReq(),
        res as any,
      );

      expect(res.redirect).toHaveBeenCalledWith('https://acme.myapp.io/logged-out');
    });

    it('falls through to the generic page for unregistered origins', async () => {
      mockPrisma.applicationClient.findMany.mockResolvedValue([
        {
          redirectUris: ['https://app.example.com/callback'],
          postLogoutRedirectUris: [],
          initiateLoginUri: null,
        },
      ]);

      await controller.logoutRedirect(
        'https://evil.com/phish',
        buildReq(),
        res as any,
      );

      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalled();
    });

    it('still allows localhost dev origins with nothing registered', async () => {
      mockPrisma.applicationClient.findMany.mockResolvedValue([]);

      await controller.logoutRedirect(
        'http://localhost:3000/bye',
        buildReq(),
        res as any,
      );

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/bye');
    });
  });
});
