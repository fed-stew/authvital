import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SyncModule } from '../sync';
import { AuthorizationModule } from '../authorization';
import { MfaModule } from '../auth/mfa';
import { SsoModule } from '../sso/sso.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

// Services
import { TenantsService } from './tenants.service';
import { MembersService } from './members.service';
import { DomainsService } from './domains/domains.service';

// Controllers
import { TenantsController } from './tenants.controller';
import { MembersController } from './members.controller';
import { DomainsController } from './domains/domains.controller';
import { TenantSsoController } from './sso/tenant-sso.controller';

// Guards
import { TenantAccessGuard } from './guards';

/**
 * TenantsModule - Unified tenant management module
 *
 * Consolidates functionality from:
 * - TenancyModule (tenant CRUD, invitations)
 * - TenantManagementModule (member management, app access)
 *
 * Provides:
 * - TenantsService: Core tenant operations
 * - MembersService: Member lifecycle and app access
 * - DomainsService: Domain verification for enterprise
 */
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    SyncModule, // For emitting sync events
    AuthorizationModule, // For AppAccessService
    MfaModule,
    SsoModule, // For TenantSsoConfigService
    forwardRef(() => WebhooksModule), // For SystemWebhookService (tenant events)
  ],
  controllers: [
    TenantsController,
    MembersController,
    DomainsController,
    TenantSsoController,
  ],
  providers: [
    TenantsService,
    MembersService,
    DomainsService,
    TenantAccessGuard,
  ],
  exports: [
    TenantsService,
    MembersService,
    DomainsService,
  ],
})
export class TenantsModule {}
