/**
 * System Webhook Event Type Definitions
 *
 * The CANONICAL payload contract now lives in @authvital/shared
 * (packages/shared/src/types/system-events.types.ts) so the backend, the
 * broker, and the server SDK share ONE strictly-typed definition. This file
 * re-exports it to keep the internal import path working.
 *
 * dispatch<T>() in SystemWebhookService is generic over SystemEventDataOf,
 * so every emit site is compile-time checked against these shapes.
 */

export type {
  SystemEventType,
  SystemEventDataOf,
  SystemEvent,
  BaseSystemEvent,
  TenantCreatedEventData,
  TenantUpdatedEventData,
  TenantDeletedEventData,
  TenantSuspendedEventData,
  TenantAppAccessType,
  TenantAppGrantedEventData,
  TenantAppRevokedEventData,
  ApplicationClientConfig,
  ApplicationLicensingInfo,
  ApplicationCreatedEventData,
  ApplicationUpdatedEventData,
  ApplicationDeletedEventData,
  SsoProviderAddedEventData,
  SsoProviderUpdatedEventData,
  SsoProviderRemovedEventData,
} from '@authvital/shared';

export { SYSTEM_EVENT_TYPES } from '@authvital/shared';
