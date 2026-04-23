/**
 * @authvital/core - Formatting Utilities
 *
 * Request and response formatting utilities.
 * Environment-agnostic helper functions for working with API data.
 *
 * @packageDocumentation
 */

import type { ApiError, ApiResponse, PaginatedResponse } from '../types/index.js';

// =============================================================================
// API RESPONSE FORMATTING
// =============================================================================

/**
 * Create a successful API response.
 *
 * @param data - The response data
 * @returns A properly formatted success response
 *
 * @example
 * ```ts
 * const response = createSuccessResponse({ id: '1', name: 'Test' });
 * // { success: true, data: { id: '1', name: 'Test' } }
 * ```
 */
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Create an error API response.
 *
 * @param error - The error details
 * @returns A properly formatted error response
 *
 * @example
 * ```ts
 * const response = createErrorResponse({
 *   statusCode: 404,
 *   message: 'User not found',
 * });
 * // { success: false, error: { statusCode: 404, message: 'User not found' } }
 * ```
 */
export function createErrorResponse(error: ApiError): ApiResponse<never> {
  return {
    success: false,
    error,
  };
}

/**
 * Check if an API response is successful.
 *
 * @param response - The API response to check
 * @returns true if the response indicates success
 *
 * @example
 * ```ts
 * const response = await fetch('/api/user').then(r => r.json());
 * if (isSuccessResponse(response)) {
 *   console.log(response.data);
 * }
 * ```
 */
export function isSuccessResponse<T>(
  response: ApiResponse<T>
): response is { success: true; data: T } {
  return response.success === true;
}

/**
 * Check if an API response is an error.
 *
 * @param response - The API response to check
 * @returns true if the response indicates an error
 */
export function isErrorResponse<T>(
  response: ApiResponse<T>
): response is { success: false; error: ApiError } {
  return response.success === false;
}

/**
 * Extract data from a success response or return null.
 *
 * @param response - The API response
 * @returns The data if successful, null otherwise
 *
 * @example
 * ```ts
 * const user = getResponseData<User>(await fetchUser());
 * if (user) {
 *   console.log(user.name);
 * }
 * ```
 */
export function getResponseData<T>(response: ApiResponse<T>): T | null {
  return isSuccessResponse(response) ? response.data : null;
}

/**
 * Extract error from an error response or return null.
 *
 * @param response - The API response
 * @returns The error if failed, null otherwise
 */
export function getResponseError(response: ApiResponse<unknown>): ApiError | null {
  return isErrorResponse(response) ? response.error : null;
}

// =============================================================================
// PAGINATION FORMATTING
// =============================================================================

/**
 * Create a paginated response.
 *
 * @param data - The array of items
 * @param total - Total number of items
 * @param page - Current page number (1-indexed)
 * @param pageSize - Number of items per page
 * @returns A properly formatted paginated response
 *
 * @example
 * ```ts
 * const response = createPaginatedResponse(
 *   users,
 *   100,
 *   1,
 *   20
 * );
 * ```
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / pageSize);
  
  return {
    data,
    meta: {
      total,
      page,
      pageSize,
      totalPages,
    },
  };
}

/**
 * Create empty paginated response.
 *
 * @param page - Current page (default: 1)
 * @param pageSize - Items per page (default: 20)
 * @returns An empty paginated response
 */
export function createEmptyPaginatedResponse<T>(
  page = 1,
  pageSize = 20
): PaginatedResponse<T> {
  return createPaginatedResponse([], 0, page, pageSize);
}

/**
 * Get pagination info from a paginated response.
 *
 * @param response - The paginated response
 * @returns Pagination metadata
 */
export function getPaginationMeta<T>(response: PaginatedResponse<T>): PaginatedResponse<T>['meta'] {
  return response.meta;
}

/**
 * Check if there are more pages in a paginated response.
 *
 * @param response - The paginated response
 * @returns true if there are more pages
 */
export function hasNextPage<T>(response: PaginatedResponse<T>): boolean {
  return response.meta.page < response.meta.totalPages;
}

/**
 * Check if there is a previous page in a paginated response.
 *
 * @param response - The paginated response
 * @returns true if there is a previous page
 */
export function hasPreviousPage<T>(response: PaginatedResponse<T>): boolean {
  return response.meta.page > 1;
}

// =============================================================================
// URL FORMATTING
// =============================================================================

/**
 * Build a URL with query parameters.
 *
 * @param baseUrl - The base URL
 * @param params - Query parameters to add
 * @returns The complete URL with query string
 *
 * @example
 * ```ts
 * const url = buildUrl('https://api.example.com/users', {
 *   page: '1',
 *   limit: '20',
 * });
 * // 'https://api.example.com/users?page=1&limit=20'
 * ```
 */
