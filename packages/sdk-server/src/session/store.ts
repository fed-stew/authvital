/**
 * @authvital/server - Session Store
 *
 * Session management with encrypted cookie storage.
 * Supports token rotation, cleanup utilities, and session metadata.
 */

import type { TokenResponse } from '@authvital/shared';
import {
  createSessionCookie,
  parseSessionCookie,
  rotateSessionCookie,
  createCookieOptions,
  serializeCookie,
  createClearCookie,
  getCookieValue,
  type SessionTokens,
  type CookieOptions,
} from './cookie.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Session store configuration.
 */
export interface SessionStoreConfig {
  /** Encryption secret (must be at least 32 characters) */
  secret: string;
  /** Cookie configuration options */
  cookie?: Partial<CookieOptions>;
  /** Is production environment */
  isProduction?: boolean;
  /** AuthVital API host */
  authVitalHost: string;
}

/**
 * Session metadata stored alongside tokens.
 */
export interface SessionMetadata {
  /** Session ID */
  sessionId: string;
  /** When the session was created */
  createdAt: number;
  /** Last activity timestamp */
  lastAccessedAt: number;
  /** User agent string (if available) */
  userAgent?: string;
  /** IP address (if available) */
  ipAddress?: string;
  /** Number of times tokens have been rotated */
  rotationCount: number;
}

/**
 * Complete session data including tokens and metadata.
 */
export interface SessionData {
  tokens: SessionTokens;
  metadata: SessionMetadata;
}

/**
 * Session creation result.
 */
export interface CreateSessionResult {
  /** Encrypted cookie value to send to client */
  cookieValue: string;
  /** Set-Cookie header value */
  setCookieHeader: string;
  /** Session metadata */
  metadata: SessionMetadata;
}

/**
 * Session validation result.
 */
export interface ValidateSessionResult {
  /** Whether the session is valid */
  valid: boolean;
  /** Session data if valid */
  session?: SessionData;
  /** Whether the session needs refresh */
  needsRefresh: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Token refresh result.
 */
export interface RefreshResult {
  /** Whether refresh succeeded */
  success: boolean;
  /** New cookie value if successful */
  cookieValue?: string;
  /** New Set-Cookie header if successful */
  setCookieHeader?: string;
  /** Updated session metadata */
  metadata?: SessionMetadata;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// SESSION STORE CLASS
// =============================================================================

/**
 * Session store for managing encrypted session cookies.
 *
 * This class provides:
 * - Session creation and validation
 * - Token rotation support
 * - Session metadata tracking
 * - Cleanup utilities
 */
export class SessionStore {
  private readonly config: SessionStoreConfig;
  private readonly cookieOptions: CookieOptions;

  /**
   * Create a new session store.
   *
   * @param config - Session store configuration
   */
  constructor(config: SessionStoreConfig) {
    if (!config.secret || config.secret.length < 32) {
      throw new Error('Session secret must be at least 32 characters');
    }

    this.config = config;
    this.cookieOptions = createCookieOptions(
      config.isProduction ?? process.env.NODE_ENV === 'production',
      config.cookie
    );
  }

  /**
   * Get the cookie name used by this store.
   *
   * @returns Cookie name
   */
  get cookieName(): string {
    return this.cookieOptions.name;
  }

  /**
   * Get the full cookie options.
   *
   * @returns Cookie options
   */
  get options(): CookieOptions {
    return { ...this.cookieOptions };
  }

  // ===========================================================================
  // SESSION CREATION
  // ===========================================================================

  /**
   * Create a new session from OAuth tokens.
   *
   * @param tokens - OAuth token response
   * @param context - Optional request context for metadata
   * @returns Session creation result with cookie headers
   */
  createSession(
    tokens: TokenResponse,
    context?: { userAgent?: string; ipAddress?: string }
  ): CreateSessionResult {
    const encryptedValue = createSessionCookie(tokens, this.config.secret);
    const sessionTokens = parseSessionCookie(encryptedValue, this.config.secret);

    const metadata: SessionMetadata = {
      sessionId: sessionTokens.sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      userAgent: context?.userAgent,
      ipAddress: context?.ipAddress,
      rotationCount: 0,
    };

    return {
      cookieValue: encryptedValue,
      setCookieHeader: serializeCookie(encryptedValue, this.cookieOptions),
      metadata,
    };
  }

