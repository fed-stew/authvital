import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from "@nestjs/common";
import {
  SignUpService,
  SignUpDto,
  AnonymousSignUpDto,
  UpgradeAccountDto,
} from "./signup.service";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthenticatedRequest } from "./interfaces/auth.interface";

@Controller("auth")
export class SignUpController {
  constructor(
    private readonly signUpService: SignUpService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Public sign-up endpoint
   * Creates user, tenant (if corporate email), and domain record
   */
  @Post("signup")
  @HttpCode(HttpStatus.CREATED)
  async signUp(@Body() dto: SignUpDto) {
    const result = await this.signUpService.signUp(dto);

    // Don't expose verification token in response
    return {
      user: result.user,
      tenant: result.tenant,
      membership: result.membership,
      domain: result.domain
        ? {
            id: result.domain.id,
            domainName: result.domain.domainName,
            isVerified: result.domain.isVerified,
            // Only show that verification is available, not the token
            canVerify: !result.domain.isVerified,
          }
        : null,
      joinedExistingTenant: result.joinedExistingTenant,
    };
  }

  /**
   * Anonymous sign-up endpoint
   * Creates user with just an ID - no email/password required
   * Use case: Mobile games, try-before-you-buy experiences
   */
  @Post("signup/anonymous")
  @HttpCode(HttpStatus.CREATED)
  async signUpAnonymous(@Body() dto: AnonymousSignUpDto) {
    const result = await this.signUpService.signUpAnonymous(dto);

    return {
      user: result.user,
      // IMPORTANT: This token is only shown ONCE
      // Client must save it securely for future authentication
      anonymousToken: result.anonymousToken,
      message:
        "Save this token securely! It is your only way to access this account until you upgrade.",
    };
  }

  /**
   * Upgrade anonymous account to full account
   * Requires authentication with anonymous token
   */
  @Post("upgrade-account")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async upgradeAccount(
    @Request() req: AuthenticatedRequest,
    @Body() dto: Omit<UpgradeAccountDto, "userId">,
  ) {
    const result = await this.signUpService.upgradeAnonymousAccount({
      ...dto,
      userId: req.user.id,
    });

    return {
      user: result.user,
      tenant: result.tenant,
      membership: result.membership,
      domain: result.domain
        ? {
            id: result.domain.id,
            domainName: result.domain.domainName,
            isVerified: result.domain.isVerified,
            canVerify: !result.domain.isVerified,
          }
        : null,
      joinedExistingTenant: result.joinedExistingTenant,
      message: "Account upgraded successfully!",
    };
  }
}
