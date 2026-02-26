// =============================================================================
// SYNC EVENT TYPES FOR SDK
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

  // Memberships
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

export interface BaseEvent<T extends SyncEventType, D> {
  id: string;
  type: T;
  timestamp: string;
  tenant_id: string;
  application_id: string;
  data: D;
}

// =============================================================================
// INVITATION EVENTS
// =============================================================================

export interface InviteData {
  invite_id: string;
  membership_id: string;
  email: string;
  tenant_roles: string[];
  invited_by_sub?: string;
  expires_at?: string;
}

export type InviteCreatedEvent = BaseEvent<'invite.created', InviteData>;

export type InviteAcceptedEvent = BaseEvent<
  'invite.accepted',
  InviteData & {
    sub: string;
    given_name?: string;
    family_name?: string;
  }
>;

export type InviteDeletedEvent = BaseEvent<
  'invite.deleted',
  Pick<InviteData, 'invite_id' | 'membership_id' | 'email'>
>;

export type InviteExpiredEvent = BaseEvent<
  'invite.expired',
  Pick<InviteData, 'invite_id' | 'membership_id' | 'email'>
>;

// =============================================================================
// SUBJECT EVENTS (users, service accounts, machines, etc.)
// =============================================================================

export interface SubjectData {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  subject_type?: 'user' | 'service_account' | 'machine';
}

export type SubjectCreatedEvent = BaseEvent<'subject.created', SubjectData>;

export type SubjectUpdatedEvent = BaseEvent<
  'subject.updated',
  SubjectData & {
    changed_fields: string[];
  }
>;

export type SubjectDeletedEvent = BaseEvent<
  'subject.deleted',
  Pick<SubjectData, 'sub' | 'email'>
>;

export type SubjectDeactivatedEvent = BaseEvent<
  'subject.deactivated',
  Pick<SubjectData, 'sub' | 'email'>
>;

// =============================================================================
// MEMBER EVENTS
// =============================================================================

export interface MemberData {
  membership_id: string;
  sub: string;
  email?: string;
  tenant_roles: string[];
}

export type MemberJoinedEvent = BaseEvent<
  'member.joined',
  MemberData & {
    given_name?: string;
    family_name?: string;
  }
>;

export type MemberLeftEvent = BaseEvent<
  'member.left',
  Pick<MemberData, 'membership_id' | 'sub' | 'email'>
>;

export type MemberRoleChangedEvent = BaseEvent<
  'member.role_changed',
  MemberData & {
    previous_roles: string[];
  }
>;

export type MemberSuspendedEvent = BaseEvent<
  'member.suspended',
  Pick<MemberData, 'membership_id' | 'sub' | 'email'>
>;

export type MemberActivatedEvent = BaseEvent<
  'member.activated',
  Pick<MemberData, 'membership_id' | 'sub' | 'email'>
>;

// =============================================================================
// APP ACCESS EVENTS
// =============================================================================

export interface AppAccessData {
  membership_id: string;
  sub: string;
  email?: string;
  role_id: string;
  role_name: string;
  role_slug: string;
}

export type AppAccessGrantedEvent = BaseEvent<
  'app_access.granted',
  AppAccessData & {
    given_name?: string;
    family_name?: string;
  }
>;

export type AppAccessRevokedEvent = BaseEvent<
  'app_access.revoked',
  Pick<AppAccessData, 'membership_id' | 'sub' | 'email'>
>;

/**
 * @deprecated Use AppAccessRevokedEvent instead. This alias exists for backwards compatibility.
 */
export type AppAccessDeactivatedEvent = AppAccessRevokedEvent;

export type AppAccessRoleChangedEvent = BaseEvent<
  'app_access.role_changed',
  AppAccessData & {
    previous_role_id: string;
    previous_role_name: string;
    previous_role_slug: string;
  }
>;

// =============================================================================
// LICENSE EVENTS
// =============================================================================

export interface LicenseData {
  assignment_id: string;
  sub: string;
  email?: string;
  license_type_id: string;
  license_type_name: string;
}

export type LicenseAssignedEvent = BaseEvent<'license.assigned', LicenseData>;

export type LicenseRevokedEvent = BaseEvent<
  'license.revoked',
  Pick<LicenseData, 'assignment_id' | 'sub' | 'email'>
>;

export type LicenseChangedEvent = BaseEvent<
  'license.changed',
  LicenseData & {
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
): event is
  | SubjectCreatedEvent
  | SubjectUpdatedEvent
  | SubjectDeletedEvent
  | SubjectDeactivatedEvent {
  return event.type.startsWith('subject.');
}

export function isMemberEvent(
  event: SyncEvent,
): event is
  | MemberJoinedEvent
  | MemberLeftEvent
  | MemberRoleChangedEvent
  | MemberSuspendedEvent
  | MemberActivatedEvent {
  return event.type.startsWith('member.');
}

export function isAppAccessEvent(
  event: SyncEvent,
): event is
  | AppAccessGrantedEvent
  | AppAccessRevokedEvent
  | AppAccessDeactivatedEvent
  | AppAccessRoleChangedEvent {
  return event.type.startsWith('app_access.');
}

export function isLicenseEvent(
  event: SyncEvent,
): event is LicenseAssignedEvent | LicenseRevokedEvent | LicenseChangedEvent {
  return event.type.startsWith('license.');
}
