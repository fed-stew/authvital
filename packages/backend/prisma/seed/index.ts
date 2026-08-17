// =============================================================================
// SEED — public barrel
// =============================================================================
// Import from here. The seed is organised as: types + config loading, a shared
// ordered pipeline, and one self-contained seeder module per concern under
// ./seeders.

export * from './types';
export * from './config';
export * from './context';
export * from './pipeline';
export * from './run';

// Individual seeders (pure functions + Seeder objects), re-exported so callers
// can compose or test them in isolation.
export { instanceSeeder, seedInstanceMeta } from './seeders/instance.seeder';
export { seedSystemTenantRoles, systemRolesSeeder } from './seeders/system-roles.seeder';
export { seedSuperAdmin, superAdminSeeder } from './seeders/super-admin.seeder';
export { applicationsSeeder, seedApplications } from './seeders/applications.seeder';
export { seedTenants, tenantsSeeder } from './seeders/tenants.seeder';
export { seedUsers, usersSeeder } from './seeders/users.seeder';
export { seedSubscriptions, subscriptionsSeeder } from './seeders/subscriptions.seeder';
