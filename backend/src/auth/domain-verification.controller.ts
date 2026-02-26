import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DomainVerificationService } from './domain-verification.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedRequest } from './interfaces/auth.interface';

@Controller('domains')
@UseGuards(JwtAuthGuard)
export class DomainVerificationController {
  constructor(
    private readonly domainVerificationService: DomainVerificationService,
  ) {}

  /**
   * Initiate domain verification for a tenant
   * Returns DNS instructions for verification
   */
  @Post('verify/initiate')
  @HttpCode(HttpStatus.OK)
  async initiateDomainVerification(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { tenantId: string; domainName: string },
  ) {
    return this.domainVerificationService.initiateDomainVerification(
      dto.tenantId,
      dto.domainName,
      req.user.id,
    );
  }

  /**
   * Verify domain via DNS TXT record
   */
  @Post(':domainId/verify')
  @HttpCode(HttpStatus.OK)
  async verifyDomain(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
  ) {
    return this.domainVerificationService.verifyDomain(domainId, req.user.id);
  }

  /**
   * Get list of users that can be migrated to a verified domain's tenant
   */
  @Get(':domainId/migratable-users')
  async findMigratableUsers(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
  ) {
    return this.domainVerificationService.findMigratableUsers(
      domainId,
      req.user.id,
    );
  }

  /**
   * Migrate users to a verified domain's tenant
   */
  @Post(':domainId/migrate-users')
  @HttpCode(HttpStatus.OK)
  async migrateUsers(
    @Request() req: AuthenticatedRequest,
    @Param('domainId') domainId: string,
    @Body()
    dto: {
      userIds: string[];
      removeFromOldTenants?: boolean;
    },
  ) {
    return this.domainVerificationService.migrateUsers(
      domainId,
      dto.userIds,
      req.user.id,
      { removeFromOldTenants: dto.removeFromOldTenants },
    );
  }
}
