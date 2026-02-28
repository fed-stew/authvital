import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { KeyService } from './key.service';
import { ConfigService } from '@nestjs/config';

/**
 * M2M Token payload structure from client_credentials flow
 */
export interface M2MTokenPayload {
  sub: string;           // "app:{clientId}"
  client_id: string;     // Application client ID
  scope: string;         // Granted scopes
  token_type: 'm2m';     // Always "m2m" for machine tokens
  aud: string;           // Audience
  iss: string;           // Issuer
  exp: number;           // Expiration
  iat: number;           // Issued at
}

/**
 * Request info attached by M2MAuthGuard
 */
export interface M2MRequestInfo {
  clientId: string;
  scope: string;
  tokenType: 'm2m';
}

/**
 * Guard for validating Machine-to-Machine (M2M) OAuth tokens.
 * 
 * This guard is specifically for backend-to-backend communication using
 * the OAuth client_credentials flow. It validates RS256 signed JWTs and
 * ensures the token is an M2M token (not a user token).
 * 
 * Usage:
 * ```ts
 * @Controller('integration')
 * @UseGuards(M2MAuthGuard)
 * export class IntegrationController { ... }
 * ```
 */
@Injectable()
export class M2MAuthGuard implements CanActivate {
  private readonly logger = new Logger(M2MAuthGuard.name);
  private readonly issuer: string;

  constructor(
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
  ) {
    // Must match the issuer used by OAuthService when signing tokens
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing Authorization header. Use: Bearer <access_token>');
    }

    try {
      // Verify the RS256 signed token
      const payload = await this.keyService.verifyJwt(token, this.issuer) as unknown as M2MTokenPayload;

      // Ensure this is an M2M token, not a user token
      if (payload.token_type !== 'm2m') {
        throw new UnauthorizedException(
          'Invalid token type. This endpoint requires an M2M access token from client_credentials flow.'
        );
      }

      // Validate required M2M claims
      if (!payload.client_id) {
        throw new UnauthorizedException('Invalid M2M token: missing required claims');
      }

      // Attach M2M info to request for downstream use
      // Using type assertion since Express Request doesn't have these custom properties
      (request as any).m2m = {
        clientId: payload.client_id,
        scope: payload.scope || '',
        tokenType: 'm2m',
      } satisfies M2MRequestInfo;
      
      // Also set a minimal user-like object for compatibility with other guards/code
      (request as any).user = {
        sub: payload.sub,
        clientId: payload.client_id,
        scope: payload.scope,
      };

      return true;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Token verification failed (invalid signature, expired, etc.)
      this.logger.error(`M2M token verification failed: ${error.message}`, error.stack);
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      return null;
    }

    // Must be Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Invalid Authorization format. Use: Bearer <access_token>'
      );
    }

    return authHeader.substring(7);
  }
}
