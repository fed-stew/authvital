import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  Param,
  BadRequestException,
  NotFoundException,
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
 * Signup Controller
 * Public endpoints for tenant signup and email verification
 * 
 * Uses InstanceService for configuration (replaces Directory model)
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
    // Extract cookie domain from BASE_URL for cross-subdomain cookies
    const baseUrl = this.configService.get<string>('BASE_URL');
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        // Use the hostname as cookie domain (e.g., .example.com for subdomain sharing)
        // Only set domain for non-localhost to allow subdomain cookies
        if (!url.hostname.includes('localhost')) {
          this.cookieDomain = '.' + url.hostname.replace(/^www\./, '');
        }
      } catch {
        // Invalid URL, leave cookieDomain undefined
      }
    }
  }

  /**
   * Get public instance configuration for signup/login forms
   * PUBLIC - No authentication required
   */
  @Get('config')
  async getInstanceConfig() {
    const config = await this.instanceService.getSignupConfig();
    const branding = await this.instanceService.getBrandingConfig();

    return {
      name: branding.name,
      allowSignUp: config.allowSignUp,
      requiredUserFields: config.requiredUserFields,
      allowGenericDomains: config.allowGenericDomains,
      // Single-tenant mode - when true, don't show tenant name/slug fields
      singleTenantMode: config.singleTenantMode,
      branding: {
        name: branding.name,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
      },
    };
  }

  /**
   * Check if a slug is available for a new tenant
   * Slugs are now globally unique (no directory scoping)
   */
  @Get('check-slug')
  async checkSlug(
    @Query('slug') slug: string,
  ) {
    if (!slug) {
      throw new BadRequestException('slug is required');
    }
    
    // Normalize slug
    const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    if (normalizedSlug.length < 2) {
      return {
        available: false,
        slug: normalizedSlug,
        reason: 'Slug must be at least 2 characters',
      };
    }
    
    // Reserved slugs
    const reserved = ['admin', 'api', 'www', 'app', 'id', 'auth', 'login', 'signup', 'register'];
    if (reserved.includes(normalizedSlug)) {
      return {
        available: false,
        slug: normalizedSlug,
        reason: 'This URL is reserved',
      };
    }
    
    // Check if slug exists (globally unique now)
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedSlug },
    });
    
    if (existingTenant) {
      return {
        available: false,
        slug: normalizedSlug,
        reason: 'This URL is already taken',
      };
    }
    
    return {
      available: true,
      slug: normalizedSlug,
    };
  }

  /**
   * Get available license types for signup (by application)
   * PUBLIC - No authentication required
   * Used for showing plan selection during signup
   */
  @Get('license-types/:applicationId')
  async getLicenseTypesForSignup(
    @Param('applicationId') applicationId: string,
  ) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId, isActive: true },
      select: {
        id: true,
        name: true,
        licensingMode: true,
      },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    // FREE apps have an auto-provisioned "Free" license type - return it
    // (no special case needed, the query below will find it)

    // Get active license types for this application
    const licenseTypes = await this.prisma.licenseType.findMany({
      where: {
        applicationId,
        status: 'ACTIVE',
      },
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        features: true,
        maxMembers: true,
        displayPrice: true,
        displayOrder: true,
      },
    });

    return {
      application: {
        id: app.id,
        name: app.name,
        licensingMode: app.licensingMode,
      },
      licenseTypes,
    };
  }

  /**
   * Look up application by clientId
   * PUBLIC - No authentication required
   * Used during signup to get application info and load license types
   */
  @Get('application/:clientId')
  async getApplicationByClientId(
    @Param('clientId') clientId: string,
  ) {
    const app = await this.prisma.application.findUnique({
      where: { clientId, isActive: true },
      select: {
        id: true,
        clientId: true,
        name: true,
        licensingMode: true,
      },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    return {
      id: app.id,
      clientId: app.clientId,
      name: app.name,
      licensingMode: app.licensingMode,
    };
  }

  /**
   * Get pending signup info by verification token
   * PUBLIC - No authentication required
   * Used during complete-signup to load application and plan info
   * 
   * Security: Returns generic error for all failure cases to prevent enumeration attacks.
   * Token is invalidated (nulled) after signup completion.
   */
  @Get('pending/:token')
  async getPendingSignupByToken(
    @Param('token') token: string,
  ) {
    // Generic error message for all failure cases - no hints about why it failed
    const genericError = 'This link is invalid or has expired.';

    const pending = await this.prisma.pendingSignup.findUnique({
      where: { verificationToken: token },
    });

    // Token not found (includes already-used tokens since we null them out)
    if (!pending) {
      throw new BadRequestException(genericError);
    }

    // Token expired
    if (pending.expiresAt && new Date() > pending.expiresAt) {
      throw new BadRequestException(genericError);
    }

    // Fetch application info if applicationId exists
    let application = null;
    if (pending.applicationId) {
      const app = await this.prisma.application.findUnique({
        where: { id: pending.applicationId, isActive: true },
        select: {
          id: true,
          name: true,
          clientId: true,
          licensingMode: true,
        },
      });
      if (app) {
        application = app;
      }
    }

    return {
      email: pending.email,
      givenName: pending.givenName,
      familyName: pending.familyName,
      selectedLicenseTypeId: pending.selectedLicenseTypeId,
      application,
      status: pending.status,
      expiresAt: pending.expiresAt,
    };
  }

  /**
   * Initiate signup - sends verification link to email
   * 
   * NOTE: selectedLicenseTypeId is optional. If not provided:
   *  - If Application.autoProvisionOnSignup=true with defaultLicenseTypeId → will auto-provision
   *  - If Application.autoProvisionOnSignup=false → no subscription created
   */
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  async initiateSignup(
    @Body() body: { 
      email: string; 
      givenName?: string;
      familyName?: string;
      callbackUrl?: string;  // Client app's verification page URL
      redirectUri?: string;  // Where to redirect after signup completion
      clientId?: string;     // The application that initiated signup (optional - will grant FREE apps if not provided)
      selectedLicenseTypeId?: string; // User's selected license type (OPTIONAL)
    },
  ) {
    this.logger.log(`Signup initiate - FULL BODY: ${JSON.stringify(body)}`);
    
    const { email, givenName, familyName, callbackUrl, clientId, selectedLicenseTypeId } = body;
    
    if (!email) {
      throw new BadRequestException('Email is required');
    }
    
    // Look up application by clientId (optional - if provided)
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
    
    // Get instance configuration
    const signupConfig = await this.instanceService.getSignupConfig();
    
    if (!signupConfig.allowSignUp) {
      throw new BadRequestException('Sign-up is not enabled for this instance');
    }
    
    this.logger.log(`Initiating signup for ${normalizedEmail}`);
    
    // Check if user already exists (email is globally unique)
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
    
    // Generate URL-safe verification token
    const verificationToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Create or update pending signup (email is globally unique)
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
    
    // Send verification email with link (to client app's callback URL)
    await this.emailService.sendVerificationEmail(normalizedEmail, verificationToken, {
      name: givenName,
      callbackUrl,  // Client app's verification page
    });
    
    this.logger.log(`Verification email sent to ${normalizedEmail}`);
    
    // Check domain for existing tenant (for UI info)
    const domain = extractDomain(email);
    const isGeneric = isGenericDomain(domain);
    
    let existingTenant = null;
    if (!isGeneric) {
      const verifiedDomain = await this.prisma.domain.findFirst({
        where: {
          domainName: domain,
          isVerified: true,
        },
        include: {
          tenant: {
            select: { id: true, name: true, slug: true },
          },
        },
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
  async verifyEmailLink(
    @Query('token') token: string,
  ) {
    this.logger.log(`Verifying email token`);
    
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    
    const pending = await this.prisma.pendingSignup.findUnique({
      where: { verificationToken: token },
    });
    
    if (!pending) {
      return {
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired verification link.',
      };
    }
    
    if (pending.status === 'COMPLETED') {
      return {
        success: false,
        error: 'ALREADY_COMPLETED',
        message: 'This signup has already been completed.',
      };
    }
    
    if (new Date() > pending.expiresAt) {
      await this.prisma.pendingSignup.update({
        where: { id: pending.id },
        data: { status: 'EXPIRED' },
      });
      return {
        success: false,
        error: 'EXPIRED',
        message: 'Verification link has expired. Please sign up again.',
      };
    }
    
    // Mark as verified
    await this.prisma.pendingSignup.update({
      where: { id: pending.id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
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
  async verifyEmailToken(
    @Body() body: { token: string },
  ) {
    return this.verifyEmailLink(body.token);
  }

  /**
   * Complete signup - creates user and organization
   * Requires email to be verified first
   * Sets session cookie directly (no separate exchange step needed)
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
    
    // Find the pending signup - either by email or token
    let pending;
    if (token) {
      pending = await this.prisma.pendingSignup.findUnique({
        where: { verificationToken: token },
      });
    } else {
      pending = await this.prisma.pendingSignup.findUnique({
        where: { email: normalizedEmail },
      });
    }
    
    // Look up application to get initiateLoginUri (if applicationId was stored)
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

    // applicationId is optional - if not provided, will grant access to FREE apps

    // Determine which license type to use (string | undefined)
    let licenseTypeIdToProvision: string | undefined = pending.selectedLicenseTypeId || undefined;
    
    // If no license type was selected and we have an applicationId, check if application has auto-provisioning configured
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
      
      // Check if accessMode allows auto-provisioning
      const accessModeAllowsAutoProvision = 
        app?.accessMode === AccessMode.AUTOMATIC || 
        app?.accessMode === AccessMode.MANUAL_AUTO_GRANT;

      if (app?.autoProvisionOnSignup && app.defaultLicenseTypeId && accessModeAllowsAutoProvision) {
        this.logger.log(`Auto-provisioning default license type: ${app.defaultLicenseTypeId} (accessMode=${app.accessMode})`);
        licenseTypeIdToProvision = app.defaultLicenseTypeId;
      } else if (app?.autoProvisionOnSignup && !accessModeAllowsAutoProvision) {
        this.logger.log(`Skipping auto-provision: accessMode=${app.accessMode} does not allow auto-provisioning`);
        // Continue without provisioning - accessMode blocks it
      } else if (app?.autoProvisionOnSignup) {
        this.logger.warn(`autoProvisionOnSignup is true but no defaultLicenseTypeId configured for app ${app.id}`);
        // Continue without provisioning - will be handled by signUpService
      } else {
        this.logger.log(`No license type selected and autoProvisionOnSignup is false - skipping license provisioning`);
      }
    } else if (!pending.applicationId) {
      this.logger.log('No applicationId - signUpService will auto-provision all FREE apps');
    }

    // Complete signup using the signup service
    const result = await this.signUpService.signUp({
      ...dto,
      email: normalizedEmail,
      givenName: dto.givenName || pending.givenName || undefined,
      familyName: dto.familyName || pending.familyName || undefined,
      selectedLicenseTypeId: licenseTypeIdToProvision,
      applicationId: pending.applicationId || undefined,
    });
    
    // DELETE the pending signup record - token can never be reused
    // This prevents enumeration attacks (no way to tell if token was "used" vs "never existed")
    await this.prisma.pendingSignup.delete({
      where: { id: pending.id },
    });
    
    // Send welcome email
    await this.emailService.sendWelcomeEmail(normalizedEmail, {
      name: result.user.givenName || undefined,
      tenantName: result.tenant?.name,
    });
    
    // Generate JWT and set session cookies directly
    const accessToken = await this.authService.generateJwt(
      result.user.id,
      result.user.email || '',
    );
    
    // Set both cookie names for compatibility
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
      initiateLoginUri, // Template for redirect URL (e.g., "https://{tenant}.myapp.com/api/auth/login")
    };
  }

  /**
   * Resend verification email
   */
  @Post('resend')
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @Body() body: { email: string; callbackUrl?: string; redirectUri?: string },
  ) {
    const { email, callbackUrl } = body;
    const normalizedEmail = email.toLowerCase();
    
    const pending = await this.prisma.pendingSignup.findUnique({
      where: { email: normalizedEmail },
    });
    
    if (!pending) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'No pending signup found. Please start again.',
      };
    }
    
    if (pending.status === 'COMPLETED') {
      return {
        success: false,
        error: 'ALREADY_COMPLETED',
        message: 'This signup has already been completed.',
      };
    }
    
    // Generate new token
    const verificationToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await this.prisma.pendingSignup.update({
      where: { id: pending.id },
      data: {
        verificationToken,
        expiresAt,
        status: 'PENDING',
      },
    });
    
    // Send new verification email
    await this.emailService.sendVerificationEmail(normalizedEmail, verificationToken, {
      name: pending.givenName || undefined,
      callbackUrl,
    });
    
    this.logger.log(`Resent verification email to ${normalizedEmail}`);
    
    return {
      success: true,
      message: 'New verification email sent.',
    };
  }

  /**
   * Get pending signups (admin endpoint)
   */
  @Get('pending-signups')
  async getPendingSignups() {
    const pendingSignups = await this.prisma.pendingSignup.findMany({
      where: {
        status: { in: ['PENDING', 'VERIFIED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        givenName: true,
        familyName: true,
        tenantName: true,
        status: true,
        expiresAt: true,
        verifiedAt: true,
        createdAt: true,
      },
    });
    
    return pendingSignups;
  }

  /**
   * Exchange redirect token for JWT
   * Called by client app after signup redirect
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
    
    // Delete used token (one-time use)
    redirectTokens.delete(token);
    
    // Get user data
    const user = await this.prisma.user.findUnique({
      where: { id: tokenData.userId },
      select: {
        id: true,
        email: true,
        givenName: true,
        familyName: true,
      },
    });
    
    if (!user) {
      throw new BadRequestException('User not found');
    }
    
    // Get tenant data
    const tenant = tokenData.tenantId ? await this.prisma.tenant.findUnique({
      where: { id: tokenData.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }) : null;
    
    // Generate JWT (stateless - no DB storage needed)
    const jwt = await this.authService.generateJwt(
      user.id,
      user.email || '',
    );
    
    // Set JWT in httpOnly cookie (shared across subdomains if domain is configured)
    const cookieOptions = {
      ...getSessionCookieOptions(),
      ...(this.cookieDomain && { domain: this.cookieDomain }),
    };
    res.cookie('session_token', jwt, cookieOptions);
    
    this.logger.log(`Token exchanged for user ${user.email}, JWT issued`);
    
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        givenName: user.givenName,
        familyName: user.familyName,
      },
      tenant,
    };
  }
}
