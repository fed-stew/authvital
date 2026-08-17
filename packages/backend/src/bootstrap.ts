import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as sgMail from '@sendgrid/mail';
import {
  createSeedContext,
  loadConfig,
  resolveConfigPath,
  runSeedPipeline,
  SeedConfig,
} from '../prisma/seed';

/**
 * Bootstrap script - runs on first startup to create initial super admin
 * and seed the database from YAML config if available.
 * 
 * Behavior:
 * - Super admin CREATION is idempotent: created only if one doesn't exist yet.
 *   - If YAML config has super_admin:
 *     - Production: Create with YAML email + random password, email it
 *     - Development: Create with YAML email + YAML password, log it
 *     - Opt-in (SEED_SUPER_ADMIN_USE_YAML_PASSWORD=true, set ONLY in the local
 *       examples compose): even under NODE_ENV=production, honor the documented
 *       YAML password + log it. Real production never sets this flag.
 *   - If no YAML or no super_admin: use SUPER_ADMIN_EMAIL env + random password
 * - The YAML seed pipeline (apps, tenants, users, roles, subscriptions AND
 *   per-application webhook config) ALWAYS runs afterwards. It is a series of
 *   idempotent upserts, so every `migrate` run converges the DB to the YAML
 *   config — no manual /admin steps and no need to wipe ./data to pick up
 *   seed changes (e.g. a newly-added webhook_url).
 * - Always ensure system tenant roles exist.
 */
export async function bootstrap(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // 1. Load YAML config once (used for both super admin + the seed pipeline).
    const yamlConfig = await loadBootstrapConfig();

    // 2. Create the super admin ONLY if one doesn't exist yet. Unlike before,
    //    an existing admin no longer short-circuits the whole bootstrap — we
    //    still run the idempotent seed pipeline below so seed edits apply on
    //    re-run without wiping the database.
    const existingAdmin = await prisma.superAdmin.findFirst();
    if (existingAdmin) {
      console.log('Super admin already exists, skipping super admin creation');
    } else if (yamlConfig?.super_admin) {
      // YAML-driven bootstrap
      console.log('YAML config found with super_admin, using YAML-driven bootstrap...');
      await createSuperAdminFromYaml(prisma, yamlConfig);
    } else {
      // Legacy env-based bootstrap
      console.log('No YAML super_admin config found, using env-based bootstrap...');
      await bootstrapFromEnv(prisma);
    }

    // 3. Seed the rest via the SAME ordered pipeline the standalone seed uses.
    //    The super admin is already handled above (superAdmin: 'skip'), and the
    //    pipeline runs system tenant roles BEFORE users, so membership tenant-
    //    role assignments always resolve. Idempotent + a safe no-op when there
    //    is no YAML config (only system roles get ensured).
    const ctx = createSeedContext(prisma, yamlConfig ?? {}, {
      superAdmin: 'skip',
      includeSubscriptions: true,
    });
    await runSeedPipeline(ctx);

    console.log('Bootstrap completed successfully');
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Load YAML bootstrap config if available
 */
async function loadBootstrapConfig(): Promise<SeedConfig | null> {
  const configPath = resolveConfigPath();
  if (!configPath) {
    return null;
  }
  try {
    return loadConfig(configPath);
  } catch (error) {
    console.warn('Failed to load YAML config:', error);
    return null;
  }
}

/**
 * Create the super admin from YAML config. The rest of the YAML data is seeded
 * afterwards by the shared pipeline in bootstrap().
 */
async function createSuperAdminFromYaml(
  prisma: PrismaClient,
  yamlConfig: SeedConfig,
): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  // Local examples run NODE_ENV=production for prod-like cookies/TLS but still
  // need the documented fixed password. This opt-in (set ONLY in the examples
  // compose) honors the YAML password; real production never sets it and keeps
  // the random-password + email behavior.
  const useConfigPassword =
    !isProduction || process.env.SEED_SUPER_ADMIN_USE_YAML_PASSWORD === 'true';
  const superAdminConfig = yamlConfig.super_admin;
  if (!superAdminConfig) {
    throw new Error('Seed config is missing the super_admin section');
  }

  // Normalize email
  const email = superAdminConfig.email.toLowerCase();

  // Determine password: YAML password when opted-in (dev or examples), else random.
  let temporaryPassword: string;
  if (useConfigPassword) {
    temporaryPassword = superAdminConfig.password;
    console.log(`Creating super admin from YAML (config password): ${email}`);
  } else {
    temporaryPassword = crypto.randomBytes(16).toString('base64url');
    console.log(`Creating super admin from YAML (production, random password): ${email}`);
  }

  // Hash and create super admin
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const admin = await prisma.superAdmin.create({
    data: {
      email,
      passwordHash,
      displayName: superAdminConfig.display_name || 'Super Admin',
      isActive: true,
      mustChangePassword: !useConfigPassword,
    },
  });

  console.log(`Super admin created: ${admin.email}`);

  // Handle password delivery
  if (useConfigPassword) {
    // Log the fixed credentials to console (dev + local examples).
    console.log('\n' + '='.repeat(60));
    console.log('SUPER ADMIN CREDENTIALS (Development Mode)');
    console.log('='.repeat(60));
    console.log(`Email:    ${email}`);
    console.log(`Password: ${temporaryPassword}`);
    console.log(`Login:    /admin/login`);
    console.log('='.repeat(60) + '\n');
  } else {
    await sendInitialPasswordEmail(email, temporaryPassword);
  }
}

