// Heavy transitive deps (jose/uuid are ESM-only; bcrypt is native) — the
// flows under test never reach into these services beyond the mocked methods.
jest.mock('./auth.service', () => ({ AuthService: class MockAuthService {} }));
jest.mock('../oauth/key.service', () => ({ KeyService: class MockKeyService {} }));
jest.mock('../oauth/oauth-session.service', () => ({
  OAuthSessionService: class MockOAuthSessionService {},
}));

import { ConfigService } from '@nestjs/config';
import { AuthFlowService } from './auth-flow.service';

/**
 * Regression guard for the post-login redirect contract.
 *
 * WHY: the hosted login SPA submits credentials via fetch(); the post-login
 * target is often cross-origin (auth host → tenant host). Chrome enforces the
 * CSP `form-action 'self'` directive (Helmet, main.ts) against redirects that
 * follow form submissions and CANCELS them, breaking login. So:
 *   - Content-Type: application/json  → 200 { success: true, redirect_url }
 *     and the SPA navigates itself (window.location.assign).
 *   - urlencoded form posts (legacy/no-JS) → classic 302 the browser follows.
 */
describe('AuthFlowService — login/MFA redirect responses', () => {
  const mockAuthService = {
    login: jest.fn(),
    verifyMfaAndCompleteLogin: jest.fn(),
  };
  const mockPrisma = {
    user: { findUnique: jest.fn() },
    applicationClient: { findUnique: jest.fn() },
  };
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('https://idp.example.com'),
    get: jest.fn().mockReturnValue('https://idp.example.com'),
  } as unknown as ConfigService;

  let service: AuthFlowService;
  let res: { json: jest.Mock; redirect: jest.Mock; cookie: jest.Mock };

  const jsonReq = { headers: { 'content-type': 'application/json' } } as any;
  const formReq = {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthFlowService(
      mockAuthService as any,
      mockPrisma as any,
      {} as any, // oauthSessionService
      {} as any, // keyService
      mockConfigService,
    );
    res = { json: jest.fn(), redirect: jest.fn(), cookie: jest.fn() };
  });

  describe('login()', () => {
    beforeEach(() => {
      mockAuthService.login.mockResolvedValue({
        accessToken: 'access-token',
        user: { id: 'u1' },
      });
    });

    it('JSON request with redirectUri → 200 { success, redirect_url } (no 302)', async () => {
      await service.login(
        { email: 'a@b.co', password: 'pw', redirectUri: '/oauth/authorize?x=1' } as any,
        jsonReq,
        res as any,
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        redirect_url: '/oauth/authorize?x=1',
      });
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('urlencoded form post with redirectUri → keeps the 302 fallback', async () => {
      await service.login(
        { email: 'a@b.co', password: 'pw', redirectUri: '/oauth/authorize?x=1' } as any,
        formReq,
        res as any,
      );

      expect(res.redirect).toHaveBeenCalledWith(302, '/oauth/authorize?x=1');
      expect(res.json).not.toHaveBeenCalled();
    });

    it('still rejects non-relative redirect URIs before responding', async () => {
      await expect(
        service.login(
          { email: 'a@b.co', password: 'pw', redirectUri: '//evil.example' } as any,
          jsonReq,
          res as any,
        ),
      ).rejects.toThrow('Invalid redirect URI');
      expect(res.json).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('single-membership app launch returns the tenant-substituted URL as JSON', async () => {
      mockPrisma.applicationClient.findUnique.mockResolvedValue({
        clientId: 'client-1',
        initiateLoginUri: 'https://{tenant}.example.dev/api/auth/login',
        redirectUris: [],
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        memberships: [{ tenant: { id: 't1', name: 'Acme', slug: 'acme' } }],
      });

      await service.login(
        { email: 'a@b.co', password: 'pw', clientId: 'client-1' } as any,
        jsonReq,
        res as any,
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        redirect_url: 'https://acme.example.dev/api/auth/login',
      });
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  describe('verifyMfa()', () => {
    beforeEach(() => {
      mockAuthService.verifyMfaAndCompleteLogin.mockResolvedValue({
        accessToken: 'access-token',
        user: { id: 'u1', email: 'a@b.co' },
        memberships: [],
      });
    });

    it('JSON request with redirectUri → { success, redirect_url }', async () => {
      await service.verifyMfa(
        { challengeToken: 'ct', code: '123456', redirectUri: '/oauth/authorize?y=2' },
        jsonReq,
        res as any,
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        redirect_url: '/oauth/authorize?y=2',
      });
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('urlencoded form post with redirectUri → keeps the 302 fallback', async () => {
      await service.verifyMfa(
        { challengeToken: 'ct', code: '123456', redirectUri: '/oauth/authorize?y=2' },
        formReq,
        res as any,
      );

      expect(res.redirect).toHaveBeenCalledWith(302, '/oauth/authorize?y=2');
      expect(res.json).not.toHaveBeenCalled();
    });

    it('no redirect resolved → existing JSON success shape is unchanged', async () => {
      // clientId present but the app is unknown and the user has zero
      // memberships → no redirectUrl → token payload comes back as before.
      mockPrisma.applicationClient.findUnique.mockResolvedValue(null);

      const result = await service.verifyMfa(
        { challengeToken: 'ct', code: '123456', clientId: 'ghost-app' },
        jsonReq,
        res as any,
      );

      expect(result).toMatchObject({
        success: true,
        access_token: 'access-token',
        user: { id: 'u1', email: 'a@b.co' },
        memberships: [],
      });
      expect(res.json).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });
});
