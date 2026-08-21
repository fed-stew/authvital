import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from './audit.service';

/**
 * AuditModule - the tenant audit trail WRITE path.
 *
 * Marked @Global so AuditService can be injected by any mutating service
 * (members, licensing, app-access, ...) to record entries WITHOUT every module
 * having to import AuditModule. This mirrors how PrismaModule is exposed.
 *
 * The READ/EXPORT API (AuditController + its guard chain) is control-plane
 * surface and registers via ControlPlaneModule only (SERVICE_ROLE admin|all).
 * The write path stays available on every plane.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
