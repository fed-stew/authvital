import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SsoProviderService } from './sso-provider.service';
import { SsoAuthService } from './sso-auth.service';
import { SsoAuthController } from './sso-auth.controller';
import { TenantSsoConfigService } from './tenant-sso-config.service';
import { GoogleProvider } from './providers/google.provider';
import { MicrosoftProvider } from './providers/microsoft.provider';
import { SsoEncryptionService } from './sso-encryption.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [SsoAuthController],
  providers: [
    SsoProviderService,
    SsoAuthService,
    TenantSsoConfigService,
    SsoEncryptionService,
    GoogleProvider,
    MicrosoftProvider,
  ],
  exports: [SsoProviderService, SsoAuthService, TenantSsoConfigService],
})
export class SsoModule {}
