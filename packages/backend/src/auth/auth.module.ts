import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { InstanceModule } from '../instance/instance.module';
import { AuthorizationModule } from '../authorization';
import { LicensingModule } from '../licensing/licensing.module';
import { KeyModule } from '../oauth/key.module';
import { SyncModule } from '../sync';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SignUpService } from './signup.service';
import { SignUpLicenseService } from './signup-license.service';
import { SignUpAnonymousService } from './signup-anonymous.service';
import { SignUpController } from './signup.controller';
import { SignupFlowController } from './signup-flow.controller';
import { SignupConfigController } from './signup-config.controller';
import { EmailService } from './email.service';
import { DomainVerificationService } from './domain-verification.service';
import { DomainVerificationController } from './domain-verification.controller';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetController } from './password-reset.controller';
import { PasswordBreachCheckService } from './password-breach-check.service';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { MfaModule } from './mfa';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    InstanceModule,
    AuthorizationModule,
    KeyModule,
    forwardRef(() => LicensingModule),
    forwardRef(() => SyncModule), // For emitting signup events
    MfaModule,
  ],
  controllers: [
    AuthController,
    SignUpController,
    SignupFlowController,
    SignupConfigController,
    DomainVerificationController,
    PasswordResetController,
    ApiKeyController,
  ],
  providers: [
    AuthService,
    SignUpLicenseService,
    SignUpAnonymousService,
    SignUpService,
    EmailService,
    DomainVerificationService,
    PasswordResetService,
    PasswordBreachCheckService,
    JwtAuthGuard,
    OptionalAuthGuard,
    ApiKeyService,
  ],
  exports: [AuthService, JwtAuthGuard, OptionalAuthGuard, SignUpService, ApiKeyService, KeyModule, EmailService, MfaModule, PasswordBreachCheckService],
})
export class AuthModule {}
