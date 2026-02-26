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
