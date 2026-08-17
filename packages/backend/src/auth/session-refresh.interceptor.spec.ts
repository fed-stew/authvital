jest.mock("../oauth/key.service", () => ({
  KeyService: class MockKeyService {},
}));

import { ConfigService } from "@nestjs/config";
import { of } from "rxjs";
import { SessionRefreshInterceptor } from "./session-refresh.interceptor";
import {
  CONSOLE_SESSION_TTL_SECONDS,
  CONSOLE_SESSION_ABSOLUTE_TTL_SECONDS,
} from "./constants/token-ttl";

describe("SessionRefreshInterceptor — sliding idp_session re-issuance", () => {
  const mockKeyService = { verifyJwt: jest.fn() };
  const mockAuthService = { generateJwt: jest.fn() };
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue("https://issuer.example.com"),
  } as unknown as ConfigService;

  let interceptor: SessionRefreshInterceptor;

  const now = () => Math.floor(Date.now() / 1000);

  /** Build a structurally valid (unsigned) compact JWT for jose.decodeJwt. */
  const makeToken = (payload: Record<string, unknown>): string => {
    const b64 = (obj: object) =>
      Buffer.from(JSON.stringify(obj)).toString("base64url");
    return `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}.sig`;
  };

  /** A token past half its TTL with a healthy absolute-cap budget. */
  const midlifePayload = (overrides: Record<string, unknown> = {}) => ({
    sub: "u1",
    email: "u@example.com",
    amr: ["pwd", "otp"],
    iat: now() - 2400, // 40 min old
    exp: now() + 1200, // 20 min left (1h TTL)
    session_start: now() - 2400,
    ...overrides,
  });

  const buildContext = ({
    cookieToken,
    authorization,
  }: {
    cookieToken?: string;
    authorization?: string;
  }) => {
    const request: any = {
      headers: authorization ? { authorization } : {},
      cookies: cookieToken ? { idp_session: cookieToken } : {},
    };
    const response: any = { cookie: jest.fn(), headersSent: false };
    const next = { handle: jest.fn(() => of("handled")) };
    const context = {
      getType: () => "http",
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any;
    return { context, next, request, response };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new SessionRefreshInterceptor(
      mockKeyService as any,
      mockAuthService as any,
      mockConfigService,
    );
    mockAuthService.generateJwt.mockResolvedValue("fresh-jwt");
  });

  it("re-issues the cookie once the token is past half its TTL, preserving sub/email/amr/session_start", async () => {
    const payload = midlifePayload();
    mockKeyService.verifyJwt.mockResolvedValue(payload);
    const { context, next, response } = buildContext({
      cookieToken: makeToken(payload),
    });

    await interceptor.intercept(context, next as any);

    expect(mockKeyService.verifyJwt).toHaveBeenCalled();
    expect(mockAuthService.generateJwt).toHaveBeenCalledWith(
      "u1",
      "u@example.com",
      {
        amr: ["pwd", "otp"],
        sessionStart: payload.session_start,
        expiresIn: CONSOLE_SESSION_TTL_SECONDS,
      },
    );
    expect(response.cookie).toHaveBeenCalledWith(
      "idp_session",
      "fresh-jwt",
      expect.objectContaining({ httpOnly: true }),
    );
    expect(next.handle).toHaveBeenCalled();
  });

  it("does NOT re-issue a token younger than half its TTL", async () => {
    const payload = midlifePayload({
      iat: now() - 60, // 1 min old
      exp: now() + 3540,
    });
    const { context, next, response } = buildContext({
      cookieToken: makeToken(payload),
    });

    await interceptor.intercept(context, next as any);

    // Pre-filter short-circuits BEFORE any signature verification.
    expect(mockKeyService.verifyJwt).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("refuses to slide past the absolute session cap", async () => {
    const payload = midlifePayload({
      session_start: now() - CONSOLE_SESSION_ABSOLUTE_TTL_SECONDS - 10,
    });
    const { context, next, response } = buildContext({
      cookieToken: makeToken(payload),
    });

    await interceptor.intercept(context, next as any);

    expect(mockAuthService.generateJwt).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("clamps the fresh token's lifetime so it never outlives the cap", async () => {
    const remaining = 600; // only 10 minutes of absolute budget left
    const payload = midlifePayload({
      session_start: now() - CONSOLE_SESSION_ABSOLUTE_TTL_SECONDS + remaining,
    });
    mockKeyService.verifyJwt.mockResolvedValue(payload);
    const { context, next } = buildContext({
      cookieToken: makeToken(payload),
    });

    await interceptor.intercept(context, next as any);

    const options = mockAuthService.generateJwt.mock.calls[0][2];
    expect(options.expiresIn).toBeLessThanOrEqual(remaining);
    expect(options.sessionStart).toBe(payload.session_start);
  });

  it("skips Bearer-authenticated requests entirely (even with a cookie present)", async () => {
    const payload = midlifePayload();
    const { context, next, response } = buildContext({
      cookieToken: makeToken(payload),
      authorization: "Bearer some-access-token",
    });

    await interceptor.intercept(context, next as any);

    expect(mockKeyService.verifyJwt).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalled();
  });

  it("does nothing without an idp_session cookie", async () => {
    const { context, next, response } = buildContext({});

    await interceptor.intercept(context, next as any);

    expect(response.cookie).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalled();
  });

  it("legacy tokens (no amr / session_start) slide as ['pwd'] with iat as session start", async () => {
    const payload = midlifePayload({
      amr: undefined,
      session_start: undefined,
    });
    mockKeyService.verifyJwt.mockResolvedValue(payload);
    const { context, next } = buildContext({
      cookieToken: makeToken(payload),
    });

    await interceptor.intercept(context, next as any);

    expect(mockAuthService.generateJwt).toHaveBeenCalledWith(
      "u1",
      "u@example.com",
      expect.objectContaining({ amr: ["pwd"], sessionStart: payload.iat }),
    );
  });

  it("silently skips when the cookie fails verification (expired/forged)", async () => {
    const payload = midlifePayload();
    mockKeyService.verifyJwt.mockRejectedValue(new Error("bad signature"));
    const { context, next, response } = buildContext({
      cookieToken: makeToken(payload),
    });

    await interceptor.intercept(context, next as any);

    expect(response.cookie).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalled();
  });

  it("never breaks the request when sliding throws unexpectedly", async () => {
    const payload = midlifePayload();
    mockKeyService.verifyJwt.mockResolvedValue(payload);
    mockAuthService.generateJwt.mockRejectedValue(new Error("keys on fire"));
    const { context, next } = buildContext({
      cookieToken: makeToken(payload),
    });

    await expect(
      interceptor.intercept(context, next as any),
    ).resolves.toBeDefined();
    expect(next.handle).toHaveBeenCalled();
  });
});
