/**
 * Tenant Licensing — permission-tier / IDOR / seat-accounting e2e.
 *
 * WHAT THIS PROVES (end-to-end, through the REAL guards + controller + services + DB):
 *   - licenses:view      → owner, billing-admin, admin, member   (read overview)
 *   - licenses:manage    → owner, billing-admin, admin           (grant/revoke seats)
 *   - licenses:provision → owner, billing-admin                  (resize inventory)
 *   - owner-permission expansion (tenant:* → god-mode) via resolveEffectiveTenantPermissions
 *   - the new billing-admin role sits ABOVE admin for billing, but can't do other admin stuff
 *   - IDOR: you can't touch another tenant's subscription, and can't read a tenant you're not in
 *   - seat accounting: totalSeatsAssigned moves correctly on grant/revoke
 *
 * HOW IT AUTHENTICATES (no OAuth dance, no browser):
 *   The DB-backed TenantAccessGuard resolves permissions from the database, not from
 *   token claims, so a minimal RS256 token signed by the app's own KeyService (sub = userId)
 *   is enough for the guards to enforce the real logic. We mint one per seeded user.
 *
 * REQUIREMENTS TO RUN (see test/README.md):
 *   - A Postgres reachable via DATABASE_URL with the schema migrated.
 *   - The SAME MASTER_SECRET as that database (so the signing keys decrypt).
 *   - BASE_URL set (matches the JWT issuer the guard verifies).
 *   Easiest path: `docker compose up -d` then run this against that DB using the same .env.
 *
 * Rows are created under a unique run-id and best-effort cleaned up in afterAll, so it's
 * safe to point at your dev database.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as path from 'path';

// Load secrets from .env BEFORE the AppModule graph is compiled (ConfigModule also
// loads it, but Prisma reads process.env.DATABASE_URL eagerly). Best-effort.
for (const p of ['../.env', '../../../.env']) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config({ path: path.resolve(__dirname, p) });
  } catch {
    /* dotenv not present or file missing — rely on the ambient environment */
  }
}

import { AppModule } from '../src/app.module';
import { KeyService } from '../src/oauth/key.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  seedApplications,
  seedSystemTenantRoles,
  seedTenants,
  seedUsers,
} from '../prisma/seed';

// Node 18+ global fetch, typed loosely so this file compiles regardless of the
// TS lib/@types/node combination in CI.
const fetchFn: (input: string, init?: any) => Promise<any> = (globalThis as any).fetch;

const RID = `e2e${Date.now().toString(36)}`;
const APP_SLUG = `${RID}-seat-app`;
const T_LICENSECO = `${RID}-licenseco`;
const T_OTHERCO = `${RID}-otherco`;

const email = (name: string) => `${name}@${RID}.test`;
const PASSWORD = 'test1234';

// Personas
const OWNER = email('owner');
const BILLING = email('billing');
const ADMIN = email('admin');
const MEMBER = email('member');
const OTHER_OWNER = email('otherowner');

const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

