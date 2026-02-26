import { Module, forwardRef } from '@nestjs/common';
import { SyncEventService } from './sync-event.service';
import { SyncController } from './sync.controller';
import { PrismaModule } from '../prisma';
import { KeyModule } from '../oauth/key.module';
import { AuthModule } from '../auth';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [
    PrismaModule,
    KeyModule,
    forwardRef(() => AuthModule), // For JwtAuthGuard dependencies
    forwardRef(() => SuperAdminModule), // For SuperAdminGuard on event-types endpoint
  ],
  controllers: [SyncController],
  providers: [SyncEventService],
  exports: [SyncEventService],
})
export class SyncModule {}
