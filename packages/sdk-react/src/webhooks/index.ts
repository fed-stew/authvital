// =============================================================================
// AUTHVITAL WEBHOOKS SDK (React Package - Types Only)
// =============================================================================
//
// For webhook handling, use @authvital/node which provides:
// - WebhookRouter for Express/Next.js
// - AuthVitalWebhooks for signature verification
// - IdentitySyncHandler for database syncing
//
// This package exports webhook types and handler interfaces for:
// - Type-checking your event handler implementations
// - Building custom webhook handlers in the browser (rare)
//
// =============================================================================

// Event types (for typing your handler methods)
export type {
  SyncEvent,
  SyncEventType,
  // Invite events
  InviteCreatedEvent,
  InviteAcceptedEvent,
  InviteDeletedEvent,
  InviteExpiredEvent,
  // Subject events (users, service accounts, machines)
  SubjectData,
  SubjectCreatedEvent,
  SubjectUpdatedEvent,
  SubjectDeletedEvent,
  SubjectDeactivatedEvent,
  // Member events
  MemberJoinedEvent,
  MemberLeftEvent,
  MemberRoleChangedEvent,
  MemberSuspendedEvent,
  MemberActivatedEvent,
  // App access events
  AppAccessGrantedEvent,
  AppAccessRevokedEvent,
  AppAccessDeactivatedEvent,
  AppAccessRoleChangedEvent,
  // License events
  LicenseAssignedEvent,
  LicenseRevokedEvent,
  LicenseChangedEvent,
} from './types';

// Type guards (for narrowing event types)
export {
  isInviteEvent,
  isSubjectEvent,
  isMemberEvent,
  isAppAccessEvent,
  isLicenseEvent,
  SYNC_EVENT_TYPES,
} from './types';

// Abstract base classes to extend (for type checking)
export {
  AuthVitalEventHandler,
  // Granular handlers for specific event categories
  InviteEventHandler,
  SubjectEventHandler,
  MemberEventHandler,
  AppAccessEventHandler,
  LicenseEventHandler,
} from './event-interfaces';

// Handler interfaces (for typing)
export type {
  IAuthVitalEventHandler,
  IInviteEventHandler,
  ISubjectEventHandler,
  IMemberEventHandler,
  IAppAccessEventHandler,
  ILicenseEventHandler,
} from './event-interfaces';
