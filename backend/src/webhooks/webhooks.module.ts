import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { KeyModule } from '../oauth/key.module';
import { SystemWebhookService } from './system-webhook.service';
import { SystemWebhookController } from './system-webhook.controller';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    KeyModule, // Provides KeyService needed by SuperAdminGuard
    forwardRef(() => SuperAdminModule), // Provides SuperAdminGuard and AdminAuthService
  ],
  controllers: [SystemWebhookController],
  providers: [SystemWebhookService],
  exports: [SystemWebhookService],
})
export class WebhooksModule {}
