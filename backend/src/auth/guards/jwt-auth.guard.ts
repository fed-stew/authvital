import { Injectable, ExecutionContext, UnauthorizedException, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { KeyService } from '../../oauth/key.service';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { extractJwt } from '../utils/extract-jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly issuer: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly keyService: KeyService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractJwt(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.keyService.verifyJwt(token, this.issuer);
      
      // Validate user exists
      const user = await this.authService.validateUser(payload.sub as string);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Attach user to request
      (request as any).user = {
        id: user.id,
        sub: payload.sub,
        email: payload.email || user.email,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
