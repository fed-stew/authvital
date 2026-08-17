// =============================================================================
// SEED NORMALIZATION GUARD — container/credential shape resolution
// =============================================================================
// Locks in the marquee "one app container, up-to-one SPA + one MACHINE
// credential" behaviour AND the backward-compat for the old flat single-
// credential shape. Lives under src/ because jest's rootDir is "src".

import { normalizeCredentials, machineCredential } from '../prisma/seed/normalize';
import { SeedApplication } from '../prisma/seed/types';

const app = (over: Partial<SeedApplication>): SeedApplication => ({
  name: 'Test',
  slug: 'test',
  ...over,
});

describe('normalizeCredentials — new nested container shape', () => {
  it('returns both SPA + MACHINE credentials of a single container', () => {
    const creds = normalizeCredentials(
      app({
        credentials: [
          { type: 'SPA', client_id: 'web-bff-client-id', redirect_uris: ['https://x/cb'] },
          {
            type: 'MACHINE',
            client_id: 'local-machine-client-id',
            client_secret: 'local-machine-secret-key',
            m2m_trusted_all_tenants: true,
            m2m_allowed_scopes: ['integration:read', 'integration:write'],
          },
        ],
      }),
    );

    expect(creds.map((c) => c.type)).toEqual(['SPA', 'MACHINE']);
    expect(creds[0].client_id).toBe('web-bff-client-id');
    expect(creds[1].client_secret).toBe('local-machine-secret-key');
    expect(creds[1].m2m_allowed_scopes).toEqual(['integration:read', 'integration:write']);
  });

  it('accepts `clients:` as an alias for `credentials:`', () => {
    const creds = normalizeCredentials(
      app({ clients: [{ type: 'MACHINE', client_id: 'm' }] }),
    );
    expect(creds).toHaveLength(1);
    expect(creds[0].type).toBe('MACHINE');
  });

  it('coerces any non-MACHINE type to SPA', () => {
    const creds = normalizeCredentials(
      app({ credentials: [{ type: undefined, client_id: 'x' }] }),
    );
    expect(creds[0].type).toBe('SPA');
  });

  it('machineCredential() returns the MACHINE credential when present', () => {
    const found = machineCredential(
      app({
        credentials: [
          { type: 'SPA', client_id: 's' },
          { type: 'MACHINE', client_id: 'm' },
        ],
      }),
    );
    expect(found?.client_id).toBe('m');
  });
});

describe('normalizeCredentials — old flat backward-compat shape', () => {
  it('folds flat SPA fields into a single SPA credential', () => {
    const creds = normalizeCredentials(
      app({
        type: 'SPA',
        client_id: 'local-spa-client-id',
        redirect_uris: ['http://localhost:5173/cb'],
      }),
    );
    expect(creds).toHaveLength(1);
    expect(creds[0].type).toBe('SPA');
    expect(creds[0].client_id).toBe('local-spa-client-id');
    expect(creds[0].redirect_uris).toEqual(['http://localhost:5173/cb']);
  });

  it('maps the old flat `allowed_scopes` to credential `m2m_allowed_scopes`', () => {
    const creds = normalizeCredentials(
      app({
        type: 'MACHINE',
        client_id: 'm',
        client_secret: 's',
        m2m_trusted_all_tenants: true,
        allowed_scopes: ['integration:read'],
      }),
    );
    expect(creds[0].type).toBe('MACHINE');
    expect(creds[0].m2m_allowed_scopes).toEqual(['integration:read']);
  });

  it('defaults an omitted flat type to SPA (historical default)', () => {
    const creds = normalizeCredentials(app({ client_id: 'x' }));
    expect(creds[0].type).toBe('SPA');
  });
});

describe('normalizeCredentials — invariants', () => {
  it('rejects more than one SPA credential', () => {
    expect(() =>
      normalizeCredentials(
        app({
          credentials: [
            { type: 'SPA', client_id: 'a' },
            { type: 'SPA', client_id: 'b' },
          ],
        }),
      ),
    ).toThrow(/at most one/i);
  });

  it('rejects more than one MACHINE credential', () => {
    expect(() =>
      normalizeCredentials(
        app({
          credentials: [
            { type: 'MACHINE', client_id: 'a' },
            { type: 'MACHINE', client_id: 'b' },
          ],
        }),
      ),
    ).toThrow(/at most one/i);
  });

  it('allows exactly one SPA + one MACHINE (the marquee shape)', () => {
    expect(() =>
      normalizeCredentials(
        app({
          credentials: [
            { type: 'SPA', client_id: 'a' },
            { type: 'MACHINE', client_id: 'b' },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects an SPA credential that carries a client_secret', () => {
    expect(() =>
      normalizeCredentials(
        app({ credentials: [{ type: 'SPA', client_id: 'a', client_secret: 'nope' }] }),
      ),
    ).toThrow(/must NOT define a secret/i);
  });
});
