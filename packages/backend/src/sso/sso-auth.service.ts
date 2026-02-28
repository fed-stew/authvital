import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SsoProviderService } from './sso-provider.service';
import { TenantSsoConfigService } from './tenant-sso-config.service';
import { GoogleProvider } from './providers/google.provider';
import { MicrosoftProvider } from './providers/microsoft.provider';
import { BaseSsoProvider, SsoUserProfile } from './providers/base.provider';
import { SsoProviderType, MembershipStatus } from '@prisma/client';
import * as crypto from 'crypto';

export interface SsoAuthState {
  provider: SsoProviderType;
  tenantId?: string;
  tenantSlug?: string;
  clientId?: string; // OAuth client (application) for redirect after auth
  redirectUri?: string; // Where to redirect after auth
  nonce: string;
}

export interface SsoAuthResult {
  user: {
    id: string;
    email: string;
    displayName?: string;
  };
  isNewUser: boolean;
  accessToken: string;
  redirectTo?: string;
}

@Injectable()
export class SsoAuthService {
  private readonly logger = new Logger(SsoAuthService.name);
  private readonly baseUrl: string;

  // In-memory state store (use Redis in production)
  private stateStore = new Map<string, { state: SsoAuthState; expiresAt: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ssoProviderService: SsoProviderService,
    private readonly tenantSsoConfigService: TenantSsoConfigService,
    private readonly googleProvider: GoogleProvider,
    private readonly microsoftProvider: MicrosoftProvider,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('BASE_URL');

    // Clean up expired states every 5 minutes
    setInterval(() => this.cleanupExpiredStates(), 5 * 60 * 1000);
  }

  /**
   * Get the provider instance for a given type
   */
  private getProvider(type: SsoProviderType): BaseSsoProvider {
    switch (type) {
      case 'GOOGLE':
        return this.googleProvider;
      case 'MICROSOFT':
        return this.microsoftProvider;
      default:
        throw new BadRequestException(`Unknown SSO provider: ${type}`);
    }
  }

  /**
   * Generate the callback URL for SSO
   */
  getCallbackUrl(provider: SsoProviderType): string {
    return `${this.baseUrl}/api/auth/sso/${provider.toLowerCase()}/callback`;
  }

