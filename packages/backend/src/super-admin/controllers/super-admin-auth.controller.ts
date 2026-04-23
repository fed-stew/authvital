import {
  Controller,
  UseGuards,
  Request,
  Res,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { superAdminContract as c } from '@authvital/contracts';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminAuthService } from '../services/admin-auth.service';
import { MfaService } from '../../auth/mfa/mfa.service';
import { getBaseCookieOptions } from '../../common/utils/cookie.utils';

const getSuperAdminCookieOptions = () => ({
  ...getBaseCookieOptions(),
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
});

@Controller()
export class SuperAdminAuthController {
  private readonly logger = new Logger(SuperAdminAuthController.name);

  constructor(
    private readonly authService: AdminAuthService,
    private readonly mfaService: MfaService,
  ) {}

  // =========================================================================
  // AUTH (no guard — public login endpoints)
  // =========================================================================

  @TsRestHandler(c.login)
  async login(@Res({ passthrough: true }) res: Response) {
    return tsRestHandler(c.login, async ({ body }) => {
      this.logger.warn(`Login attempt for: ${body.email}`);
      const result = await this.authService.login(body.email, body.password);

      if (result.mfaRequired || result.mfaSetupRequired) {
        return {
          status: 200 as const,
          body: {
            mfaRequired: true as const,
            mfaSetupRequired: result.mfaSetupRequired,
            mfaChallengeToken: result.mfaChallengeToken!,
          } as any,
        };
      }

      res.cookie('super_admin_session', result.accessToken, getSuperAdminCookieOptions());

      return {
        status: 200 as const,
        body: {
          admin: result.admin!,
          mustChangePassword: result.mustChangePassword,
        } as any,
      };
    });
  }

  @TsRestHandler(c.mfaVerify)
  async mfaVerify(@Res({ passthrough: true }) res: Response) {
    return tsRestHandler(c.mfaVerify, async ({ body }) => {
      const result = await this.authService.verifyMfaAndLogin(body.challengeToken, body.code);
      res.cookie('super_admin_session', result.accessToken, getSuperAdminCookieOptions());
      return {
        status: 200 as const,
        body: { admin: result.admin, mustChangePassword: result.mustChangePassword } as any,
      };
    });
  }

  @TsRestHandler(c.forgotPassword)
  async forgotPassword() {
    return tsRestHandler(c.forgotPassword, async ({ body }) => {
      await this.authService.requestPasswordReset(body.email);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'If an account exists with this email, a reset link has been sent.',
        },
      };
    });
  }

  @TsRestHandler(c.verifyResetToken)
  async verifyResetToken() {
    return tsRestHandler(c.verifyResetToken, async ({ body }) => {
      const result = await this.authService.verifyResetToken(body.token);
      return { status: 200 as const, body: result as any };
    });
  }

  @TsRestHandler(c.resetPassword)
  async resetPassword() {
    return tsRestHandler(c.resetPassword, async ({ body }) => {
      await this.authService.resetPassword(body.token, body.newPassword);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'Password has been reset successfully. Please login with your new password.',
        },
      };
    });
  }

  @TsRestHandler(c.logout)
  async logout(@Res({ passthrough: true }) res: Response) {
    return tsRestHandler(c.logout, async () => {
      res.clearCookie('super_admin_session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
      });
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  // =========================================================================
  // PROFILE & PASSWORD (guarded)
  // =========================================================================

  @TsRestHandler(c.getProfile)
  @UseGuards(SuperAdminGuard)
  async getProfile(@Request() req: any) {
    return tsRestHandler(c.getProfile, async () => {
      const profile = await this.authService.getProfile(req.user.id);
      return { status: 200 as const, body: profile as any };
    });
  }

  @TsRestHandler(c.changePassword)
  @UseGuards(SuperAdminGuard)
  async changePassword(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return tsRestHandler(c.changePassword, async ({ body }) => {
      const result = await this.authService.changePassword(
        req.user.id,
        body.currentPassword,
        body.newPassword,
      );
      res.cookie('super_admin_session', result.accessToken, getSuperAdminCookieOptions());
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  // =========================================================================
  // ADMIN ACCOUNTS (guarded)
  // =========================================================================

  @TsRestHandler(c.getAdmins)
  @UseGuards(SuperAdminGuard)
  async getAdmins() {
    return tsRestHandler(c.getAdmins, async () => {
      const admins = await this.authService.getSuperAdmins();
      return { status: 200 as const, body: admins as any };
    });
  }

  @TsRestHandler(c.createAdmin)
  @UseGuards(SuperAdminGuard)
  async createAdmin() {
    return tsRestHandler(c.createAdmin, async ({ body }) => {
      const admin = await this.authService.createSuperAdmin(body as any);
      return { status: 201 as const, body: admin as any };
    });
  }

  @TsRestHandler(c.deleteAdmin)
  @UseGuards(SuperAdminGuard)
  async deleteAdmin(@Request() req: any) {
    return tsRestHandler(c.deleteAdmin, async ({ params: { id } }) => {
      await this.authService.deleteSuperAdmin(id, req.user.id);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  // =========================================================================
  // MFA (guarded)
  // =========================================================================

  @TsRestHandler(c.mfaSetup)
  @UseGuards(SuperAdminGuard)
  async mfaSetup(@Request() req: any) {
    return tsRestHandler(c.mfaSetup, async () => {
      const admin = await this.authService.getProfile(req.user.id);
      const setup = await this.mfaService.generateSetup(admin.email);
      return { status: 200 as const, body: setup as any };
    });
  }

  @TsRestHandler(c.mfaEnable)
  @UseGuards(SuperAdminGuard)
  async mfaEnable(@Request() req: any) {
    return tsRestHandler(c.mfaEnable, async ({ body }) => {
      await this.mfaService.enableMfaForSuperAdmin(
        req.user.id,
        body.secret,
        body.code,
        body.backupCodes,
      );
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  @TsRestHandler(c.mfaDisable)
  @UseGuards(SuperAdminGuard)
  async mfaDisable(@Request() req: any) {
    return tsRestHandler(c.mfaDisable, async ({ body }) => {
      await this.mfaService.disableMfaForSuperAdmin(req.user.id, body.code);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  @TsRestHandler(c.mfaStatus)
  @UseGuards(SuperAdminGuard)
  async mfaStatus(@Request() req: any) {
    return tsRestHandler(c.mfaStatus, async () => {
      const status = await this.mfaService.getSuperAdminMfaStatus(req.user.id);
      return { status: 200 as const, body: status as any };
    });
  }

  @TsRestHandler(c.getMfaPolicy)
  @UseGuards(SuperAdminGuard)
  async getMfaPolicy() {
    return tsRestHandler(c.getMfaPolicy, async () => {
      const required = await this.mfaService.isSuperAdminMfaRequired();
      return { status: 200 as const, body: { superAdminMfaRequired: required } as any };
    });
  }

  @TsRestHandler(c.updateMfaPolicy)
  @UseGuards(SuperAdminGuard)
  async updateMfaPolicy(@Request() req: any) {
    return tsRestHandler(c.updateMfaPolicy, async ({ body }) => {
      if (body.required) {
        const adminMfaStatus = await this.mfaService.getSuperAdminMfaStatus(req.user.id);
        if (!adminMfaStatus.enabled) {
          throw new BadRequestException(
            'You must set up MFA for your own account before requiring it for all admins',
          );
        }
      }
      await this.mfaService.setSuperAdminMfaRequired(body.required);
      return {
        status: 200 as const,
        body: { success: true as const, superAdminMfaRequired: body.required } as any,
      };
    });
  }
}
