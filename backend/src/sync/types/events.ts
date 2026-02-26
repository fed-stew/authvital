// =============================================================================
// SYNC EVENT TYPES
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
// EVENT PAYLOAD INTERFACES
// =============================================================================

export interface BaseEventPayload {
  id: string;
  type: SyncEventType;
  timestamp: string;
  tenant_id: string;
  application_id: string;
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

export interface InviteCreatedEvent extends BaseEventPayload {
  type: 'invite.created';
  data: InviteEventData;
}

export interface InviteAcceptedEvent extends BaseEventPayload {
  type: 'invite.accepted';
  data: InviteEventData & {
    sub: string;
    given_name?: string;
    family_name?: string;
  };
}

export interface InviteDeletedEvent extends BaseEventPayload {
  type: 'invite.deleted';
  data: Pick<InviteEventData, 'invite_id' | 'membership_id' | 'email'>;
}

export interface InviteExpiredEvent extends BaseEventPayload {
  type: 'invite.expired';
  data: Pick<InviteEventData, 'invite_id' | 'membership_id' | 'email'>;
}

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

export interface SubjectCreatedEvent extends BaseEventPayload {
  type: 'subject.created';
  data: SubjectEventData;
}

export interface SubjectUpdatedEvent extends BaseEventPayload {
  type: 'subject.updated';
  data: SubjectEventData & {
    changed_fields: string[];
  };
}

export interface SubjectDeletedEvent extends BaseEventPayload {
  type: 'subject.deleted';
  data: Pick<SubjectEventData, 'sub' | 'email'>;
}

export interface SubjectDeactivatedEvent extends BaseEventPayload {
  type: 'subject.deactivated';
  data: Pick<SubjectEventData, 'sub' | 'email'>;
}

// =============================================================================
// MEMBERSHIP EVENTS
// =============================================================================

export interface MemberEventData {
  membership_id: string;
  sub: string;
  email?: string;
  tenant_roles: string[];
}

export interface MemberJoinedEvent extends BaseEventPayload {
  type: 'member.joined';
  data: MemberEventData & {
    given_name?: string;
    family_name?: string;
  };
}

export interface MemberLeftEvent extends BaseEventPayload {
  type: 'member.left';
  data: Pick<MemberEventData, 'membership_id' | 'sub' | 'email'>;
}

export interface MemberRoleChangedEvent extends BaseEventPayload {
  type: 'member.role_changed';
  data: MemberEventData & {
    previous_roles: string[];
  };
}

export interface MemberSuspendedEvent extends BaseEventPayload {
  type: 'member.suspended';
  data: Pick<MemberEventData, 'membership_id' | 'sub' | 'email'>;
}

export interface MemberActivatedEvent extends BaseEventPayload {
  type: 'member.activated';
  data: Pick<MemberEventData, 'membership_id' | 'sub' | 'email'>;
}

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

export interface AppAccessGrantedEvent extends BaseEventPayload {
  type: 'app_access.granted';
  data: AppAccessEventData & {
    given_name?: string;
    family_name?: string;
  };
}

export interface AppAccessRevokedEvent extends BaseEventPayload {
  type: 'app_access.revoked';
  data: Pick<AppAccessEventData, 'membership_id' | 'sub' | 'email'>;
}

export interface AppAccessRoleChangedEvent extends BaseEventPayload {
  type: 'app_access.role_changed';
  data: AppAccessEventData & {
    previous_role_id: string;
    previous_role_name: string;
    previous_role_slug: string;
  };
}

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

export interface LicenseAssignedEvent extends BaseEventPayload {
  type: 'license.assigned';
  data: LicenseEventData;
}

export interface LicenseRevokedEvent extends BaseEventPayload {
  type: 'license.revoked';
  data: Pick<LicenseEventData, 'assignment_id' | 'sub' | 'email'>;
}

export interface LicenseChangedEvent extends BaseEventPayload {
  type: 'license.changed';
  data: LicenseEventData & {
    previous_license_type_id: string;
    previous_license_type_name: string;
  };
}

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
