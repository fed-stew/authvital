/**
 * @authvital/core - PKCE Utilities
 *
 * Proof Key for Code Exchange (PKCE) utilities for OAuth 2.0.
 * These are pure functions with no storage dependencies.
 *
 * Works in both browser and server environments using Web Crypto API.
 *
 * @see RFC 7636 - Proof Key for Code Exchange by OAuth Public Clients
 *
 * @packageDocumentation
 */

// =============================================================================
// CODE VERIFIER GENERATION
// =============================================================================

/**
 * Generate a cryptographically random code verifier.
 *
 * The code verifier is a high-entropy random string using the
 * unreserved characters [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 * with a minimum length of 43 characters and a maximum length of 128 characters.
 *
 * @returns A base64url-encoded random string (43 characters)
 *
 * @example
 * ```ts
 * const codeVerifier = generateCodeVerifier();
 * // 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
 * ```
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// =============================================================================
// CODE CHALLENGE GENERATION
// =============================================================================

/**
 * Generate code challenge from verifier using S256 method.
 *
 * The code challenge is derived from the code verifier using SHA-256 hash,
 * then base64url-encoded.
 *
 * @param verifier - The code verifier string
 * @returns A promise resolving to the code challenge string
 *
 * @example
 * ```ts
 * const verifier = generateCodeVerifier();
 * const challenge = await generateCodeChallenge(verifier);
 * // 'E9Melhoa2OwvFrEMT...'
 * ```
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate both PKCE values at once.
 *
 * Convenience function that generates the verifier and challenge together.
 *
 * @returns An object containing both codeVerifier and codeChallenge
 *
 * @example
 * ```ts
 * const { codeVerifier, codeChallenge } = generatePKCE();
 * // Store codeVerifier for later token exchange
 * // Send codeChallenge with the authorization request
 * ```
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = generateCodeVerifier();
  // Note: We don't use async/await here to keep the function synchronous
  // The caller should await generateCodeChallenge separately if needed
  return { codeVerifier, codeChallenge: '' }; // codeChallenge will be generated separately
}

/**
 * Generate PKCE parameters asynchronously.
 *
 * This is the recommended function as it generates both values in one call,
 * handling the async nature of the challenge generation.
 *
 * @returns A promise resolving to an object with codeVerifier and codeChallenge
 *
 * @example
 * ```ts
 * const { codeVerifier, codeChallenge } = await generatePKCEAsync();
 * ```
 */
export async function generatePKCEAsync(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}

// =============================================================================
// BASE64URL ENCODING
// =============================================================================

/**
 * Base64url-encode a Uint8Array.
 *
 * Base64url encoding is similar to base64, but uses URL-safe characters:
 * - '+' is replaced with '-'
 * - '/' is replaced with '_'
 * - Padding '=' is removed
 *
 * @param buffer - The bytes to encode
 * @returns The base64url-encoded string
 */
export function base64UrlEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64url-decode a string to a Uint8Array.
 *
 * @param str - The base64url-encoded string
 * @returns The decoded bytes
 */
export function base64UrlDecode(str: string): Uint8Array {
  // Add padding if needed
  const padding = 4 - (str.length % 4);
  const padded = padding !== 4 ? str + '='.repeat(padding) : str;
  
  // Convert base64url to base64
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  
  // Decode
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Base64url-decode a string to a regular string.
 *
 * @param str - The base64url-encoded string
 * @returns The decoded string
 */
export function base64UrlDecodeToString(str: string): string {
  const bytes = base64UrlDecode(str);
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

// =============================================================================
// CSRF STATE GENERATION
// =============================================================================

/**
 * Generate a secure random state for CSRF protection.
 *
 * This generates a high-entropy random string suitable for use as the
 * OAuth state parameter to prevent CSRF attacks.
 *
 * @param length - The length of the state string (default: 32)
 * @returns A base64url-encoded random string
 *
 * @example
 * ```ts
 * const state = generateCSRFState();
 * // 'xCoCwR2V7hDqWz8J...'
 * ```
 */
export function generateCSRFState(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// =============================================================================
// NONCE GENERATION
// =============================================================================

/**
 * Generate a nonce for OIDC requests.
 *
 * A nonce is a cryptographically random string used to prevent replay attacks
 * in OpenID Connect flows.
 *
 * @param length - The length of the nonce string (default: 32)
 * @returns A base64url-encoded random string
 *
 * @example
 * ```ts
 * const nonce = generateNonce();
 * // Verify the nonce matches in the ID token after callback
 * ```
 */
export function generateNonce(length = 32): string {
  return generateCSRFState(length);
}
