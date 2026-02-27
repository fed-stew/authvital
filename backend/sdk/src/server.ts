/**
 * @authvital/sdk/server
 * 
 * Server-side SDK for AuthVital integration.
 * Import this for backend-to-backend communication.
 * 
 * @example
 * ```ts
 * import { AuthVitalClient, OAuthFlow } from '@authvital/sdk/server';
 * 
 * // For backend-to-backend API calls
 * const authvital = new AuthVitalClient({
 *   authVitalHost: process.env.AV_HOST,
 *   clientId: process.env.AV_CLIENT_ID,
 *   clientSecret: process.env.AV_CLIENT_SECRET,
 * });
 * 
 * // Send invitations, check permissions, etc.
 * await authvital.invitations.send({ email: 'user@example.com', tenantId: 'tenant-123' });
 * await authvital.permissions.check({ userId: '...', tenantId: '...', permission: 'admin' });
 * 
 * // For OAuth authorization code flow
 * const oauth = new OAuthFlow({
 *   authVitalHost: process.env.AV_HOST,
 *   clientId: process.env.AV_CLIENT_ID,
 *   redirectUri: 'https://myapp.com/api/auth/callback',
 * });
 * ```
 */

export * from './server/index';
