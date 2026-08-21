import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Minimal Prisma service for the broker.
 *
 * DESIGN CHOICE — Prisma client reuse:
 * The backend's Prisma generator (packages/backend/prisma/schema/01_base.prisma)
 * writes the generated client to the monorepo ROOT `node_modules/.prisma/client`
 * (output = "../../../../node_modules/.prisma/client"). Because npm workspaces
 * hoist `@prisma/client` to the root, importing `@prisma/client` here resolves
 * to the exact same generated client the backend uses — same models, same
 * types, zero duplication. So the broker just declares `@prisma/client` as a
 * dependency and defines its own thin lifecycle wrapper. No second schema,
 * no second `prisma generate` in local dev (the Dockerfile generates from the
 * backend schema for standalone image builds).
 *
 * Intentionally slimmer than the backend's PrismaService: no cleanDatabase()
 * helper — the broker never seeds or wipes data (YAGNI).
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
}
