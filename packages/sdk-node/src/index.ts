/**
 * @authvital/node
 * 
 * Server-side SDK for AuthVital integration.
 * 
 * @example
 * ```ts
 * import { createAuthVital, OAuthFlow } from '@authvital/node';
 * 
 * // For backend-to-backend API calls
 * const authvital = createAuthVital({
 *   authVitalHost: process.env.AV_HOST,
 *   clientId: process.env.AV_CLIENT_ID,
 *   clientSecret: process.env.AV_CLIENT_SECRET,
 * });
 * 
 * // Send invitations, check permissions, etc.
 * await authvital.invitations.send(request, { email: 'user@example.com' });
 * await authvital.permissions.check(request, 'admin');
 * 
 * // For OAuth authorization code flow
 * const oauth = new OAuthFlow({
 *   authVitalHost: process.env.AV_HOST,
 *   clientId: process.env.AV_CLIENT_ID,
 *   redirectUri: 'https://myapp.com/api/auth/callback',
 * });
 * ```
 * 
 * For React frontend integration, use @authvital/react instead.
 */

// Server-side exports
export * from './server';

// Webhooks (for server-side handling)
export * from './webhooks';

// Identity sync (for database mirroring)
export * from './sync';
