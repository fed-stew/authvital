// =============================================================================
// SEED PIPELINE ORDER GUARD
// =============================================================================
// The seed used to break because tenant roles were seeded AFTER users, so
// membership tenant-role assignments silently failed. The fix centralised the
// ordering in prisma/seed/pipeline.ts. This test locks that ordering in so a
// future edit can't quietly reintroduce the regression.
//
// It lives under src/ (not next to pipeline.ts) because jest's rootDir is
// "src" — only specs here are picked up by `npm test`. Importing the barrel is
// side-effect free: no PrismaClient is instantiated at import time.

import { SEED_PIPELINE } from '../prisma/seed';

describe('SEED_PIPELINE ordering', () => {
  const order = SEED_PIPELINE.map((s) => s.name);

  const idx = (name: string): number => {
    const i = order.indexOf(name);
    if (i === -1) {
      throw new Error(
        `Seeder "${name}" is missing from SEED_PIPELINE (found: ${order.join(', ')})`,
      );
    }
    return i;
  };

  it('seeds system tenant roles BEFORE users (the regression this guards)', () => {
    // If this fails, membership tenant_role assignments will silently no-op.
    expect(idx('system-roles')).toBeLessThan(idx('users'));
  });

  it('seeds applications and tenants before users (memberships resolve slugs)', () => {
    expect(idx('applications')).toBeLessThan(idx('users'));
    expect(idx('tenants')).toBeLessThan(idx('users'));
  });

  it('seeds subscriptions last (needs tenants, applications and users)', () => {
    expect(idx('tenants')).toBeLessThan(idx('subscriptions'));
    expect(idx('applications')).toBeLessThan(idx('subscriptions'));
    expect(idx('users')).toBeLessThan(idx('subscriptions'));
  });

  it('has no duplicate seeder names', () => {
    expect(new Set(order).size).toBe(order.length);
  });

  it('every seeder exposes name, shouldRun and run', () => {
    for (const seeder of SEED_PIPELINE) {
      expect(typeof seeder.name).toBe('string');
      expect(seeder.name.length).toBeGreaterThan(0);
      expect(typeof seeder.shouldRun).toBe('function');
      expect(typeof seeder.run).toBe('function');
    }
  });
});
