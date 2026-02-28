/**
 * Sync Event Type Definitions
 *
 * These types define the webhook event payloads sent by AuthVital
 * for identity synchronization. Used by both backend (producer) and SDK (consumer).
 *
 * @packageDocumentation
 */

// =============================================================================
// SYNC EVENT TYPES CONSTANT
// =============================================================================

export const SYNC_EVENT_TYPES = {
  // Invitations
  INVITE_CREATED: 'invite.created',
  INVITE_ACCEPTED: 'invite.accepted',
  INVITE_DELETED: 'invite.deleted',
  INVITE_EXPIRED: 'invite.expired',

  // Subjects (users, service accounts, etc.)
  SUBJECT_CREATED: 'subject.created',
  SUBJECT_UPDATED: 'subject.updated',
  SUBJECT_DELETED: 'subject.deleted',
  SUBJECT_DEACTIVATED: 'subject.deactivated',

  // Memberships (tenant membership)
  MEMBER_JOINED: 'member.joined',
  MEMBER_LEFT: 'member.left',
  MEMBER_ROLE_CHANGED: 'member.role_changed',
  MEMBER_SUSPENDED: 'member.suspended',
  MEMBER_ACTIVATED: 'member.activated',

  // App Access
  APP_ACCESS_GRANTED: 'app_access.granted',
  APP_ACCESS_REVOKED: 'app_access.revoked',
  APP_ACCESS_ROLE_CHANGED: 'app_access.role_changed',

  // Licenses
  LICENSE_ASSIGNED: 'license.assigned',
  LICENSE_REVOKED: 'license.revoked',
  LICENSE_CHANGED: 'license.changed',
} as const;

export type SyncEventType = (typeof SYNC_EVENT_TYPES)[keyof typeof SYNC_EVENT_TYPES];

// =============================================================================
// BASE EVENT
// =============================================================================

/**
 * Base event structure for all sync events.
 * Uses generics for type-safe event handling.
 */
export interface BaseSyncEvent<T extends SyncEventType, D> {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: T;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Tenant ID where event occurred */
  tenant_id: string;
  /** Application ID the event is relevant to */
  application_id: string;
  /** Event-specific data */
  data: D;
}

// =============================================================================
// INVITATION EVENTS
// =============================================================================

export interface InviteEventData {
  invite_id: string;
  membership_id: string;
  email: string;
  tenant_roles: string[];
  invited_by_sub?: string;
  expires_at?: string;
}

export type InviteCreatedEvent = BaseSyncEvent<'invite.created', InviteEventData>;

export type InviteAcceptedEvent = BaseSyncEvent<
  'invite.accepted',
  InviteEventData & {
    sub: string;
    given_name?: string;
    family_name?: string;
  }
>;

export type InviteDeletedEvent = BaseSyncEvent<
  'invite.deleted',
  Pick<InviteEventData, 'invite_id' | 'membership_id' | 'email'>
>;

export type InviteExpiredEvent = BaseSyncEvent<
  'invite.expired',
  Pick<InviteEventData, 'invite_id' | 'membership_id' | 'email'>
>;

// =============================================================================
// SUBJECT EVENTS (users, service accounts, machines, etc.)
// =============================================================================

export interface SubjectEventData {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  subject_type?: 'user' | 'service_account' | 'machine';
}

export type SubjectCreatedEvent = BaseSyncEvent<'subject.created', SubjectEventData>;

export type SubjectUpdatedEvent = BaseSyncEvent<
  'subject.updated',
  SubjectEventData & {
    changed_fields: string[];
  }
>;

export type SubjectDeletedEvent = BaseSyncEvent<
  'subject.deleted',
  Pick<SubjectEventData, 'sub' | 'email'>
>;

export type SubjectDeactivatedEvent = BaseSyncEvent<
  'subject.deactivated',
  Pick<SubjectEventData, 'sub' | 'email'>
>;

// =============================================================================
// MEMBER EVENTS
// =============================================================================

export interface MemberEventData {
  membership_id: string;
  sub: string;
  email?: string;
  tenant_roles: string[];
}

export type MemberJoinedEvent = BaseSyncEvent<
  'member.joined',
  MemberEventData & {
    given_name?: string;
    family_name?: string;
  }
