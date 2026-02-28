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
import { MemberAppAccessService } from './member-app-access.service';
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
 * Provides:
 * - TenantsService: Core tenant operations
 * - MembersService: Member lifecycle management
 * - MemberAppAccessService: App access management for members
 * - DomainsService: Domain verification for enterprise
 */
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    SyncModule,
    AuthorizationModule,
    MfaModule,
    SsoModule,
    forwardRef(() => WebhooksModule),
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
    MemberAppAccessService,
    DomainsService,
    TenantAccessGuard,
  ],
  exports: [
    TenantsService,
    MembersService,
    MemberAppAccessService,
    DomainsService,
  ],
})
export class TenantsModule {}
