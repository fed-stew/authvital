#!/usr/bin/env ts-node
/**
 * Admin Account Recovery CLI Tool
 * ================================
 * Safe, audited account recovery for SuperAdmin accounts.
 * Replaces dangerous raw SQL operations with proper tooling.
 *
 * Usage:
 *   pnpm recover-admin --email admin@example.com --action reset-password
 *   pnpm recover-admin --email admin@example.com --action disable-mfa --force
 *   pnpm recover-admin --email admin@example.com --action unlock-account
 *
 * Actions:
 *   reset-password  - Generate temp password, require change on next login
 *   disable-mfa     - Remove MFA setup (use with caution!)
 *   unlock-account  - Reactivate a locked/deactivated account
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SALT_ROUNDS = 12;
const TEMP_PASSWORD_LENGTH = 16;
const AUDIT_LOG_FILE = path.join(process.cwd(), 'admin-recovery-audit.log');

type Action = 'reset-password' | 'disable-mfa' | 'unlock-account';

const VALID_ACTIONS: Action[] = ['reset-password', 'disable-mfa', 'unlock-account'];

interface CliArgs {
  email?: string;
  action?: Action;
  force: boolean;
  help: boolean;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = { force: false, help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--email' || arg === '-e') {
      result.email = args[++i];
    } else if (arg === '--action' || arg === '-a') {
      const action = args[++i] as Action;
      if (VALID_ACTIONS.includes(action)) {
        result.action = action;
      } else {
        console.error(`❌ Invalid action: ${action}`);
        console.error(`   Valid actions: ${VALID_ACTIONS.join(', ')}`);
        process.exit(1);
      }
    } else if (arg === '--force' || arg === '-f') {
      result.force = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    }
  }

  return result;
}

/**
 * Generate a secure temporary password using crypto.randomBytes
 */
function generateTempPassword(): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const randomBytes = crypto.randomBytes(TEMP_PASSWORD_LENGTH);
  let password = '';

  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}

/**
 * Log action to audit file with timestamp
 */
function auditLog(
  action: string,
  targetEmail: string,
  result: 'SUCCESS' | 'FAILURE',
  details?: string,
): void {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ACTION=${action} EMAIL=${targetEmail} RESULT=${result}${details ? ` DETAILS=${details}` : ''}\n`;

  try {
    fs.appendFileSync(AUDIT_LOG_FILE, logEntry);
  } catch (err) {
    console.error(`⚠️  Warning: Could not write to audit log: ${err}`);
  }
}

/**
 * Prompt user for confirmation (unless --force is passed)
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     🔑 Admin Account Recovery CLI Tool                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Safe, audited account recovery for SuperAdmin accounts.
All actions are logged to: ${AUDIT_LOG_FILE}

USAGE:
  pnpm recover-admin --email <email> --action <action> [--force]

OPTIONS:
  -e, --email <email>     Target admin email address (required)
  -a, --action <action>   Recovery action to perform (required)
  -f, --force             Skip confirmation prompts
  -h, --help              Show this help message

ACTIONS:
  reset-password    Generate a temporary password and require change on next login
                    The temp password will be printed to console ONCE.

  disable-mfa       Remove MFA configuration from the account.
                    ⚠️  Use with caution - reduces account security!

  unlock-account    Reactivate a locked/deactivated admin account.

EXAMPLES:
  # Reset password (with confirmation prompt)
  pnpm recover-admin --email admin@example.com --action reset-password

  # Disable MFA without prompts (for scripts)
  pnpm recover-admin -e admin@example.com -a disable-mfa --force

  # Unlock a deactivated account
  pnpm recover-admin --email locked@example.com --action unlock-account

SECURITY NOTES:
  • Temporary passwords are shown ONCE - copy immediately!
  • All actions are logged to the audit file with timestamps
  • Use --force sparingly - confirmation helps prevent mistakes
`);
}

// =============================================================================
// RECOVERY ACTIONS
// =============================================================================

async function resetPassword(
  prisma: PrismaClient,
  email: string,
): Promise<{ success: boolean; tempPassword?: string }> {
  const admin = await prisma.superAdmin.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!admin) {
    return { success: false };
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

  await prisma.superAdmin.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      mustChangePassword: true,
    },
  });

  return { success: true, tempPassword };
}

