import { extractJwt } from "./extract-jwt";

describe("extractJwt", () => {
  it("returns idp_session cookie when present", () => {
    const req: any = {
      cookies: { idp_session: "idp-token", super_admin_session: "admin-token" },
      headers: { authorization: "Bearer header-token" },
    };

    expect(extractJwt(req)).toBe("idp-token");
  });

  it("returns super_admin_session when idp_session is absent", () => {
    const req: any = {
      cookies: { super_admin_session: "admin-token" },
      headers: { authorization: "Bearer header-token" },
    };

    expect(extractJwt(req)).toBe("admin-token");
  });

  it("returns bearer token from authorization header when cookies are missing", () => {
    const req: any = {
      cookies: {},
      headers: { authorization: "Bearer header-token" },
    };

    expect(extractJwt(req)).toBe("header-token");
  });

  it("returns null when authorization header is not bearer format", () => {
    const req: any = {
      cookies: {},
      headers: { authorization: "Basic abc123" },
    };

    expect(extractJwt(req)).toBeNull();
  });

  it("returns null when no auth sources exist", () => {
    const req: any = {
      cookies: undefined,
      headers: {},
    };

    expect(extractJwt(req)).toBeNull();
  });
});
