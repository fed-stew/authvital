describe("DomainVerificationService DNS helper (isolated module)", () => {
  const loadServiceWithResolve = (
    impl: (domain: string) => Promise<string[][]>,
  ) => {
    let ServiceClass: any;

    jest.isolateModules(() => {
      jest.doMock("util", () => ({
        ...jest.requireActual("util"),
        promisify: jest.fn().mockReturnValue(impl),
      }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("./domain-verification.service");
      ServiceClass = mod.DomainVerificationService;
    });

    return new ServiceClass({});
  };

  afterEach(() => {
    jest.resetModules();
    jest.dontMock("util");
  });

  it("checkDnsTxtRecord returns true when matching TXT record exists", async () => {
    const service = loadServiceWithResolve(async () => [
      ["abc"],
      ["token-match"],
    ]);

    const ok = await (service as any).checkDnsTxtRecord(
      "example.com",
      "token-match",
    );

    expect(ok).toBe(true);
  });

  it("checkDnsTxtRecord returns false when TXT records do not match", async () => {
    const service = loadServiceWithResolve(async () => [["abc"], ["def"]]);

    const ok = await (service as any).checkDnsTxtRecord(
      "example.com",
      "token-match",
    );

    expect(ok).toBe(false);
  });
});
