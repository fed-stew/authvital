import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Global Prisma service for database operations
 * Handles connection lifecycle and provides typed database access
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Clean the database - useful for testing
   * Deletes all data in reverse order of dependencies
   */
  async cleanDatabase(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production!');
    }

    // Delete in dependency order (most dependent first)
    await this.$transaction([
      this.membershipRole.deleteMany(),
      this.role.deleteMany(),
      // License Pool Billing
      this.licenseAssignment.deleteMany(),
      this.appSubscription.deleteMany(),
      this.licenseType.deleteMany(),
      // Core
      this.application.deleteMany(),
      this.domain.deleteMany(),
      this.membership.deleteMany(),
      this.tenant.deleteMany(),
      this.user.deleteMany(),
    ]);
  }
}
