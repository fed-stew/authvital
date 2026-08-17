// =============================================================================
// TENANT LICENSE MANAGEMENT — PURE HELPERS
// =============================================================================
//
// Pure, side-effect-free helpers shared by the LicensesTab orchestrator, its
// modals and section subcomponents. Keeping them here avoids duplicating logic
// across the extracted pieces (DRY).

import type { MemberWithLicenses } from './LicensesTab.types';

// Resolve a friendly display name for a member.
export const getUserName = (member: MemberWithLicenses): string => {
  const user = member.user;
  if (user.givenName && user.familyName) {
    return `${user.givenName} ${user.familyName}`;
  }
  if (user.givenName) return user.givenName;
  return user.email || 'Unknown';
};

// Format an ISO date string for display (or "Never" when missing).
export const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'Never';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString || 'Never';
  }
};

// Percentage of seats assigned out of the total owned.
export const getUtilizationPercentage = (
  assigned: number,
  total: number
): number => {
  if (total === 0) return 0;
  return Math.round((assigned / total) * 100);
};

// Progress-bar color keyed off utilization thresholds.
export const getUtilizationColor = (percentage: number): string => {
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 75) return 'bg-yellow-500';
  return 'bg-green-500';
};
