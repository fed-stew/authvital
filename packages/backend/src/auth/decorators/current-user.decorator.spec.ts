import "reflect-metadata";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { CurrentUser } from "./current-user.decorator";

describe("CurrentUser decorator", () => {
  class TestController {
    testMethod(_user: any, _email: string) {
      return true;
    }
  }

  beforeAll(() => {
    CurrentUser()(TestController.prototype, "testMethod", 0);
    CurrentUser("email")(TestController.prototype, "testMethod", 1);
  });

  const getMetadata = () =>
    Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, "testMethod") ||
    Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestController.prototype,
      "testMethod",
    ) ||
    {};

  const getFactoryByData = (data: unknown) => {
    const metadata = getMetadata();
    const entry = Object.values(metadata).find(
      (m: any) => m?.data === data,
    ) as any;
    if (!entry?.factory)
      throw new Error("CurrentUser metadata factory not found");
    return entry.factory as (data: unknown, ctx: any) => unknown;
  };

  const createCtx = (user: any) => ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  });

  it("returns full user when no data key is provided", () => {
    const factory = getFactoryByData(undefined);
    const user = { sub: "u1", email: "u1@example.com" };
    expect(factory(undefined, createCtx(user))).toEqual(user);
  });

  it("returns selected field when data key is provided", () => {
    const factory = getFactoryByData("email");
    const user = { sub: "u1", email: "u1@example.com" };
    expect(factory("email", createCtx(user))).toBe("u1@example.com");
  });

  it("returns undefined when selected field is missing", () => {
    const factory = getFactoryByData("email");
    expect(factory("email", createCtx(undefined))).toBeUndefined();
  });
});
