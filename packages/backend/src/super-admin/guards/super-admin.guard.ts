import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeyService } from '../../oauth/key.service';
import { AdminAuthService } from '../services';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  private readonly issuer: string;

  constructor(
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
    private readonly authService: AdminAuthService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.keyService.verifyJwt(token, this.issuer);

      // Check if this is a super admin token
      if (payload.type !== 'super_admin') {
        throw new UnauthorizedException('Not a super admin token');
      }

      // Validate the super admin still exists and is active
      const admin = await this.authService.validateSuperAdmin(payload.sub as string);

      if (!admin) {
        throw new UnauthorizedException('Super admin not found or inactive');
      }

      // Attach admin to request
      request.user = {
        id: admin.id,
        email: admin.email,
        type: 'super_admin',
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Extract token from cookie first, then fall back to Authorization header
   */
  private extractToken(request: any): string | undefined {
    // 1. Try super admin session cookie (preferred - httpOnly)
    const cookieToken = request.cookies?.['super_admin_session'];
    if (cookieToken) {
      return cookieToken;
    }
    
    // 2. Fall back to Authorization header (for API clients if needed)
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
