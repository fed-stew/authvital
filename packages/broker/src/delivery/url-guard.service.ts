import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dns from 'dns';
import * as net from 'net';

export type UrlCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * UrlGuardService — SSRF protection for webhook targets.
 *
 * Before any POST, the target URL is validated:
 *  - scheme must be http/https,
 *  - the hostname's resolved addresses must not be private / loopback /
 *    link-local / ULA / metadata ranges.
 *
 * Gate: BROKER_ALLOW_PRIVATE_WEBHOOK_TARGETS ('true'/'false'). Default:
 * allow private targets when NODE_ENV != production (local dev uses lvh.me
 * domains that resolve to 127.0.0.1), block in production.
 */
@Injectable()
export class UrlGuardService {
  private readonly logger = new Logger(UrlGuardService.name);
  private readonly allowPrivateTargets: boolean;

  /** Overridable for tests — defaults to real DNS resolution. */
  lookupFn: (hostname: string) => Promise<string[]> = async (hostname) => {
    const results = await dns.promises.lookup(hostname, {
      all: true,
      verbatim: true,
    });
    return results.map((r) => r.address);
  };

  constructor(configService: ConfigService) {
    const explicit = configService.get<string>(
      'BROKER_ALLOW_PRIVATE_WEBHOOK_TARGETS',
    );
    if (explicit === 'true' || explicit === 'false') {
      this.allowPrivateTargets = explicit === 'true';
    } else {
      this.allowPrivateTargets =
        configService.get<string>('NODE_ENV') !== 'production';
    }

    if (this.allowPrivateTargets) {
      this.logger.warn(
        'Private/loopback webhook targets are ALLOWED ' +
          '(BROKER_ALLOW_PRIVATE_WEBHOOK_TARGETS / non-production default). ' +
          'Do not run production like this.',
      );
    }
  }

  /** Validate a webhook URL. Never throws — returns a verdict. */
  async checkUrl(rawUrl: string): Promise<UrlCheckResult> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return this.blocked(rawUrl, 'invalid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return this.blocked(rawUrl, `disallowed scheme "${parsed.protocol}"`);
    }

    if (this.allowPrivateTargets) {
      return { allowed: true };
    }

    // URL keeps IPv6 literals bracketed: "[::1]" -> "::1"
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

    let addresses: string[];
    if (net.isIP(hostname)) {
      addresses = [hostname];
    } else {
      try {
        addresses = await this.lookupFn(hostname);
      } catch (error: any) {
        return this.blocked(rawUrl, `DNS resolution failed: ${error.message}`);
      }
    }

    if (addresses.length === 0) {
      return this.blocked(rawUrl, 'DNS resolved no addresses');
    }

    for (const address of addresses) {
      if (UrlGuardService.isPrivateAddress(address)) {
        return this.blocked(
          rawUrl,
          `resolves to private/restricted address ${address}`,
        );
      }
    }

    return { allowed: true };
  }

  /**
   * True when the IP is in a private / loopback / link-local / ULA /
   * metadata range: 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8,
   * ::1, ::, fc00::/7, fe80::/10, and IPv4-mapped forms thereof.
   */
  static isPrivateAddress(ip: string): boolean {
    if (net.isIPv4(ip)) {
      return UrlGuardService.isPrivateV4(ip);
    }

    const lower = ip.toLowerCase();

    // IPv4-mapped IPv6 (::ffff:10.0.0.1) — check the embedded IPv4.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) {
      return UrlGuardService.isPrivateV4(mapped[1]);
    }

    // Loopback / unspecified
    if (lower === '::1' || lower === '::') {
      return true;
    }

    // First hextet decides fc00::/7 (fc00–fdff) and fe80::/10 (fe80–febf).
    const firstHextet = lower.split(':')[0];
    if (/^f[cd]/.test(firstHextet)) {
      return true; // fc00::/7 (ULA)
    }
    if (/^fe[89ab]/.test(firstHextet)) {
      return true; // fe80::/10 (link-local)
    }

    return false;
  }

  private static isPrivateV4(ip: string): boolean {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || // 0.0.0.0/8 ("this network")
      a === 10 || // 10.0.0.0/8
      a === 127 || // 127.0.0.0/8 loopback
      (a === 169 && b === 254) || // 169.254.0.0/16 link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) // 192.168.0.0/16
    );
  }

  private blocked(url: string, reason: string): UrlCheckResult {
    // Loud by design — a blocked webhook target is either a misconfiguration
    // or an SSRF attempt. Either way, ops should see it.
    this.logger.error(` SSRF guard BLOCKED webhook target ${url}: ${reason}`);
    return { allowed: false, reason };
  }
}
