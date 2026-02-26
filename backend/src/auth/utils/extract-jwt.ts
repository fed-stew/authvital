import { Request } from 'express';

/**
 * Extract JWT from:
 * 1. idp_session cookie (IDP frontend)
 * 2. super_admin_session cookie (Admin panel)
 * 3. Authorization header (API clients)
 */
export function extractJwt(req: Request): string | null {
  // 1. Try IDP session cookie
  const idpSession = req.cookies?.['idp_session'];
  if (idpSession) return idpSession;
  
  // 2. Try super admin session cookie (Admin panel)
  const superAdminSession = req.cookies?.['super_admin_session'];
  if (superAdminSession) return superAdminSession;
  
  // 3. Try Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}
