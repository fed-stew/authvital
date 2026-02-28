import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { TenantAccessGuard } from "./tenant-access.guard";

describe("TenantAccessGuard", () => {
  const mockPrisma = {
    tenant: {
      findUnique: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
  };

  const createContext = (request: any = {}) => ({
    switchToHttp: () => ({ getRequest: () => request }),
  });

  let guard: TenantAccessGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new TenantAccessGuard(mockPrisma as any);
  });

  it("throws when user is unauthenticated", async () => {
    const context = createContext({ user: null, params: { tenantId: "t1" } });
    await expect(guard.canActivate(context as any)).rejects.toThrow(
      new ForbiddenException("Authentication required"),
    );
  });

  it("throws when tenantId is missing", async () => {
    const context = createContext({ user: { sub: "u1" }, params: {} });
    await expect(guard.canActivate(context as any)).rejects.toThrow(
      new ForbiddenException("Tenant ID required"),
    );
  });

  it("throws not found when tenant does not exist", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    const context = createContext({
      user: { sub: "u1" },
      params: { tenantId: "t1" },
    });

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      new NotFoundException("Tenant not found"),
    );
  });

  it("throws when membership is missing", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: "t1",
      name: "Tenant",
      slug: "tenant",
    });
    mockPrisma.membership.findFirst.mockResolvedValue(null);

    const context = createContext({
      user: { sub: "u1" },
      params: { tenantId: "t1" },
    });

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      new ForbiddenException("You do not have access to this tenant"),
    );
  });

  it("attaches tenant, membership, permissions and owner flag when valid", async () => {
    const tenant = { id: "t1", name: "Tenant", slug: "tenant" };
    const membership = {
      id: "m1",
      membershipTenantRoles: [
        {
          tenantRole: {
            slug: "owner",
            permissions: ["members:invite", "licenses:*"],
          },
        },
        { tenantRole: { slug: "admin", permissions: ["domains:verify"] } },
      ],
    };

    mockPrisma.tenant.findUnique.mockResolvedValue(tenant);
    mockPrisma.membership.findFirst.mockResolvedValue(membership);

    const request: any = { user: { sub: "u1" }, params: { tenantId: "t1" } };
    const context = createContext(request);

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
    expect(request.tenant).toEqual(tenant);
    expect(request.membership).toEqual(membership);
    expect(request.tenantPermissions).toEqual([
      "members:invite",
      "licenses:*",
      "domains:verify",
    ]);
    expect(request.isOwner).toBe(true);
  });
});
