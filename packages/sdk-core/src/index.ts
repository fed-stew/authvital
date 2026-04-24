/**
 * @authvital/core - Environment-Agnostic Core SDK
 *
 * This package contains all environment-agnostic logic for AuthVital:
 * - Type definitions
 * - API endpoint constants
 * - OAuth URL generation utilities (pure functions, no storage)
 * - PKCE utilities
 * - Error classes
 * - JWT validation utilities
 * - Request/response formatting
 * - JWKS and JWT verification utilities (Web Crypto API)
 *
 * This package has NO:
 * - localStorage references
 * - document.cookie parsing
 * - window object usage
 * - Node.js-specific APIs
 *
 * @packageDocumentation
 */

// Re-export everything from submodules
export * from './types/index.js';
export * from './api/index.js';
export * from './oauth/index.js';
export * from './errors/index.js';
export * from './utils/index.js';
export * from './crypto/index.js';
