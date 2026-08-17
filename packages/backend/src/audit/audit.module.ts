import { Global, Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { TenantIdentifierGuard } from '../tenants/guards/tenant-identifier.guard';

/**
 * AuditModule - the tenant audit trail.
 *
 * Marked @Global so AuditService can be injected by any mutating service
 * (members, licensing, app-access, ...) to record entries WITHOUT every module
 * having to import AuditModule. This mirrors how PrismaModule is exposed.
 *
 * The guards are provided locally (they only depend on PrismaService/Reflector,
 * both global) so the controller's guard chain resolves without pulling in the
 * whole TenantsModule. AuthModule is imported for JwtAuthGuard's dependencies.
 */
@Global()
@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [AuditController],
  providers: [
    AuditService,
    PermissionGuard,
    TenantAccessGuard,
    TenantIdentifierGuard,
  ],
  exports: [AuditService],
})
export class AuditModule {}