>;

export type MemberLeftEvent = BaseSyncEvent<
  'member.left',
  Pick<MemberEventData, 'membership_id' | 'sub' | 'email'>
>;

export type MemberRoleChangedEvent = BaseSyncEvent<
  'member.role_changed',
  MemberEventData & {
    previous_roles: string[];
  }
>;

export type MemberSuspendedEvent = BaseSyncEvent<
  'member.suspended',
  Pick<MemberEventData, 'membership_id' | 'sub' | 'email'>
>;

export type MemberActivatedEvent = BaseSyncEvent<
  'member.activated',
  Pick<MemberEventData, 'membership_id' | 'sub' | 'email'>
>;

// =============================================================================
// APP ACCESS EVENTS
// =============================================================================

export interface AppAccessEventData {
  membership_id: string;
  sub: string;
  email?: string;
  role_id: string;
  role_name: string;
  role_slug: string;
}

export type AppAccessGrantedEvent = BaseSyncEvent<
  'app_access.granted',
  AppAccessEventData & {
    given_name?: string;
    family_name?: string;
  }
>;

export type AppAccessRevokedEvent = BaseSyncEvent<
  'app_access.revoked',
  Pick<AppAccessEventData, 'membership_id' | 'sub' | 'email'>
>;

export type AppAccessRoleChangedEvent = BaseSyncEvent<
  'app_access.role_changed',
  AppAccessEventData & {
    previous_role_id: string;
    previous_role_name: string;
    previous_role_slug: string;
  }
>;

// =============================================================================
// LICENSE EVENTS
// =============================================================================

export interface LicenseEventData {
  assignment_id: string;
  sub: string;
  email?: string;
  license_type_id: string;
  license_type_name: string;
}

export type LicenseAssignedEvent = BaseSyncEvent<'license.assigned', LicenseEventData>;

export type LicenseRevokedEvent = BaseSyncEvent<
  'license.revoked',
  Pick<LicenseEventData, 'assignment_id' | 'sub' | 'email'>
>;

export type LicenseChangedEvent = BaseSyncEvent<
  'license.changed',
  LicenseEventData & {
    previous_license_type_id: string;
    previous_license_type_name: string;
  }
>;

// =============================================================================
// UNION TYPE
// =============================================================================

export type SyncEvent =
  | InviteCreatedEvent
  | InviteAcceptedEvent
  | InviteDeletedEvent
  | InviteExpiredEvent
  | SubjectCreatedEvent
  | SubjectUpdatedEvent
  | SubjectDeletedEvent
  | SubjectDeactivatedEvent
  | MemberJoinedEvent
  | MemberLeftEvent
  | MemberRoleChangedEvent
  | MemberSuspendedEvent
  | MemberActivatedEvent
  | AppAccessGrantedEvent
  | AppAccessRevokedEvent
  | AppAccessRoleChangedEvent
  | LicenseAssignedEvent
  | LicenseRevokedEvent
  | LicenseChangedEvent;

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isInviteEvent(
  event: SyncEvent,
): event is InviteCreatedEvent | InviteAcceptedEvent | InviteDeletedEvent | InviteExpiredEvent {
  return event.type.startsWith('invite.');
}

export function isSubjectEvent(
  event: SyncEvent,
): event is SubjectCreatedEvent | SubjectUpdatedEvent | SubjectDeletedEvent | SubjectDeactivatedEvent {
  return event.type.startsWith('subject.');
}

export function isMemberEvent(
  event: SyncEvent,
): event is MemberJoinedEvent | MemberLeftEvent | MemberRoleChangedEvent | MemberSuspendedEvent | MemberActivatedEvent {
  return event.type.startsWith('member.');
}

export function isAppAccessEvent(
  event: SyncEvent,
): event is AppAccessGrantedEvent | AppAccessRevokedEvent | AppAccessRoleChangedEvent {
  return event.type.startsWith('app_access.');
}

export function isLicenseEvent(
  event: SyncEvent,
): event is LicenseAssignedEvent | LicenseRevokedEvent | LicenseChangedEvent {
  return event.type.startsWith('license.');
}
