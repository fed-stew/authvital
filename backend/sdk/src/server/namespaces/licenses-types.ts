/**
 * @authvader/sdk - License Types
 *
 * Shared types for the licenses namespace.
 */

// =============================================================================
// LICENSE RESPONSE TYPES
// =============================================================================

export interface LicenseGrantResponse {
  assignmentId: string;
  message: string;
}

export interface LicenseRevokeResponse {
  message: string;
}

export interface LicenseCheckResponse {
  hasLicense: boolean;
  licenseType: string | null;
  features?: string[];
}

export interface LicenseFeatureResponse {
  hasFeature: boolean;
}

export interface LicensedUser {
  id: string;
  userId: string;
  email: string;
  licenseType: string;
}

export interface LicenseHolder {
  userId: string;
  userEmail: string;
  userName?: string;
  licenseTypeId: string;
  licenseTypeName: string;
  assignedAt: string;
}

export interface LicenseAuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  applicationId: string;
  applicationName: string;
  licenseTypeId: string;
  licenseTypeName: string;
  action: 'GRANTED' | 'REVOKED' | 'CHANGED';
  previousLicenseTypeName?: string;
  performedBy: string;
  performedAt?: string;
  reason?: string;
}

export interface LicenseAuditLogResponse {
  entries: LicenseAuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface UsageOverviewResponse {
  tenantId: string;
  applications: Array<{
    applicationId: string;
    applicationName: string;
    licenseTypeName: string;
    totalSeats: number;
    seatsAssigned: number;
    seatsAvailable: number;
    utilizationPercentage: number;
  }>;
  totalSeatsAcrossAllApps: number;
  totalSeatsAssigned: number;
  overallUtilization: number;
  hasOverage: boolean;
  overageApplications: string[];
}

export interface UsageTrendEntry {
  date: string;
  seatsAssigned: number;
  seatsAvailable: number;
  utilizationPercentage: number;
}

export interface UserLicenseListItem {
  id: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  applicationId: string;
  applicationName: string;
  assignedAt: string;
}
