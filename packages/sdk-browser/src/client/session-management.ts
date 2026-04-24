/**
 * @authvital/browser - OIDC Session Management
 *
 * Implements OpenID Connect Session Management 1.0 specification for detecting
 * when a user logs out in another tab/window or their session changes at the IDP.
 *
 * Features:
 * - Creates hidden iframe pointing to check_session_iframe endpoint
 * - PostMessage-based session state polling
 * - Detects session changes (logout in other tabs, session expiration)
 * - Configurable polling interval
 * - Automatic cleanup on stop
 * - Cross-browser compatible
 * - Origin validation for security
 *
 * Note: This requires backend support for:
 * - session_state parameter in authorization response
 * - check_session_iframe endpoint in well-known configuration
 *
 * @see https://openid.net/specs/openid-connect-session-1_0.html
 *
 * @packageDocumentation
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for the session manager
 */
export interface SessionManagerOptions {
  /** AuthVital server URL (e.g., https://auth.myapp.com) */
  authVitalHost: string;
  /** OAuth client_id for your application */
  clientId: string;
  /** session_state from authorization response */
  sessionState: string;
  /** Polling interval in milliseconds (default: 5000, min: 2000) */
  checkInterval?: number;
  /** Callback invoked when session state changes */
  onSessionChange?: (changed: boolean, event: SessionChangeEvent) => void;
  /** Callback invoked when an error occurs */
  onError?: (error: SessionManagerError) => void;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Event fired when session state changes
 */
export interface SessionChangeEvent {
  /** Whether the session has changed at the IDP */
  changed: boolean;
  /** The current session state value */
  sessionState: string;
  /** Client ID used for checking */
  clientId: string;
  /** Timestamp of the change detection */
  timestamp: number;
}

/**
 * Error from the session manager
 */
export interface SessionManagerError {
  /** Error code */
  code: 'iframe_failed' | 'postmessage_failed' | 'invalid_response' | 'network_error' | string;
  /** Error message */
  message: string;
  /** Original error if available */
  originalError?: Error;
}

/**
 * Message format for check_session_iframe communication
 * @see https://openid.net/specs/openid-connect-session-1_0.html
 */
interface CheckSessionMessage {
  /** The client ID */
  client_id: string;
  /** The session state to check */
  session_state: string;
}

// =============================================================================
// INTERNAL STATE
// =============================================================================

/** Currently active iframe element */
let activeIframe: HTMLIFrameElement | null = null;

/** Current polling interval ID */
let activeIntervalId: number | null = null;

/** Current message handler */
let activeMessageHandler: ((event: MessageEvent) => void) | null = null;

/** Current options */
let currentOptions: SessionManagerOptions | null = null;

/** Debug mode flag */
let debugMode = false;

/** Whether the session manager is currently running */
let isRunning = false;

/** Cached check_session_iframe URL */
let cachedCheckSessionUrl: string | null = null;

// =============================================================================
// DEBUG LOGGING
// =============================================================================

/**
 * Log debug message
 */
function debug(message: string, ...args: unknown[]): void {
  if (debugMode) {
    // eslint-disable-next-line no-console
    console.log(`[AuthVital SessionManager] ${message}`, ...args);
  }
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

/**
 * Start OIDC session monitoring
 *
 * Creates a hidden iframe pointing to the `check_session_iframe` endpoint
 * and begins polling for session state changes. When the session changes
 * (e.g., user logs out in another tab), the `onSessionChange` callback
 * is invoked.
 *
 * @param options - Session manager options
 * @returns Promise that resolves when monitoring has started
 *
 * @example
 * ```typescript
 * // After successful authentication, get session_state from auth response
 * const sessionState = 'abc123...'; // From authorization response
 *
 * startSessionMonitoring({
 *   authVitalHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   sessionState: sessionState,
 *   checkInterval: 5000, // Check every 5 seconds
 *   onSessionChange: (changed, event) => {
 *     if (changed) {
 *       console.log('Session changed - user may have logged out');
 *       // Re-authenticate or log out locally
 *       handleSessionChange();
 *     }
 *   },
 *   onError: (error) => {
 *     console.error('Session monitoring error:', error);
 *   },
 * });
 * ```
 */
export async function startSessionMonitoring(
  options: SessionManagerOptions
): Promise<boolean> {
  // Validate environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    debug('Session monitoring not available in non-browser environment');
    return false;
  }

  // Validate required parameters
  if (!options.authVitalHost || !options.clientId || !options.sessionState) {
    debug('Missing required parameters', {
      authVitalHost: !!options.authVitalHost,
      clientId: !!options.clientId,
      sessionState: !!options.sessionState,
    });
    options.onError?.({
      code: 'invalid_config',
      message: 'Missing required parameters: authVitalHost, clientId, sessionState',
    });
    return false;
  }

  // Don't start if already running
  if (isRunning) {
    debug('Session monitoring already running, stopping first');
    stopSessionMonitoring();
  }

  debugMode = options.debug ?? false;
  currentOptions = options;
  isRunning = true;

  debug('Starting session monitoring', {
    authVitalHost: options.authVitalHost,
    clientId: options.clientId,
    checkInterval: options.checkInterval,
  });

  try {
    // Get or fetch the check_session_iframe URL
    const checkSessionUrl = await getCheckSessionUrl(options.authVitalHost);

    if (!checkSessionUrl) {
      debug('check_session_iframe endpoint not available');
      options.onError?.({
        code: 'iframe_failed',
        message: 'check_session_iframe endpoint not available in OIDC configuration',
      });
      isRunning = false;
      return false;
    }

    // Create the hidden iframe
    createCheckSessionIframe(checkSessionUrl, options.authVitalHost);

    // Set up message handler
    setupMessageHandler(options);

    // Start polling
    const interval = Math.max(2000, options.checkInterval ?? 5000);
    startPolling(options, interval);

    debug('Session monitoring started successfully');
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    debug('Failed to start session monitoring', { error: message });
    options.onError?.({
      code: 'iframe_failed',
      message: `Failed to start session monitoring: ${message}`,
      originalError: err instanceof Error ? err : undefined,
    });
    isRunning = false;
    return false;
  }
}

/**
 * Stop OIDC session monitoring
 *
 * Removes the hidden iframe, stops polling, and cleans up event listeners.
 *
 * @example
 * ```typescript
 * // Stop monitoring when user logs out
 * stopSessionMonitoring();
 * ```
 */
export function stopSessionMonitoring(): void {
  if (!isRunning) {
    debug('Session monitoring not running');
    return;
  }

  debug('Stopping session monitoring');

  isRunning = false;
  currentOptions = null;

  // Stop polling
  if (activeIntervalId !== null) {
    clearInterval(activeIntervalId);
    activeIntervalId = null;
    debug('Polling stopped');
  }

  // Remove message handler
  if (activeMessageHandler) {
    window.removeEventListener('message', activeMessageHandler);
    activeMessageHandler = null;
    debug('Message handler removed');
  }

  // Remove iframe
  if (activeIframe) {
    if (activeIframe.parentNode) {
      activeIframe.parentNode.removeChild(activeIframe);
    }
    activeIframe = null;
    debug('Check session iframe removed');
  }
}

/**
 * Check if session monitoring is currently active
 *
 * @returns true if monitoring is running
 */
export function isSessionMonitoring(): boolean {
  return isRunning;
}

/**
 * Update the session state being monitored
 *
 * This is useful after a token refresh or silent authentication
 * that returns a new session_state.
 *
 * @param sessionState - The new session_state value
 * @returns true if updated successfully
 */
export function updateSessionState(sessionState: string): boolean {
  if (!isRunning || !currentOptions) {
    debug('Cannot update session state - monitoring not running');
    return false;
  }

  debug('Updating session state', { oldState: currentOptions.sessionState.substring(0, 8) + '...', newState: sessionState.substring(0, 8) + '...' });
  currentOptions.sessionState = sessionState;
  return true;
}

/**
 * Manually trigger a session state check
 *
 * Sends a postMessage to the check_session_iframe to check
 * the current session state immediately.
 */
export function checkSessionNow(): void {
  if (!isRunning || !currentOptions || !activeIframe) {
    debug('Cannot check session - monitoring not running');
    return;
  }

  debug('Manual session check triggered');
  sendCheckSessionMessage(currentOptions);
}

// =============================================================================
// PRIVATE IMPLEMENTATION
// =============================================================================

/**
 * Get the check_session_iframe URL from well-known configuration
 */
async function getCheckSessionUrl(authVitalHost: string): Promise<string | null> {
  // Return cached URL if available
  if (cachedCheckSessionUrl) {
    return cachedCheckSessionUrl;
  }

  try {
    const response = await fetch(`${authVitalHost}/.well-known/openid-configuration`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      debug('Failed to fetch well-known configuration', { status: response.status });
      return null;
    }

    const config = await response.json() as { check_session_iframe?: string };

    if (config.check_session_iframe) {
      cachedCheckSessionUrl = config.check_session_iframe;
      debug('Found check_session_iframe endpoint', { url: cachedCheckSessionUrl });
      return cachedCheckSessionUrl;
    }

    debug('check_session_iframe endpoint not found in configuration');
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    debug('Error fetching well-known configuration', { error: message });
    return null;
  }
}

/**
 * Create the hidden check_session_iframe
 */
function createCheckSessionIframe(src: string, _authVitalHost: string): void {
  debug('Creating check session iframe', { src: src.substring(0, 100) + '...' });

  const iframe = document.createElement('iframe');
  iframe.setAttribute('src', src);
  // Allow scripts and same-origin access for postMessage
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');

  // Position off-screen but not display:none (some browsers block postMessage to hidden iframes)
  iframe.style.position = 'absolute';
  iframe.style.top = '-1000px';
  iframe.style.left = '-1000px';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('title', 'Session monitoring frame');

  document.body.appendChild(iframe);
  activeIframe = iframe;

  debug('Check session iframe created and injected');
}

/**
 * Set up the message handler for iframe responses
 */
function setupMessageHandler(options: SessionManagerOptions): void {
  const expectedOrigin = new URL(options.authVitalHost).origin;

  const handler = (event: MessageEvent): void => {
    // Validate origin
    if (event.origin !== expectedOrigin) {
      debug('Ignoring message from unexpected origin', { origin: event.origin, expected: expectedOrigin });
      return;
    }

    // Handle session state response
    // According to OIDC spec, the response should be "changed", "unchanged", or "error"
    const response = event.data as string;

    debug('Received session state response', { response: response?.substring(0, 20) });

    if (response === 'changed') {
      debug('Session state changed detected');
      options.onSessionChange?.(true, {
        changed: true,
        sessionState: options.sessionState,
        clientId: options.clientId,
        timestamp: Date.now(),
      });
    } else if (response === 'unchanged') {
      // Session is still valid, nothing to do
      debug('Session state unchanged');
    } else if (response?.startsWith('error:')) {
      const errorMessage = response.substring(6);
      debug('Error response from check_session_iframe', { error: errorMessage });
      options.onError?.({
        code: 'invalid_response',
        message: `Session check error: ${errorMessage}`,
      });
    } else {
      // Unexpected response format
      debug('Unexpected response format', { response: response?.substring(0, 50) });
      options.onError?.({
        code: 'invalid_response',
        message: 'Unexpected response format from check_session_iframe',
      });
    }
  };

  activeMessageHandler = handler;
  window.addEventListener('message', handler);

  debug('Message handler set up');
}

/**
 * Start polling the session state
 */
function startPolling(options: SessionManagerOptions, interval: number): void {
  // Send initial check after a short delay to allow iframe to load
  setTimeout(() => {
    if (isRunning) {
      sendCheckSessionMessage(options);
    }
  }, 1000);

  // Set up recurring checks
  activeIntervalId = window.setInterval(() => {
    if (isRunning) {
      sendCheckSessionMessage(options);
    }
  }, interval);

  debug('Polling started', { interval });
}

/**
 * Send the check session message to the iframe
 */
function sendCheckSessionMessage(options: SessionManagerOptions): void {
  if (!activeIframe?.contentWindow) {
    debug('Cannot send message - iframe not ready');
    return;
  }

  const message: CheckSessionMessage = {
    client_id: options.clientId,
    session_state: options.sessionState,
  };

  const targetOrigin = new URL(options.authVitalHost).origin;

  try {
    activeIframe.contentWindow.postMessage(
      `${message.client_id} ${message.session_state}`,
      targetOrigin
    );
    debug('Session check message sent');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    debug('Failed to send session check message', { error: message });
    options.onError?.({
      code: 'postmessage_failed',
      message: `Failed to send session check: ${message}`,
      originalError: err instanceof Error ? err : undefined,
    });
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if OIDC session management is available
 *
 * This checks if the browser environment supports the required APIs
 * and if the backend exposes the check_session_iframe endpoint.
 *
 * @param authVitalHost - The AuthVital host URL to check
 * @returns Promise resolving to true if session management is available
 */
export async function isSessionManagementAvailable(authVitalHost: string): Promise<boolean> {
  // Check browser support
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof window.postMessage === 'undefined'
  ) {
    return false;
  }

  // Check backend support
  const checkSessionUrl = await getCheckSessionUrl(authVitalHost);
  return checkSessionUrl !== null;
}

/**
 * Extract session_state from authorization response URL
 *
 * @param url - The authorization response URL (or current URL)
 * @returns The session_state parameter or null if not found
 */
export function extractSessionState(url?: string): string | null {
  const checkUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  if (!checkUrl) return null;

  try {
    const urlObj = new URL(checkUrl);
    return urlObj.searchParams.get('session_state');
  } catch {
    return null;
  }
}

/**
 * Get the current monitoring status
 *
 * @returns Object with monitoring status details
 */
export function getMonitoringStatus(): {
  isRunning: boolean;
  hasIframe: boolean;
  hasInterval: boolean;
  options: Omit<SessionManagerOptions, 'onSessionChange' | 'onError'> | null;
} {
  return {
    isRunning,
    hasIframe: activeIframe !== null,
    hasInterval: activeIntervalId !== null,
    options: currentOptions
      ? {
          authVitalHost: currentOptions.authVitalHost,
          clientId: currentOptions.clientId,
          sessionState: currentOptions.sessionState,
          checkInterval: currentOptions.checkInterval,
          debug: currentOptions.debug,
        }
      : null,
  };
}

/**
 * Clear the cached check_session_iframe URL
 *
 * This is useful when switching environments or for testing.
 */
export function clearCachedConfig(): void {
  cachedCheckSessionUrl = null;
  debug('Cached configuration cleared');
}
