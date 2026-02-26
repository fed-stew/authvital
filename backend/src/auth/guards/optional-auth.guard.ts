import { Injectable, ExecutionContext, CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { KeyService } from '../../oauth/key.service';
import { AuthService } from '../auth.service';
import { extractJwt } from '../utils/extract-jwt';

/**
 * Optional JWT Auth Guard
 * 
 * Unlike JwtAuthGuard, this doesn't throw if authentication fails.
 * It just doesn't attach the user to the request.
 * 
 * Use this for endpoints that work for both authenticated and unauthenticated users.
 * 
 * Uses the same JWT extraction and validation as JwtAuthGuard (cookies + header).
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  private readonly issuer: string;

  constructor(
    private readonly keyService: KeyService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractJwt(request);

    if (!token) {
      // No token - that's fine, user is just not authenticated
      return true;
    }

    try {
      const payload = await this.keyService.verifyJwt(token, this.issuer);
      
      // Validate user exists
      const user = await this.authService.validateUser(payload.sub as string);
      if (!user) {
        // User doesn't exist - treat as unauthenticated
        return true;
      }

      // Attach user to request
      (request as any).user = {
        id: user.id,
        sub: payload.sub,
        email: payload.email || user.email,
      };

      return true;
    } catch (error) {
      // Invalid token - treat as unauthenticated (don't throw)
      console.debug('[OptionalAuthGuard] Token validation failed:', error instanceof Error ? error.message : 'Unknown error');
      return true;
    }
  }
}
