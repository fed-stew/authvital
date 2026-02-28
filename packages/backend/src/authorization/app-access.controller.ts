import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { AppAccessService } from './app-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessType } from '@prisma/client';

/**
 * AppAccessController - Application Access Management API
 *
 * Endpoints for managing who can access which applications.
 * Separate from MembershipRoles (permissions) - this is about entitlement.
 */
@Controller('tenants/:tenantId/access')
@UseGuards(JwtAuthGuard)
export class AppAccessController {
  private readonly logger = new Logger(AppAccessController.name);

  constructor(private readonly appAccessService: AppAccessService) {}

  /**
   * List all users who have access to an application
   */
  @Get('apps/:appId/users')
  async listAppUsers(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
    @Query('includeRevoked') includeRevoked?: string,
  ) {
    const accesses = await this.appAccessService.listAppAccess(
      tenantId,
      appId,
      includeRevoked === 'true',
    );

    return {
      tenantId,
      applicationId: appId,
      users: accesses.map((access) => ({
        id: access.id,
        userId: access.userId,
        email: access.user.email,
        name:
          [access.user.givenName, access.user.familyName]
            .filter(Boolean)
            .join(' ') || access.user.email,
        accessType: access.accessType,
        status: access.status,
        grantedAt: access.grantedAt,
        revokedAt: access.revokedAt,
      })),
      count: accesses.length,
    };
  }

  /**
   * List all apps a user has access to in a tenant
   */
  @Get('users/:userId/apps')
  async listUserApps(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Query('includeRevoked') includeRevoked?: string,
  ) {
    const accesses = await this.appAccessService.listUserAccess(
      tenantId,
      userId,
      includeRevoked === 'true',
    );

    return {
      tenantId,
      userId,
      apps: accesses.map((access) => ({
        id: access.id,
        applicationId: access.applicationId,
        accessType: access.accessType,
        status: access.status,
        grantedAt: access.grantedAt,
        revokedAt: access.revokedAt,
      })),
      count: accesses.length,
    };
  }

  /**
   * Check if a user has access to an application
   */
  @Get('check')
  async checkAccess(
    @Param('tenantId') tenantId: string,
    @Query('userId') userId: string,
    @Query('appId') appId: string,
  ) {
    const result = await this.appAccessService.checkAccess(
      tenantId,
      userId,
      appId,
    );
    return {
      tenantId,
      userId,
      applicationId: appId,
      ...result,
    };
  }

  /**
   * Grant access to an application for one or more users
   */
  @Post('apps/:appId/grant')
  async grantAccess(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
    @Body()
    body: { userIds: string[]; accessType?: AccessType; grantedById?: string },
  ) {
    const { userIds, accessType = AccessType.GRANTED, grantedById } = body;

    if (!userIds || userIds.length === 0) {
      return { granted: 0, message: 'No user IDs provided' };
    }

    const count = await this.appAccessService.bulkGrantAccess({
      tenantId,
      applicationId: appId,
      userIds,
      accessType,
      grantedById,
    });

    return { granted: count, message: `Granted access to ${count} users` };
  }

  /**
   * Revoke access to an application for a user
   */
  @Delete('apps/:appId/users/:userId')
  async revokeAccess(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
    @Param('userId') userId: string,
    @Query('revokedById') revokedById?: string,
  ) {
    const access = await this.appAccessService.revokeAccess({
      tenantId,
      userId,
      applicationId: appId,
      revokedById,
    });

    return {
      success: true,
      message: 'Access revoked',
      access: {
        id: access.id,
        status: access.status,
        revokedAt: access.revokedAt,
      },
    };
  }

  /**
   * Count users with access to an application
   */
  @Get('apps/:appId/count')
  async countAppUsers(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
  ) {
    const count = await this.appAccessService.countAppAccess(tenantId, appId);
    return { tenantId, applicationId: appId, count };
  }
}
