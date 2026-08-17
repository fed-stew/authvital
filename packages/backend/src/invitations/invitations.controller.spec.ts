// Mock the heavy service imports: this spec only inspects decorator metadata,
// and loading the real services drags in a require cycle through the
// authorization barrel that breaks when entered from this file.
jest.mock("./invitations.service", () => ({ InvitationsService: class {} }));
jest.mock("../auth/auth.service", () => ({ AuthService: class {} }));

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { InvitationsController } from "./invitations.controller";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { TenantIdentifierGuard, TenantAccessGuard } from "../tenants/guards";
import { PermissionGuard } from "../authorization/guards/permission.guard";

/**
 * Regression spec for the invitation MANAGEMENT guard stack.
 *
 * Console-session JWTs carry no tenant claims, so PermissionGuard alone would
 * 403 every management call (including tenant owners). TenantAccessGuard MUST
 * sit between TenantIdentifierGuard and PermissionGuard to populate
 * request.tenantPermissions from a live DB membership read.
 */
describe("InvitationsController guard stack", () => {
  const guardsFor = (handler: string) =>
    Reflect.getMetadata(
      GUARDS_METADATA,
      InvitationsController.prototype[
        handler as keyof InvitationsController
      ] as object,
    );

  const managementHandlers = [
    "createInvitation",
    "listTenantInvitations",
    "resendInvitation",
    "updateInvitation",
    "revokeInvitation",
  ];

  it.each(managementHandlers)(
    "%s uses Jwt -> TenantIdentifier -> TenantAccess -> Permission",
    (handler) => {
      expect(guardsFor(handler)).toEqual([
        JwtAuthGuard,
        TenantIdentifierGuard,
        TenantAccessGuard,
        PermissionGuard,
      ]);
    },
  );

  it.each(["getInvitation", "acceptInvitation"])(
    "public invitee route %s stays unguarded",
    (handler) => {
      expect(guardsFor(handler)).toBeUndefined();
    },
  );
});
