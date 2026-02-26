/**
 * @authvader/sdk - Client-Side Invitation Helpers
 * 
 * Handles the invite flow: get invite details, store token, consume after login.
 * Auth is via httpOnly cookies - no Authorization header needed for authenticated requests.
 */

import type {
  InvitationDetails,
  CreateInvitationParams,
  CreateInvitationResult,
  ConsumeInvitationResult,
} from './types';

const INVITE_TOKEN_KEY = 'authvader_invite_token';

// =============================================================================
// INVITE TOKEN STORAGE (sessionStorage - short-lived, not auth tokens)
// =============================================================================

/**
 * Store invite token in sessionStorage (temporary, for the signup flow)
 */
export function storeInviteToken(token: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(INVITE_TOKEN_KEY, token);
}

/**
 * Get stored invite token
 */
export function getStoredInviteToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(INVITE_TOKEN_KEY);
}

/**
 * Clear stored invite token
 */
export function clearStoredInviteToken(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(INVITE_TOKEN_KEY);
}

/**
 * Check URL for invite token and store it
 */
export function captureInviteTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite_token') || params.get('token');
  
  if (token && window.location.pathname.includes('/invite')) {
    storeInviteToken(token);
    return token;
  }
  
  return null;
}

// =============================================================================
// API FUNCTIONS (Cookie-based auth)
// =============================================================================

/**
 * Get invitation details by token (public endpoint - no auth required)
 */
export async function getInvitation(
  authVaderHost: string,
  token: string
): Promise<InvitationDetails> {
  const response = await fetch(`${authVaderHost}/api/invitations/token/${token}`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Failed to get invitation: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Create an invitation (requires authentication via cookie)
 */
export async function createInvitation(
  authVaderHost: string,
  _accessToken: string, // Ignored - auth is via cookie
  params: CreateInvitationParams
): Promise<CreateInvitationResult> {
  const response = await fetch(`${authVaderHost}/api/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Send httpOnly cookie
    body: JSON.stringify(params),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Failed to create invitation: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Consume an invitation - adds current user to the tenant
 */
export async function consumeInvitation(
  authVaderHost: string,
  _accessToken: string, // Ignored - auth is via cookie
  token: string
): Promise<ConsumeInvitationResult> {
  const response = await fetch(`${authVaderHost}/api/invitations/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Send httpOnly cookie
    body: JSON.stringify({ token }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Failed to consume invitation: ${response.status}`);
  }
  
  return response.json();
}

/**
 * List pending invitations for a tenant
 */
export async function listTenantInvitations(
  authVaderHost: string,
  _accessToken: string, // Ignored - auth is via cookie
  tenantId: string
): Promise<Array<{
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; email: string; givenName: string; familyName: string } | null;
}>> {
  const response = await fetch(`${authVaderHost}/api/invitations/tenant/${tenantId}`, {
    credentials: 'include', // Send httpOnly cookie
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Failed to list invitations: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Revoke an invitation
 */
export async function revokeInvitation(
  authVaderHost: string,
  _accessToken: string, // Ignored - auth is via cookie
  invitationId: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${authVaderHost}/api/invitations/${invitationId}`, {
    method: 'DELETE',
    credentials: 'include', // Send httpOnly cookie
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Failed to revoke invitation: ${response.status}`);
  }
  
  return response.json();
}
