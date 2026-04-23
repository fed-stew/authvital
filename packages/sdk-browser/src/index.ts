/**
 * @authvital/browser
 *
 * AuthVital Browser SDK for Single Page Applications.
 *
 * Features:
 * - Split-token architecture (access token in memory, refresh in httpOnly cookie)
 * - Automatic token refresh with request queuing
 * - Axios/Fetch interceptors for seamless authentication
 * - React integration via optional hooks and provider
 *
 * @example
 * ```ts
 * // Basic usage
 * import { AuthVitalClient } from '@authvital/browser';
 *
 * const auth = new AuthVitalClient({
 *   authVitalHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 * });
 *
 * // Handle OAuth callback
 * const result = await auth.handleCallback();
 * if (result.success) {
 *   console.log('Logged in as', result.user?.email);
 * }
 *
 * // Make authenticated API calls
 * const api = auth.getAxiosInstance();
 * const { data } = await api.get('/api/protected');
 * ```
 *
 * @example
 * ```ts
 * // React usage (optional)
 * import { AuthVitalProvider, useAuth } from '@authvital/browser/react';
 *
 * function App() {
 *   return (
 *     <AuthVitalProvider
 *       authVitalHost="https://auth.myapp.com"
 *       clientId="my-app"
 *     >
 *       <YourApp />
 *     </AuthVitalProvider>
 *   );
 * }
 *
 * function Profile() {
 *   const { user, isAuthenticated, login } = useAuth();
 *
 *   if (!isAuthenticated) {
 *     return <button onClick={login}>Sign In</button>;
 *   }
 *
 *   return <div>Hello, {user?.email}</div>;
 * }
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// MAIN EXPORTS
// =============================================================================

export * from './client';

// =============================================================================
// MODULE INFO
// =============================================================================

/**
 * SDK Version
 */
export const VERSION = '0.1.0';

/**
 * SDK Name
 */
export const SDK_NAME = '@authvital/browser';
