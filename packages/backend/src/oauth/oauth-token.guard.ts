import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { OAuthService } from './oauth.service';

/**
 * Guard for validating OAuth access tokens (RS256 signed)
 * 
 * This is different from JwtAuthGuard which validates internal JWTs (HS256).
 * OAuth access tokens are signed with RSA keys and need different validation.
 */
@Injectable()
export class OAuthTokenGuard implements CanActivate {
  constructor(private readonly oauthService: OAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No access token provided');
    }

    try {
      // Validate the RS256 signed OAuth token (async with proper signature verification)
      const payload = await this.oauthService.validateAccessToken(token);
      
      if (!payload) {
        throw new UnauthorizedException('Invalid access token');
      }

      // Attach user info to request
      request['user'] = {
        id: payload.userId,
        sub: payload.userId,
        email: payload.email,
        clientId: payload.clientId,
        scope: payload.scope,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractToken(request: Request): string | null {
    // Extract from Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }
}
