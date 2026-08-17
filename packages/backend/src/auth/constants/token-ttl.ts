/**
 * Token TTL constants shared between token issuance (AuthService, the
 * session-refresh interceptor) and the signing-key lifecycle
 * (KeyManagerService).
 *
 * INVARIANT: PASSIVE_KEY_LIFETIME_HOURS (key-manager.service.ts) must exceed
 * the longest-lived token TTL, otherwise tokens signed just before a key
 * rotation become unverifiable while still valid. Console session JWTs are
 * short-lived (rolling 1-hour default) but OAuth clients carry per-client
 * access/refresh token TTLs — KeyManagerService cross-checks those against
 * the passive lifetime at startup.
 *
 * All values are read from process.env ONCE at module load (startup); they
 * never change for the lifetime of the process.
 */

/** Parse a positive integer from the environment, falling back on garbage. */
function positiveIntFromEnv(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Console/IdP session JWT lifetime (rolling window).
 *
 * Default: 1 hour. Each console JWT lives this long, but the
 * SessionRefreshInterceptor silently re-issues the `idp_session` cookie once
 * a token is past half its TTL, so an ACTIVE console session slides forward
 * indefinitely — up to the absolute cap below. An idle session simply
 * expires after this window.
 *
 * Override with CONSOLE_SESSION_TTL_SECONDS.
 */
export const CONSOLE_SESSION_TTL_SECONDS = positiveIntFromEnv(
  'CONSOLE_SESSION_TTL_SECONDS',
  60 * 60,
);

/**
 * Absolute console session lifetime cap.
 *
 * Every console JWT carries a `session_start` claim (unix seconds, stamped
 * at FIRST login and preserved across sliding re-issues). No re-issue may
 * extend a session past session_start + this value — after that the user
 * must authenticate again, no matter how active they are.
 *
 * Default: 7 days. Override with CONSOLE_SESSION_ABSOLUTE_TTL_SECONDS.
 */
export const CONSOLE_SESSION_ABSOLUTE_TTL_SECONDS = positiveIntFromEnv(
  'CONSOLE_SESSION_ABSOLUTE_TTL_SECONDS',
  7 * 24 * 60 * 60,
);

/**
 * Default passive signing-key lifetime: 192 hours (8 days).
 *
 * The binding constraint is the LONGEST-lived JWT verified against these
 * keys: refresh tokens are RS256 JWTs verified via JWKS with a DEFAULT
 * refreshTokenTtl of 7 days. After a rotation, refresh JWTs signed by the
 * demoted key must remain verifiable for their full lifetime, or every
 * default-configured client suffers a forced re-login ~2 days
 * post-rotation. Hence:
 *
 *   max(refreshTokenTtl, accessTokenTtl, CONSOLE_SESSION_ABSOLUTE_TTL)
 *     + 24h margin  =  7d + 24h  =  192h
 *
 * Clients configured with even longer access/refresh token TTLs are
 * flagged by KeyManagerService at startup. Override with
 * PASSIVE_KEY_LIFETIME_HOURS.
 */
export const DEFAULT_PASSIVE_KEY_LIFETIME_HOURS = 192;

/**
 * Minimum passive signing-key lifetime: the console session TTL plus a
 * 1-hour safety margin, so every console JWT remains verifiable for its
 * entire (rolling) lifetime. Per-client OAuth token TTLs are checked
 * separately against the configured passive lifetime at startup.
 */
export const MIN_PASSIVE_KEY_LIFETIME_SECONDS =
  CONSOLE_SESSION_TTL_SECONDS + 60 * 60;
