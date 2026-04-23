import { DomainVerificationService } from "./domain-verification.service";

describe("DomainVerificationService DNS helper", () => {
  const mockPrisma = {
    domain: {
      findUnique: jest.fn(),
    },
    membership: {
      findFirst: jest.fn().mockResolvedValue({ id: "m1" }),
    },
  };

  let service: DomainVerificationService;

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.membership.findFirst.mockResolvedValue({ id: "m1" });
    service = new DomainVerificationService(mockPrisma as any);
  });

  it("checkDnsTxtRecord returns true when matching TXT record exists", async () => {
    jest
      .spyOn(service as any, "checkDnsTxtRecord")
      .mockResolvedValue(true);

    const ok = await (service as any).checkDnsTxtRecord(
      "example.com",
      "token-match",
    );

    expect(ok).toBe(true);
  });

  it("checkDnsTxtRecord returns false when TXT records do not match", async () => {
    jest
      .spyOn(service as any, "checkDnsTxtRecord")
      .mockResolvedValue(false);

    const ok = await (service as any).checkDnsTxtRecord(
      "example.com",
      "token-match",
    );

    expect(ok).toBe(false);
  });
});
