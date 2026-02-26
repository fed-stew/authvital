/**
 * Note: There's a conflicting src/bootstrap.ts file (the NestJS startup bootstrap function).
 * Import directly from './bootstrap/bootstrap.module' instead of './bootstrap' in app.module.ts
 * to avoid TypeScript resolving to the wrong file.
 */
export * from './bootstrap.module';
export * from './bootstrap.service';
