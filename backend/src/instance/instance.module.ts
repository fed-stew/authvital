import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { InstanceService } from './instance.service';
import { InstanceApiKeyService } from './instance-api-key.service';
import { InstanceController } from './instance.controller';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule), // For KeyModule
    forwardRef(() => SuperAdminModule), // For SuperAdminGuard
  ],
  providers: [InstanceService, InstanceApiKeyService],
  controllers: [InstanceController],
  exports: [InstanceService, InstanceApiKeyService],
})
export class InstanceModule {}
