import {
  extractDomain,
  GENERIC_EMAIL_DOMAINS,
  isGenericDomain,
} from "./generic-domains";

describe("generic-domains helpers", () => {
  it("has expected major domains in generic set", () => {
    expect(GENERIC_EMAIL_DOMAINS.has("gmail.com")).toBe(true);
    expect(GENERIC_EMAIL_DOMAINS.has("outlook.com")).toBe(true);
  });

  it("isGenericDomain is case-insensitive", () => {
    expect(isGenericDomain("GMAIL.COM")).toBe(true);
    expect(isGenericDomain("ExampleCorp.COM")).toBe(false);
  });

  it("extractDomain returns normalized domain from email", () => {
    expect(extractDomain("User@Example.com")).toBe("example.com");
  });

  it("extractDomain returns empty string for invalid email shape", () => {
    expect(extractDomain("invalid-email")).toBe("");
    expect(extractDomain("")).toBe("");
  });
});
