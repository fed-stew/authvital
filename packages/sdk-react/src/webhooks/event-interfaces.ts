import type {
  InviteCreatedEvent,
  InviteAcceptedEvent,
  InviteDeletedEvent,
  InviteExpiredEvent,
  SubjectCreatedEvent,
  SubjectUpdatedEvent,
  SubjectDeletedEvent,
  SubjectDeactivatedEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  MemberRoleChangedEvent,
  MemberSuspendedEvent,
  MemberActivatedEvent,
  AppAccessGrantedEvent,
  AppAccessRevokedEvent,
  AppAccessRoleChangedEvent,
  LicenseAssignedEvent,
  LicenseRevokedEvent,
  LicenseChangedEvent,
} from './types';

// =============================================================================
// EVENT HANDLER INTERFACES
// =============================================================================

/**
 * Interface for handling invitation events
 * Implement only the methods you need - all have default no-op implementations
 */
export interface IInviteEventHandler {
  onInviteCreated?(event: InviteCreatedEvent): Promise<void> | void;
  onInviteAccepted?(event: InviteAcceptedEvent): Promise<void> | void;
  onInviteDeleted?(event: InviteDeletedEvent): Promise<void> | void;
  onInviteExpired?(event: InviteExpiredEvent): Promise<void> | void;
}

/**
 * Interface for handling subject events (users, service accounts, machines)
 */
export interface ISubjectEventHandler {
  onSubjectCreated?(event: SubjectCreatedEvent): Promise<void> | void;
  onSubjectUpdated?(event: SubjectUpdatedEvent): Promise<void> | void;
  onSubjectDeleted?(event: SubjectDeletedEvent): Promise<void> | void;
  onSubjectDeactivated?(event: SubjectDeactivatedEvent): Promise<void> | void;
}

/**
 * Interface for handling membership events
 */
export interface IMemberEventHandler {
  onMemberJoined?(event: MemberJoinedEvent): Promise<void> | void;
  onMemberLeft?(event: MemberLeftEvent): Promise<void> | void;
  onMemberRoleChanged?(event: MemberRoleChangedEvent): Promise<void> | void;
  onMemberSuspended?(event: MemberSuspendedEvent): Promise<void> | void;
  onMemberActivated?(event: MemberActivatedEvent): Promise<void> | void;
}

/**
 * Interface for handling app access events
 */
export interface IAppAccessEventHandler {
  onAppAccessGranted?(event: AppAccessGrantedEvent): Promise<void> | void;
  onAppAccessRevoked?(event: AppAccessRevokedEvent): Promise<void> | void;
  /**
   * @deprecated Use onAppAccessRevoked instead. This method exists for backwards compatibility
   * and will delegate to onAppAccessRevoked if implemented.
   */
  onAppAccessDeactivated?(event: AppAccessRevokedEvent): Promise<void> | void;
  onAppAccessRoleChanged?(event: AppAccessRoleChangedEvent): Promise<void> | void;
}

/**
 * Interface for handling license events
 */
export interface ILicenseEventHandler {
  onLicenseAssigned?(event: LicenseAssignedEvent): Promise<void> | void;
  onLicenseRevoked?(event: LicenseRevokedEvent): Promise<void> | void;
  onLicenseChanged?(event: LicenseChangedEvent): Promise<void> | void;
}

/**
 * Combined interface for all events
 * Extend this if you want to handle everything in one class
 */
export interface IAuthVitalEventHandler
  extends IInviteEventHandler,
    ISubjectEventHandler,
    IMemberEventHandler,
    IAppAccessEventHandler,
    ILicenseEventHandler {
  /**
   * Called for any event that doesn't have a specific handler
   */
  onUnhandledEvent?(event: unknown): Promise<void> | void;
}

// =============================================================================
// ABSTRACT BASE CLASSES (with default no-op implementations)
// =============================================================================

/**
 * Base class for invite event handlers
 * Extend this and override only the methods you need
 *
 * @example
 * ```typescript
 * class MyInviteHandler extends InviteEventHandler {
 *   async onInviteAccepted(event: InviteAcceptedEvent) {
 *     await sendWelcomeEmail(event.data.email);
 *   }
 * }
 * ```
 */
export abstract class InviteEventHandler implements IInviteEventHandler {
  onInviteCreated?(_event: InviteCreatedEvent): Promise<void> | void {}
  onInviteAccepted?(_event: InviteAcceptedEvent): Promise<void> | void {}
  onInviteDeleted?(_event: InviteDeletedEvent): Promise<void> | void {}
  onInviteExpired?(_event: InviteExpiredEvent): Promise<void> | void {}
}

/**
 * Base class for subject event handlers (users, service accounts, machines)
 *
 * @example
 * ```typescript
 * class MySubjectHandler extends SubjectEventHandler {
 *   async onSubjectCreated(event: SubjectCreatedEvent) {
 *     // event.data.sub is the subject ID (could be user, service account, etc.)
 *     await this.db.subjects.create({ id: event.data.sub, email: event.data.email });
 *   }
 * }
 * ```
 */
