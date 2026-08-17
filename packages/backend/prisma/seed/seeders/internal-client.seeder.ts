// =============================================================================
// INTERNAL CLIENT SEEDER — the reserved internal auth-flow credential
// =============================================================================
// Internal auth-flow sessions (e.g. the admin-console redirect `exchange-token`)
// mint refresh tokens that point at a reserved ApplicationClient rather than any
// customer OAuth app. This seeder ensures that reserved container + credential
// exist on every bootstrap so a fresh `migrate` + `seed` yields a working
// internal session path. Fully idempotent (get-or-create).
//
// The actual shape lives in src/auth/internal-client.ts — the single source of
// truth shared with the auth controller (DRY).

import { PrismaClient } from '@prisma/client';
import { ensureInternalClient, INTERNAL_CLIENT_ID } from '../../../src/auth/internal-client';
import { Seeder } from '../context';
import { log, logSection } from '../logger';

export async function seedInternalClient(prisma: PrismaClient): Promise<void> {
  logSection('Internal Auth-Flow Client');
  await ensureInternalClient(prisma);
  log('', `Reserved internal client ensured (client_id=${INTERNAL_CLIENT_ID})`);
}

export const internalClientSeeder: Seeder = {
  name: 'internal-client',
  shouldRun: () => true, // always required for internal auth-flow sessions
  run: (ctx) => seedInternalClient(ctx.prisma),
};
