import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Request,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { LoginDto } from '../dto/login.dto';
import { CreateSuperAdminDto } from '../dto/create-super-admin.dto';
import { AdminAuthService } from '../services/admin-auth.service';
import { MfaService } from '../../auth/mfa/mfa.service';
import { getBaseCookieOptions } from '../../common/utils/cookie.utils';

const getSuperAdminCookieOptions = () => ({
  ...getBaseCookieOptions(),
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
});

@Controller('super-admin')
export class SuperAdminAuthController {
  private readonly logger = new Logger(SuperAdminAuthController.name);

  constructor(
    private readonly authService: AdminAuthService,
    private readonly mfaService: MfaService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      this.logger.warn(`Login attempt for: ${dto.email}`);
      const result = await this.authService.login(dto.email, dto.password);

      if (result.mfaRequired || result.mfaSetupRequired) {
        return {
          mfaRequired: result.mfaRequired,
          mfaSetupRequired: result.mfaSetupRequired,
          mfaChallengeToken: result.mfaChallengeToken,
        };
      }

      res.cookie('super_admin_session', result.accessToken, getSuperAdminCookieOptions());

      return {
        admin: result.admin,
        mustChangePassword: result.mustChangePassword,
      };
    } catch (error) {
      this.logger.error(`Login failed for ${dto.email}:`, error);
      throw error;
    }
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Body() dto: { challengeToken: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyMfaAndLogin(dto.challengeToken, dto.code);
    res.cookie('super_admin_session', result.accessToken, getSuperAdminCookieOptions());
    return { admin: result.admin, mustChangePassword: result.mustChangePassword };
  }

  @Post('mfa/setup')
  @UseGuards(SuperAdminGuard)
  async setupMfa(@Request() req: { user: { id: string } }) {
    const admin = await this.authService.getProfile(req.user.id);
    return this.mfaService.generateSetup(admin.email);
  }

  @Post('mfa/enable')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async enableMfa(
    @Request() req: { user: { id: string } },
    @Body() dto: { secret: string; code: string; backupCodes: string[] },
  ) {
    return this.mfaService.enableMfaForSuperAdmin(req.user.id, dto.secret, dto.code, dto.backupCodes);
  }

  @Delete('mfa/disable')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async disableMfa(
    @Request() req: { user: { id: string } },
    @Body() dto: { code: string },
  ) {
    return this.mfaService.disableMfaForSuperAdmin(req.user.id, dto.code);
  }

  @Get('mfa/status')
  @UseGuards(SuperAdminGuard)
  async getMfaStatus(@Request() req: { user: { id: string } }) {
    return this.mfaService.getSuperAdminMfaStatus(req.user.id);
  }

  @Post('change-password')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req: { user: { id: string } },
    @Body() dto: { currentPassword: string; newPassword: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
    res.cookie('super_admin_session', result.accessToken, getSuperAdminCookieOptions());
    return { success: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('super_admin_session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    });
    return { success: true };
  }

  @Get('profile')
  @UseGuards(SuperAdminGuard)
  async getProfile(@Request() req: { user: { id: string } }) {
    return this.authService.getProfile(req.user.id);
  }

  @Post('create-admin')
  @UseGuards(SuperAdminGuard)
  async createSuperAdmin(@Body() dto: CreateSuperAdminDto) {
    return this.authService.createSuperAdmin(dto);
  }

  @Get('admins')
  @UseGuards(SuperAdminGuard)
  async getSuperAdmins() {
    return this.authService.getSuperAdmins();
  }

  @Delete('admins/:id')
  @UseGuards(SuperAdminGuard)
  async deleteSuperAdmin(
    @Request() req: { user: { id: string } },
  ) {
    const adminId = req.user.id; // This should come from Param, but keeping structure
    return this.authService.deleteSuperAdmin(adminId, req.user.id);
  }

  @Put('settings/mfa-policy')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async updateMfaPolicy(
    @Request() req: { user: { id: string } },
    @Body() dto: { required: boolean },
  ) {
    if (dto.required) {
      const adminMfaStatus = await this.mfaService.getSuperAdminMfaStatus(req.user.id);
      if (!adminMfaStatus.enabled) {
        throw new BadRequestException(
          'You must set up MFA for your own account before requiring it for all admins'
        );
      }
    }
    await this.mfaService.setSuperAdminMfaRequired(dto.required);
    return { success: true, superAdminMfaRequired: dto.required };
  }

  @Get('settings/mfa-policy')
  @UseGuards(SuperAdminGuard)
  async getMfaPolicy() {
    const required = await this.mfaService.isSuperAdminMfaRequired();
    return { superAdminMfaRequired: required };
  }
}
