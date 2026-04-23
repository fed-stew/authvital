/**
 * @authvital/core - Utilities Module
 *
 * Environment-agnostic utility functions for the AuthVital SDK.
 *
 * This module provides:
 * - JWT validation utilities
 * - Request/response formatting
 * - URL and header helpers
 * - Data formatting utilities
 *
 * @example
 * ```ts
 * import {
 *   createJwtValidator,
 *   createBearerHeader,
 *   formatDate,
 *   buildUrl,
 * } from '@authvital/core/utils';
 *
 * // JWT validation
 * const validator = createJwtValidator({ authVitalHost: 'https://auth.example.com' });
 * const result = await validator.validateToken(token);
 *
 * // Formatting
 * const headers = createApiHeaders(token);
 * const url = buildUrl('https://api.example.com/users', { page: 1 });
 * ```
 *
 * @packageDocumentation
 */

export * from './validators.js';
export * from './formatters.js';
