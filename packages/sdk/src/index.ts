/**
 * @authvital/sdk
 * 
 * AuthVital authentication SDK for React applications.
 * 
 * @example
 * ```tsx
 * import { AuthVitalProvider, useAuth, UserButton } from '@authvital/sdk';
 * 
 * function App() {
 *   return (
 *     <AuthVitalProvider
 *       clientId="your-client-id"
 *       authVitalHost="http://localhost:3000"
 *     >
 *       <YourApp />
 *     </AuthVitalProvider>
 *   );
 * }
 * ```
 * 
 * For server-side usage, import from '@authvital/sdk/server':
 * ```ts
 * import { AuthVitalClient, OAuthFlow } from '@authvital/sdk/server';
 * ```
 */

// Re-export everything from client
export * from './client';

// Webhook types and handler (also available from '@authvital/sdk/server')
export * from './webhooks';
