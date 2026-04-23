/**
 * @authvital/server - Session Module
 *
 * Secure session management with AES-256-GCM encrypted cookies.
 * Provides utilities for creating, parsing, and rotating session cookies.
 */

// Cookie utilities
export {
  createSessionCookie,
  parseSessionCookie,
  rotateSessionCookie,
  createCookieOptions,
  serializeCookie,
  createClearCookie,
  parseCookies,
  getCookieValue,
  isSessionExpired,
  DEFAULT_COOKIE_OPTIONS,
  type SessionTokens,
  type CookieOptions,
} from './cookie.js';

// Session store
export {
  SessionStore,
  createSessionStore,
  type SessionStoreConfig,
  type SessionMetadata,
  type SessionData,
  type CreateSessionResult,
  type ValidateSessionResult,
  type RefreshResult,
} from './store.js';
