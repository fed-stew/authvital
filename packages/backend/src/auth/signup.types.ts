/**
 * Shared types for signup-related services
 */

export interface SignUpDto {
  email: string;
  password: string;
  givenName?: string;
  familyName?: string;
  phone?: string;
  tenantName?: string;
  slug?: string;
  selectedLicenseTypeId?: string;
  applicationId?: string;
}

export interface AnonymousSignUpDto {
  deviceId?: string;
}

export interface UpgradeAccountDto {
  userId: string;
  email: string;
  password: string;
  givenName?: string;
  familyName?: string;
  phone?: string;
}

export interface SignUpResult {
  user: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
    isAnonymous: boolean;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
  membership: {
    id: string;
  } | null;
  domain: {
    id: string;
    domainName: string;
    isVerified: boolean;
    verificationToken: string;
  } | null;
  joinedExistingTenant: boolean;
}

export interface AnonymousSignUpResult {
  user: {
    id: string;
    isAnonymous: boolean;
  };
  anonymousToken: string;
}
