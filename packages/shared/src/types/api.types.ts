/**
 * Common API Response Type Definitions
 *
 * These types define standard response wrappers used across
 * all AuthVital API endpoints.
 *
 * @packageDocumentation
 */

// =============================================================================
// PAGINATION
// =============================================================================

/**
 * Paginated response wrapper.
 *
 * Standard pagination structure used for list endpoints.
 *
 * @typeParam T - The type of items in the list
 *
 * @example
 * ```ts
 * interface UserListResponse extends PaginatedResponse<User> {}
 *
 * const response: PaginatedResponse<User> = {
 *   data: [{ id: '1', email: 'alice@example.com', ... }],
 *   meta: {
 *     total: 100,
 *     page: 1,
 *     pageSize: 20,
 *     totalPages: 5,
 *   },
 * };
 * ```
 */
export interface PaginatedResponse<T> {
  /** Array of items for the current page */
  data: T[];
  /** Pagination metadata */
  meta: {
    /** Total number of items across all pages */
    total: number;
    /** Current page number (1-indexed) */
    page: number;
    /** Number of items per page */
    pageSize: number;
    /** Total number of pages */
    totalPages: number;
  };
}

// =============================================================================
// API RESPONSE WRAPPERS
// =============================================================================

/**
 * Standard API error response.
 *
 * Returned when an API request fails.
 */
export interface ApiError {
  /** HTTP status code */
  statusCode: number;
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  error?: string;
  /** Additional error details (validation errors, etc.) */
  details?: Record<string, unknown>;
  /** Request timestamp */
  timestamp?: string;
  /** Request path */
  path?: string;
}

/**
 * Standard API success response wrapper.
 *
 * Used for endpoints that need to wrap their response in a standard format.
 *
 * @typeParam T - The type of the response data
 *
 * @example
 * ```ts
 * const response: ApiResponse<User> = {
 *   success: true,
 *   data: {
 *     id: '1',
 *     email: 'alice@example.com',
 *     // ...
 *   },
 * };
 *
 * const errorResponse: ApiResponse<never> = {
 *   success: false,
 *   error: {
 *     statusCode: 404,
 *     message: 'User not found',
 *   },
 * };
 * ```
 */
export type ApiResponse<T> =
  | {
      /** Indicates successful response */
      success: true;
      /** Response data */
      data: T;
    }
  | {
      /** Indicates failed response */
      success: false;
      /** Error details */
      error: ApiError;
    };
