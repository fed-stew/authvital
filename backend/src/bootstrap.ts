import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as sgMail from '@sendgrid/mail';

/**
 * Bootstrap script - runs on first startup to create initial super admin
 * Generates a random password and emails it to the admin
 */
export async function bootstrap(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // Check if any super admin exists
    const existingAdmin = await prisma.superAdmin.findFirst();
    
    if (existingAdmin) {
      console.log('Super admin already exists, skipping bootstrap');
      return;
    }

    // Check for required env var
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

  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Send initial password email to super admin
 */
async function sendInitialPasswordEmail(email: string, password: string): Promise<void> {
  // BASE_URL is validated at startup - guaranteed to exist
  const baseUrl = process.env.BASE_URL!;
  // SendGrid config is optional - falls back to console logging if not configured
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME;
  const apiKey = process.env.SENDGRID_API_KEY;

  const loginUrl = `${baseUrl}/admin`;
  
  const subject = 'Your AuthVital Super Admin Account';
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
    console.log('\n' + '='.repeat(60));
    console.log('SUPER ADMIN CREDENTIALS (SendGrid not configured)');
    console.log('='.repeat(60));
    console.log(`Email: ${email}`);
    console.log(`Temporary Password: ${password}`);
    console.log(`Login URL: ${loginUrl}`);
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
    // Still log to console as fallback
    console.log('\n' + '='.repeat(60));
    console.log('SUPER ADMIN CREDENTIALS (email failed, logging here)');
    console.log('='.repeat(60));
    console.log(`Email: ${email}`);
    console.log(`Temporary Password: ${password}`);
    console.log(`Login URL: ${loginUrl}`);
    console.log('='.repeat(60) + '\n');
  }
}
