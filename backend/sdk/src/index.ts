/**
 * @authvader/sdk
 * 
 * AuthVader authentication SDK for React applications.
 * 
 * @example
 * ```tsx
 * import { AuthVaderProvider, useAuth, UserButton } from '@authvader/sdk';
 * 
 * function App() {
 *   return (
 *     <AuthVaderProvider
 *       clientId="your-client-id"
 *       authVaderHost="http://localhost:3000"
 *     >
 *       <YourApp />
 *     </AuthVaderProvider>
 *   );
 * }
 * ```
 * 
 * For server-side usage, import from '@authvader/sdk/server':
 * ```ts
 * import { AuthVaderClient, OAuthFlow } from '@authvader/sdk/server';
 * ```
 */

// Re-export everything from client
export * from './client';

// Webhook types and handler (also available from '@authvader/sdk/server')
export * from './webhooks';
