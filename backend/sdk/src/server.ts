/**
 * @authvader/sdk/server
 * 
 * Server-side SDK for AuthVader integration.
 * Import this for backend-to-backend communication.
 * 
 * @example
 * ```ts
 * import { AuthVaderClient, OAuthFlow } from '@authvader/sdk/server';
 * 
 * // For backend-to-backend API calls
 * const authvader = new AuthVaderClient({
 *   authVaderHost: process.env.AV_HOST,
 *   clientId: process.env.AV_CLIENT_ID,
 *   clientSecret: process.env.AV_CLIENT_SECRET,
 * });
 * 
 * // Send invitations, check permissions, etc.
 * await authvader.invitations.send({ email: 'user@example.com', tenantId: 'tenant-123' });
 * await authvader.permissions.check({ userId: '...', tenantId: '...', permission: 'admin' });
 * 
 * // For OAuth authorization code flow
 * const oauth = new OAuthFlow({
 *   authVaderHost: process.env.AV_HOST,
 *   clientId: process.env.AV_CLIENT_ID,
 *   redirectUri: 'https://myapp.com/api/auth/callback',
 * });
 * ```
 */

export * from './server/index';
