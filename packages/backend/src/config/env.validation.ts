/**
 * Environment Variable Validation
 * 
 * Validates all required environment variables at startup.
 * The app will exit(1) if any required variables are missing.
 * 
 * NO FALLBACKS - explicit configuration required for production safety.
 */

export interface RequiredEnvVars {
  // Core
  BASE_URL: string;
  DATABASE_URL: string;
  
  // Security
  SIGNING_KEY_SECRET: string;
  
  // Optional but validated if present
  PORT?: string;
  NODE_ENV?: string;
  CORS_ORIGINS?: string;
  KEY_ROTATION_INTERVAL_SECONDS?: string;
  
  // SendGrid (optional - falls back to console logging)
  SENDGRID_API_KEY?: string;
  SENDGRID_FROM_EMAIL?: string;
  SENDGRID_FROM_NAME?: string;
  
  // Super Admin bootstrap (optional)
  SUPER_ADMIN_EMAIL?: string;
}

const REQUIRED_ENV_VARS = [
  'BASE_URL',
  'DATABASE_URL', 
  'SIGNING_KEY_SECRET',
  'PORT',
] as const;

export function validateEnv(): void {
  const missing: string[] = [];
  const warnings: string[] = [];
  
  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  // Validate BASE_URL format if present
  if (process.env.BASE_URL) {
    try {
      new URL(process.env.BASE_URL);
    } catch {
      missing.push('BASE_URL (invalid URL format)');
    }
  }
  
  // Validate PORT is a number
  if (process.env.PORT && isNaN(parseInt(process.env.PORT, 10))) {
    missing.push('PORT (must be a valid number)');
  }
  
  // Warn about optional but recommended variables
  if (!process.env.SENDGRID_API_KEY) {
    warnings.push('SENDGRID_API_KEY not set - emails will be logged to console');
  }
  
  // If SendGrid is configured, require FROM fields
  if (process.env.SENDGRID_API_KEY) {
    if (!process.env.SENDGRID_FROM_EMAIL) {
      missing.push('SENDGRID_FROM_EMAIL (required when SENDGRID_API_KEY is set)');
    }
    if (!process.env.SENDGRID_FROM_NAME) {
      missing.push('SENDGRID_FROM_NAME (required when SENDGRID_API_KEY is set)');
    }
  }
  
  // Print warnings
  if (warnings.length > 0) {
    console.warn('\nConfiguration Warnings:');
    for (const warning of warnings) {
      console.warn(`   - ${warning}`);
    }
    console.warn('');
  }
  
  // Exit if required vars missing
  if (missing.length > 0) {
    console.error('\nFATAL: Missing required environment variables:');
    console.error('=' .repeat(60));
    for (const varName of missing) {
      console.error(`   - ${varName}`);
    }
    console.error('=' .repeat(60));
    console.error('\nThe application cannot start without these variables.');
    console.error('Please set them in your .env file or environment.\n');
    process.exit(1);
  }
  
  console.log('Environment validation passed');
}

/**
 * Get a required environment variable.
 * Throws if not set (should only be called after validateEnv()).
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
