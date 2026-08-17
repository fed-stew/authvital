/**
 * Token TTL constants shared between token issuance (AuthService) and the
 * signing-key lifecycle (KeyManagerService).
 *
 * INVARIANT: PASSIVE_KEY_LIFETIME_HOURS (key-manager.service.ts) must exceed
 * the longest-lived token TTL, otherwise tokens signed just before a key
 * rotation become unverifiable while still valid. The longest-lived token is
 * currently the 7-day console session JWT minted by AuthService.generateJwt.
 *
 * Both sides import these constants so the values cannot silently drift.
 */

/** Console/IdP session JWT lifetime: 7 days (AuthService.generateJwt). */
export const CONSOLE_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Minimum passive signing-key lifetime: max token TTL plus a 24-hour safety
 * margin, so every token remains verifiable for its entire lifetime.
 */
export const MIN_PASSIVE_KEY_LIFETIME_SECONDS =
  CONSOLE_SESSION_TTL_SECONDS + 24 * 60 * 60;
