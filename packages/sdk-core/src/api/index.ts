/**
 * @authvital/core - API Module
 *
 * API endpoint definitions and URL builders for the AuthVital platform.
 *
 * @example
 * ```ts
 * import { OAUTH_AUTHORIZE, getTenantById } from '@authvital/core/api';
 *
 * const authorizeUrl = `${authVitalHost}${OAUTH_AUTHORIZE}`;
 * const tenantUrl = `${authVitalHost}${getTenantById('tenant_123')}`;
 * ```
 *
 * @packageDocumentation
 */

export * from './endpoints.js';
