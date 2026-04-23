/**
 * @authvital/browser - Silent Refresh
 *
 * Handles silent token refresh using the httpOnly refresh cookie.
 *
 * The refresh token is stored in an httpOnly cookie (managed by browser/IDP).
 * The access token is stored in memory only.
 * When the access token expires or is missing, we call /auth/refresh
 * with credentials included to get a new access token.
 *
 * @packageDocumentation
 */

import {
  setAccessToken,
  getAccessToken,
  setRefreshInProgress,
  resolvePendingRequests,
  rejectPendingRequests,
  isRefreshInProgress,
  isTokenExpired,
  getTimeUntilExpiration,
} from './token-store';
import type { RefreshResult, AuthError } from './types';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Default AuthVital host */
let authVitalHost = '';

/** Debug mode flag */
let debugMode = false;

/** Callback when refresh fails */
let onRefreshFailed: ((error: Error) => void) | null = null;

// =============================================================================
// DEBUG LOGGING
// =============================================================================

function debug(message: string, ...args: unknown[]): void {
  if (debugMode) {
    // eslint-disable-next-line no-console
    console.log(`[AuthVital Refresh] ${message}`, ...args);
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the refresh module
 *
 * @param options - Configuration options
 */
export function initializeRefresh(options: {
  authVitalHost: string;
  debug?: boolean;
  onRefreshFailed?: (error: Error) => void;
}): void {
  authVitalHost = options.authVitalHost.replace(/\/$/, '');
  debugMode = options.debug ?? false;
  onRefreshFailed = options.onRefreshFailed ?? null;
  
  debug('Refresh module initialized', { authVitalHost });
}

// =============================================================================
// REFRESH IMPLEMENTATION
// =============================================================================

/**
 * Perform a silent token refresh
 *
 * Calls POST /auth/refresh with credentials to get a new access token.
 * The refresh token is automatically sent via httpOnly cookie.
 *
 * @returns Refresh result with new token or error
 */
export async function performRefresh(): Promise<RefreshResult> {
  // Prevent concurrent refresh attempts
  if (isRefreshInProgress()) {
    debug('Refresh already in progress, waiting...');
    
    return new Promise((resolve) => {
      // Add to pending queue - will be resolved when current refresh completes
      const checkInterval = setInterval(() => {
        const token = getAccessToken();
        if (!isRefreshInProgress()) {
          clearInterval(checkInterval);
          if (token) {
            resolve({ success: true, accessToken: token });
          } else {
            resolve({
              success: false,
              error: createAuthError('REFRESH_FAILED', 'Refresh failed or no token available'),
            });
          }
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve({
          success: false,
          error: createAuthError('REFRESH_TIMEOUT', 'Refresh timed out'),
        });
      }, 10000);
    });
  }

  debug('Starting silent token refresh');
  setRefreshInProgress(true);

  try {
    const response = await fetch(`${authVitalHost}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // CRITICAL: Send httpOnly refresh cookie
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.message || `Refresh failed: ${response.status}`;
      
      debug('Refresh failed', { status: response.status, error: errorMessage });
      
      // Clear tokens on 401 (refresh token invalid/expired)
      if (response.status === 401) {
        handleRefreshFailure(new Error('Refresh token invalid or expired'));
      }
      
      const error = createAuthError(
        response.status === 401 ? 'REFRESH_TOKEN_INVALID' : 'REFRESH_FAILED',
        errorMessage,
      );
      
      rejectPendingRequests(new Error(errorMessage));
      
      return { success: false, error };
    }

    const data = await response.json();
    
    if (!data.access_token) {
      const error = createAuthError('NO_ACCESS_TOKEN', 'No access token in refresh response');
      debug('Refresh response missing access_token');
      rejectPendingRequests(new Error(error.message));
      return { success: false, error };
    }

    // Store the new access token
    const expiresIn = data.expires_in || 3600; // Default 1 hour
    setAccessToken(data.access_token, expiresIn, data.rotation_id);
    
    debug('Refresh successful', { expiresIn });
    
    // Resolve any pending requests with the new token
    resolvePendingRequests(data.access_token);
    
    return {
      success: true,
      accessToken: data.access_token,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during refresh';
    debug('Refresh error', { error: errorMessage });
    
    const error = createAuthError('REFRESH_ERROR', errorMessage, err as Error);
    
    rejectPendingRequests(new Error(errorMessage));
    
    return { success: false, error };
  } finally {
    setRefreshInProgress(false);
  }
}

/**
 * Handle refresh failure - clear state and notify
 *
 * @param error - The error that caused the failure
 */
function handleRefreshFailure(error: Error): void {
  debug('Handling refresh failure', { error: error.message });
  
  // Clear the access token (refresh token clearing is handled by IDP)
  setAccessToken(null);
  
  // Notify the application
  onRefreshFailed?.(error);
}

/**
 * Check if refresh is needed and perform if so
 *
 * @param bufferSeconds - Time buffer before expiration (default: 60)
 * @returns Whether refresh was performed successfully
 */
export async function ensureValidToken(bufferSeconds = 60): Promise<boolean> {
  const currentToken = getAccessToken();
  
  // If we have a token and it's not expired, we're good
  if (currentToken && !isTokenExpired(bufferSeconds)) {
    debug('Token still valid, no refresh needed', {
      timeRemaining: getTimeUntilExpiration(),
    });
    return true;
  }
  
  // No token or expired - perform refresh
  debug('Token expired or missing, performing refresh');
  const result = await performRefresh();
  
  return result.success;
}

/**
 * Schedule a proactive refresh before token expiration
 *
 * @param bufferSeconds - Refresh this many seconds before expiration (default: 120)
 * @returns A function to cancel the scheduled refresh
 */
export function scheduleProactiveRefresh(bufferSeconds = 120): () => void {
  const timeUntilExpiration = getTimeUntilExpiration();
  const refreshIn = Math.max(0, timeUntilExpiration - bufferSeconds * 1000);
  
  debug('Scheduling proactive refresh', { refreshIn, bufferSeconds });
  
  const timeoutId = setTimeout(() => {
    debug('Executing proactive refresh');
    performRefresh().catch(err => {
      debug('Proactive refresh failed', { error: (err as Error).message });
    });
  }, refreshIn);
  
  return () => {
    debug('Cancelling scheduled refresh');
    clearTimeout(timeoutId);
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create an AuthError object
 *
 * @param code - Error code
 * @param message - Error message
 * @param originalError - Original error if available
 * @returns AuthError object
 */
function createAuthError(code: string, message: string, originalError?: Error): AuthError {
  return {
    code,
    message,
    originalError,
  };
}

/**
 * Check if an error is a refresh-related error
 *
 * @param error - The error to check
 * @returns True if it's a refresh error
 */
export function isRefreshError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const refreshErrorCodes = [
    'REFRESH_FAILED',
    'REFRESH_TIMEOUT',
    'REFRESH_TOKEN_INVALID',
    'REFRESH_ERROR',
    'NO_ACCESS_TOKEN',
  ];
  
  // Check if error message contains refresh-related keywords
  return refreshErrorCodes.some(code => 
    error.message.includes(code) || 
    error.message.toLowerCase().includes('refresh'),
  );
}
