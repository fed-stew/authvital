import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key holding the list of scopes an integration endpoint requires.
 */
export const REQUIRE_SCOPES_KEY = 'm2m:requireScopes';

/**
 * Declare the scopes an M2M client must hold to invoke the decorated handler.
 *
 * Deny-by-default: {@link M2mScopeGuard} rejects any endpoint that does not
 * declare at least one scope via this decorator.
 */
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(REQUIRE_SCOPES_KEY, scopes);
