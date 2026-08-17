import { Request } from 'express';

/**
 * Extract JWT from Authorization header ONLY.
 * 
 * SECURITY: This function strictly enforces the split-token architecture.
 * It ONLY reads from the Authorization: Bearer header and NEVER from cookies.
 * 
 * This ensures:
 * - Access tokens are explicitly provided by clients
 * - No accidental cookie-based token extraction
 * - Backend remains stateless and secure
 * 
 * @param req - Express Request object
 * @returns The JWT token string or null if Authorization header is missing/invalid
 * @throws Never - returns null for any invalid input
 */
export function extractJwt(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Extract the caller's session JWT for the FIRST-PARTY console/IdP browser
 * session.
 *
 * Order of precedence:
 *   1. `Authorization: Bearer <token>` header (the in-memory access token the
 *      SPA attaches once it's warm). Delegates to {@link extractJwt}.
 *   2. The `idp_session` httpOnly cookie that the IdP sets on every login /
 *      signup / SSO / invite-accept flow.
 *
 * WHY THE COOKIE FALLBACK EXISTS
 * ------------------------------
 * The console (auth.lvh.me) keeps its access token in memory, so it is GONE
 * after any full page load / hard refresh. The only credential that survives a
 * reload is the `idp_session` cookie. Without this fallback the first API call
 * after every reload 401s and — because the password-login flow never issues a
 * refresh_token cookie — cannot self-heal. Reading the cookie makes the console
 * session actually durable.
 *
 * SECURITY
 * --------
 * `idp_session` is httpOnly (immune to XSS exfiltration — the classic reason to
 * keep access tokens out of *JS-readable* cookies does NOT apply here) and
 * sameSite (mitigates CSRF; cross-site fetches don't carry it). This is the
 * SAME cookie {@link OptionalAuthGuard} and the OAuth authorize redirect
 * already trust. Note we deliberately read ONLY `idp_session` — never
 * `super_admin_session` or any other cookie.
 *
 * @param req - Express Request object (requires cookie-parser to be enabled)
 * @returns The JWT token string, or null if neither source is present
 */
export function extractSessionJwt(req: Request): string | null {
  return (
    extractJwt(req) ||
    (req as unknown as { cookies?: Record<string, string> }).cookies?.[
      'idp_session'
    ] ||
    null
  );
}
