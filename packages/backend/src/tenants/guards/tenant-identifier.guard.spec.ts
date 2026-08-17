import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { TenantIdentifierGuard } from './tenant-identifier.guard';

/**
 * These tests pin the contract of the slug->id boundary resolver:
 * - UUIDs pass through untouched (back-compat with id-based URLs)
 * - Slugs are resolved to the canonical id and rewritten in place
 * - Unknown slugs 404 (rather than silently sailing on as a bogus id)
 * - No tenant identifier on the request is a no-op
 */
describe('TenantIdentifierGuard', () => {
  const TENANT_ID = '91b5021c-0231-4881-951d-64f4f4f7bdc1';

  const makeContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const makeGuard = (findUnique: jest.Mock) =>
    new TenantIdentifierGuard({ tenant: { findUnique } } as never);

  it('resolves a slug param to the canonical id and rewrites it', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ id: TENANT_ID, slug: 'acme' });
    const request: any = { params: { tenantId: 'acme' } };

    await expect(makeGuard(findUnique).canActivate(makeContext(request))).resolves.toBe(
      true,
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: 'acme' },
      select: { id: true, slug: true },
    });
    expect(request.params.tenantId).toBe(TENANT_ID);
    expect(request.tenantSlug).toBe('acme');
  });

  it('leaves a UUID param untouched and never hits the database', async () => {
    const findUnique = jest.fn();
    const request: any = { params: { tenantId: TENANT_ID } };

    await expect(makeGuard(findUnique).canActivate(makeContext(request))).resolves.toBe(
      true,
    );

    expect(findUnique).not.toHaveBeenCalled();
    expect(request.params.tenantId).toBe(TENANT_ID);
  });

  it('resolves a slug in the request body', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ id: TENANT_ID, slug: 'acme' });
    const request: any = { body: { tenantId: 'acme' } };

    await makeGuard(findUnique).canActivate(makeContext(request));

    expect(request.body.tenantId).toBe(TENANT_ID);
  });

  it('throws NotFound for an unknown slug', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const request: any = { params: { tenantId: 'ghost' } };

    await expect(
      makeGuard(findUnique).canActivate(makeContext(request)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is a no-op when there is no tenant identifier', async () => {
    const findUnique = jest.fn();
    const request: any = { params: {} };

    await expect(makeGuard(findUnique).canActivate(makeContext(request))).resolves.toBe(
      true,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
