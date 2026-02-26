import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { InstanceService, UpdateInstanceDto } from './instance.service';
import { InstanceApiKeyService, CreateInstanceApiKeyDto } from './instance-api-key.service';
import { SuperAdminGuard } from '../super-admin/guards/super-admin.guard';

@Controller('instance')
@UseGuards(SuperAdminGuard)
export class InstanceController {
  constructor(
    private readonly instanceService: InstanceService,
    private readonly apiKeyService: InstanceApiKeyService,
  ) {}

  // ===========================================================================
  // INSTANCE CONFIGURATION
  // ===========================================================================

  @Get()
  async getInstanceMeta() {
    return this.instanceService.getInstanceMeta();
  }

  @Get('uuid')
  async getInstanceUuid() {
    const uuid = await this.instanceService.getInstanceUuid();
    return { instanceUuid: uuid };
  }

  @Get('signup-config')
  async getSignupConfig() {
    return this.instanceService.getSignupConfig();
  }

  @Get('branding')
  async getBrandingConfig() {
    return this.instanceService.getBrandingConfig();
  }

  @Patch()
  async updateInstanceMeta(@Body() dto: UpdateInstanceDto) {
    return this.instanceService.updateInstanceMeta(dto);
  }

  // ===========================================================================
  // INSTANCE API KEYS (Fleet Manager)
  // ===========================================================================

  @Get('api-keys')
  async listApiKeys() {
    return this.apiKeyService.listApiKeys();
  }

  @Post('api-keys')
  async createApiKey(@Body() dto: CreateInstanceApiKeyDto) {
    return this.apiKeyService.createApiKey(dto);
  }

  @Delete('api-keys/:id')
  async revokeApiKey(@Param('id') id: string) {
    return this.apiKeyService.revokeApiKey(id);
  }
}
