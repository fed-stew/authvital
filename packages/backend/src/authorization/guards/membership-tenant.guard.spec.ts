import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { MembershipTenantGuard } from "./membership-tenant.guard";

describe("MembershipTenantGuard", () => {
  const mockPrisma = {
    membership: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const createContext = (request: any = {}) => ({
    switchToHttp: () => ({ getRequest: () => request }),
  });

  let guard: MembershipTenantGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new MembershipTenantGuard(mockPrisma as any);
  });

  it("throws when user is unauthenticated", async () => {
    const context = createContext({
      user: null,
      params: { membershipId: "m1" },
    });

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      new ForbiddenException("Authentication required"),
    );
  });

  it("throws not found when the target membership does not exist", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue(null);
    const context = createContext({
      user: { sub: "u1" },
      params: { membershipId: "missing" },
    });

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      new NotFoundException("Membership not found"),
    );
  });

  it("rejects a caller who is not a member of the resolved tenant", async () => {
    // Target membership lives in t1...
    mockPrisma.membership.findUnique.mockResolvedValue({ tenantId: "t1" });
    // ...but the caller has no membership there.
    mockPrisma.membership.findFirst.mockResolvedValue(null);

    const context = createContext({
      user: { sub: "outsider" },
      params: { membershipId: "m1" },
    });

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      new ForbiddenException("You do not have access to this tenant"),
    );
    expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          userId: "outsider",
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("attaches the caller's fresh permissions resolved via membershipId", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ tenantId: "t1" });
    mockPrisma.membership.findFirst.mockResolvedValue({
      id: "caller-m",
      membershipTenantRoles: [
        {
          tenantRole: {
            slug: "admin",
            permissions: ["members:manage-roles", "members:view"],
          },
        },
      ],
    });

    const request: any = {
      user: { sub: "admin-user" },
      params: { membershipId: "m1" },
    };

    await expect(
      guard.canActivate(createContext(request) as any),
    ).resolves.toBe(true);
    expect(request.tenant).toEqual({ id: "t1" });
    expect(request.tenantPermissions).toEqual([
      "members:manage-roles",
      "members:view",
    ]);
    expect(request.isOwner).toBe(false);
    expect(mockPrisma.membership.findUnique).toHaveBeenCalled();
  });

  it("prefers an explicit tenantId param without resolving the membership", async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({
      id: "caller-m",
      membershipTenantRoles: [
        { tenantRole: { slug: "owner", permissions: ["tenant:*"] } },
      ],
    });

    const request: any = {
      user: { sub: "owner-user" },
      params: { tenantId: "t9", userId: "someone" },
    };

    await expect(
      guard.canActivate(createContext(request) as any),
    ).resolves.toBe(true);
    expect(mockPrisma.membership.findUnique).not.toHaveBeenCalled();
    expect(request.tenant).toEqual({ id: "t9" });
    expect(request.isOwner).toBe(true);
  });
});
