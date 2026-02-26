import { UnauthorizedException } from "@nestjs/common";
import { InstanceApiKeyGuard } from "./instance-api-key.guard";

describe("InstanceApiKeyGuard", () => {
  const mockApiKeyService = {
    validateApiKey: jest.fn(),
  };

  const createContext = (authorization?: string) => {
    const request: any = { headers: {}, instanceApiKey: undefined };
    if (authorization) request.headers.authorization = authorization;

    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as any,
    };
  };

  let guard: InstanceApiKeyGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new InstanceApiKeyGuard(mockApiKeyService as any);
  });

  it("throws when auth header is missing", async () => {
    const { context } = createContext();
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Instance API key required"),
    );
  });

  it("throws when auth header does not match expected prefix", async () => {
    const { context } = createContext("Bearer sk_live_wrong");
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Instance API key required"),
    );
  });

  it("throws when API key is invalid/expired", async () => {
    const { context } = createContext("Bearer ik_live_validformat");
    mockApiKeyService.validateApiKey.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid or expired instance API key"),
    );
  });

  it("returns true and attaches key when valid", async () => {
    const { context, request } = createContext("Bearer ik_live_valid");
    const keyRecord = { id: "key1" };
    mockApiKeyService.validateApiKey.mockResolvedValue(keyRecord);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockApiKeyService.validateApiKey).toHaveBeenCalledWith(
      "ik_live_valid",
    );
    expect(request.instanceApiKey).toEqual(keyRecord);
  });
});