  // ===========================================================================
  // SESSION VALIDATION
  // ===========================================================================

  /**
   * Validate a session from a cookie header.
   *
   * @param cookieHeader - The Cookie header string
   * @returns Validation result
   */
  validateSession(cookieHeader: string | undefined): ValidateSessionResult {
    try {
      const cookieValue = getCookieValue(cookieHeader, this.cookieOptions.name);

      if (!cookieValue) {
        return {
          valid: false,
          needsRefresh: false,
          error: 'No session cookie found',
        };
      }

      const tokens = parseSessionCookie(cookieValue, this.config.secret);
      const now = Math.floor(Date.now() / 1000);
      const needsRefresh = tokens.expiresAt <= now + 300; // 5 minute buffer

      const metadata: SessionMetadata = {
        sessionId: tokens.sessionId,
        createdAt: now,
        lastAccessedAt: now,
        rotationCount: 0,
      };

      return {
        valid: true,
        session: { tokens, metadata },
        needsRefresh,
      };
    } catch (error) {
      return {
        valid: false,
        needsRefresh: false,
        error: error instanceof Error ? error.message : 'Invalid session',
      };
    }
  }

  /**
   * Parse session tokens without full validation.
   * Useful when you just need the tokens and don't care about expiration.
   *
   * @param cookieHeader - The Cookie header string
   * @returns Session tokens or null if invalid
   */
  getSessionTokens(cookieHeader: string | undefined): SessionTokens | null {
    try {
      const cookieValue = getCookieValue(cookieHeader, this.cookieOptions.name);
      if (!cookieValue) return null;

      return parseSessionCookie(cookieValue, this.config.secret);
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // TOKEN ROTATION
  // ===========================================================================

  /**
   * Rotate session with new tokens.
   *
   * @param currentCookieValue - Current encrypted cookie value
   * @param newTokens - New OAuth tokens
   * @param context - Optional request context
   * @returns Refresh result with new cookie
   */
  rotateSession(
    currentCookieValue: string,
    newTokens: TokenResponse,
    context?: { userAgent?: string; ipAddress?: string }
  ): RefreshResult {
    try {
      const newCookieValue = rotateSessionCookie(
        currentCookieValue,
        newTokens,
        this.config.secret
      );

      const tokens = parseSessionCookie(newCookieValue, this.config.secret);

      const metadata: SessionMetadata = {
        sessionId: tokens.sessionId,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        userAgent: context?.userAgent,
        ipAddress: context?.ipAddress,
        rotationCount: 0, // Reset on rotation
      };

      return {
        success: true,
        cookieValue: newCookieValue,
        setCookieHeader: serializeCookie(newCookieValue, this.cookieOptions),
        metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Rotation failed',
      };
    }
  }

  // ===========================================================================
  // SESSION CLEANUP
  // ===========================================================================

  /**
   * Create a header to clear the session cookie.
   *
   * @returns Set-Cookie header to clear the session
   */
  createClearCookieHeader(): string {
    return createClearCookie(this.cookieOptions);
  }

  /**
   * Destroy a session (create clear cookie header).
   * Alias for createClearCookieHeader for semantic clarity.
   *
   * @returns Set-Cookie header to clear the session
   */
  destroySession(): string {
    return this.createClearCookieHeader();
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Check if a session cookie exists in the request.
   *
   * @param cookieHeader - The Cookie header string
   * @returns true if session cookie exists
   */
  hasSession(cookieHeader: string | undefined): boolean {
    const cookieValue = getCookieValue(cookieHeader, this.cookieOptions.name);
    return cookieValue !== undefined;
  }

  /**
   * Update session metadata (last accessed time).
   *
   * @param sessionData - Current session data
   * @returns Updated metadata
   */
  touchSession(sessionData: SessionData): SessionMetadata {
    return {
      ...sessionData.metadata,
      lastAccessedAt: Date.now(),
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new session store.
 *
 * @param config - Session store configuration
 * @returns Configured session store
 */
export function createSessionStore(config: SessionStoreConfig): SessionStore {
  return new SessionStore(config);
}
