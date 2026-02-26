/**
 * System Webhook Event Type Definitions
 */

// Base payload for all system events
export interface BaseSystemEventPayload {
  event: string;
  timestamp: string;
}

// =============================================================================
// TENANT EVENTS
// =============================================================================

export interface TenantEventData {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
}

export interface TenantCreatedEventPayload extends BaseSystemEventPayload {
  event: 'tenant.created';
  data: TenantEventData & {
    owner_id?: string;
    owner_email?: string;
  };
}

export interface TenantUpdatedEventPayload extends BaseSystemEventPayload {
  event: 'tenant.updated';
  data: TenantEventData & {
    changed_fields: string[];
  };
}

export interface TenantDeletedEventPayload extends BaseSystemEventPayload {
  event: 'tenant.deleted';
  data: Pick<TenantEventData, 'tenant_id' | 'tenant_slug'>;
}

export interface TenantSuspendedEventPayload extends BaseSystemEventPayload {
  event: 'tenant.suspended';
  data: TenantEventData & {
    reason?: string;
  };
}

// =============================================================================
// TENANT APP EVENTS
// =============================================================================

export interface TenantAppEventData {
  tenant_id: string;
  tenant_slug: string;
  user_id: string;
  user_email?: string;
  application_id: string;
  application_name: string;
  application_slug: string;
  access_type: string; // 'GRANTED' | 'INVITED' | 'AUTO_FREE' | 'AUTO_TENANT' | 'AUTO_OWNER'
}

export interface TenantAppGrantedEventPayload extends BaseSystemEventPayload {
  event: 'tenant.app.granted';
  data: TenantAppEventData & {
    granted_by_id?: string;
    license_assignment_id?: string;
  };
}

export interface TenantAppRevokedEventPayload extends BaseSystemEventPayload {
  event: 'tenant.app.revoked';
  data: Pick<TenantAppEventData, 'tenant_id' | 'tenant_slug' | 'user_id' | 'user_email' | 'application_id' | 'application_slug'> & {
    revoked_by_id?: string;
  };
}

// =============================================================================
// UNION TYPE
// =============================================================================

export type SystemEventPayload =
  | TenantCreatedEventPayload
  | TenantUpdatedEventPayload
  | TenantDeletedEventPayload
  | TenantSuspendedEventPayload
  | TenantAppGrantedEventPayload
  | TenantAppRevokedEventPayload;
