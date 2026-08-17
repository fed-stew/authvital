import { Request } from 'express';

export interface JwtPayload {
  sub: string; // User ID
  email: string;
  given_name?: string;
  family_name?: string;
  scope?: string;
  // Tenant context (only when token is scoped to a single tenant)
  tenant_id?: string;
  tenant_subdomain?: string;
  // Tenant roles and permissions
  tenant_roles?: string[];
  tenant_permissions?: string[];
  // Application-specific roles (just slugs - no permissions)
  // Permission checking happens in the consuming application layer
  app_roles?: string[];
  // AMR (RFC 8176): how this session/token actually authenticated.
  // Missing on legacy tokens minted before session-amr tracking → consumers
  // treat that as ['pwd'].
  amr?: string[];
  // Open MFA-enrollment grace window for the token's tenant (unix seconds).
  mfa_grace_expires_at?: number;
  // Console-session claim: first-login timestamp (unix seconds), preserved
  // across sliding re-issues (see SessionRefreshInterceptor).
  session_start?: number;
  // License info
  license?: {
    type: string;
    name: string;
    features: string[];
  };
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}

export interface AuthenticatedUser extends JwtPayload {
  id: string; // Same as sub, included for convenience
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
