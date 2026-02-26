import { validateRedirectUriPattern } from "./redirect-uri.utils";

describe("validateRedirectUriPattern", () => {
  it("accepts a standard https URI", () => {
    expect(validateRedirectUriPattern("https://example.com/callback")).toEqual({
      valid: true,
    });
  });

  it("rejects URI without http/https scheme", () => {
    const result = validateRedirectUriPattern("ftp://example.com/callback");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Must start with http:// or https://");
  });

  it("accepts wildcard in subdomain position", () => {
    expect(
      validateRedirectUriPattern("https://*.example.com/callback"),
    ).toEqual({ valid: true });
  });

  it("rejects wildcard outside subdomain position", () => {
    const result = validateRedirectUriPattern("https://example.*.com/callback");
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      "Wildcards are only allowed in subdomain position",
    );
  });

  it("rejects wildcard without valid domain suffix", () => {
    const result = validateRedirectUriPattern("https://*.internal/callback");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Must have a valid domain after *.");
  });

  it("accepts tenant placeholder in subdomain position", () => {
    expect(
      validateRedirectUriPattern("https://{tenant}.example.com/callback"),
    ).toEqual({ valid: true });
  });

  it("rejects tenant placeholder outside subdomain position", () => {
    const result = validateRedirectUriPattern(
      "https://example.com/{tenant}/callback",
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      "{tenant} is only allowed in subdomain position",
    );
  });

  it("rejects malformed URL after placeholder substitution", () => {
    const result = validateRedirectUriPattern("https://exa mple.com/callback");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not a valid URL format");
  });
});
