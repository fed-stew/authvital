/**
 * @authvital/react
 * 
 * AuthVital React SDK for building authentication flows in React applications.
 * 
 * @example
 * ```tsx
 * import { AuthVitalProvider, useAuth, SignUpForm, VerifyEmail } from '@authvital/react';
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
 * 
 * function SignupPage() {
 *   return <SignUpForm onSuccess={({ email }) => console.log('Sent to', email)} />;
 * }
 * 
 * function VerifyPage({ token }: { token: string }) {
 *   return <VerifyEmail token={token} onContinueSignup={(data) => {
 *     // Redirect to complete signup
 *     router.push(`/signup/complete?token=${data.token}`);
 *   }} />;
 * }
 * ```
 * 
 * For server-side usage, use @authvital/node instead.
 */

// Re-export everything from client
export * from './client';

// Webhook types (for reference when building handlers with @authvital/node)
export * from './webhooks';
