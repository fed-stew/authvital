import { Injectable, Logger } from '@nestjs/common';
import * as sgMail from '@sendgrid/mail';

/**
 * Email Service
 * - When SENDGRID_API_KEY is configured: sends via SendGrid
 * - Otherwise: logs emails to console (dev mode)
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly sendgridConfigured: boolean;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly baseUrl: string;

  constructor() {
    // BASE_URL is validated at startup - guaranteed to exist
    this.baseUrl = process.env.BASE_URL!;
    // SendGrid config is optional - falls back to console logging if not configured
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL ?? '';
    this.fromName = process.env.SENDGRID_FROM_NAME ?? '';

    // Check if SendGrid is configured
    const apiKey = process.env.SENDGRID_API_KEY;
    this.sendgridConfigured = !!apiKey;

    if (this.sendgridConfigured && apiKey) {
      sgMail.setApiKey(apiKey);
      this.logger.log('SendGrid configured and ready');
    } else {
      this.logger.warn(
        'SENDGRID_API_KEY not configured - emails will be logged to console',
      );
    }
  }

  /**
   * Send email verification link
   * @param callbackUrl - Client app's verification page URL
   */
  async sendVerificationEmail(
    email: string,
    token: string,
    options?: {
      name?: string;
      callbackUrl?: string;
    },
  ): Promise<void> {
    const verifyBaseUrl =
      options?.callbackUrl || `${this.baseUrl}/auth/verify-email`;

    const verifyUrl = new URL(verifyBaseUrl);
    verifyUrl.searchParams.set('token', token);

    const subject = 'Verify your email address';
    const text = `
Hi${options?.name ? ` ${options.name}` : ''},

Please verify your email address by clicking the link below:

${verifyUrl.toString()}

This link expires in 24 hours.

If you didn't request this, please ignore this email.
`.trim();

    const html = `
<p>Hi${options?.name ? ` ${options.name}` : ''},</p>
<p>Please verify your email address by clicking the link below:</p>
<p><a href="${verifyUrl.toString()}">Verify Email Address</a></p>
<p>Or copy this link: ${verifyUrl.toString()}</p>
<p>This link expires in 24 hours.</p>
<p>If you didn't request this, please ignore this email.</p>
`.trim();

    await this.send({ to: email, subject, text, html });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    options?: { name?: string; resetUrl?: string },
  ): Promise<void> {
    const resetUrl =
      options?.resetUrl ||
      `${this.baseUrl}/auth/reset-password?token=${resetToken}`;

    const subject = 'Reset your password';
    const text = `
Hi${options?.name ? ` ${options.name}` : ''},

You requested to reset your password.

Click here to reset: ${resetUrl}

This link expires in 1 hour.

If you didn't request this, please ignore this email.
`.trim();

    const html = `
<p>Hi${options?.name ? ` ${options.name}` : ''},</p>
<p>You requested to reset your password.</p>
<p><a href="${resetUrl}">Reset Password</a></p>
<p>Or copy this link: ${resetUrl}</p>
<p>This link expires in 1 hour.</p>
<p>If you didn't request this, please ignore this email.</p>
`.trim();

    await this.send({ to: email, subject, text, html });
  }

  /**
   * Send welcome email after signup
   */
  async sendWelcomeEmail(
    email: string,
    options?: { name?: string; tenantName?: string },
  ): Promise<void> {
    const subject = options?.tenantName
      ? `Welcome to ${options.tenantName}!`
      : 'Welcome!';

    const text = `
Hi${options?.name ? ` ${options.name}` : ''},

Welcome${options?.tenantName ? ` to ${options.tenantName}` : ''}!

Your account has been created successfully.
`.trim();

    const html = `
<p>Hi${options?.name ? ` ${options.name}` : ''},</p>
<p>Welcome${options?.tenantName ? ` to ${options.tenantName}` : ''}!</p>
<p>Your account has been created successfully.</p>
`.trim();

    await this.send({ to: email, subject, text, html });
  }

  /**
   * Send team invitation email
   */
  async sendInvitationEmail(
    email: string,
    options: {
      inviterName?: string;
      tenantName: string;
      roleName?: string;
      inviteUrl: string;
    },
  ): Promise<void> {
    const subject = `You've been invited to join ${options.tenantName}`;

    const inviterText = options.inviterName
      ? `${options.inviterName} has invited you`
      : "You've been invited";
    const roleText = options.roleName ? ` as ${options.roleName}` : '';

    const text = `
${inviterText} to join ${options.tenantName}${roleText}.

Click here to accept: ${options.inviteUrl}

This invitation expires in 7 days.
`.trim();

    const html = `
<p>${inviterText} to join <strong>${options.tenantName}</strong>${roleText}.</p>
<p><a href="${options.inviteUrl}">Accept Invitation</a></p>
<p>Or copy this link: ${options.inviteUrl}</p>
<p>This invitation expires in 7 days.</p>
`.trim();

    await this.send({ to: email, subject, text, html });
  }

  /**
   * Core send method - uses SendGrid or logs to console
   */
  async send(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    const { to, subject, text, html } = params;

    if (!this.sendgridConfigured) {
      this.logEmailToConsole(to, subject, text);
      return;
    }

    // Validate SendGrid config
    if (!this.fromEmail || !this.fromName) {
      throw new Error('SENDGRID_FROM_EMAIL and SENDGRID_FROM_NAME are required when SENDGRID_API_KEY is set');
    }

    try {
      await sgMail.send({
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject,
        text,
        html: html || text.replace(/\n/g, '<br>'),
      });

      this.logger.log(`Email sent to ${to}: "${subject}"`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send email to ${to}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Log email to console for dev/testing
   */
  private logEmailToConsole(
    to: string,
    subject: string,
    body: string,
  ): void {
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL (SendGrid not configured - logging to console)');
    console.log('='.repeat(60));
    console.log(`To: ${to}`);
    console.log(`From: ${this.fromName} <${this.fromEmail}>`);
    console.log(`Subject: ${subject}`);
    console.log('-'.repeat(60));
    console.log(body);
    console.log('='.repeat(60) + '\n');
  }
}
