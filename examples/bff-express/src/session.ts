import {
  createSessionStore,
  createCookieOptions,
  serializeCookie,
  createClearCookie,
  getCookieValue,
  encryptToString,
  decryptFromString,
  type SessionTokens,
} from '@authvital/server';
import type { Request } from 'express';
import { config } from './config';

// Encrypted (AES-256-GCM) httpOnly session cookie holding the OAuth tokens.
export const sessionStore = createSessionStore({
  secret: config.sessionSecret,
  authVitalHost: config.avHost,
  isProduction: config.isProduction, // -> Secure cookies (HTTPS via Traefik)
  cookie: { name: 'bff_session', sameSite: 'lax', httpOnly: true },
});

/** Return the decrypted session tokens for a request, or null. */
export function getSessionTokens(req: Request): SessionTokens | null {
  const result = sessionStore.validateSession(req.headers.cookie);
  return result.valid && result.session ? result.session.tokens : null;
}

// ---------------------------------------------------------------------------
// Transient PKCE flow cookie: binds {state, codeVerifier} to the browser
// between /api/auth/login and /api/auth/callback. Short-lived + encrypted, so
// the OAuth state/verifier never leave the server unprotected. This is our CSRF
// binding for the authorization code flow.
// ---------------------------------------------------------------------------
const FLOW_COOKIE = 'bff_oauth_flow';
const flowOptions = createCookieOptions(config.isProduction, {
  name: FLOW_COOKIE,
  sameSite: 'lax',
  httpOnly: true,
  maxAge: 600, // 10 minutes to complete login
});

export interface FlowData {
  state: string;
  codeVerifier: string;
}

export function serializeFlowCookie(data: FlowData): string {
  const value = encryptToString(JSON.stringify(data), config.sessionSecret);
  return serializeCookie(value, flowOptions);
}

export function readFlowCookie(cookieHeader: string | undefined): FlowData | null {
  const value = getCookieValue(cookieHeader, FLOW_COOKIE);
  if (!value) return null;
  try {
    return JSON.parse(decryptFromString(value, config.sessionSecret)) as FlowData;
  } catch {
    return null;
  }
}

export function clearFlowCookie(): string {
  return createClearCookie(flowOptions);
}

export function clearSessionCookie(): string {
  return sessionStore.createClearCookieHeader();
}
