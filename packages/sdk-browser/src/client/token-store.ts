/**
 * @authvital/browser - Token Store
 *
 * In-memory token storage for the split-token architecture.
 *
 * SECURITY NOTES:
 * - Access tokens are stored ONLY in memory (never localStorage/sessionStorage)
 * - Refresh tokens are httpOnly cookies (handled automatically by browser)
 * - Tokens are lost on page refresh, requiring a silent refresh
 * - This prevents XSS attacks from stealing tokens
 *
 * @packageDocumentation
 */

import type { TokenMetadata, PendingRequestCallback } from './types';

// =============================================================================
// MODULE-LEVEL CLOSURE (private state)
// =============================================================================

/** In-memory access token storage */
let accessToken: string | null = null;

/** Token metadata (expiration, rotation tracking) */
let tokenMetadata: TokenMetadata | null = null;

/** Queue of pending requests waiting for token refresh */
let pendingRequestQueue: PendingRequestCallback[] = [];

/** Whether a refresh is currently in progress */
let isRefreshing = false;

/** Debug mode flag */
let debugMode = false;

// =============================================================================
// DEBUG LOGGING
// =============================================================================

/**
 * Set debug mode
 * @param enabled - Whether to enable debug logging
 */
export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

/**
 * Log debug message
 */
function debug(message: string, ...args: unknown[]): void {
  if (debugMode) {
    // eslint-disable-next-line no-console
    console.log(`[AuthVital TokenStore] ${message}`, ...args);
  }
}

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

/**
 * Set the access token in memory
 *
 * @param token - The access token to store, or null to clear
 * @param expiresIn - Token expiration time in seconds (optional)
 * @param rotationId - Token rotation ID for tracking (optional)
 */
export function setAccessToken(
  token: string | null,
  expiresIn?: number,
  rotationId?: string,
): void {
  const prevToken = accessToken ? '***' : null;
  
  accessToken = token;
  
  if (token && expiresIn) {
    tokenMetadata = {
      storedAt: Date.now(),
      expiresAt: Date.now() + expiresIn * 1000,
      rotationId,
    };
  } else if (token) {
    // Token provided but no expiration - store with default metadata
    tokenMetadata = {
      storedAt: Date.now(),
      expiresAt: Date.now() + 3600 * 1000, // Default 1 hour
      rotationId,
    };
  } else {
    // Clearing token
    tokenMetadata = null;
  }

  debug('Token stored', {
    hasToken: !!token,
    expiresIn,
    rotationId,
    prevTokenExists: !!prevToken,
  });
}

/**
 * Get the current access token from memory
 *
 * @returns The access token string, or null if not set
 */
export function getAccessToken(): string | null {
  debug('Token retrieved', { hasToken: !!accessToken });
  return accessToken;
}

/**
 * Get token metadata
 *
 * @returns Token metadata or null if no token stored
 */
export function getTokenMetadata(): TokenMetadata | null {
  return tokenMetadata ? { ...tokenMetadata } : null;
}

/**
 * Check if the current token is expired
 *
 * @param bufferSeconds - Buffer time before expiration to consider token expired (default: 60)
 * @returns True if token is expired or about to expire
 */
export function isTokenExpired(bufferSeconds = 60): boolean {
  if (!tokenMetadata) return true;
  
  const expirationWithBuffer = tokenMetadata.expiresAt - bufferSeconds * 1000;
  return Date.now() >= expirationWithBuffer;
}

/**
 * Get time until token expiration
 *
 * @returns Milliseconds until expiration, or 0 if no token/expired
 */
export function getTimeUntilExpiration(): number {
  if (!tokenMetadata) return 0;
  
  const remaining = tokenMetadata.expiresAt - Date.now();
  return Math.max(0, remaining);
}

/**
 * Clear all tokens from memory
 */
export function clearTokens(): void {
  debug('Clearing all tokens');
  
  accessToken = null;
  tokenMetadata = null;
  
  // Clear any pending requests with an error
  const queue = [...pendingRequestQueue];
  pendingRequestQueue = [];
  
  queue.forEach(callback => {
    try {
      callback(null, new Error('Tokens cleared'));
    } catch {
      // Ignore callback errors
    }
  });
}

// =============================================================================
// TOKEN ROTATION SUPPORT
// =============================================================================

/**
 * Check if a rotation ID matches the current token
 *
 * @param rotationId - The rotation ID to check
 * @returns True if the rotation ID matches
 */
export function isCurrentRotationId(rotationId: string): boolean {
  return tokenMetadata?.rotationId === rotationId;
}

/**
 * Get the current rotation ID
 *
 * @returns The current rotation ID or undefined
 */
export function getCurrentRotationId(): string | undefined {
  return tokenMetadata?.rotationId;
}

// =============================================================================
// PENDING REQUEST QUEUE
// =============================================================================

/**
 * Check if a refresh is currently in progress
 *
 * @returns True if refresh is in progress
 */
export function isRefreshInProgress(): boolean {
  return isRefreshing;
}

/**
 * Set refresh in progress state
 *
 * @param inProgress - Whether refresh is in progress
 */
export function setRefreshInProgress(inProgress: boolean): void {
  isRefreshing = inProgress;
  debug('Refresh state updated', { inProgress });
}

/**
 * Add a callback to the pending request queue
 *
 * @param callback - Function to call when refresh completes
 */
export function addPendingRequest(callback: PendingRequestCallback): void {
  debug('Adding pending request to queue', { queueLength: pendingRequestQueue.length + 1 });
  pendingRequestQueue.push(callback);
}

/**
 * Process all pending requests with the new token
 *
 * @param token - The new access token
 */
export function resolvePendingRequests(token: string): void {
  debug('Resolving pending requests', { count: pendingRequestQueue.length });
  
  const queue = [...pendingRequestQueue];
  pendingRequestQueue = [];
  
  queue.forEach(callback => {
    try {
      callback(token);
    } catch {
      // Ignore callback errors
    }
  });
}

/**
 * Reject all pending requests with an error
 *
 * @param error - The error to pass to pending requests
 */
export function rejectPendingRequests(error: Error): void {
  debug('Rejecting pending requests', { count: pendingRequestQueue.length, error: error.message });
  
  const queue = [...pendingRequestQueue];
  pendingRequestQueue = [];
  
  queue.forEach(callback => {
    try {
      callback(null, error);
    } catch {
      // Ignore callback errors
    }
  });
}

/**
 * Get the number of pending requests
 *
 * @returns Number of requests waiting for refresh
 */
export function getPendingRequestCount(): number {
  return pendingRequestQueue.length;
}

// =============================================================================
// STATE SNAPSHOT
// =============================================================================

/**
 * Get a snapshot of the current token store state
 *
 * @returns Current state (safe for logging/debugging)
 */
export function getStateSnapshot(): {
  hasToken: boolean;
  hasMetadata: boolean;
  isExpired: boolean;
  isRefreshing: boolean;
  pendingRequests: number;
  timeUntilExpiration: number;
} {
  return {
    hasToken: !!accessToken,
    hasMetadata: !!tokenMetadata,
    isExpired: isTokenExpired(),
    isRefreshing,
    pendingRequests: pendingRequestQueue.length,
    timeUntilExpiration: getTimeUntilExpiration(),
  };
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the token store
 *
 * @param options - Initialization options
 */
export function initializeTokenStore(options?: { debug?: boolean }): void {
  debugMode = options?.debug ?? false;
  debug('Token store initialized');
}