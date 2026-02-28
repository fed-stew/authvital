import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: {
    sub: string; // userId
    email: string;
  };
}

@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * Generate a new API key
   * Returns the raw key ONCE - must be copied immediately
   */
  @Post()
  async createApiKey(
    @Request() req: AuthenticatedRequest,
    @Body()
    body: {
      name: string;
      permissions?: string[];
      expiresInDays?: number;
    },
  ) {
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const result = await this.apiKeyService.generateApiKey(
      req.user.sub,
      body.name,
      body.permissions || [],
      expiresAt,
    );

    return {
      ...result,
      message: 'API key created. Copy the key now - it will not be shown again!',
      warning: 'Store this key securely. It cannot be retrieved after this response.',
    };
  }

  /**
   * List all API keys for the authenticated user
   */
  @Get()
  async listApiKeys(@Request() req: AuthenticatedRequest) {
    return this.apiKeyService.listUserApiKeys(req.user.sub);
  }

  /**
   * Update an API key
   */
  @Put(':keyId')
  async updateApiKey(
    @Request() req: AuthenticatedRequest,
    @Param('keyId') keyId: string,
    @Body()
    body: {
      name?: string;
      permissions?: string[];
      isActive?: boolean;
    },
  ) {
    return this.apiKeyService.updateApiKey(keyId, req.user.sub, body);
  }

  /**
   * Revoke (delete) an API key
   */
  @Delete(':keyId')
  async revokeApiKey(
    @Request() req: AuthenticatedRequest,
    @Param('keyId') keyId: string,
  ) {
    await this.apiKeyService.revokeApiKey(keyId, req.user.sub);
    return { success: true, message: 'API key revoked' };
  }
}
