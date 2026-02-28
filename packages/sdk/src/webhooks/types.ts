/**
 * @authvital/sdk - Webhook Event Types
 *
 * Re-exported from @authvital/shared with SDK-specific additions.
 */

// =============================================================================
// RE-EXPORT FROM SHARED (canonical source)
// =============================================================================
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
// SDK-SPECIFIC ALIASES (for backwards compatibility)
// =============================================================================

import type { BaseSyncEvent } from '@authvital/shared';

/**
 * @deprecated Use BaseSyncEvent instead. Alias for backwards compatibility.
 */
export type BaseEvent<T extends string, D> = BaseSyncEvent<T extends import('@authvital/shared').SyncEventType ? T : never, D>;

// Invite data alias
export type { InviteEventData as InviteData } from '@authvital/shared';

// Subject data alias
export type { SubjectEventData as SubjectData } from '@authvital/shared';

// Member data alias
export type { MemberEventData as MemberData } from '@authvital/shared';

// App access data alias
export type { AppAccessEventData as AppAccessData } from '@authvital/shared';

// License data alias
export type { LicenseEventData as LicenseData } from '@authvital/shared';

/**
 * @deprecated Use AppAccessRevokedEvent instead. This alias exists for backwards compatibility.
 */
export type AppAccessDeactivatedEvent = import('@authvital/shared').AppAccessRevokedEvent;
