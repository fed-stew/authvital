/**
 * @authvader/sdk - Identity Sync Module
 * 
 * Provides tools for syncing AuthVader identities to your local database:
 * 
 * 1. **Prisma Schema Snippets** - Copy into your schema.prisma
 * 2. **TypeScript Types** - For type-safe operations
 * 3. **IdentitySyncHandler** - Pre-built webhook handler
 * 4. **Session Cleanup** - Optional maintenance utility
 * 
 * @example
 * ```typescript
 * // 1. Print schema to copy into your schema.prisma
 * import { printSchema } from '@authvader/sdk/server';
 * printSchema();
 * 
 * // 2. Set up webhook handler
 * import { IdentitySyncHandler, WebhookRouter } from '@authvader/sdk/server';
 * import { prisma } from './prisma';
 * 
 * const router = new WebhookRouter({
 *   handler: new IdentitySyncHandler(prisma),
 * });
 * 
 * app.post('/webhooks/authvader', router.expressHandler());
 * 
 * // 3. Optional: Schedule cleanup
 * import { cleanupSessions } from '@authvader/sdk/server';
 * 
 * // Run daily
 * cron.schedule('0 3 * * *', () => {
 *   cleanupSessions(prisma, { expiredOlderThanDays: 30 });
 * });
 * ```
 */

// Prisma schema snippets
export {
  IDENTITY_SCHEMA,
  IDENTITY_SESSION_SCHEMA,
  FULL_SCHEMA,
  printSchema,
} from './prisma-schema';

// Types
export type {
  IdentityBase,
  IdentityCreate,
  IdentityUpdate,
  IdentitySessionBase,
  IdentitySessionCreate,
  IdentitySessionUpdate,
  SessionCleanupOptions,
  SessionCleanupResult,
  PrismaClientLike,
  PrismaClientResolver,
  PrismaClientOrResolver,
} from './types';

// Identity sync handler
export { IdentitySyncHandler } from './identity-sync-handler';

// Session cleanup
export { cleanupSessions, getCleanupSQL } from './session-cleanup';