/**
 * Legacy env-based bootstrap (when no YAML config)
 */
async function bootstrapFromEnv(prisma: PrismaClient): Promise<void> {
  const rawEmail = process.env.SUPER_ADMIN_EMAIL;

  if (!rawEmail) {
    console.warn('No super admin exists and SUPER_ADMIN_EMAIL not set');
    console.warn('   Set SUPER_ADMIN_EMAIL env var on first deployment to create initial admin');
    return;
  }

  // Normalize email to lowercase for case-insensitive matching
  const email = rawEmail.toLowerCase();

  // Generate a secure random password
  const temporaryPassword = crypto.randomBytes(16).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  // Create the super admin with mustChangePassword flag
  const admin = await prisma.superAdmin.create({
    data: {
      email,
      passwordHash,
      displayName: 'Super Admin',
      isActive: true,
      mustChangePassword: true,
    },
  });

  console.log(`Super admin created: ${admin.email}`);

  // Send the temporary password via email
  await sendInitialPasswordEmail(email, temporaryPassword);
}

/**
 * Send initial password email to super admin
 */
async function sendInitialPasswordEmail(email: string, password: string): Promise<void> {
  // SendGrid config is optional - falls back to console logging if not configured
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME;
  const apiKey = process.env.SENDGRID_API_KEY;

  // For emails, we use BASE_URL to construct full links
  // For console output, we just show the relative path (we don't know the actual access domain)
  const baseUrl = process.env.BASE_URL || '';
  const loginPath = '/admin/login';

  const subject = 'Your AuthVital Super Admin Account';
  const loginUrl = `${baseUrl}${loginPath}`;
  const text = `
Your super admin account has been created.

Email: ${email}
Temporary Password: ${password}

Login at: ${loginUrl}

You will be required to change your password on first login.

This is an automated message from system bootstrap.
`.trim();

  const html = `
<h2>Your Super Admin Account</h2>
<p>Your super admin account has been created.</p>
<table>
  <tr><td><strong>Email:</strong></td><td>${email}</td></tr>
  <tr><td><strong>Temporary Password:</strong></td><td><code>${password}</code></td></tr>
</table>
<p><a href="${loginUrl}">Login to Admin Dashboard</a></p>
<p><strong>You will be required to change your password on first login.</strong></p>
<hr>
<p><small>This is an automated message from system bootstrap.</small></p>
`.trim();

  if (!apiKey) {
    // Log to console if SendGrid not configured
    // Use relative path - we don't know what domain the user will access from
    console.log('\n' + '='.repeat(60));
    console.log('SUPER ADMIN CREDENTIALS (SendGrid not configured)');
    console.log('='.repeat(60));
    console.log(`Email: ${email}`);
    console.log(`Temporary Password: ${password}`);
    console.log(`Login path: ${loginPath}`);
    console.log('='.repeat(60) + '\n');
    return;
  }

  try {
    if (!fromEmail || !fromName) {
      throw new Error('SENDGRID_FROM_EMAIL and SENDGRID_FROM_NAME are required when SENDGRID_API_KEY is set');
    }
    sgMail.setApiKey(apiKey);
    await sgMail.send({
      to: email,
      from: { email: fromEmail, name: fromName },
      subject,
      text,
      html,
    });
    console.log(`Initial password sent to ${email}`);
  } catch (error) {
    console.error('Failed to send initial password email:', error);
    // Still log to console as fallback - use relative path
    console.log('\n' + '='.repeat(60));
    console.log('SUPER ADMIN CREDENTIALS (email failed, logging here)');
    console.log('='.repeat(60));
    console.log(`Email: ${email}`);
    console.log(`Temporary Password: ${password}`);
    console.log(`Login path: ${loginPath}`);
    console.log('='.repeat(60) + '\n');
  }
}
