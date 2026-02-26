import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BootstrapService } from './bootstrap.service';

/**
 * BootstrapModule - Handles startup initialization
 *
 * Imports PrismaModule to access the database for seeding
 * system-required data on application startup.
 */
@Module({
  imports: [PrismaModule],
  providers: [BootstrapService],
})
export class BootstrapModule {}
