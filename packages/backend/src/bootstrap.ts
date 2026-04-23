import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as sgMail from '@sendgrid/mail';
import {
  resolveConfigPath,
  loadConfig,
  SeedConfig,
  seedInstanceMeta,
  seedSystemTenantRoles,
  seedApplications,
  seedTenants,
  seedUsers,
} from '../prisma/seed-from-yaml';

/**
 * Bootstrap script - runs on first startup to create initial super admin
 * and seed the database from YAML config if available.
 * 
 * Behavior:
 * - If super admin already exists: skip entirely (idempotent)
 * - If YAML config has super_admin:
 *   - Production: Create with YAML email + random password, email it
 *   - Development: Create with YAML email + YAML password, log it
 *   - Then seed rest from YAML (apps, tenants, users, etc.)
 * - If no YAML or no super_admin:
 *   - Use SUPER_ADMIN_EMAIL env var
 *   - Create with random password
 *   - Email or log it
 * - Always ensure system tenant roles exist
 */
export async function bootstrap(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // 1. Check if super admin already exists (idempotency)
    const existingAdmin = await prisma.superAdmin.findFirst();
    if (existingAdmin) {
      console.log('Super admin already exists, skipping bootstrap');
      return;
    }

    console.log('Running bootstrap (no super admin found)...');

    // 2. Try to load YAML config
    const yamlConfig = await loadBootstrapConfig();

    if (yamlConfig?.super_admin) {
      // YAML-driven bootstrap
      console.log('YAML config found with super_admin, using YAML-driven bootstrap...');
      await bootstrapFromYaml(prisma, yamlConfig);
    } else {
      // Legacy env-based bootstrap
      console.log('No YAML super_admin config found, using env-based bootstrap...');
      await bootstrapFromEnv(prisma);
    }

    // 3. Always ensure system tenant roles
    await ensureSystemTenantRoles(prisma);

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
 * Bootstrap from YAML config
 */
async function bootstrapFromYaml(prisma: PrismaClient, yamlConfig: SeedConfig): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const superAdminConfig = yamlConfig.super_admin!;

  // Normalize email
  const email = superAdminConfig.email.toLowerCase();

  // Determine password based on environment
  let temporaryPassword: string;
  if (isProduction) {
    // Always random password in production
    temporaryPassword = crypto.randomBytes(16).toString('base64url');
    console.log(`Creating super admin from YAML (production mode): ${email}`);
  } else {
    // Use YAML password in development
    temporaryPassword = superAdminConfig.password;
    console.log(`Creating super admin from YAML (dev mode): ${email}`);
  }

  // Hash and create super admin
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const admin = await prisma.superAdmin.create({
    data: {
      email,
      passwordHash,
      displayName: superAdminConfig.display_name || 'Super Admin',
      isActive: true,
      mustChangePassword: true,
    },
  });

  console.log(`Super admin created: ${admin.email}`);

  // Handle password delivery
  if (isProduction) {
    await sendInitialPasswordEmail(email, temporaryPassword);
  } else {
    // Log to console in development
    console.log('\n' + '='.repeat(60));
    console.log('SUPER ADMIN CREDENTIALS (Development Mode)');
    console.log('='.repeat(60));
    console.log(`Email:    ${email}`);
    console.log(`Password: ${temporaryPassword}`);
    console.log(`Login:    /admin/login`);
    console.log('='.repeat(60) + '\n');
  }

  // Seed remaining data from YAML (skip super admin since we just created it)
  await seedFromYamlConfig(prisma, yamlConfig);
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
 * Seed remaining data from YAML config (everything except super admin)
 */
async function seedFromYamlConfig(prisma: PrismaClient, config: SeedConfig): Promise<void> {
  console.log('Seeding additional data from YAML config...');

  // 1. Instance configuration
  if (config.instance) {
    await seedInstanceMeta(prisma, config.instance);
  }

  // 2. Applications + roles
  const appIdMap = config.applications?.length
    ? await seedApplications(prisma, config.applications)
    : new Map<string, { id: string; clientSecret?: string }>();

  // 3. Tenants
  const tenantIdMap = config.tenants?.length
    ? await seedTenants(prisma, config.tenants)
    : new Map<string, string>();

  // 4. Users + memberships + role assignments
  if (config.users?.length) {
    await seedUsers(prisma, config.users, tenantIdMap, appIdMap);
  }

  console.log('YAML seeding completed');
}

/**
 * Ensure system tenant roles exist (idempotent)
 */
async function ensureSystemTenantRoles(prisma: PrismaClient): Promise<void> {
  console.log('Ensuring system tenant roles exist...');
  await seedSystemTenantRoles(prisma);
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
