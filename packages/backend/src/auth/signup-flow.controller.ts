import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  BadRequestException,
  Logger,
  Res,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { AccessMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SignUpService, SignUpDto } from './signup.service';
import { EmailService } from './email.service';
import { AuthService } from './auth.service';
import { InstanceService } from '../instance/instance.service';
import { extractDomain, isGenericDomain } from './constants/generic-domains';
import { getSessionCookieOptions } from '../common/utils/cookie.utils';
import * as crypto from 'crypto';
import { redirectTokens } from './redirect-tokens';

/**
 * Signup Flow Controller
 * Handles the actual signup flow (initiate, verify, complete)
 * Config/lookup endpoints are in SignupConfigController
 */
@Controller('signup')
export class SignupFlowController {
  private readonly logger = new Logger(SignupFlowController.name);
  private readonly cookieDomain: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly signUpService: SignUpService,
    private readonly emailService: EmailService,
    private readonly authService: AuthService,
    private readonly instanceService: InstanceService,
    private readonly configService: ConfigService,
  ) {
    const baseUrl = this.configService.get<string>('BASE_URL');
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        if (!url.hostname.includes('localhost')) {
          this.cookieDomain = '.' + url.hostname.replace(/^www\./, '');
        }
      } catch {
        // Invalid URL, leave cookieDomain undefined
      }
    }
  }

  /**
   * Initiate signup - sends verification link to email
   */
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  async initiateSignup(
    @Body() body: {
      email: string;
      givenName?: string;
      familyName?: string;
      callbackUrl?: string;
      redirectUri?: string;
      clientId?: string;
      selectedLicenseTypeId?: string;
    },
  ) {
    this.logger.log(`Signup initiate - FULL BODY: ${JSON.stringify(body)}`);

    const { email, givenName, familyName, callbackUrl, clientId, selectedLicenseTypeId } = body;

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    let applicationId: string | null = null;
    if (clientId) {
      const app = await this.prisma.application.findUnique({
        where: { clientId },
        select: { id: true, name: true },
      });

      if (!app) {
        throw new BadRequestException('Invalid application');
      }

      applicationId = app.id;
      this.logger.log(`Found application ${applicationId} (${app.name}) for clientId ${clientId}`);
    } else {
      this.logger.log('No clientId provided - will grant access to FREE apps after signup');
    }

    const normalizedEmail = email.toLowerCase();
    const signupConfig = await this.instanceService.getSignupConfig();

    if (!signupConfig.allowSignUp) {
      throw new BadRequestException('Sign-up is not enabled for this instance');
    }

    this.logger.log(`Initiating signup for ${normalizedEmail}`);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return {
        success: false,
        error: 'EMAIL_EXISTS',
        message: 'An account with this email already exists',
      };
    }

    const verificationToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const pendingSignup = await this.prisma.pendingSignup.upsert({
      where: { email: normalizedEmail },
      update: {
        verificationToken,
        givenName,
        familyName,
        applicationId,
        selectedLicenseTypeId,
        status: 'PENDING',
        expiresAt,
        verifiedAt: null,
        completedAt: null,
      },
      create: {
        email: normalizedEmail,
        verificationToken,
        givenName,
        familyName,
        applicationId,
        selectedLicenseTypeId,
        status: 'PENDING',
        expiresAt,
      },
    });

    await this.emailService.sendVerificationEmail(normalizedEmail, verificationToken, {
      name: givenName,
      callbackUrl,
    });

    this.logger.log(`Verification email sent to ${normalizedEmail}`);

    const domain = extractDomain(email);
    const isGeneric = isGenericDomain(domain);

    let existingTenant = null;
    if (!isGeneric) {
      const verifiedDomain = await this.prisma.domain.findFirst({
        where: { domainName: domain, isVerified: true },
        include: { tenant: { select: { id: true, name: true, slug: true } } },
      });

      if (verifiedDomain) {
        existingTenant = verifiedDomain.tenant;
      }
    }

    return {
      success: true,
      pendingSignupId: pendingSignup.id,
      email: normalizedEmail,
      willJoinExisting: !!existingTenant,
      existingTenant,
      willCreateNew: !existingTenant,
      message: 'Verification email sent. Please check your inbox.',
    };
  }

  /**
   * Verify email via token (from link)
   */
  @Get('verify')
  async verifyEmailLink(@Query('token') token: string) {
    this.logger.log(`Verifying email token`);

    if (!token) {
      throw new BadRequestException('Token is required');
    }

    const pending = await this.prisma.pendingSignup.findUnique({
      where: { verificationToken: token },
    });

    if (!pending) {
      return { success: false, error: 'INVALID_TOKEN', message: 'Invalid or expired verification link.' };
    }

    if (pending.status === 'COMPLETED') {
      return { success: false, error: 'ALREADY_COMPLETED', message: 'This signup has already been completed.' };
    }

    if (new Date() > pending.expiresAt) {
      await this.prisma.pendingSignup.update({
        where: { id: pending.id },
        data: { status: 'EXPIRED' },
      });
      return { success: false, error: 'EXPIRED', message: 'Verification link has expired. Please sign up again.' };
    }

    await this.prisma.pendingSignup.update({
      where: { id: pending.id },
      data: { status: 'VERIFIED', verifiedAt: new Date() },
    });

    this.logger.log(`Email verified for ${pending.email}`);

    return {
      success: true,
      verified: true,
      email: pending.email,
      givenName: pending.givenName,
      familyName: pending.familyName,
      tenantName: pending.tenantName,
      message: 'Email verified! You can now complete your signup.',
    };
  }

  /**
   * POST version for verifying token (alternative to GET)
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmailToken(@Body() body: { token: string }) {
    return this.verifyEmailLink(body.token);
  }

  /**
   * Complete signup - creates user and organization
   */
  @Post('complete')
  @HttpCode(HttpStatus.CREATED)
  async completeSignup(
    @Body() body: SignUpDto & { token?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, ...dto } = body;
    const normalizedEmail = dto.email.toLowerCase();

    this.logger.log(`Completing signup for ${normalizedEmail}`);

    let pending;
    if (token) {
      pending = await this.prisma.pendingSignup.findUnique({ where: { verificationToken: token } });
    } else {
      pending = await this.prisma.pendingSignup.findUnique({ where: { email: normalizedEmail } });
    }

    let initiateLoginUri: string | null = null;
    if (pending?.applicationId) {
      const app = await this.prisma.application.findUnique({
        where: { id: pending.applicationId },
        select: { initiateLoginUri: true },
      });
      if (app?.initiateLoginUri) {
        initiateLoginUri = app.initiateLoginUri;
        this.logger.log(`Found initiateLoginUri: ${initiateLoginUri}`);
      }
    }

    if (!pending) {
      throw new BadRequestException('Email not verified. Please complete verification first.');
    }

    if (pending.status === 'COMPLETED') {
      throw new BadRequestException('This signup has already been completed.');
    }

    if (pending.status !== 'VERIFIED') {
      throw new BadRequestException('Email not verified. Please click the verification link sent to your email.');
    }

    let licenseTypeIdToProvision: string | undefined = pending.selectedLicenseTypeId || undefined;

    if (!licenseTypeIdToProvision && pending.applicationId) {
      const app = await this.prisma.application.findUnique({
        where: { id: pending.applicationId },
        select: {
          id: true,
          licensingMode: true,
          defaultLicenseTypeId: true,
          autoProvisionOnSignup: true,
          accessMode: true,
        },
      });

      const accessModeAllowsAutoProvision =
        app?.accessMode === AccessMode.AUTOMATIC || app?.accessMode === AccessMode.MANUAL_AUTO_GRANT;

      if (app?.autoProvisionOnSignup && app.defaultLicenseTypeId && accessModeAllowsAutoProvision) {
        this.logger.log(`Auto-provisioning default license type: ${app.defaultLicenseTypeId}`);
        licenseTypeIdToProvision = app.defaultLicenseTypeId;
      } else if (app?.autoProvisionOnSignup && !accessModeAllowsAutoProvision) {
        this.logger.log(`Skipping auto-provision: accessMode=${app.accessMode} does not allow auto-provisioning`);
      } else {
        this.logger.log(`No license type selected and autoProvisionOnSignup is false`);
      }
    } else if (!pending.applicationId) {
      this.logger.log('No applicationId - signUpService will auto-provision all FREE apps');
    }

    const result = await this.signUpService.signUp({
      ...dto,
      email: normalizedEmail,
      givenName: dto.givenName || pending.givenName || undefined,
      familyName: dto.familyName || pending.familyName || undefined,
      selectedLicenseTypeId: licenseTypeIdToProvision,
      applicationId: pending.applicationId || undefined,
    });

    await this.prisma.pendingSignup.delete({ where: { id: pending.id } });

    await this.emailService.sendWelcomeEmail(normalizedEmail, {
      name: result.user.givenName || undefined,
      tenantName: result.tenant?.name,
    });

    const accessToken = await this.authService.generateJwt(result.user.id, result.user.email || '');
    const cookieOptions = getSessionCookieOptions();

    res.cookie('auth_token', accessToken, cookieOptions);
    res.cookie('idp_session', accessToken, cookieOptions);

    this.logger.log(`Signup completed for ${normalizedEmail}, session cookie set`);

    return {
      success: true,
      user: result.user,
      tenant: result.tenant,
      membership: result.membership,
      joinedExisting: result.joinedExistingTenant,
      initiateLoginUri,
    };
  }

  /**
   * Resend verification email
   */
  @Post('resend')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() body: { email: string; callbackUrl?: string; redirectUri?: string }) {
    const { email, callbackUrl } = body;
    const normalizedEmail = email.toLowerCase();

    const pending = await this.prisma.pendingSignup.findUnique({ where: { email: normalizedEmail } });

    if (!pending) {
      return { success: false, error: 'NOT_FOUND', message: 'No pending signup found. Please start again.' };
    }

    if (pending.status === 'COMPLETED') {
      return { success: false, error: 'ALREADY_COMPLETED', message: 'This signup has already been completed.' };
    }

    const verificationToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.pendingSignup.update({
      where: { id: pending.id },
      data: { verificationToken, expiresAt, status: 'PENDING' },
    });

    await this.emailService.sendVerificationEmail(normalizedEmail, verificationToken, {
      name: pending.givenName || undefined,
      callbackUrl,
    });

    this.logger.log(`Resent verification email to ${normalizedEmail}`);

    return { success: true, message: 'New verification email sent.' };
  }

  /**
   * Exchange redirect token for JWT
   */
  @Post('exchange-token')
  @HttpCode(HttpStatus.OK)
  async exchangeToken(
    @Body() body: { token: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = body;

    if (!token) {
      throw new BadRequestException('Token is required');
    }

    const tokenData = redirectTokens.get(token);

    if (!tokenData) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (tokenData.expiresAt < new Date()) {
      redirectTokens.delete(token);
      throw new BadRequestException('Token has expired');
    }

    redirectTokens.delete(token);

    const user = await this.prisma.user.findUnique({
      where: { id: tokenData.userId },
      select: { id: true, email: true, givenName: true, familyName: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const tenant = tokenData.tenantId
      ? await this.prisma.tenant.findUnique({
          where: { id: tokenData.tenantId },
          select: { id: true, name: true, slug: true },
        })
      : null;

    const jwt = await this.authService.generateJwt(user.id, user.email || '');

    const cookieOptions = {
      ...getSessionCookieOptions(),
      ...(this.cookieDomain && { domain: this.cookieDomain }),
    };
    res.cookie('session_token', jwt, cookieOptions);

    this.logger.log(`Token exchanged for user ${user.email}, JWT issued`);

    return {
      success: true,
      user: { id: user.id, email: user.email, givenName: user.givenName, familyName: user.familyName },
      tenant,
    };
  }
}