export function buildUrl(baseUrl: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return baseUrl;
  
  const url = new URL(baseUrl);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });
  
  return url.toString();
}

/**
 * Remove trailing slash from a URL or path.
 *
 * @param url - The URL or path
 * @returns The URL without trailing slash
 */
export function removeTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/**
 * Ensure a URL has a protocol.
 *
 * @param url - The URL that may or may not have a protocol
 * @returns The URL with https:// protocol if missing
 */
export function ensureProtocol(url: string, protocol = 'https'): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${protocol}://${url}`;
}

/**
 * Normalize a URL by ensuring protocol and removing trailing slash.
 *
 * @param url - The URL to normalize
 * @returns The normalized URL
 */
export function normalizeUrl(url: string): string {
  return removeTrailingSlash(ensureProtocol(url));
}

// =============================================================================
// HEADER FORMATTING
// =============================================================================

/**
 * Create an Authorization header with Bearer token.
 *
 * @param token - The access token
 * @returns The Authorization header value
 *
 * @example
 * ```ts
 * const headers = {
 *   'Authorization': createBearerHeader(token),
 * };
 * ```
 */
export function createBearerHeader(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Create a Content-Type header for JSON.
 *
 * @returns The Content-Type header value
 */
export function createJsonContentType(): string {
  return 'application/json';
}

/**
 * Create standard API request headers.
 *
 * @param token - Optional access token for authorization
 * @returns Headers object for fetch requests
 *
 * @example
 * ```ts
 * const headers = createApiHeaders(token);
 * const response = await fetch('/api/user', { headers });
 * ```
 */
export function createApiHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = createBearerHeader(token);
  }
  
  return headers;
}

// =============================================================================
// DATA FORMATTING
// =============================================================================

/**
 * Format a date to ISO 8601 string.
 *
 * @param date - The date to format (Date object or timestamp)
 * @returns ISO 8601 formatted string
 */
export function formatDate(date: Date | number | string): string {
  const d = typeof date === 'number' || typeof date === 'string' 
    ? new Date(date) 
    : date;
  return d.toISOString();
}

/**
 * Format a date to a relative time string.
 *
 * @param date - The date to format
 * @returns Human-readable relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | number | string): string {
  const d = typeof date === 'number' || typeof date === 'string' 
    ? new Date(date) 
    : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return formatDate(date);
}

/**
 * Truncate a string with ellipsis.
 *
 * @param str - The string to truncate
 * @param maxLength - Maximum length before truncation (default: 100)
 * @returns Truncated string with ellipsis if needed
 */
export function truncateString(str: string, maxLength = 100): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Mask a string for display (e.g., email masking).
 *
 * @param str - The string to mask
 * @param visibleChars - Number of characters to keep visible at start and end
 * @returns Masked string
 *
 * @example
 * ```ts
 * maskString('user@example.com', 2); // 'us**@ex********'
 * ```
 */
export function maskString(str: string, visibleChars = 2): string {
  if (str.length <= visibleChars * 2) return '*'.repeat(str.length);
  
  const start = str.slice(0, visibleChars);
  const end = str.slice(-visibleChars);
  const middle = '*'.repeat(Math.max(0, str.length - visibleChars * 2));
  
  return start + middle + end;
}

/**
 * Format a number with thousands separators.
 *
 * @param num - The number to format
 * @returns Formatted string with commas
 *
 * @example
 * ```ts
 * formatNumber(1234567); // '1,234,567'
 * ```
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Deep clone an object.
 *
 * @param obj - The object to clone
 * @returns A deep clone of the object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (Array.isArray(obj)) return obj.map(deepClone) as unknown as T;
  
  const cloned = {} as Record<string, unknown>;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return cloned as T;
}

/**
 * Pick specific keys from an object.
 *
 * @param obj - The source object
 * @param keys - Keys to pick
 * @returns New object with only the picked keys
 *
 * @example
 * ```ts
 * const user = { id: '1', name: 'John', email: 'john@example.com', password: 'secret' };
 * const publicUser = pick(user, ['id', 'name', 'email']);
 * // { id: '1', name: 'John', email: 'john@example.com' }
 * ```
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    result[key] = obj[key];
  });
  return result;
}

/**
 * Omit specific keys from an object.
 *
 * @param obj - The source object
 * @param keys - Keys to omit
 * @returns New object without the omitted keys
 *
 * @example
 * ```ts
 * const user = { id: '1', name: 'John', email: 'john@example.com', password: 'secret' };
 * const publicUser = omit(user, ['password']);
 * // { id: '1', name: 'John', email: 'john@example.com' }
 * ```
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => {
    delete (result as Record<string, unknown>)[key as string];
  });
  return result;
}
