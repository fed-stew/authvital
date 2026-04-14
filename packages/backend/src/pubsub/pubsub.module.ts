import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { KeyModule } from '../oauth/key.module';
import { PubSubConfigService } from './pubsub-config.service';
import { PubSubPublisherService } from './pubsub-publisher.service';
import { PubSubOutboxService } from './pubsub-outbox.service';
import { PubSubAdminController } from './pubsub-admin.controller';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    KeyModule,
    forwardRef(() => SuperAdminModule),
  ],
  controllers: [PubSubAdminController],
  providers: [PubSubConfigService, PubSubPublisherService, PubSubOutboxService],
  exports: [PubSubConfigService, PubSubOutboxService],
})
export class PubSubModule {}
