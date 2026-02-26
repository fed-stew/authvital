import "reflect-metadata";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { BadRequestException } from "@nestjs/common";
import { JwtTenantId } from "./jwt-tenant-id.decorator";

describe("JwtTenantId decorator", () => {
  class TestController {
    testMethod(_tenantId: string) {
      return true;
    }
  }

  beforeAll(() => {
    JwtTenantId()(TestController.prototype, "testMethod", 0);
  });

  const getFactory = () => {
    const metadata =
      Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, "testMethod") ||
      Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        TestController.prototype,
        "testMethod",
      ) ||
      {};
    const entry = Object.values(metadata)[0] as any;
    if (!entry?.factory)
      throw new Error("JwtTenantId metadata factory not found");
    return entry.factory as (data: unknown, ctx: any) => string;
  };

  const createCtx = (user: any) => ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  });

  it("returns tenant_id from authenticated user", () => {
    const factory = getFactory();
    expect(factory(undefined, createCtx({ tenant_id: "tenant-1" }))).toBe(
      "tenant-1",
    );
  });

  it("throws when tenant_id is missing", () => {
    const factory = getFactory();
    expect(() => factory(undefined, createCtx({ sub: "u1" }))).toThrow(
      BadRequestException,
    );
  });
});
