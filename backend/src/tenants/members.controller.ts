import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MembersService } from './members.service';
import {
  InviteMemberDto,
  UpdateMemberDto,
  AssignAppRoleDto,
  GrantAppAccessDto,
  ChangeMemberRoleDto,
  ToggleAppAccessDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantAccessGuard } from './guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * MembersController - REST API for member management
 *
 * All routes require:
 * 1. User to be authenticated via JWT
 * 2. User to have membership in the requested tenant
 *
 * Routes are prefixed with /api/tenants/:tenantId/members
 */
@Controller('tenants/:tenantId/members')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  // ===========================================================================
  // MEMBER CRUD
  // ===========================================================================

  /**
   * GET /api/tenants/:tenantId/members
   * List all members of the tenant
   */
  @Get()
  async getMembers(@Param('tenantId') tenantId: string) {
    return this.membersService.getMembers(tenantId);
  }

  /**
   * GET /api/tenants/:tenantId/members/:membershipId
   * Get detailed info about a specific member
   */
  @Get(':membershipId')
  async getMemberDetail(
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.membersService.getMemberDetail(tenantId, membershipId);
  }

  /**
   * POST /api/tenants/:tenantId/members/invite
   * Invite a user to the tenant
   */
  @Post('invite')
  async inviteMember(
    @Param('tenantId') tenantId: string,
    @Body() dto: Omit<InviteMemberDto, 'tenantId'>,
  ) {
    return this.membersService.inviteUser({ ...dto, tenantId } as InviteMemberDto);
  }

  /**
   * POST /api/tenants/:tenantId/members/:membershipId/accept
   * Accept an invitation
   */
  @Post(':membershipId/accept')
  async acceptInvitation(
    @Param('membershipId') membershipId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.membersService.acceptInvitation(membershipId, userId);
  }

  /**
   * PATCH /api/tenants/:tenantId/members/:membershipId
   * Update member status (suspend/activate)
   */
  @Patch(':membershipId')
  async updateMember(
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    if (dto.status) {
      return this.membersService.updateMemberStatus(tenantId, membershipId, dto.status);
    }
    return { success: true };
  }

  /**
   * DELETE /api/tenants/:tenantId/members/:membershipId
   * Remove a member from the tenant
   */
  @Delete(':membershipId')
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.membersService.removeMember(tenantId, membershipId);
  }

  /**
   * POST /api/tenants/:tenantId/members/:membershipId/role
   * Change a member's tenant role
   */
  @Post(':membershipId/role')
  async changeMemberRole(
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: ChangeMemberRoleDto,
  ) {
    return this.membersService.changeMemberRole(tenantId, membershipId, dto.roleSlug);
  }

  // ===========================================================================
  // APPLICATION ACCESS MANAGEMENT
  // ===========================================================================

  /**
   * GET /api/tenants/:tenantId/members/apps/:appId
   * Get all members with their access status for an application
   */
  @Get('apps/:appId')
  async getAppUsers(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
  ) {
    return this.membersService.getAppUsers(tenantId, appId);
  }

  /**
   * GET /api/tenants/:tenantId/members/apps/:appId/available
   * Get members who don't have access to this app yet
   */
  @Get('apps/:appId/available')
  async getAvailableMembers(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
  ) {
    return this.membersService.getMembersWithoutAppAccess(tenantId, appId);
  }

  /**
   * POST /api/tenants/:tenantId/members/apps/:appId/access
   * Grant app access to one or more members
   */
  @Post('apps/:appId/access')
  async grantAccess(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
    @Body() dto: GrantAppAccessDto,
  ) {
    return this.membersService.grantAppAccess(
      tenantId,
      appId,
      dto.membershipIds,
      dto.roleId,
    );
  }

  /**
   * PATCH /api/tenants/:tenantId/members/apps/:appId/access/:membershipId
   * Update a member's role in an application
   */
  @Patch('apps/:appId/access/:membershipId')
  async updateAccess(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: AssignAppRoleDto,
  ) {
    return this.membersService.updateAppRole(tenantId, appId, membershipId, dto.roleId);
  }

  /**
   * DELETE /api/tenants/:tenantId/members/apps/:appId/access/:membershipId
   * Remove a member's access to an application
   */
  @Delete('apps/:appId/access/:membershipId')
  @HttpCode(HttpStatus.OK)
  async removeAccess(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.membersService.removeAppAccess(tenantId, appId, membershipId);
  }

  /**
   * POST /api/tenants/:tenantId/members/apps/:appId/toggle
   * Toggle app access for a user
   */
  @Post('apps/:appId/toggle')
  async toggleAppAccess(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
    @Body() dto: ToggleAppAccessDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.membersService.toggleAppAccess(
      tenantId,
      appId,
      dto.userId,
      dto.enable,
      {
        roleId: dto.roleId,
        performedById: currentUser?.id,
      },
    );
  }
}
