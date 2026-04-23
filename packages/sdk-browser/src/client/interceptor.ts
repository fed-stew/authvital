/**
 * @authvital/browser - HTTP Interceptor
 *
 * Axios/Fetch interceptor with automatic token attachment and silent refresh.
 *
 * Features:
 * - Request interceptor: Attach Bearer token from memory
 * - Response interceptor: Handle 401 with automatic refresh
 * - Queue pending requests during refresh
 * - Retry with new token after successful refresh
 *
 * @packageDocumentation
 */

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import {
  getAccessToken as _getAccessToken,
  addPendingRequest,
  isRefreshInProgress,
} from './token-store';
import { performRefresh } from './refresh';
import type { InterceptorOptions, RequestMetadata } from './types';

// =============================================================================
// MODULE STATE
// =============================================================================

/** Debug mode flag */
let debugMode = false;

/** Callback for auth errors */
let authErrorCallback: (() => void) | null = null;

// =============================================================================
// DEBUG LOGGING
// =============================================================================

function debug(message: string, ...args: unknown[]): void {
  if (debugMode) {
    // eslint-disable-next-line no-console
    console.log(`[AuthVital Interceptor] ${message}`, ...args);
  }
}

// =============================================================================
// AXIOS INSTANCE CREATION
// =============================================================================

/**
 * Create an Axios instance with AuthVital interceptors
 *
 * This instance automatically:
 * - Attaches the Bearer token from memory to requests
 * - Handles 401 responses with silent refresh
 * - Queues requests during refresh
 * - Retries failed requests after refresh
 *
 * @param options - Configuration options
 * @returns Configured Axios instance
 *
 * @example
 * ```ts
 * const api = createAxiosInstance({
 *   authVitalHost: 'https://auth.myapp.com',
 *   onAuthError: () => window.location.href = '/login',
 * });
 *
 * // Use normally - tokens handled automatically
 * const response = await api.get('/api/users/me');
 * ```
 */
