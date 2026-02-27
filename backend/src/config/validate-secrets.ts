/**
 * Signing Key Secret Validation
 *
 * Validates SIGNING_KEY_SECRET meets security requirements at startup:
 * - Must be exactly 64 hexadecimal characters (256-bit key)
 * - Must not be a known insecure/test value in production
 * - Must have sufficient entropy (no repeating patterns)
 *
 * Call this AFTER validateEnv() to ensure the var exists.
 */

/**
 * Known insecure values that should NEVER be used in production.
 * These are common test/example values that might slip into prod configs.
 */
const KNOWN_INSECURE_VALUES = new Set([
  // All zeros
  '0'.repeat(64),
  // All ones
  '1'.repeat(64),
  // Hex alphabet repeated
  'abcdef0123456789'.repeat(4),
  '0123456789abcdef'.repeat(4),
  // Common test values
  'deadbeef'.repeat(8),
  'cafebabe'.repeat(8),
  // Sequential patterns
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
]);

/**
 * Validates that a string is exactly 64 hexadecimal characters.
 */
function isValidHexFormat(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Calculates Shannon entropy of a string.
 * Higher values = more randomness. Max for hex is ~4 bits per char.
 *
 * A good 256-bit random key should have entropy close to 4.0
 * Low entropy (< 3.0) indicates patterns or repetition.
 */
function calculateShannonEntropy(value: string): number {
  const len = value.length;
  if (len === 0) return 0;

  // Count character frequencies
  const freq = new Map<string, number>();
  for (const char of value.toLowerCase()) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  // Calculate entropy: -Σ(p * log2(p))
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Checks for obvious repeating patterns.
 * Returns true if the value has suspicious repetition.
 */
function hasRepetitivePattern(value: string): boolean {
  const lower = value.toLowerCase();

  // Check for 2-char repeating pattern (e.g., "abababab...")
  if (lower.length >= 4) {
    const twoChar = lower.slice(0, 2);
    if (lower === twoChar.repeat(32)) return true;
  }

  // Check for 4-char repeating pattern (e.g., "abcdabcd...")
  if (lower.length >= 8) {
    const fourChar = lower.slice(0, 4);
    if (lower === fourChar.repeat(16)) return true;
  }

  // Check for 8-char repeating pattern (e.g., "deadbeef" x8)
  if (lower.length >= 16) {
    const eightChar = lower.slice(0, 8);
    if (lower === eightChar.repeat(8)) return true;
  }

  // Check for 16-char repeating pattern
  if (lower.length >= 32) {
    const sixteenChar = lower.slice(0, 16);
    if (lower === sixteenChar.repeat(4)) return true;
  }

  return false;
}

export interface SecretValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  entropy?: number;
}

/**
 * Validates the SIGNING_KEY_SECRET meets all security requirements.
 *
 * @param secret - The secret value to validate
 * @param isProduction - Whether we're running in production mode
 * @returns Validation result with errors and warnings
 */
export function validateSigningKeySecretValue(
  secret: string,
  isProduction: boolean,
): SecretValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: Must be 64 hex characters
  if (!isValidHexFormat(secret)) {
    if (secret.length !== 64) {
      errors.push(
        `SIGNING_KEY_SECRET must be exactly 64 hex characters (got ${secret.length})`,
      );
    } else {
      errors.push(
        'SIGNING_KEY_SECRET contains non-hexadecimal characters',
      );
    }
    // Can't do further checks if format is wrong
    return { valid: false, errors, warnings };
  }

  // Check 2: Reject known insecure values (always in prod, warn in dev)
  const lowerSecret = secret.toLowerCase();
  if (KNOWN_INSECURE_VALUES.has(lowerSecret)) {
    if (isProduction) {
      errors.push(
        'SIGNING_KEY_SECRET is a known insecure test value - generate a real secret!',
      );
    } else {
      warnings.push(
        'SIGNING_KEY_SECRET is a known insecure test value - do NOT use in production',
      );
    }
  }

  // Check 3: Check for repeating patterns
  if (hasRepetitivePattern(secret)) {
    if (isProduction) {
      errors.push(
        'SIGNING_KEY_SECRET has a repeating pattern - use a random value!',
      );
    } else {
      warnings.push(
        'SIGNING_KEY_SECRET has a repeating pattern - not suitable for production',
      );
    }
  }

  // Check 4: Calculate entropy
  const entropy = calculateShannonEntropy(secret);
  const MIN_ENTROPY_PRODUCTION = 3.5; // Strict for prod
  const MIN_ENTROPY_DEVELOPMENT = 2.5; // More lenient for dev/test

  if (isProduction && entropy < MIN_ENTROPY_PRODUCTION) {
    errors.push(
      `SIGNING_KEY_SECRET has low entropy (${entropy.toFixed(2)} bits) - use a cryptographically random value`,
    );
  } else if (!isProduction && entropy < MIN_ENTROPY_DEVELOPMENT) {
    warnings.push(
      `SIGNING_KEY_SECRET has low entropy (${entropy.toFixed(2)} bits) - not suitable for production`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    entropy,
  };
}

/**
 * Validates SIGNING_KEY_SECRET from environment and exits if invalid.
 * Call this after validateEnv() in your startup sequence.
 */
export function validateSigningKeySecret(): void {
  const secret = process.env.SIGNING_KEY_SECRET;

  // Should already be validated by validateEnv(), but be defensive
  if (!secret) {
    console.error('FATAL: SIGNING_KEY_SECRET is not set');
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const result = validateSigningKeySecretValue(secret, isProduction);

  // Print warnings (but don't exit)
  if (result.warnings.length > 0) {
    console.warn('\nSigning Key Warnings:');
    for (const warning of result.warnings) {
      console.warn(`   ⚠️  ${warning}`);
    }
    console.warn('');
  }

  // Print errors and exit
  if (!result.valid) {
    console.error('\nFATAL: Invalid SIGNING_KEY_SECRET:');
    console.error('='.repeat(60));
    for (const error of result.errors) {
      console.error(`   ❌ ${error}`);
    }
    console.error('='.repeat(60));
    console.error('\nGenerate a secure key with:');
    console.error('   openssl rand -hex 32');
    console.error('');
    process.exit(1);
  }

  // Log success with entropy info in development
  if (!isProduction && result.entropy !== undefined) {
    console.log(
      `Signing key validation passed (entropy: ${result.entropy.toFixed(2)} bits/char)`,
    );
  } else {
    console.log('Signing key validation passed');
  }
}
