import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InstanceApiKeyService } from '../instance-api-key.service';

@Injectable()
export class InstanceApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: InstanceApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Check for API key in header
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ik_live_')) {
      throw new UnauthorizedException('Instance API key required');
    }

    const apiKey = authHeader.replace('Bearer ', '');
    const keyRecord = await this.apiKeyService.validateApiKey(apiKey);

    if (!keyRecord) {
      throw new UnauthorizedException('Invalid or expired instance API key');
    }

    // Attach key info to request for use in controllers
    request.instanceApiKey = keyRecord;
    return true;
  }
}
