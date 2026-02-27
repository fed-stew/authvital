import { Module, forwardRef } from "@nestjs/common";
import { OAuthController } from "./oauth.controller";
import { WellKnownController } from "./well-known.controller";
import { BrandingController } from "./branding.controller";
import { OAuthService } from "./oauth.service";
import { RedirectUriValidatorService } from "./redirect-uri-validator.service";
import { KeyModule } from "./key.module";
import { OAuthTokenGuard } from "./oauth-token.guard";
import { M2MAuthGuard } from "./m2m-auth.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { InstanceModule } from "../instance/instance.module";

@Module({
  imports: [
    PrismaModule,
    KeyModule,
    forwardRef(() => AuthModule),
    InstanceModule,
  ],
  controllers: [OAuthController, WellKnownController, BrandingController],
  providers: [OAuthService, RedirectUriValidatorService, OAuthTokenGuard, M2MAuthGuard],
  exports: [KeyModule, OAuthService, RedirectUriValidatorService, OAuthTokenGuard, M2MAuthGuard],
})
export class OAuthModule {}
