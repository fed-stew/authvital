/**
 * Migration Runner Entry Point
 * 
 * This runs after Prisma migrations in the Cloud Run Job.
 * Handles bootstrap tasks like creating initial super admin and system roles.
 * 
 * Usage: node dist/src/migrate-runner.js
 */

import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

// Build DATABASE_URL from components if not provided directly (Cloud SQL socket connection)
if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD && process.env.DB_DATABASE) {
  const { DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;
  process.env.DATABASE_URL = `postgresql://${DB_USERNAME}:${encodeURIComponent(DB_PASSWORD)}@localhost/${DB_DATABASE}?host=${DB_HOST}`;
}

import { bootstrap } from './bootstrap';

async function runMigration(): Promise<void> {
  try {
    // Run bootstrap (handles super admin creation, YAML seeding, and system roles)
    console.log('Running bootstrap...');
    await bootstrap();
    
    console.log('Bootstrap complete');
    process.exit(0);
  } catch (error) {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  }
}

runMigration();