  /**
   * Initiate SSO flow - generates authorization URL
   */
  async initiateAuth(
    provider: SsoProviderType,
    options: {
      tenantId?: string;
      tenantSlug?: string;
      clientId?: string;
      redirectUri?: string;
    } = {},
  ): Promise<{ authorizationUrl: string; state: string }> {
    // Get effective config (tenant override or instance)
    const config = await this.tenantSsoConfigService.getEffectiveSsoConfig(
      options.tenantId || null,
      provider,
    );

    if (!config) {
      throw new BadRequestException(`SSO provider ${provider} is not enabled`);
    }

    const providerInstance = this.getProvider(provider);
    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const redirectUri = this.getCallbackUrl(provider);

    // Store state for verification
    const authState: SsoAuthState = {
      provider,
      tenantId: options.tenantId,
      tenantSlug: options.tenantSlug,
      clientId: options.clientId,
      redirectUri: options.redirectUri,
      nonce,
    };

    this.stateStore.set(state, {
      state: authState,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const authorizationUrl = providerInstance.getAuthorizationUrl(
      {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: config.scopes,
      },
      redirectUri,
      state,
      nonce,
    );

    this.logger.log(`Initiated ${provider} SSO flow, state: ${state.substring(0, 8)}...`);

    return { authorizationUrl, state };
  }

  /**
   * Handle OAuth callback - exchange code and authenticate user
   */
  async handleCallback(
    provider: SsoProviderType,
    code: string,
    state: string,
  ): Promise<SsoAuthResult> {
    // Verify state
    const storedState = this.stateStore.get(state);
    if (!storedState || storedState.expiresAt < Date.now()) {
      this.stateStore.delete(state);
      throw new UnauthorizedException('Invalid or expired SSO state');
    }

    if (storedState.state.provider !== provider) {
      throw new UnauthorizedException('SSO provider mismatch');
    }

    const authState = storedState.state;
    this.stateStore.delete(state); // One-time use

    // Get config
    const config = await this.tenantSsoConfigService.getEffectiveSsoConfig(
      authState.tenantId || null,
      provider,
    );

    if (!config) {
      throw new BadRequestException(`SSO provider ${provider} is no longer enabled`);
    }

    const providerInstance = this.getProvider(provider);
    const redirectUri = this.getCallbackUrl(provider);

    // Exchange code for tokens
    const tokens = await providerInstance.exchangeCodeForTokens(
      {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: config.scopes,
      },
      code,
      redirectUri,
    );

    // Get user profile
    const profile = await providerInstance.getUserProfile(tokens.accessToken, tokens.idToken);

    this.logger.log(`SSO profile received: ${profile.email} from ${provider}`);

    // Validate email domain if restrictions set
    if (config.allowedDomains.length > 0) {
      const emailDomain = profile.email.split('@')[1]?.toLowerCase();
      const isAllowed = config.allowedDomains.some(
        (d) => d.toLowerCase() === emailDomain,
      );
      if (!isAllowed) {
        throw new UnauthorizedException(
          `Email domain ${emailDomain} is not allowed for SSO`,
        );
      }
    }

    // Find or create user
    const { user, isNewUser } = await this.findOrCreateUser(profile, provider, authState.tenantId);

    // Generate access token
    const accessToken = await this.generateAccessToken(user.id);

    // Determine redirect URL
    let redirectTo = '/auth/app-picker';
    if (authState.redirectUri) {
      // SECURITY: Only allow same-origin relative paths to prevent open redirect
      if (authState.redirectUri.startsWith('/') && !authState.redirectUri.startsWith('//')) {
        redirectTo = authState.redirectUri;
      } else {
        this.logger.warn(`Blocked unsafe redirect URI: ${authState.redirectUri}`);
      }
    } else if (authState.clientId) {
      // TODO: Look up application and build authorize URL
      redirectTo = `/oauth/authorize?client_id=${authState.clientId}`;
    }

    return {
      user: {
        id: user.id,
        email: user.email!,
        displayName: user.displayName || undefined,
      },
      isNewUser,
      accessToken,
      redirectTo,
    };
  }

  /**
   * Find existing user or create new one
   */
  private async findOrCreateUser(
    profile: SsoUserProfile,
    provider: SsoProviderType,
    tenantId?: string,
  ): Promise<{ user: any; isNewUser: boolean }> {
    // First, check if we have an existing SSO link
    const existingLink = await this.prisma.userSsoLink.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
      include: { user: true },
    });

    if (existingLink) {
      // Update last used and profile info
      await this.prisma.userSsoLink.update({
        where: { id: existingLink.id },
        data: {
          lastUsedAt: new Date(),
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          rawProfile: profile.rawProfile,
        },
      });

      this.logger.log(`SSO login for existing linked user: ${existingLink.user.email}`);
      return { user: existingLink.user, isNewUser: false };
    }

    // Check if user exists with same email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    // Get instance config to check auto-link setting
    const instanceConfig = await this.ssoProviderService.getProvider(provider);
    const autoLinkExisting = instanceConfig?.autoLinkExisting ?? true;
    const autoCreateUser = instanceConfig?.autoCreateUser ?? true;

    if (existingUser) {
      if (!autoLinkExisting) {
        throw new BadRequestException(
          'An account with this email already exists. Please log in with your password.',
        );
      }

      // SECURITY: Require verified email from SSO provider before auto-linking
      if (!profile.emailVerified) {
        throw new UnauthorizedException(
          'Email not verified by SSO provider. Please verify your email with Google/Microsoft first, or log in with your password.',
        );
      }

      // Link SSO to existing account
      await this.prisma.userSsoLink.create({
        data: {
          userId: existingUser.id,
          provider,
          providerUserId: profile.providerUserId,
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          rawProfile: profile.rawProfile,
          lastUsedAt: new Date(),
        },
      });

      // Update email verification if SSO provider verified it
      if (profile.emailVerified && !existingUser.emailVerified) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { emailVerified: true },
        });
      }

      this.logger.log(`Linked ${provider} SSO to existing user: ${existingUser.email}`);
      return { user: existingUser, isNewUser: false };
    }

    // Create new user
    if (!autoCreateUser) {
      throw new BadRequestException(
        'Account creation via SSO is not enabled. Please sign up first.',
      );
    }

    const newUser = await this.prisma.user.create({
      data: {
        email: profile.email,
        emailVerified: profile.emailVerified,
        displayName: profile.displayName,
        givenName: profile.givenName,
        familyName: profile.familyName,
        pictureUrl: profile.avatarUrl,
        ssoLinks: {
          create: {
            provider,
            providerUserId: profile.providerUserId,
            email: profile.email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            rawProfile: profile.rawProfile,
            lastUsedAt: new Date(),
          },
        },
      },
    });

    this.logger.log(`Created new user via ${provider} SSO: ${newUser.email}`);

    // If tenant context, add user to tenant
    if (tenantId) {
      await this.prisma.membership.create({
        data: {
          userId: newUser.id,
          tenantId,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });
      this.logger.log(`Added new SSO user to tenant: ${tenantId}`);
    }

    return { user: newUser, isNewUser: true };
  }

  /**
   * Generate access token for user
   * TODO: Refactor to use shared AuthService method
   */
  private async generateAccessToken(userId: string): Promise<string> {
    const jwt = await import('jsonwebtoken');
    const secret = this.configService.getOrThrow<string>('SIGNING_KEY_SECRET');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    return jwt.sign(
      { sub: userId, email: user?.email },
      secret,
      { expiresIn: '7d' },
    );
  }

  /**
   * Clean up expired states
   */
  private cleanupExpiredStates() {
    const now = Date.now();
    for (const [key, value] of this.stateStore.entries()) {
      if (value.expiresAt < now) {
        this.stateStore.delete(key);
      }
    }
  }
}
