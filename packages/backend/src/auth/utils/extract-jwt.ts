import { Request } from 'express';

/**
 * Extract JWT from Authorization header ONLY.
 * 
 * SECURITY: This function strictly enforces the split-token architecture.
 * It ONLY reads from the Authorization: Bearer header and NEVER from cookies.
 * 
 * This ensures:
 * - Access tokens are explicitly provided by clients
 * - No accidental cookie-based token extraction
 * - Backend remains stateless and secure
 * 
 * @param req - Express Request object
 * @returns The JWT token string or null if Authorization header is missing/invalid
 * @throws Never - returns null for any invalid input
 */
export function extractJwt(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}
