import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface BreachCheckResult {
  isBreached: boolean;
  breachCount?: number;
}

/**
 * Password Breach Check Service
 *
 * Checks passwords against HaveIBeenPwned API using k-anonymity.
 * Only the first 5 chars of the SHA-1 hash are sent to the API,
 * protecting the actual password from being transmitted.
 *
 * Can be disabled via HIBP_CHECK_ENABLED=false env var.
 */
@Injectable()
export class PasswordBreachCheckService {
  private readonly logger = new Logger(PasswordBreachCheckService.name);
  private readonly HIBP_API_URL = 'https://api.pwnedpasswords.com/range';
  private readonly isEnabled: boolean;

  constructor() {
    // Default to enabled unless explicitly disabled
    this.isEnabled = process.env.HIBP_CHECK_ENABLED !== 'false';

    if (!this.isEnabled) {
      this.logger.warn(
        'HIBP password breach checking is DISABLED (HIBP_CHECK_ENABLED=false)',
      );
    }
  }

  /**
   * Check if a password has been exposed in known data breaches.
   *
   * Uses k-anonymity: only sends first 5 chars of SHA-1 hash to HIBP API,
   * then checks locally if the full hash suffix appears in the response.
   *
   * @param password - The plaintext password to check
   * @returns BreachCheckResult with isBreached flag and optional breach count
   */
  async checkPassword(password: string): Promise<BreachCheckResult> {
    if (!this.isEnabled) {
      this.logger.debug('Breach check skipped (disabled)');
      return { isBreached: false };
    }

    try {
      // SHA-1 hash the password (HIBP uses SHA-1)
      const sha1Hash = crypto
        .createHash('sha1')
        .update(password)
        .digest('hex')
        .toUpperCase();

      // k-anonymity: split into prefix (5 chars) and suffix
      const prefix = sha1Hash.substring(0, 5);
      const suffix = sha1Hash.substring(5);

      // Query the HIBP API with only the prefix
      const response = await fetch(`${this.HIBP_API_URL}/${prefix}`, {
        headers: {
          'User-Agent': 'AuthVital-PasswordBreachCheck/1.0',
        },
      });

      if (!response.ok) {
        this.logger.error(
          `HIBP API request failed: ${response.status} ${response.statusText}`,
        );
        // Fail open: don't block registration if HIBP is down
        return { isBreached: false };
      }

      const responseText = await response.text();

      // Parse response - each line is "SUFFIX:COUNT"
      const match = this.findHashInResponse(suffix, responseText);

      if (match) {
        this.logger.debug(
          `Password found in ${match.count} breach(es) (hash prefix: ${prefix})`,
        );
        return {
          isBreached: true,
          breachCount: match.count,
        };
      }

      return { isBreached: false };
    } catch (error) {
      this.logger.error('Error checking password against HIBP:', error);
      // Fail open: don't block user flow if there's a network issue
      return { isBreached: false };
    }
  }

  /**
   * Parse HIBP response and find matching hash suffix.
   *
   * Response format is lines of "SUFFIX:COUNT" (uppercase hex)
   */
  private findHashInResponse(
    suffix: string,
    responseText: string,
  ): { count: number } | null {
    const lines = responseText.split('\n');

    for (const line of lines) {
      const [hashSuffix, countStr] = line.trim().split(':');

      if (hashSuffix === suffix) {
        const count = parseInt(countStr, 10);
        return { count: isNaN(count) ? 1 : count };
      }
    }

    return null;
  }
}
