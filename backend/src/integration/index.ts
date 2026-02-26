/**
 * Integration Module
 *
 * Provides M2M (machine-to-machine) APIs for SaaS backends to:
 * - Check user permissions
 * - Check feature/subscription/seat entitlements
 * - Manage licenses (grant, revoke, change)
 * - Query tenant and membership data
 * - Send and manage invitations
 */

export * from './integration.module';
export * from './services';
export * from './types';
