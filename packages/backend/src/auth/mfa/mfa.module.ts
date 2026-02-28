import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MfaService } from './mfa.service';
import { MfaComplianceGuard } from './guards/mfa-compliance.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { KeyModule } from '../../oauth/key.module';

/**
 * MfaModule - Multi-Factor Authentication
 * 
 * Note: MfaController is NOT included here to avoid circular dependency with AuthModule.
 * The MFA user endpoints are handled directly in AuthController.
 * 
 * This module exports MfaService for use by:
 * - AuthModule (user MFA)
 * - SuperAdminModule (admin MFA)
 * - IntegrationModule (tenant MFA policies)
 * - TenantsModule (tenant MFA policies)
 */
@Module({
  imports: [PrismaModule, KeyModule, ConfigModule],
  providers: [MfaService, MfaComplianceGuard],
  exports: [MfaService, MfaComplianceGuard],
})
export class MfaModule {}
