import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { KeyModule } from '../oauth/key.module';
import { PubSubModule } from '../pubsub';
import { SystemWebhookService } from './system-webhook.service';

// SystemWebhookController (admin CRUD) registers via ControlPlaneModule
// only — this module now provides just the dispatch service, which every
// plane needs (public flows and admin actions both trigger system events).
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    KeyModule, // KeyService for webhook payload signing
    PubSubModule,
  ],
  providers: [SystemWebhookService],
  exports: [SystemWebhookService],
})
export class WebhooksModule {}
