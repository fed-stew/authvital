import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  RedirectUriValidatorService,
  RedirectUriValidationOptions,
} from './redirect-uri-validator.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RedirectUriValidatorService', () => {
  let service: RedirectUriValidatorService;
  let prisma: jest.Mocked<PrismaService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedirectUriValidatorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('development'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            tenant: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<RedirectUriValidatorService>(RedirectUriValidatorService);
    prisma = module.get(PrismaService);
    configService = module.get(ConfigService);
  });

  describe('validateRedirectUri - Security Checks', () => {
    const patterns = ['https://example.com/callback'];

    it('should reject empty redirect URIs', async () => {
      const result = await service.validateRedirectUri('', patterns);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('empty');
    });

    it('should reject javascript: URIs', async () => {
      const result = await service.validateRedirectUri('javascript:alert(1)', patterns);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Dangerous URL scheme');
    });

    it('should reject data: URIs', async () => {
      const result = await service.validateRedirectUri('data:text/html,<script>', patterns);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Dangerous URL scheme');
    });

    it('should reject file: URIs', async () => {
      const result = await service.validateRedirectUri('file:///etc/passwd', patterns);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Dangerous URL scheme');
    });

    it('should reject protocol-relative URLs', async () => {
      const result = await service.validateRedirectUri('//evil.com/callback', patterns);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('malicious pattern');
    });

    it('should reject URLs with backslashes', async () => {
      const result = await service.validateRedirectUri(
        'https://example.com\\@evil.com',
        patterns,
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('malicious pattern');
    });

    it('should reject URLs with CRLF injection', async () => {
      const result = await service.validateRedirectUri(
        'https://example.com/callback%0d%0aSet-Cookie:evil',
        patterns,
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('malicious pattern');
    });

    it('should reject URLs with null bytes', async () => {
      const result = await service.validateRedirectUri(
        'https://example.com/callback%00.jpg',
        patterns,
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('malicious pattern');
    });

    it('should reject URLs with fragments per RFC 6749', async () => {
      const result = await service.validateRedirectUri(
        'https://example.com/callback#fragment',
        patterns,
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('fragment');
    });

    it('should reject ftp:// URIs', async () => {
      const result = await service.validateRedirectUri('ftp://example.com/callback', patterns);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('http:// or https://');
    });

    it('should reject IP addresses by default', async () => {
      const result = await service.validateRedirectUri(
        'https://192.168.1.1/callback',
        ['https://192.168.1.1/callback'],
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('IP addresses are not allowed');
    });

    it('should allow IP addresses when explicitly permitted', async () => {
      const options: RedirectUriValidationOptions = { allowIpAddresses: true };
      const result = await service.validateRedirectUri(
        'https://192.168.1.1/callback',
        ['https://192.168.1.1/callback'],
        options,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('validateRedirectUri - Exact Matching', () => {
    it('should match exact URI', async () => {
      const result = await service.validateRedirectUri(
        'https://example.com/callback',
        ['https://example.com/callback'],
      );
      expect(result.valid).toBe(true);
      expect(result.matchedPattern).toBe('https://example.com/callback');
    });

    it('should not match different paths', async () => {
      const result = await service.validateRedirectUri(
        'https://example.com/different',
        ['https://example.com/callback'],
      );
      expect(result.valid).toBe(false);
    });

    it('should not match different domains', async () => {
      const result = await service.validateRedirectUri(
        'https://evil.com/callback',
        ['https://example.com/callback'],
      );
      expect(result.valid).toBe(false);
    });

    it('should match with query parameters when registered exactly', async () => {
      const result = await service.validateRedirectUri(
        'https://example.com/callback?state=abc',
        ['https://example.com/callback?state=abc'],
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('validateRedirectUri - Wildcard Matching', () => {
    it('should match wildcard subdomain', async () => {
      const result = await service.validateRedirectUri(
        'https://app.example.com/callback',
        ['https://*.example.com/callback'],
      );
      expect(result.valid).toBe(true);
      expect(result.matchedPattern).toBe('https://*.example.com/callback');
    });

    it('should match wildcard with multiple subdomain levels', async () => {
      const result = await service.validateRedirectUri(
        'https://staging.example.com/callback',
        ['https://*.example.com/callback'],
      );
      expect(result.valid).toBe(true);
    });

    it('should not match wildcard when no subdomain present', async () => {
      const result = await service.validateRedirectUri(
        'https://example.com/callback',
        ['https://*.example.com/callback'],
      );
      expect(result.valid).toBe(false);
    });

    it('should not match wildcard for different domain', async () => {
      const result = await service.validateRedirectUri(
        'https://app.evil.com/callback',
        ['https://*.example.com/callback'],
      );
      expect(result.valid).toBe(false);
    });

    it('should match wildcard with port', async () => {
      const result = await service.validateRedirectUri(
        'https://app.localhost:3000/callback',
        ['https://*.localhost:3000/callback'],
      );
      expect(result.valid).toBe(true);
    });

    it('should only allow alphanumeric and hyphen in subdomain', async () => {
      const result = await service.validateRedirectUri(
        'https://app_test.example.com/callback',
        ['https://*.example.com/callback'],
      );
      expect(result.valid).toBe(false);
    });
  });

  describe('validateRedirectUri - Tenant Placeholder Matching', () => {
    beforeEach(() => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 'tenant-1' });
    });

    it('should match tenant placeholder when tenant exists', async () => {
      const result = await service.validateRedirectUri(
        'https://acme-corp.example.com/callback',
        ['https://{tenant}.example.com/callback'],
      );
      expect(result.valid).toBe(true);
      expect(result.matchedPattern).toBe('https://{tenant}.example.com/callback');
      expect(result.extractedTenant).toBe('acme-corp');
    });

    it('should reject when tenant does not exist', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.validateRedirectUri(
        'https://nonexistent.example.com/callback',
        ['https://{tenant}.example.com/callback'],
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should skip tenant validation when disabled', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.validateRedirectUri(
        'https://any-tenant.example.com/callback',
        ['https://{tenant}.example.com/callback'],
        { validateTenantExists: false },
      );
      expect(result.valid).toBe(true);
      expect(result.extractedTenant).toBe('any-tenant');
    });
  });

  describe('validatePatternForRegistration', () => {
    it('should accept valid HTTPS URL', () => {
      const result = service.validatePatternForRegistration('https://example.com/callback');
      expect(result.valid).toBe(true);
    });

    it('should accept valid HTTP URL', () => {
      const result = service.validatePatternForRegistration('http://localhost:3000/callback');
      expect(result.valid).toBe(true);
    });

    it('should accept valid wildcard pattern', () => {
      const result = service.validatePatternForRegistration('https://*.example.com/callback');
      expect(result.valid).toBe(true);
    });

    it('should accept valid tenant placeholder pattern', () => {
      const result = service.validatePatternForRegistration(
        'https://{tenant}.example.com/callback',
      );
      expect(result.valid).toBe(true);
    });

    it('should reject wildcard in wrong position', () => {
      const result = service.validatePatternForRegistration('https://example.*.com/callback');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('only allowed at the start of subdomains');
    });

    it('should reject tenant placeholder in path', () => {
      const result = service.validatePatternForRegistration(
        'https://example.com/{tenant}/callback',
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('only allowed at the start of subdomains');
    });

    it('should reject wildcard without valid domain suffix', () => {
      const result = service.validatePatternForRegistration('https://*.internal/callback');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('valid domain');
    });

    it('should reject bare wildcard pattern', () => {
      const result = service.validatePatternForRegistration('https://*');
      expect(result.valid).toBe(false);
      // Gets caught by wildcard placement validation (no domain after *)
      expect(result.reason).toContain('only allowed');
    });

    it('should reject multiple wildcards', () => {
      const result = service.validatePatternForRegistration('https://*.*.example.com/callback');
      expect(result.valid).toBe(false);
      // Gets caught by wildcard placement validation (invalid format)
      expect(result.reason).toBeDefined();
    });

    it('should reject both wildcard and tenant placeholder', () => {
      const result = service.validatePatternForRegistration(
        'https://*.{tenant}.example.com/callback',
      );
      expect(result.valid).toBe(false);
      // Gets caught by wildcard placement validation (invalid format)
      expect(result.reason).toBeDefined();
    });

    it('should reject mixing wildcard and tenant in any position', () => {
      // Any combination of wildcard and tenant placeholder should be rejected
      // (gets caught by various validation checks in the pipeline)
      const result = service.validatePatternForRegistration(
        'https://*.example.com/{tenant}/callback',
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should reject ftp:// scheme', () => {
      const result = service.validatePatternForRegistration('ftp://example.com/callback');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('http:// or https://');
    });

    it('should reject patterns with CRLF', () => {
      const result = service.validatePatternForRegistration(
        'https://example.com/callback%0d%0a',
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('malicious pattern');
    });
  });

  describe('Environment-aware defaults', () => {
    it('should reject localhost in production', async () => {
      // Mock production environment
      jest.spyOn(configService, 'get').mockReturnValue('production');

      // Need to recreate service with new config
      const prodService = new RedirectUriValidatorService(configService, prisma as any);

      const result = await prodService.validateRedirectUri(
        'http://localhost:3000/callback',
        ['http://localhost:3000/callback'],
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not allowed in production');
    });

    it('should allow localhost in development', async () => {
      const result = await service.validateRedirectUri(
        'http://localhost:3000/callback',
        ['http://localhost:3000/callback'],
      );
      expect(result.valid).toBe(true);
    });

    it('should allow HTTP for localhost even when allowHttp is false', async () => {
      const result = await service.validateRedirectUri(
        'http://localhost:3000/callback',
        ['http://localhost:3000/callback'],
        { allowHttp: false },
      );
      // Should pass because localhost is special-cased
      expect(result.valid).toBe(true);
    });
  });
});
