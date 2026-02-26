import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiKeyService, ApiKeyValidationResult } from "../api-key.service";

export const API_KEY_PERMISSIONS_KEY = "api_key_permissions";

/**
 * Decorator to specify required permissions for an endpoint
 */
export function RequireApiKeyPermissions(...permissions: string[]) {
  return (target: any, key?: string, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(
      API_KEY_PERMISSIONS_KEY,
      permissions,
      descriptor?.value || target,
    );
    return descriptor || target;
  };
}

/**
 * Guard that validates API keys from Authorization header
 * Format: Authorization: Bearer sk_live_xxxxx
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException("Missing Authorization header");
    }

    // Support both "Bearer sk_live_xxx" and just "sk_live_xxx"
    let apiKey: string;
    if (authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.slice(7);
    } else if (authHeader.startsWith("sk_live_")) {
      apiKey = authHeader;
    } else {
      throw new UnauthorizedException(
        "Invalid Authorization format. Use: Bearer sk_live_xxx",
      );
    }

    // Validate the API key
    const validationResult: ApiKeyValidationResult =
      await this.apiKeyService.validateApiKey(apiKey);

    // Check required permissions
    const requiredPermissions = this.reflector.get<string[]>(
      API_KEY_PERMISSIONS_KEY,
      context.getHandler(),
    );

    if (requiredPermissions && requiredPermissions.length > 0) {
      for (const permission of requiredPermissions) {
        if (
          !this.apiKeyService.hasPermission(
            validationResult.permissions,
            permission,
          )
        ) {
          throw new UnauthorizedException(
            `API key lacks required permission: ${permission}`,
          );
        }
      }
    }

    // Attach API key info to request for downstream use
    request.apiKey = validationResult;
    request.user = validationResult.user;

    return true;
  }
}
