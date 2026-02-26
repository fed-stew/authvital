// =============================================================================
// AUTHVADER WEBHOOKS SDK
// =============================================================================
//
// The recommended way to handle AuthVader webhooks:
//
// 1. Set AV_HOST environment variable (or pass authVaderHost in options)
// 2. Extend AuthVaderEventHandler
// 3. Override the methods you need (IDE autocomplete shows all options)
// 4. Create a WebhookRouter with your handler
// 5. Use router.expressHandler() in your route
//
// Example:
// ```typescript
// import { AuthVaderEventHandler, WebhookRouter } from '@authvader/sdk/server';
//
// class MyHandler extends AuthVaderEventHandler {
//   async onSubjectCreated(event) {
//     await db.users.create({ id: event.data.sub, email: event.data.email });
//   }
// }
//
// // AV_HOST is read from environment automatically
// const router = new WebhookRouter({
//   handler: new MyHandler(),
// });
//
// app.post('/webhooks', router.expressHandler());
// ```
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

// Main API: Abstract base classes to extend
export {
  AuthVaderEventHandler,
  // Granular handlers for specific event categories
  InviteEventHandler,
  SubjectEventHandler,
  MemberEventHandler,
  AppAccessEventHandler,
  LicenseEventHandler,
} from './event-interfaces';

// Handler interfaces (for typing)
export type {
  IAuthVaderEventHandler,
  IInviteEventHandler,
  ISubjectEventHandler,
  IMemberEventHandler,
  IAppAccessEventHandler,
  ILicenseEventHandler,
} from './event-interfaces';

// Router: Connects your handler to incoming webhooks
export { WebhookRouter, type WebhookRouterOptions } from './webhook-router';

// Low-level verifier (for advanced use cases only)
// Most users should use WebhookRouter + AuthVaderEventHandler instead
export {
  AuthVaderWebhooks as WebhookVerifier,
  type WebhookHandlerOptions as WebhookVerifierOptions,
} from './webhook-handler';
