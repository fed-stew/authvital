import { getRequiredEnv, validateEnv } from "./env.validation";

describe("env.validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("passes with required vars and warns when SendGrid key is missing", () => {
    process.env.BASE_URL = "https://idp.example.com";
    process.env.DATABASE_URL = "postgres://db";
    process.env.SIGNING_KEY_SECRET = "secret";
    process.env.PORT = "3000";

    expect(() => validateEnv()).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      "Environment validation passed",
    );
  });

  it("exits when required env vars are missing", () => {
    const exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    delete process.env.BASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.SIGNING_KEY_SECRET;
    delete process.env.PORT;

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("exits when BASE_URL is invalid", () => {
    const exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    process.env.BASE_URL = "not-a-url";
    process.env.DATABASE_URL = "postgres://db";
    process.env.SIGNING_KEY_SECRET = "secret";
    process.env.PORT = "3000";

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorCalls = (console.error as jest.Mock).mock.calls.flat();
    expect(errorCalls.join(" ")).toContain("BASE_URL (invalid URL format)");
  });

  it("exits when PORT is not numeric", () => {
    const exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    process.env.BASE_URL = "https://idp.example.com";
    process.env.DATABASE_URL = "postgres://db";
    process.env.SIGNING_KEY_SECRET = "secret";
    process.env.PORT = "abc";

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorCalls = (console.error as jest.Mock).mock.calls.flat();
    expect(errorCalls.join(" ")).toContain("PORT (must be a valid number)");
  });

  it("requires SendGrid FROM fields when SENDGRID_API_KEY is set", () => {
    const exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    process.env.BASE_URL = "https://idp.example.com";
    process.env.DATABASE_URL = "postgres://db";
    process.env.SIGNING_KEY_SECRET = "secret";
    process.env.PORT = "3000";
    process.env.SENDGRID_API_KEY = "sg-key";
    delete process.env.SENDGRID_FROM_EMAIL;
    delete process.env.SENDGRID_FROM_NAME;

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorCalls = (console.error as jest.Mock).mock.calls.flat().join(" ");
    expect(errorCalls).toContain(
      "SENDGRID_FROM_EMAIL (required when SENDGRID_API_KEY is set)",
    );
    expect(errorCalls).toContain(
      "SENDGRID_FROM_NAME (required when SENDGRID_API_KEY is set)",
    );
  });

  it("getRequiredEnv returns value when present", () => {
    process.env.MY_TEST_VAR = "woof";
    expect(getRequiredEnv("MY_TEST_VAR")).toBe("woof");
  });

  it("getRequiredEnv throws when value is missing", () => {
    delete process.env.MISSING_VAR;
    expect(() => getRequiredEnv("MISSING_VAR")).toThrow(
      "Missing required environment variable: MISSING_VAR",
    );
  });
});
