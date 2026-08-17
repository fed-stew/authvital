import { Module, forwardRef } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { MfaEnrollmentController } from './mfa-enrollment.controller';
import { WellKnownController } from './well-known.controller';
import { BrandingController } from './branding.controller';
import { OAuthService } from './oauth.service';
import { MfaEnrollmentService } from './mfa-enrollment.service';
import { OAuthSessionService } from './oauth-session.service';
import { OAuthTokenService } from './oauth-token.service';
import { OAuthIntrospectionService } from './oauth-introspection.service';
import { OAuthLicenseService } from './oauth-license.service';
import { RedirectUriValidatorService } from './redirect-uri-validator.service';
import { KeyModule } from './key.module';
import { OAuthTokenGuard } from './oauth-token.guard';
import { M2MAuthGuard } from './m2m-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InstanceModule } from '../instance/instance.module';
import { MfaModule } from '../auth/mfa/mfa.module';

@Module({
  imports: [
    PrismaModule,
    KeyModule,
    forwardRef(() => AuthModule),
    InstanceModule,
    // MFA-at-mint enforcement: OAuthService + OAuthTokenService check tenant
    // MFA policy compliance before issuing codes/tokens.
    MfaModule,
  ],
  controllers: [
    OAuthController,
    MfaEnrollmentController,
    WellKnownController,
    BrandingController,
  ],
  providers: [
    // Core services (order matters for dependencies)
    OAuthSessionService,
    OAuthLicenseService,
    OAuthTokenService,
    OAuthIntrospectionService,
    RedirectUriValidatorService,
    OAuthService,
    MfaEnrollmentService,
    // Guards
    OAuthTokenGuard,
    M2MAuthGuard,
  ],
  exports: [
    KeyModule,
    OAuthService,
    OAuthSessionService,
    OAuthTokenService,
    OAuthIntrospectionService,
    OAuthLicenseService,
    RedirectUriValidatorService,
    OAuthTokenGuard,
    M2MAuthGuard,
  ],
})
export class OAuthModule {}
