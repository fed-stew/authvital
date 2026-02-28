import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { MfaService } from '../mfa.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Guard that checks if a user meets the MFA requirements for a tenant.
 * 
 * Use this guard on tenant-scoped endpoints where MFA policy should be enforced.
 * Expects the request to have:
 * - req.user.id (from JwtAuthGuard)
 * - req.params.tenantId OR req.body.tenantId OR req.query.tenantId
 * 
 * If the user is not MFA compliant and outside the grace period,
 * throws ForbiddenException with details about what's needed.
 */
@Injectable()
export class MfaComplianceGuard implements CanActivate {
  constructor(
    private readonly mfaService: MfaService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Get user ID from authenticated request
    const userId = request.user?.id;
    if (!userId) {
      // No user = let other guards handle auth
      return true;
    }
    
    // Get tenant ID from various sources
    const tenantId = 
      request.params?.tenantId ||
      request.body?.tenantId ||
      request.query?.tenantId ||
      request.query?.tenant_id;
    
    if (!tenantId) {
      // No tenant context = skip MFA check
      return true;
    }
    
    // Check MFA compliance
    const compliance = await this.mfaService.checkUserMfaCompliance(userId, tenantId);
    
    if (!compliance.compliant) {
      throw new ForbiddenException({
        error: 'mfa_required',
        message: compliance.message || 'MFA is required to access this organization.',
        requiresSetup: compliance.requiresSetup,
        mfaEnabled: compliance.mfaEnabled,
        gracePeriodEndsAt: compliance.gracePeriodEndsAt?.toISOString(),
      });
    }
    
    // Optionally attach compliance info to request for downstream use
    request.mfaCompliance = compliance;
    
    return true;
  }
}
