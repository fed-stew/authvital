/**
 * @authvital/core - OAuth Module
 *
 * OAuth 2.0 / OpenID Connect utilities for AuthVital.
 *
 * This module provides:
 * - PKCE (Proof Key for Code Exchange) utilities
 * - OAuth URL builders
 * - State encoding/decoding
 *
 * All functions are pure and environment-agnostic.
 *
 * @example
 * ```ts
 * import {
 *   generateCodeVerifier,
 *   generateCodeChallenge,
 *   buildAuthorizeUrl,
 *   getLoginUrl,
 * } from '@authvital/core/oauth';
 *
 * // Generate PKCE parameters
 * const codeVerifier = generateCodeVerifier();
 * const codeChallenge = await generateCodeChallenge(codeVerifier);
 *
 * // Build authorization URL
 * const authorizeUrl = buildAuthorizeUrl({
 *   authVitalHost: 'https://auth.example.com',
 *   clientId: 'my-app',
 *   redirectUri: 'https://app.example.com/callback',
 *   state: 'csrf-token',
 *   codeChallenge,
 * });
 * ```
 *
 * @packageDocumentation
 */

export * from './pkce.js';
export * from './urls.js';
