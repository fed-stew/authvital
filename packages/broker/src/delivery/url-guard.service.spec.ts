import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UrlGuardService } from './url-guard.service';

describe('UrlGuardService', () => {
  const mockConfig = { get: jest.fn() };

  function makeGuard(env: Record<string, string | undefined>): UrlGuardService {
    mockConfig.get.mockImplementation((key: string) => env[key]);
    return new UrlGuardService(mockConfig as unknown as ConfigService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // isPrivateAddress matrix
  // ===========================================================================

  describe('isPrivateAddress', () => {
    const privateAddresses = [
      // IPv4 ranges from the spec
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
      '127.0.0.1',
      '127.53.1.2',
      '169.254.169.254', // cloud metadata
      '169.254.0.1',
      '0.0.0.0',
      // IPv6
      '::1',
      '::',
      'fc00::1', // ULA fc00::/7
      'fd12:3456::1', // ULA fd..
      'fe80::1', // link-local
      'febf::1', // still fe80::/10
      '::ffff:10.0.0.1', // IPv4-mapped private
      '::ffff:127.0.0.1',
    ];

    const publicAddresses = [
      '8.8.8.8',
      '1.1.1.1',
      '172.15.0.1', // just below 172.16/12
      '172.32.0.1', // just above 172.16/12
      '192.169.0.1', // not 192.168/16
      '169.253.0.1', // not 169.254/16
      '11.0.0.1',
      '2606:4700::1111', // public IPv6
      'fec0::1', // NOT fe80::/10 (fec0 > febf)
      '::ffff:8.8.8.8', // IPv4-mapped public
    ];

    it.each(privateAddresses)('should classify %s as private', (ip) => {
      expect(UrlGuardService.isPrivateAddress(ip)).toBe(true);
    });

    it.each(publicAddresses)('should classify %s as public', (ip) => {
      expect(UrlGuardService.isPrivateAddress(ip)).toBe(false);
    });
  });

  // ===========================================================================
  // checkUrl
  // ===========================================================================

  describe('checkUrl (production mode)', () => {
    let guard: UrlGuardService;

    beforeEach(() => {
      guard = makeGuard({ NODE_ENV: 'production' });
    });

    it('should reject non-http(s) schemes', async () => {
      for (const url of ['ftp://example.com/x', 'file:///etc/passwd', 'gopher://x']) {
        const verdict = await guard.checkUrl(url);
        expect(verdict.allowed).toBe(false);
      }
    });

    it('should reject invalid URLs', async () => {
      const verdict = await guard.checkUrl('not a url at all');
      expect(verdict.allowed).toBe(false);
    });

    it('should reject IP-literal private targets without DNS', async () => {
      guard.lookupFn = jest.fn();

      expect((await guard.checkUrl('http://10.1.2.3/hook')).allowed).toBe(false);
      expect((await guard.checkUrl('http://127.0.0.1:8080/hook')).allowed).toBe(false);
      expect((await guard.checkUrl('http://[::1]/hook')).allowed).toBe(false);
      expect(guard.lookupFn).not.toHaveBeenCalled();
    });

    it('should resolve hostnames and reject when ANY address is private (rebinding defence)', async () => {
      guard.lookupFn = jest.fn().mockResolvedValue(['93.184.216.34', '10.0.0.5']);

      const verdict = await guard.checkUrl('https://evil.example.com/hook');

      expect(verdict.allowed).toBe(false);
      expect(guard.lookupFn).toHaveBeenCalledWith('evil.example.com');
    });

    it('should allow hostnames resolving only to public addresses', async () => {
      guard.lookupFn = jest.fn().mockResolvedValue(['93.184.216.34']);

      const verdict = await guard.checkUrl('https://receiver.example.com/hook');

      expect(verdict.allowed).toBe(true);
    });

    it('should reject on DNS resolution failure', async () => {
      guard.lookupFn = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));

      const verdict = await guard.checkUrl('https://nope.example.com/hook');

      expect(verdict.allowed).toBe(false);
    });
  });

  describe('checkUrl (gate behaviour)', () => {
    it('should allow private targets by default outside production', async () => {
      const guard = makeGuard({ NODE_ENV: 'development' });

      expect((await guard.checkUrl('http://127.0.0.1:3000/hook')).allowed).toBe(true);
      expect((await guard.checkUrl('http://app.lvh.me:3000/hook')).allowed).toBe(true);
    });

    it('should honor an explicit BROKER_ALLOW_PRIVATE_WEBHOOK_TARGETS=true in production', async () => {
      const guard = makeGuard({
        NODE_ENV: 'production',
        BROKER_ALLOW_PRIVATE_WEBHOOK_TARGETS: 'true',
      });

      expect((await guard.checkUrl('http://127.0.0.1:3000/hook')).allowed).toBe(true);
    });

    it('should honor an explicit BROKER_ALLOW_PRIVATE_WEBHOOK_TARGETS=false in development', async () => {
      const guard = makeGuard({
        NODE_ENV: 'development',
        BROKER_ALLOW_PRIVATE_WEBHOOK_TARGETS: 'false',
      });

      expect((await guard.checkUrl('http://127.0.0.1:3000/hook')).allowed).toBe(false);
    });

    it('should still reject bad schemes even when private targets are allowed', async () => {
      const guard = makeGuard({ NODE_ENV: 'development' });

      expect((await guard.checkUrl('file:///etc/passwd')).allowed).toBe(false);
    });
  });
});