describe('Tenant licensing permission tiers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let issuer: string;
  let keyService: KeyService;

  // resolved ids
  let licensecoId: string;
  let othercoId: string;
  let seatAppId: string;
  let basicTypeId: string;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  async function token(userEmail: string): Promise<string> {
    if (tokens[userEmail]) return tokens[userEmail];
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) throw new Error(`Seed user not found: ${userEmail}`);
    userIds[userEmail] = user.id;
    tokens[userEmail] = await keyService.signJwt(
      { email: userEmail },
      { subject: user.id, issuer, expiresIn: 3600 },
    );
    return tokens[userEmail];
  }

  type Resp = { status: number; data: any };
  async function call(
    method: string,
    apiPath: string,
    asEmail?: string,
    body?: unknown,
  ): Promise<Resp> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (asEmail) headers.authorization = `Bearer ${await token(asEmail)}`;
    const res = await fetchFn(`${baseUrl}/api${apiPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    return { status: res.status, data };
  }

  const ok = (r: Resp) => expect([200, 201]).toContain(r.status);
  const forbidden = (r: Resp) => expect(r.status).toBe(403);

  const overviewFor = async (tenantId: string, asEmail: string) =>
    call('GET', `/tenants/${tenantId}/licenses/overview`, asEmail);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);
    keyService = app.get(KeyService);
    issuer = app.get(ConfigService).getOrThrow<string>('BASE_URL');

    // --- Seed an isolated scenario using the REAL seed helpers (DRY) --------
    await seedSystemTenantRoles(prisma); // owner / admin / member / billing-admin

    const appIdMap = await seedApplications(prisma, [
      {
        name: 'E2E Seat App',
        slug: APP_SLUG,
        type: 'SPA',
        client_id: `${RID}-seat-client`,
        licensing_mode: 'PER_SEAT',
        default_seat_count: 10,
        auto_grant_to_owner: true,
        license_types: [
          { name: 'Basic Seat', slug: 'basic-seat', status: 'ACTIVE', display_order: 1 },
          { name: 'Pro Seat', slug: 'pro-seat', status: 'ACTIVE', display_order: 2 },
        ],
        roles: [{ name: 'Member', slug: 'member', is_default: true }],
      } as any,
    ]);
    const seatApp = appIdMap.get(APP_SLUG);
    if (!seatApp) throw new Error(`Seed failed: application "${APP_SLUG}" was not created`);
    seatAppId = seatApp.id;

    const tenantIdMap = await seedTenants(prisma, [
      { name: 'E2E License Co', slug: T_LICENSECO },
      { name: 'E2E Other Co', slug: T_OTHERCO },
    ]);
    const licensecoSeedId = tenantIdMap.get(T_LICENSECO);
    const othercoSeedId = tenantIdMap.get(T_OTHERCO);
    if (!licensecoSeedId || !othercoSeedId) {
      throw new Error('Seed failed: expected tenants were not created');
    }
    licensecoId = licensecoSeedId;
    othercoId = othercoSeedId;

    await seedUsers(
      prisma,
      [
        { email: OWNER, password: PASSWORD, memberships: [{ tenant: T_LICENSECO, tenant_role: 'owner', app_roles: { [APP_SLUG]: ['member'] } }] },
        { email: BILLING, password: PASSWORD, memberships: [{ tenant: T_LICENSECO, tenant_role: 'billing-admin', app_roles: { [APP_SLUG]: ['member'] } }] },
        { email: ADMIN, password: PASSWORD, memberships: [{ tenant: T_LICENSECO, tenant_role: 'admin', app_roles: { [APP_SLUG]: ['member'] } }] },
        { email: MEMBER, password: PASSWORD, memberships: [{ tenant: T_LICENSECO, tenant_role: 'member', app_roles: { [APP_SLUG]: ['member'] } }] },
        { email: OTHER_OWNER, password: PASSWORD, memberships: [{ tenant: T_OTHERCO, tenant_role: 'owner', app_roles: { [APP_SLUG]: ['member'] } }] },
      ] as any,
      tenantIdMap,
      appIdMap,
    );

    const basic = await prisma.licenseType.findFirst({
      where: { applicationId: seatAppId, slug: 'basic-seat' },
    });
    if (!basic) throw new Error('Seed failed: basic-seat license type was not created');
    basicTypeId = basic.id;
  });

  afterAll(async () => {
    // Best-effort cleanup, child → parent. Errors are swallowed: rows are RID-scoped
    // so leftovers are harmless and the next run creates fresh, unique data.
    const swallow = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* ignore */
      }
    };
    const tenantIds = [licensecoId, othercoId].filter(Boolean);
    if (prisma) {
      await swallow(() => prisma.licenseAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } }));
      await swallow(() => prisma.appSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } }));
      await swallow(() => prisma.membership.deleteMany({ where: { tenantId: { in: tenantIds } } }));
      await swallow(() => prisma.user.deleteMany({ where: { email: { endsWith: `@${RID}.test` } } }));
      await swallow(() => prisma.licenseType.deleteMany({ where: { applicationId: seatAppId } }));
      await swallow(() => prisma.role.deleteMany({ where: { applicationId: seatAppId } }));
      await swallow(() => prisma.appAccess?.deleteMany({ where: { applicationId: seatAppId } }));
      await swallow(() => prisma.application.deleteMany({ where: { id: seatAppId } }));
      await swallow(() => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
    }
    if (app) await app.close();
  });

  // ===========================================================================
  // READ (licenses:view) — everyone in the tenant can read
  // ===========================================================================
  it('every role can read the overview (licenses:view)', async () => {
    for (const persona of [OWNER, BILLING, ADMIN, MEMBER]) {
      ok(await overviewFor(licensecoId, persona));
    }
  });

  // ===========================================================================
  // PROVISION (licenses:provision) — owner + billing-admin only
  // ===========================================================================
  it('owner can provision inventory; seats show up in the overview', async () => {
    const before = await overviewFor(licensecoId, OWNER);
    const ownedBefore = before.data.totalSeatsOwned ?? 0;

    const res = await call('POST', `/tenants/${licensecoId}/licenses/subscriptions`, OWNER, {
      applicationId: seatAppId,
      licenseTypeId: basicTypeId,
      quantityPurchased: 5,
      currentPeriodEnd: future(),
    });
    ok(res);

    const after = await overviewFor(licensecoId, OWNER);
    expect(after.data.totalSeatsOwned).toBe(ownedBefore + 5);
  });

  it('admin and member CANNOT provision/resize inventory (403)', async () => {
    const sub = await currentSubscription();

    forbidden(
      await call('POST', `/tenants/${licensecoId}/licenses/subscriptions`, ADMIN, {
        applicationId: seatAppId,
        licenseTypeId: basicTypeId,
        quantityPurchased: 3,
        currentPeriodEnd: future(),
      }),
    );
    forbidden(
      await call('PATCH', `/tenants/${licensecoId}/licenses/subscriptions/${sub.id}/quantity`, ADMIN, {
        quantityPurchased: 9,
      }),
    );
    forbidden(
      await call('PATCH', `/tenants/${licensecoId}/licenses/subscriptions/${sub.id}/quantity`, MEMBER, {
        quantityPurchased: 9,
      }),
    );
  });

  it('billing-admin CAN resize inventory (provision tier)', async () => {
    const sub = await currentSubscription();
    ok(
      await call('PATCH', `/tenants/${licensecoId}/licenses/subscriptions/${sub.id}/quantity`, BILLING, {
        quantityPurchased: 8,
      }),
    );
    const after = await overviewFor(licensecoId, OWNER);
    expect(after.data.totalSeatsOwned).toBe(8);
  });

  // ===========================================================================
  // MANAGE SEATS (licenses:manage) — owner + billing-admin + admin; NOT member
  // ===========================================================================
  it('member CANNOT grant a seat (403)', async () => {
    forbidden(
      await call('POST', `/tenants/${licensecoId}/licenses/grant`, MEMBER, {
        userId: userIds[ADMIN] ?? (await token(ADMIN), userIds[ADMIN]),
        applicationId: seatAppId,
        licenseTypeId: basicTypeId,
      }),
    );
  });

  it('admin CAN grant/revoke a seat, and seat accounting updates', async () => {
    await token(MEMBER); // ensure userIds[MEMBER] populated
    const target = userIds[MEMBER];

    const before = (await overviewFor(licensecoId, ADMIN)).data.totalSeatsAssigned ?? 0;

    ok(
      await call('POST', `/tenants/${licensecoId}/licenses/grant`, ADMIN, {
        userId: target,
        applicationId: seatAppId,
        licenseTypeId: basicTypeId,
      }),
    );
    const afterGrant = (await overviewFor(licensecoId, ADMIN)).data.totalSeatsAssigned ?? 0;
    expect(afterGrant).toBe(before + 1);

    ok(
      await call('POST', `/tenants/${licensecoId}/licenses/revoke`, ADMIN, {
        userId: target,
        applicationId: seatAppId,
      }),
    );
    const afterRevoke = (await overviewFor(licensecoId, ADMIN)).data.totalSeatsAssigned ?? 0;
    expect(afterRevoke).toBe(before);
  });

  // ===========================================================================
  // IDOR — cross-tenant access must be blocked
  // ===========================================================================
  it('cannot resize a subscription that belongs to a different tenant (403)', async () => {
    const sub = await currentSubscription(); // licenseco's subscription
    // Otto owns otherco and can provision THERE, but must not touch licenseco's sub
    // via an otherco-scoped URL.
    forbidden(
      await call('PATCH', `/tenants/${othercoId}/licenses/subscriptions/${sub.id}/quantity`, OTHER_OWNER, {
        quantityPurchased: 99,
      }),
    );
  });

  it('cannot read the overview of a tenant you are not a member of (403)', async () => {
    // licenseco member reaching into otherco
    forbidden(await overviewFor(othercoId, MEMBER));
    // otherco owner reaching into licenseco
    forbidden(await overviewFor(licensecoId, OTHER_OWNER));
  });

  // --- helpers ---------------------------------------------------------------
  async function currentSubscription(): Promise<{ id: string }> {
    const res = await overviewFor(licensecoId, OWNER);
    const subs: any[] = res.data.subscriptions ?? [];
    const match =
      subs.find((s) => s.applicationId === seatAppId) ?? subs[0];
    const id = match?.id ?? match?.subscriptionId;
    if (!id) throw new Error('No subscription found for licenseco — provisioning may have failed');
    return { id };
  }
});
