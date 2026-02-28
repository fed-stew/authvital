/**
 * Sync Event Types
 *
 * Re-exported from @authvital/shared for consistency.
 * @see @authvital/shared for canonical definitions
 */

// Import for local use in backend-specific types
import type { SyncEventType } from '@authvital/shared';

// Re-export everything for consumers
export {
  // Constants
  SYNC_EVENT_TYPES,
  type SyncEventType,

  // Base
  type BaseSyncEvent,

  // Invite events
  type InviteEventData,
  type InviteCreatedEvent,
  type InviteAcceptedEvent,
  type InviteDeletedEvent,
  type InviteExpiredEvent,

  // Subject events
  type SubjectEventData,
  type SubjectCreatedEvent,
  type SubjectUpdatedEvent,
  type SubjectDeletedEvent,
  type SubjectDeactivatedEvent,

  // Member events
  type MemberEventData,
  type MemberJoinedEvent,
  type MemberLeftEvent,
  type MemberRoleChangedEvent,
  type MemberSuspendedEvent,
  type MemberActivatedEvent,

  // App Access events
  type AppAccessEventData,
  type AppAccessGrantedEvent,
  type AppAccessRevokedEvent,
  type AppAccessRoleChangedEvent,

  // License events
  type LicenseEventData,
  type LicenseAssignedEvent,
  type LicenseRevokedEvent,
  type LicenseChangedEvent,

  // Union type
  type SyncEvent,

  // Type guards
  isInviteEvent,
  isSubjectEvent,
  isMemberEvent,
  isAppAccessEvent,
  isLicenseEvent,
} from '@authvital/shared';

// =============================================================================
// BACKEND-SPECIFIC TYPES
// =============================================================================

/**
 * Base event payload for internal use.
 * 
 * This is a non-generic version of BaseSyncEvent for cases where
 * the backend needs to construct events dynamically without knowing
 * the exact event type at compile time.
 */
export interface BaseEventPayload {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: SyncEventType;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Tenant ID where event occurred */
  tenant_id: string;
  /** Application ID the event is relevant to */
  application_id: string;
}
