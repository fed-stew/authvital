import { extractJwt, extractSessionJwt } from "./extract-jwt";

describe("extractJwt", () => {
  it("returns null when idp_session cookie is present (split-token security)", () => {
    const req: any = {
      cookies: { idp_session: "idp-token", super_admin_session: "admin-token" },
      headers: {},
    };

    expect(extractJwt(req)).toBeNull();
  });

  it("returns null when super_admin_session cookie is present (split-token security)", () => {
    const req: any = {
      cookies: { super_admin_session: "admin-token" },
      headers: {},
    };

    expect(extractJwt(req)).toBeNull();
  });

  it("returns bearer token from authorization header when cookies are missing", () => {
    const req: any = {
      cookies: {},
      headers: { authorization: "Bearer header-token" },
    };

    expect(extractJwt(req)).toBe("header-token");
  });

  it("returns bearer token from authorization header even when cookies are present", () => {
    const req: any = {
      cookies: { idp_session: "idp-token", super_admin_session: "admin-token" },
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

  it("returns null when authorization header is missing", () => {
    const req: any = {
      cookies: { idp_session: "idp-token" },
      headers: {},
    };

    expect(extractJwt(req)).toBeNull();
  });
});

describe("extractSessionJwt", () => {
  it("prefers the Authorization: Bearer header over the cookie", () => {
    const req: any = {
      cookies: { idp_session: "idp-token" },
      headers: { authorization: "Bearer header-token" },
    };

    expect(extractSessionJwt(req)).toBe("header-token");
  });

  it("falls back to the idp_session cookie when no header is present", () => {
    const req: any = {
      cookies: { idp_session: "idp-token" },
      headers: {},
    };

    expect(extractSessionJwt(req)).toBe("idp-token");
  });

  it("ignores non-idp_session cookies (e.g. super_admin_session)", () => {
    const req: any = {
      cookies: { super_admin_session: "admin-token" },
      headers: {},
    };

    expect(extractSessionJwt(req)).toBeNull();
  });

  it("returns null when neither header nor idp_session cookie exist", () => {
    const req: any = {
      cookies: {},
      headers: {},
    };

    expect(extractSessionJwt(req)).toBeNull();
  });

  it("is safe when cookies are undefined", () => {
    const req: any = {
      cookies: undefined,
      headers: {},
    };

    expect(extractSessionJwt(req)).toBeNull();
  });
});