export function createAxiosInstance(options: InterceptorOptions): AxiosInstance {
  debugMode = options.debug ?? false;
  authErrorCallback = options.onAuthError ?? null;

  const instance = axios.create({
    baseURL: options.authVitalHost.replace(/\/$/, ''),
    timeout: 30000,
    withCredentials: true, // CRITICAL: Send cookies with requests
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Attach request interceptor
  instance.interceptors.request.use(
    (config) => attachTokenToRequest(config, options.getAccessToken),
    (error) => Promise.reject(error),
  );

  // Attach response interceptor for 401 handling
  instance.interceptors.response.use(
    (response) => response,
    (error) => handleResponseError(error, instance, options),
  );

  debug('Axios instance created with interceptors');

  return instance;
}

// =============================================================================
// REQUEST INTERCEPTOR
// =============================================================================

/**
 * Attach the access token to outgoing requests
 *
 * @param config - Axios request config
 * @param getToken - Function to retrieve current token
 * @returns Modified config
 */
function attachTokenToRequest(
  config: InternalAxiosRequestConfig,
  getToken: () => string | null,
): InternalAxiosRequestConfig {
  const token = getToken();
  const metadata = config as InternalAxiosRequestConfig & RequestMetadata;

  debug('Processing request', {
    url: config.url,
    method: config.method,
    hasToken: !!token,
  });

  // Add timestamp for tracking
  metadata._timestamp = Date.now();

  // Attach Authorization header if we have a token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    debug('Attached Bearer token to request');
  } else {
    debug('No token available for request');
  }

  return config;
}

// =============================================================================
// RESPONSE INTERCEPTOR
// =============================================================================

/**
 * Handle response errors, specifically 401 for token refresh
 *
 * @param error - Axios error
 * @param axiosInstance - The axios instance for retries
 * @param options - Interceptor options
 * @returns Promise that resolves with retried response or rejects
 */
async function handleResponseError(
  error: AxiosError,
  axiosInstance: AxiosInstance,
  _options: InterceptorOptions,
): Promise<AxiosResponse> {
  const originalRequest = error.config as (InternalAxiosRequestConfig & RequestMetadata) | undefined;

  // If no config or not a 401, reject immediately
  if (!originalRequest) {
    return Promise.reject(error);
  }

  // Check if it's a 401 error
  if (error.response?.status !== 401) {
    return Promise.reject(error);
  }

  debug('Received 401 response', { url: originalRequest.url });

  // Check if we've already retried this request
  if (originalRequest._retry) {
    debug('Request already retried, rejecting');
    
    // Second 401 means refresh didn't work - trigger auth error
    authErrorCallback?.();
    return Promise.reject(error);
  }

  // Mark as retry attempt
  originalRequest._retry = true;

  // If refresh is already in progress, queue this request
  if (isRefreshInProgress()) {
    debug('Refresh in progress, queuing request');
    
    return new Promise((resolve, reject) => {
      addPendingRequest((token, err) => {
        if (err || !token) {
          debug('Queued request failed - refresh error');
          authErrorCallback?.();
          reject(err || new Error('Refresh failed'));
          return;
        }

        debug('Retrying queued request with new token');
        originalRequest.headers.Authorization = `Bearer ${token}`;
        
        axiosInstance
          .request(originalRequest)
          .then(resolve)
          .catch((retryError) => {
            // If retry also 401, auth is truly failed
            if ((retryError as AxiosError).response?.status === 401) {
              authErrorCallback?.();
            }
            reject(retryError);
          });
      });
    });
  }

  // Perform the refresh
  debug('Starting token refresh for failed request');
  
  try {
    const refreshResult = await performRefresh();

    if (!refreshResult.success || !refreshResult.accessToken) {
      debug('Refresh failed, triggering auth error');
      authErrorCallback?.();
      return Promise.reject(error);
    }

    // Retry the original request with new token
    debug('Retrying request with new token');
    originalRequest.headers.Authorization = `Bearer ${refreshResult.accessToken}`;

    return axiosInstance.request(originalRequest);
  } catch (refreshError) {
    debug('Refresh error', { error: (refreshError as Error).message });
    authErrorCallback?.();
    return Promise.reject(error);
  }
}

// =============================================================================
// FETCH API WRAPPER
// =============================================================================

/**
 * Create a fetch wrapper with AuthVital authentication
 *
 * Similar to Axios interceptor but for the native fetch API.
 *
 * @param options - Configuration options
 * @returns Fetch function with auth handling
 *
 * @example
 * ```ts
 * const authFetch = createAuthFetch({
 *   authVitalHost: 'https://auth.myapp.com',
 *   onAuthError: () => window.location.href = '/login',
 * });
 *
 * const response = await authFetch('/api/users/me');
 * ```
 */
export function createAuthFetch(
  options: InterceptorOptions,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  debugMode = options.debug ?? false;
  authErrorCallback = options.onAuthError ?? null;

  const authVitalHost = options.authVitalHost.replace(/\/$/, '');

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const isAbsoluteUrl = url.startsWith('http://') || url.startsWith('https://');
    const fullUrl = isAbsoluteUrl ? url : `${authVitalHost}${url}`;

    // Get current token
    const token = options.getAccessToken();

    debug('Fetch request', { url: fullUrl, hasToken: !!token });

    // Merge headers with Authorization
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // Create request with credentials
    const requestInit: RequestInit = {
      ...init,
      headers,
      credentials: 'include', // CRITICAL: Send httpOnly refresh cookie
    };

    // Make the request
    let response = await fetch(fullUrl, requestInit);

    // Handle 401
    if (response.status === 401) {
      debug('Received 401, attempting refresh');

      // Check if we already retried
      const retryKey = `__authvital_retry_${url}`;
      if ((init as Record<string, unknown>)?.[retryKey]) {
        debug('Already retried, rejecting');
        authErrorCallback?.();
        return response;
      }

      // Wait for any in-progress refresh or perform one
      if (isRefreshInProgress()) {
        debug('Waiting for in-progress refresh');
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (!isRefreshInProgress()) {
              clearInterval(check);
              resolve();
            }
          }, 100);
        });
      } else {
        // Perform refresh
        const refreshResult = await performRefresh();
        if (!refreshResult.success) {
          debug('Refresh failed');
          authErrorCallback?.();
          return response;
        }
      }

      // Retry with new token
      const newToken = options.getAccessToken();
      if (newToken) {
        const newHeaders = new Headers(init?.headers);
        newHeaders.set('Authorization', `Bearer ${newToken}`);

        const retryInit: RequestInit = {
          ...init,
          headers: newHeaders,
          credentials: 'include',
        };
        (retryInit as Record<string, unknown>)[retryKey] = true;

        debug('Retrying with new token');
        response = await fetch(fullUrl, retryInit);

        // If still 401, auth is truly failed
        if (response.status === 401) {
          debug('Retry still 401, auth failed');
          authErrorCallback?.();
        }
      }
    }

    return response;
  };
}

// =============================================================================
// STANDALONE INTERCEPTORS (for existing axios instances)
// =============================================================================

/**
 * Attach AuthVital interceptors to an existing Axios instance
 *
 * Use this if you have an existing axios instance you want to enhance
 * with AuthVital authentication.
 *
 * @param instance - Existing Axios instance
 * @param options - Interceptor options
 * @returns The same instance with interceptors attached
 */
export function attachAuthVitalInterceptors(
  instance: AxiosInstance,
  options: InterceptorOptions,
): AxiosInstance {
  debugMode = options.debug ?? false;
  authErrorCallback = options.onAuthError ?? null;

  // Request interceptor
  instance.interceptors.request.use(
    (config) => attachTokenToRequest(config, options.getAccessToken),
    (error) => Promise.reject(error),
  );

  // Response interceptor
  instance.interceptors.response.use(
    (response) => response,
    (error) => handleResponseError(error, instance, options),
  );

  debug('Interceptors attached to existing instance');

  return instance;
}
