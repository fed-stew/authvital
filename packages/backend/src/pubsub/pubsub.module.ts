import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PubSubConfigService } from './pubsub-config.service';
import { PubSubPublisherService } from './pubsub-publisher.service';
import { PubSubOutboxService } from './pubsub-outbox.service';

// PubSubAdminController registers via ControlPlaneModule only — this module
// provides the outbox/publisher services needed wherever events are emitted
// (both planes). The publisher cron only runs where ScheduleModule is loaded
// (SERVICE_ROLE admin|all; see AppModule.forRole).
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [PubSubConfigService, PubSubPublisherService, PubSubOutboxService],
  exports: [PubSubConfigService, PubSubOutboxService],
})
export class PubSubModule {}
