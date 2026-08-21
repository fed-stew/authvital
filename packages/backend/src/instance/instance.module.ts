import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InstanceService } from './instance.service';
import { InstanceApiKeyService } from './instance-api-key.service';

// InstanceController (SuperAdminGuard'd config write API) registers via
// ControlPlaneModule only — the services stay here because both planes
// read instance configuration.
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule), // For KeyModule
  ],
  providers: [InstanceService, InstanceApiKeyService],
  exports: [InstanceService, InstanceApiKeyService],
})
export class InstanceModule {}
