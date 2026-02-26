import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { LicensingModule } from '../licensing/licensing.module';
import { SyncModule } from '../sync';
import { AuthorizationModule } from '../authorization';

@Module({
  imports: [PrismaModule, AuthModule, LicensingModule, SyncModule, AuthorizationModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