async function disableMfa(
  prisma: PrismaClient,
  email: string,
): Promise<{ success: boolean; wasEnabled?: boolean }> {
  const admin = await prisma.superAdmin.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!admin) {
    return { success: false };
  }

  const wasEnabled = admin.mfaEnabled;

  await prisma.superAdmin.update({
    where: { id: admin.id },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: [],
      mfaVerifiedAt: null,
    },
  });

  return { success: true, wasEnabled };
}

async function unlockAccount(
  prisma: PrismaClient,
  email: string,
): Promise<{ success: boolean; wasLocked?: boolean }> {
  const admin = await prisma.superAdmin.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!admin) {
    return { success: false };
  }

  const wasLocked = !admin.isActive;

  await prisma.superAdmin.update({
    where: { id: admin.id },
    data: {
      isActive: true,
    },
  });

  return { success: true, wasLocked };
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Show help if requested or no args provided
  if (args.help || process.argv.length <= 2) {
    printHelp();
    process.exit(0);
  }

  // Validate required arguments
  if (!args.email) {
    console.error('❌ Error: --email is required');
    console.error('   Run with --help for usage information');
    process.exit(1);
  }

  if (!args.action) {
    console.error('❌ Error: --action is required');
    console.error(`   Valid actions: ${VALID_ACTIONS.join(', ')}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    // Check if admin exists first
    const admin = await prisma.superAdmin.findUnique({
      where: { email: args.email.toLowerCase() },
      select: { id: true, email: true, displayName: true, isActive: true, mfaEnabled: true },
    });

    if (!admin) {
      console.error(`❌ No SuperAdmin found with email: ${args.email}`);
      auditLog(args.action, args.email, 'FAILURE', 'Admin not found');
      process.exit(1);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 Admin Account Recovery');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Target:  ${admin.email}${admin.displayName ? ` (${admin.displayName})` : ''}`);
    console.log(`   Action:  ${args.action}`);
    console.log(`   Status:  ${admin.isActive ? '✅ Active' : '🔒 Locked'}`);
    console.log(`   MFA:     ${admin.mfaEnabled ? '🛡️  Enabled' : '⚪ Disabled'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Confirmation (unless --force)
    if (!args.force) {
      const confirmed = await confirm(`⚠️  Proceed with ${args.action}?`);
      if (!confirmed) {
        console.log('\n❌ Cancelled by user');
        auditLog(args.action, args.email, 'FAILURE', 'Cancelled by user');
        process.exit(0);
      }
    }

    // Execute the action
    switch (args.action) {
      case 'reset-password': {
        const result = await resetPassword(prisma, args.email);
        if (result.success && result.tempPassword) {
          console.log('\n✅ Password reset successful!');
          console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
          console.log('║  TEMPORARY PASSWORD (copy this now - it will NOT be shown again!)            ║');
          console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
          console.log(`║  ${result.tempPassword.padEnd(74)}║`);
          console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
          console.log('\n📝 User will be required to change password on next login.\n');
          auditLog(args.action, args.email, 'SUCCESS', 'Password reset, mustChangePassword=true');
        }
        break;
      }

      case 'disable-mfa': {
        const result = await disableMfa(prisma, args.email);
        if (result.success) {
          if (result.wasEnabled) {
            console.log('\n✅ MFA has been disabled for this account.');
            console.log('⚠️  The user should set up MFA again after logging in.\n');
            auditLog(args.action, args.email, 'SUCCESS', 'MFA disabled (was enabled)');
          } else {
            console.log('\nℹ️  MFA was already disabled for this account.\n');
            auditLog(args.action, args.email, 'SUCCESS', 'MFA was already disabled');
          }
        }
        break;
      }

      case 'unlock-account': {
        const result = await unlockAccount(prisma, args.email);
        if (result.success) {
          if (result.wasLocked) {
            console.log('\n✅ Account has been unlocked and reactivated.');
            console.log('📝 The user can now log in normally.\n');
            auditLog(args.action, args.email, 'SUCCESS', 'Account unlocked (was locked)');
          } else {
            console.log('\nℹ️  Account was already active.\n');
            auditLog(args.action, args.email, 'SUCCESS', 'Account was already active');
          }
        }
        break;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Error: ${errorMessage}`);
    auditLog(args.action!, args.email!, 'FAILURE', errorMessage);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
