/**
 * @authvital/server - Error Classes
 *
 * Typed errors surfaced by the server SDK so BFFs can branch on failure
 * modes instead of string-matching messages.
 */

/**
 * Thrown when the IdP refuses to refresh/mint tokens because the user must
 * complete an interactive step (e.g. the tenant's MFA policy is REQUIRED and
 * the user's enrollment grace period has expired).
 *
 * The IdP signals this with a 401/403 response whose JSON body carries
 * `{ error: 'interaction_required', reason?: string }`. Retrying the refresh
 * will never succeed — the BFF should catch this error, clear the session,
 * and redirect the user to re-authenticate (the authorize flow will interrupt
 * into the hosted MFA enrollment page and resume automatically).
 *
 * @example
 * ```typescript
 * import { InteractionRequiredError } from '@authvital/server';
 *
 * try {
 *   const tokens = await oauth.refreshTokens(refreshToken);
 * } catch (err) {
 *   if (err instanceof InteractionRequiredError) {
 *     // Do NOT retry — send the user back through /oauth/authorize.
 *     return res.redirect('/auth/login');
 *   }
 *   throw err;
 * }
 * ```
 */
export class InteractionRequiredError extends Error {
  /** Machine-readable reason from the IdP (e.g. 'mfa_enrollment_required') */
  reason?: string;

  constructor(message = 'Interaction required — user must re-authenticate', reason?: string) {
    super(message);
    this.name = 'InteractionRequiredError';
    this.reason = reason;
    // Fix prototype chain for instanceof checks (matches core error style)
    Object.setPrototypeOf(this, InteractionRequiredError.prototype);
  }
}

/**
 * Inspect a failed token-endpoint response and build an
 * {@link InteractionRequiredError} when the IdP rejected the request with
 * `{ error: 'interaction_required' }` on a 401/403.
 *
 * @param status - HTTP status code of the failed response
 * @param bodyText - Raw response body text
 * @returns The typed error, or null if this is some other failure
 */
export function parseInteractionRequired(
  status: number,
  bodyText: string,
): InteractionRequiredError | null {
  if (status !== 401 && status !== 403) {
    return null;
  }
  try {
    const body = JSON.parse(bodyText) as {
      error?: string;
      reason?: string;
      message?: string;
    };
    if (body.error === 'interaction_required') {
      return new InteractionRequiredError(
        body.message ?? 'Interaction required — user must re-authenticate',
        body.reason,
      );
    }
  } catch {
    // Non-JSON body — not our error shape.
  }
  return null;
}
