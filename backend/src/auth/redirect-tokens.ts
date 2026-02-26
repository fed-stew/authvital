/**
 * Shared in-memory store for redirect tokens
 * Used for cross-domain authentication flow
 *
 * Note: In production with multiple instances, use Redis instead
 */

export interface RedirectTokenData {
  userId: string;
  email?: string;
  tenantId?: string;
  tenantSlug?: string;
  expiresAt: Date;
}

// Single shared Map for all controllers
export const redirectTokens = new Map<string, RedirectTokenData>();

// Clean up expired tokens periodically
setInterval(() => {
  const now = new Date();
  for (const [token, data] of redirectTokens.entries()) {
    if (data.expiresAt < now) {
      redirectTokens.delete(token);
    }
  }
}, 60000); // Every minute
