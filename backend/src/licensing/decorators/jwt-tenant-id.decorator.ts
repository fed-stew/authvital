import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

/**
 * Extracts tenant_id from the JWT token
 *
 * This ensures the tenant ID comes from the authenticated token,
 * not from user input (preventing IDOR attacks)
 *
 * @example
 * async grantLicense(@JwtTenantId() tenantId: string) { ... }
 */
export const JwtTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.user?.tenant_id;

    if (!tenantId) {
      throw new BadRequestException(
        'This endpoint requires a tenant-scoped token. ' +
          'Please authenticate with a specific tenant context.',
      );
    }

    return tenantId;
  },
);