export abstract class SubjectEventHandler implements ISubjectEventHandler {
  onSubjectCreated?(_event: SubjectCreatedEvent): Promise<void> | void {}
  onSubjectUpdated?(_event: SubjectUpdatedEvent): Promise<void> | void {}
  onSubjectDeleted?(_event: SubjectDeletedEvent): Promise<void> | void {}
  onSubjectDeactivated?(_event: SubjectDeactivatedEvent): Promise<void> | void {}
}

/**
 * Base class for member event handlers
 */
export abstract class MemberEventHandler implements IMemberEventHandler {
  onMemberJoined?(_event: MemberJoinedEvent): Promise<void> | void {}
  onMemberLeft?(_event: MemberLeftEvent): Promise<void> | void {}
  onMemberRoleChanged?(_event: MemberRoleChangedEvent): Promise<void> | void {}
  onMemberSuspended?(_event: MemberSuspendedEvent): Promise<void> | void {}
  onMemberActivated?(_event: MemberActivatedEvent): Promise<void> | void {}
}

/**
 * Base class for app access event handlers
 */
export abstract class AppAccessEventHandler implements IAppAccessEventHandler {
  onAppAccessGranted?(_event: AppAccessGrantedEvent): Promise<void> | void {}
  onAppAccessRevoked?(_event: AppAccessRevokedEvent): Promise<void> | void {}
  /**
   * @deprecated Use onAppAccessRevoked instead. This method exists for backwards compatibility.
   */
  onAppAccessDeactivated?(event: AppAccessRevokedEvent): Promise<void> | void {
    // Delegate to onAppAccessRevoked for backwards compatibility
    return this.onAppAccessRevoked?.(event);
  }
  onAppAccessRoleChanged?(_event: AppAccessRoleChangedEvent): Promise<void> | void {}
}

/**
 * Base class for license event handlers
 */
export abstract class LicenseEventHandler implements ILicenseEventHandler {
  onLicenseAssigned?(_event: LicenseAssignedEvent): Promise<void> | void {}
  onLicenseRevoked?(_event: LicenseRevokedEvent): Promise<void> | void {}
  onLicenseChanged?(_event: LicenseChangedEvent): Promise<void> | void {}
}

/**
 * Base class for handling ALL events
 * Extend this and override only the methods you need
 *
 * @example
 * ```typescript
 * class MyEventHandler extends AuthVitalEventHandler {
 *   async onSubjectCreated(event: SubjectCreatedEvent) {
 *     // event.data.sub is the subject ID
 *     await this.db.subjects.create({ id: event.data.sub, email: event.data.email });
 *   }
 *
 *   async onMemberJoined(event: MemberJoinedEvent) {
 *     await this.slack.notify(`${event.data.email} joined!`);
 *   }
 *
 *   onUnhandledEvent(event: unknown) {
 *     console.log('Unhandled:', event);
 *   }
 * }
 * ```
 */
export abstract class AuthVitalEventHandler implements IAuthVitalEventHandler {
  // Invite events
  onInviteCreated?(_event: InviteCreatedEvent): Promise<void> | void {}
  onInviteAccepted?(_event: InviteAcceptedEvent): Promise<void> | void {}
  onInviteDeleted?(_event: InviteDeletedEvent): Promise<void> | void {}
  onInviteExpired?(_event: InviteExpiredEvent): Promise<void> | void {}

  // Subject events
  onSubjectCreated?(_event: SubjectCreatedEvent): Promise<void> | void {}
  onSubjectUpdated?(_event: SubjectUpdatedEvent): Promise<void> | void {}
  onSubjectDeleted?(_event: SubjectDeletedEvent): Promise<void> | void {}
  onSubjectDeactivated?(_event: SubjectDeactivatedEvent): Promise<void> | void {}

  // Member events
  onMemberJoined?(_event: MemberJoinedEvent): Promise<void> | void {}
  onMemberLeft?(_event: MemberLeftEvent): Promise<void> | void {}
  onMemberRoleChanged?(_event: MemberRoleChangedEvent): Promise<void> | void {}
  onMemberSuspended?(_event: MemberSuspendedEvent): Promise<void> | void {}
  onMemberActivated?(_event: MemberActivatedEvent): Promise<void> | void {}

  // App access events
  onAppAccessGranted?(_event: AppAccessGrantedEvent): Promise<void> | void {}
  onAppAccessRevoked?(_event: AppAccessRevokedEvent): Promise<void> | void {}
  /**
   * @deprecated Use onAppAccessRevoked instead. This method exists for backwards compatibility.
   */
  onAppAccessDeactivated?(event: AppAccessRevokedEvent): Promise<void> | void {
    // Delegate to onAppAccessRevoked for backwards compatibility
    return this.onAppAccessRevoked?.(event);
  }
  onAppAccessRoleChanged?(_event: AppAccessRoleChangedEvent): Promise<void> | void {}

  // License events
  onLicenseAssigned?(_event: LicenseAssignedEvent): Promise<void> | void {}
  onLicenseRevoked?(_event: LicenseRevokedEvent): Promise<void> | void {}
  onLicenseChanged?(_event: LicenseChangedEvent): Promise<void> | void {}

  // Catch-all
  onUnhandledEvent?(_event: unknown): Promise<void> | void {}
}
