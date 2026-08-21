import { resolveServiceRole } from './service-role';
import { createPlaneGateMiddleware } from './plane-gate.middleware';

describe('resolveServiceRole', () => {
  it("should default to 'all' when unset (zero-config back-compat)", () => {
    expect(resolveServiceRole(undefined)).toBe('all');
    expect(resolveServiceRole('')).toBe('all');
  });

  it('should accept the three valid roles', () => {
    expect(resolveServiceRole('public')).toBe('public');
    expect(resolveServiceRole('admin')).toBe('admin');
    expect(resolveServiceRole('all')).toBe('all');
  });

  it('should FAIL FAST on invalid values — never silently default', () => {
    expect(() => resolveServiceRole('carrier_pigeon')).toThrow(
      /Invalid SERVICE_ROLE "carrier_pigeon"/,
    );
    // Case matters — 'Public' is a typo, not a role
    expect(() => resolveServiceRole('Public')).toThrow(/Invalid SERVICE_ROLE/);
    expect(() => resolveServiceRole(' public')).toThrow(/Invalid SERVICE_ROLE/);
  });
});

describe('createPlaneGateMiddleware', () => {
  function run(role: 'public' | 'admin' | 'all', path: string) {
    const middleware = createPlaneGateMiddleware(role);
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn();
    middleware(
      { path, url: path } as any,
      { status, json } as any,
      next,
    );
    return { status, json, next };
  }

  describe("role 'public'", () => {
    it.each(['/admin', '/admin/', '/admin/tenants', '/admin/index.html'])(
      'should 404 %s (no redirect, no SPA shell)',
      (path) => {
        const { status, json, next } = run('public', path);
        expect(status).toHaveBeenCalledWith(404);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({ statusCode: 404 }),
        );
        expect(next).not.toHaveBeenCalled();
      },
    );

    it.each(['/auth/login', '/api/health', '/oauth/authorize', '/administrator'])(
      'should pass through %s',
      (path) => {
        const { next, status } = run('public', path);
        expect(next).toHaveBeenCalled();
        expect(status).not.toHaveBeenCalled();
      },
    );
  });

  describe("role 'admin'", () => {
    it.each(['/auth', '/auth/login'])('should 404 %s', (path) => {
      const { status, next } = run('admin', path);
      expect(status).toHaveBeenCalledWith(404);
      expect(next).not.toHaveBeenCalled();
    });

    it.each(['/admin/tenants', '/api/auth/session', '/authoring'])(
      'should pass through %s (API /api/auth/* is NOT the /auth UI)',
      (path) => {
        const { next, status } = run('admin', path);
        expect(next).toHaveBeenCalled();
        expect(status).not.toHaveBeenCalled();
      },
    );
  });

  describe("role 'all'", () => {
    it.each(['/admin/tenants', '/auth/login'])(
      'should serve both planes (%s passes)',
      (path) => {
        const { next, status } = run('all', path);
        expect(next).toHaveBeenCalled();
        expect(status).not.toHaveBeenCalled();
      },
    );
  });
});
