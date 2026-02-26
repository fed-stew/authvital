import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { AppAccessService } from '../app-access.service';

/**
 * AppAccessGuard - Enforces application access requirements
 *
 * Must be used AFTER JwtAuthGuard to ensure request.user is populated.
 *
 * Checks if the user has access to the application specified in the route.
 * Expects:
 * - request.params.appId or request.params.applicationId
 * - request.params.tenantId or request.body.tenantId or request.query.tenantId
 */
@Injectable()
export class AppAccessGuard implements CanActivate {
  constructor(
    @Inject(forwardRef(() => AppAccessService))
    private readonly appAccessService: AppAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.sub) {
      throw new ForbiddenException('Authentication required');
    }

    // Get application ID from route
    const applicationId =
      request.params.appId ||
      request.params.applicationId ||
      request.body?.applicationId ||
      request.query?.applicationId;

    if (!applicationId) {
      // No app specified = allow (might be a different kind of route)
      return true;
    }

    // Get tenant ID
    const tenantId =
      request.params.tenantId ||
      request.body?.tenantId ||
      request.query?.tenantId ||
      user.tenant_id;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context required for app access check');
    }

    // Check access
    const hasAccess = await this.appAccessService.hasAccess(
      tenantId,
      user.sub,
      applicationId,
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        'You do not have access to this application. Contact your administrator.',
      );
    }

    return true;
  }
}
