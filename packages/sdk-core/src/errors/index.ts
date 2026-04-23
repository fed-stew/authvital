/**
 * @authvital/core - Errors Module
 *
 * Error classes for handling authentication, authorization, and API errors.
 *
 * @example
 * ```ts
 * import {
 *   AuthenticationError,
 *   AuthorizationError,
 *   OAuthError,
 *   isAuthVitalError,
 * } from '@authvital/core/errors';
 *
 * try {
 *   // ... auth operation
 * } catch (error) {
 *   if (isAuthenticationError(error)) {
 *     console.log('Auth failed:', error.message);
 *   } else if (isOAuthError(error)) {
 *     console.log('OAuth error:', error.oauthError);
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

export * from './auth-errors.js';
