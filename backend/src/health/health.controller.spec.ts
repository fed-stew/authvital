import { HealthController } from "./health.controller";

describe("HealthController", () => {
  const mockPrisma = {
    $queryRaw: jest.fn(),
  };

  let controller: HealthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HealthController(mockPrisma as any);
  });

  it("returns ok status when database query succeeds", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const result = await controller.check();

    expect(result.status).toBe("ok");
    expect(result.database).toBe("connected");
    expect(typeof result.timestamp).toBe("string");
  });

  it("returns error status with error message when database query fails with Error", async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error("db offline"));

    const result = await controller.check();

    expect(result.status).toBe("error");
    expect(result.database).toBe("disconnected");
    expect(result.error).toBe("db offline");
  });

  it("returns unknown error message when failure is non-Error", async () => {
    mockPrisma.$queryRaw.mockRejectedValue("bad");

    const result = await controller.check();

    expect(result.status).toBe("error");
    expect(result.error).toBe("Unknown error");
  });
});
