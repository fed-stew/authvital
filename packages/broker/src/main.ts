// NOTE: no manual dotenv here (unlike backend/main.ts) — ConfigModule.forRoot
// in AppModule loads `.env` synchronously when the module graph is evaluated,
// which happens before any provider (incl. PrismaService) is constructed.

// Compose DATABASE_URL from parts when deployed with Cloud SQL unix sockets —
// IDENTICAL logic to packages/backend/src/main.ts so both images share the
// same secret plumbing (DB_PASSWORD secret + DB_HOST socket path).
if (
  !process.env.DATABASE_URL &&
  process.env.DB_HOST &&
  process.env.DB_USERNAME &&
  process.env.DB_PASSWORD &&
  process.env.DB_DATABASE
) {
  const { DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;
  process.env.DATABASE_URL = `postgresql://${DB_USERNAME}:${encodeURIComponent(DB_PASSWORD)}@localhost/${DB_DATABASE}?host=${DB_HOST}`;
}

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : undefined,
  });

  // Ensure OnApplicationShutdown fires (drains in-flight batches) on SIGTERM.
  app.enableShutdownHooks();

  const port = parseInt(process.env.BROKER_PORT ?? '8100', 10);
  await app.listen(port);

  new Logger('Bootstrap').log(`AuthVital Broker listening on port ${port}`);
}

void bootstrap();
