import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { KeyService } from '../oauth/key.service';
import { MfaService } from './mfa/mfa.service';
import { Prisma } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload, AuthResponse } from './interfaces/auth.interface';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;
  private readonly issuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
    private readonly mfaService: MfaService,
  ) {
    this.issuer = this.configService.getOrThrow<string>("BASE_URL");
  }

  /**
   * Register a new user within the instance
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const normalizedEmail = dto.email.toLowerCase();

    // Check if email already exists (now globally unique)
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
      },
    });

    // Generate tokens
    return this.generateAuthResponse(user.id, user.email || "");
  }

  /**
   * Authenticate user with email and password
   * Supports MFA flow - returns challenge token if MFA is required
   */
  async login(dto: LoginDto): Promise<{
    // Success without MFA
    accessToken?: string;
    user?: {
      id: string;
      email: string | null;
      givenName: string | null;
      familyName: string | null;
    };
    memberships?: Array<{
      id: string;
      tenant: { id: string; name: string; slug: string };
    }>;
    // MFA required
    mfaRequired?: boolean;
    mfaChallengeToken?: string;
  }> {
    const normalizedEmail = dto.email.toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true, mfaPolicy: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Machine users cannot login with password
    if (user.isMachine || !user.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Check if MFA is required (user has it enabled OR any tenant requires it)
    const tenantRequiresMfa = user.memberships.some(
      m => m.tenant.mfaPolicy === 'REQUIRED',
    );

    if (user.mfaEnabled || tenantRequiresMfa) {
      if (user.mfaEnabled) {
        // MFA is set up, require verification
        const challengeToken = await this.issueMfaChallengeToken(user.id, user.email || '');
        return {
          mfaRequired: true,
          mfaChallengeToken: challengeToken,
        };
      }
      // Tenant requires MFA but user hasn't set it up - still let them in
      // The MFA compliance guard will handle enforcement on tenant-scoped routes
    }

    // Generate JWT
    const accessToken = await this.generateJwt(user.id, user.email || "");

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        givenName: user.givenName,
        familyName: user.familyName,
      },
      memberships: user.memberships.map((m) => ({
        id: m.id,
        tenant: m.tenant,
      })),
    };
  }

  /**
   * Issue a short-lived challenge token for MFA verification
   */
  private async issueMfaChallengeToken(userId: string, email: string): Promise<string> {
    return this.keyService.signJwt(
      { email, type: 'mfa_challenge', userType: 'user' },
      {
        subject: userId,
        issuer: this.issuer,
        expiresIn: 5 * 60, // 5 minutes - short lived
      },
    );
  }

  /**
   * Verify MFA code and complete login
   */
  async verifyMfaAndCompleteLogin(challengeToken: string, code: string): Promise<{
    accessToken: string;
    user: {
      id: string;
      email: string | null;
      givenName: string | null;
      familyName: string | null;
    };
    memberships: Array<{
      id: string;
      tenant: { id: string; name: string; slug: string };
    }>;
  }> {
    // Verify challenge token
    let payload;
    try {
      payload = await this.keyService.verifyJwt(challengeToken, this.issuer);
    } catch {
      throw new UnauthorizedException('Invalid or expired challenge token');
    }

    if (payload.type !== 'mfa_challenge' || payload.userType !== 'user') {
      throw new UnauthorizedException('Invalid challenge token');
    }

    const userId = payload.sub as string;

    // Verify MFA code
    await this.mfaService.verifyUserMfa(userId, code);

    // Get user with memberships and issue access token
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid challenge token');
    }

    // Generate access token
    const accessToken = await this.generateJwt(user.id, user.email || '');

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        givenName: user.givenName,
        familyName: user.familyName,
      },
      memberships: user.memberships.map(m => ({
        id: m.id,
        tenant: m.tenant,
      })),
    };
  }

  /**
   * Validate user by ID (used by JWT strategy)
   */
  async validateUser(
    userId: string,
  ): Promise<{ id: string; email: string | null } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    return user;
  }

  /**
   * Get user profile with memberships
   */
  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        mfaEnabled: true,
        givenName: true,
        familyName: true,
        displayName: true,
        pictureUrl: true,
        createdAt: true,
        memberships: {
          select: {
            id: true,
            status: true,
            joinedAt: true,
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Generate JWT token and auth response
   */
  private async generateAuthResponse(
    userId: string,
    email: string,
  ): Promise<AuthResponse> {
    const accessToken = await this.generateJwt(userId, email);

    return {
      accessToken,
      user: {
        id: userId,
        email,
      },
    };
  }

  /**
   * Generate a JWT for a user (used after signup, token exchange, etc.)
   * Uses RSA signing via KeyService
   */
  async generateJwt(userId: string, email: string): Promise<string> {
    return this.keyService.signJwt(
      { email },
      {
        subject: userId,
        issuer: this.issuer,
        expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      },
    );
  }

  /**
   * Validate and decode a JWT token
   * Uses RSA verification via KeyService
   */
  async validateJwt(token: string): Promise<JwtPayload | null> {
    try {
      const payload = await this.keyService.verifyJwt(token, this.issuer);
      return {
        sub: payload.sub as string,
        email: payload.email as string,
      };
    } catch {
      return null;
    }
  }
}
