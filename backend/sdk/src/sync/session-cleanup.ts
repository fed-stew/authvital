/**
 * @authvital/sdk - Session Cleanup Utility
 * 
 * Optional utility for cleaning up expired/revoked sessions.
 * Call this on a schedule (cron job) or manually.
 * 
 * @example
 * ```typescript
 * import { cleanupSessions } from '@authvital/sdk/server';
 * import { prisma } from './prisma';
 * 
 * // Run daily via cron
 * await cleanupSessions(prisma, {
 *   expiredOlderThanDays: 30,
 *   deleteRevoked: false, // Keep revoked for audit trail
 * });
 * ```
 */

import type { PrismaClientLike, SessionCleanupOptions, SessionCleanupResult } from './types';

/**
 * Clean up expired and optionally revoked sessions
 * 
 * @param prisma - Prisma client instance
 * @param options - Cleanup configuration
 * @returns Result with count of deleted sessions
 */
export async function cleanupSessions(
  prisma: PrismaClientLike,
  options: SessionCleanupOptions = {},
): Promise<SessionCleanupResult> {
  const {
    expiredOlderThanDays = 30,
    deleteRevoked = false,
    dryRun = false,
  } = options;

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - expiredOlderThanDays);

  // Build where clause
  const whereConditions: Array<Record<string, unknown>> = [
    // Expired sessions older than cutoff
    { expiresAt: { lt: cutoffDate } },
  ];

  if (deleteRevoked) {
    // Also delete revoked sessions older than cutoff
    whereConditions.push({ revokedAt: { lt: cutoffDate } });
  }

  if (dryRun) {
    // For dry run, we can't easily count without deleting
    // Just log the intent
    console.log('[SessionCleanup] DRY RUN - Would delete sessions:');
    console.log(`  - Expired before: ${cutoffDate.toISOString()}`);
    if (deleteRevoked) {
      console.log(`  - Revoked before: ${cutoffDate.toISOString()}`);
    }
    
    return {
      deletedCount: 0, // Can't know without actually querying
      dryRun: true,
    };
  }

  // Execute deletion
  const result = await prisma.identitySession.deleteMany({
    where: {
      OR: whereConditions,
    },
  });

  console.log(`[SessionCleanup] Deleted ${result.count} sessions`);

  return {
    deletedCount: result.count,
    dryRun: false,
  };
}

/**
 * Get raw SQL for session cleanup (for use with pg_cron or similar)
 * 
 * @param options - Cleanup configuration
 * @returns SQL statement string
 */
export function getCleanupSQL(options: SessionCleanupOptions = {}): string {
  const { expiredOlderThanDays = 30, deleteRevoked = false } = options;

  let sql = `-- AuthVital SDK: Session Cleanup
-- Run this periodically (e.g., daily via pg_cron)

DELETE FROM av_identity_sessions
WHERE expires_at < NOW() - INTERVAL '${expiredOlderThanDays} days'`;

  if (deleteRevoked) {
    sql += `
   OR revoked_at < NOW() - INTERVAL '${expiredOlderThanDays} days'`;
  }

  sql += ';';

  return sql;
}
