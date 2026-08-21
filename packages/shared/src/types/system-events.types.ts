/**
 * System (system_webhook) Event Types — CANONICAL PAYLOAD CONTRACT
 *
 * The single source of truth for the 12 instance-level orchestration events
 * dispatched by SystemWebhookService. The backend's dispatch() is generic
 * over these types, so every emit site is compile-time enforced against
 * this contract. Mirrors the sync-events pattern (BaseSystemEvent + union +
 * SystemEventDataOf).
 *
 * Shapes were reconciled docs-as-spec against every emit site; each field
 * decision is annotated (source: docs | code | new). Payload shapes are
 * intentionally BREAKING vs pre-canonical emissions — see
 * docs/getting-started/upgrading-to-broker.md for the migration table.
 *
 * NOTE: data shapes use `type` aliases (not `interface`) on purpose — type
 * literals are assignable to Record<string, unknown> where the dispatch
 * pipeline needs it; interfaces are not.
 */

// =============================================================================
// EVENT TYPE REGISTRY
// =============================================================================

export const SYSTEM_EVENT_TYPES = {
  // Tenant lifecycle
  TENANT_CREATED: 'tenant.created',
  TENANT_UPDATED: 'tenant.updated',
  TENANT_DELETED: 'tenant.deleted',
  TENANT_SUSPENDED: 'tenant.suspended',
  // Tenant app access
  TENANT_APP_GRANTED: 'tenant.app.granted',
  TENANT_APP_REVOKED: 'tenant.app.revoked',
  // Application lifecycle
  APPLICATION_CREATED: 'application.created',
  APPLICATION_UPDATED: 'application.updated',
  APPLICATION_DELETED: 'application.deleted',
  // SSO provider lifecycle
  SSO_PROVIDER_ADDED: 'sso.provider_added',
  SSO_PROVIDER_UPDATED: 'sso.provider_updated',
  SSO_PROVIDER_REMOVED: 'sso.provider_removed',
} as const;

export type SystemEventType =
  (typeof SYSTEM_EVENT_TYPES)[keyof typeof SYSTEM_EVENT_TYPES];

// =============================================================================
// TENANT EVENTS
// =============================================================================

/** Fields present on every tenant lifecycle event. */
type TenantEventBase = {
  /** (source: docs+code) Unique tenant identifier */
  tenant_id: string;
  /** (source: docs; code sent `tenant_name` — RENAMED to canonical `name`) */
  name: string;
  /** (source: docs; code sent `tenant_slug` — RENAMED to canonical `slug`) */
  slug: string;
};

export type TenantCreatedEventData = TenantEventBase & {
  /** (source: docs) ISO timestamp of tenant creation (Tenant.createdAt) */
  created_at: string;
  /**
   * (source: docs, shape corrected) Tenant.settings is a FREEFORM Json
   * column — docs previously promised a structured settings object
   * (allow_signups, require_mfa, ...) that does not exist in the model.
   */
  settings: Record<string, unknown>;
  /** (source: docs; code sent `owner_id` — RENAMED) Optional: super-admin creation may have no owner user */
  created_by_sub?: string;
  /** (source: code) Docs missed it; optional — owner may be invite-pending */
  owner_email?: string;
};

export type TenantUpdatedEventData = TenantEventBase & {
  /** (source: docs+code) Which fields changed */
  changed_fields: string[];
  /** (source: docs, shape corrected — freeform Json, see tenant.created) */
  settings: Record<string, unknown>;
  /** (source: docs) Optional — not every emit site computes prior values */
  previous_values?: Record<string, unknown>;
  /** (source: docs) Optional — actor not threaded through every update path */
  updated_by_sub?: string;
};

export type TenantDeletedEventData = TenantEventBase & {
  /** (source: docs) ISO timestamp of deletion */
  deleted_at: string;
  /** (source: docs) Optional — actor not available on all delete paths */
  deleted_by_sub?: string;
};

/** NOTE: defined for contract completeness — the core does not currently emit tenant.suspended. */
export type TenantSuspendedEventData = TenantEventBase & {
  /** (source: docs) ISO timestamp of suspension */
  suspended_at: string;
  /** (source: docs) */
  suspended_by_sub?: string;
  /** (source: docs+code[interface]) */
  reason?: string;
};

// NOT canonical: docs' `plan` field was dropped from all tenant events —
// the Tenant model has no plan column (pure fiction, no data source).

// =============================================================================
// TENANT APP ACCESS EVENTS
// =============================================================================

/** (source: code) Prisma AccessType enum values */
export type TenantAppAccessType =
  | 'GRANTED'
  | 'INVITED'
  | 'AUTO_FREE'
  | 'AUTO_TENANT'
  | 'AUTO_OWNER';

/**
 * Fields shared by tenant.app.* events. Docs documented only
 * {tenant_id, application_id, application_name}; code has always sent the
 * richer shape below — code wins (docs were the fiction here).
 *
 * The *_slug / *_name / user_email fields are resolved via lookups at emit
 * time and are optional only for the mid-flight-deletion race; expect them
 * in practice.
 */
type TenantAppEventBase = {
  /** (source: code) */
  tenant_id: string;
  /** (source: docs+code) */
  application_id: string;
  /** (source: code) */
  tenant_slug?: string;
  /** (source: code) */
  user_email?: string;
  /** (source: docs+code) */
  application_name?: string;
  /** (source: code) */
  application_slug?: string;
};

/**
 * tenant.app.granted covers TWO grant modes (source: code — discovered at
 * emit sites, docs covered neither fully):
 *  - USER-LEVEL access grant (app-access services): user_id + access_type
 *    present, plus role fields / license_assignment_id when applicable.
 *  - TENANT-LEVEL subscription grant (license-pool service): no user —
 *    subscription_id + license_type_* + quantity_purchased present instead.
 */
export type TenantAppGrantedEventData = TenantAppEventBase & {
  /** (source: code) Present on user-level grants; absent on tenant-level subscription grants */
  user_id?: string;
  /** (source: code) How access was granted — user-level grants only */
  access_type?: TenantAppAccessType;
  /** (source: code) */
  granted_by_id?: string;
  /** (source: code) Present on explicit license-backed grants */
  license_assignment_id?: string;
  /** (source: code) Present on auto-grant paths that assign a role */
  role_id?: string;
  /** (source: code) */
  role_name?: string;
  /** (source: code) */
  role_slug?: string;
  /** (source: code — license-pool path) Tenant-level subscription grants only */
  subscription_id?: string;
  /** (source: code — license-pool path) */
  license_type_id?: string;
  /** (source: code — license-pool path) */
  license_type_name?: string;
  /** (source: code — license-pool path) */
  quantity_purchased?: number;
  /** (source: code — license-pool path) Subscription status (e.g. 'ACTIVE') */
  status?: string;
};

export type TenantAppRevokedEventData = TenantAppEventBase & {
  /** (source: code) Required — revocation is always user-level */
  user_id: string;
  /** (source: code) */
  revoked_by_id?: string;
};

// =============================================================================
// APPLICATION EVENTS
// =============================================================================

/** (source: docs+code) OAuth client configuration block */
export type ApplicationClientConfig = {
  redirect_uris: string[];
  post_logout_redirect_uris: string[];
  initiate_login_uri: string | null;
  access_token_ttl_seconds: number | null;
  refresh_token_ttl_seconds: number | null;
};

/** (source: docs+code) Licensing configuration block */
export type ApplicationLicensingInfo = {
  mode: string;
  allow_mixed: boolean;
  default_seat_count: number | null;
  auto_provision_on_signup: boolean;
  auto_grant_to_owner: boolean;
};

/** Fields present on application.created and application.updated. */
type ApplicationEventBase = {
  /** (source: docs+code) */
  application_id: string;
  /** (source: code) Always null — applications are instance-scoped */
  tenant_id: null;
  /** (source: docs+code) */
  name: string;
  /** (source: docs+code) */
  slug: string;
  /** (source: docs+code) Null when the application has no client yet */
  client_id: string | null;
  /** (source: docs+code) Application accessMode (e.g. 'AUTOMATIC') */
  application_type: string;
  /** (source: docs+code) */
  is_active: boolean;
  /** (source: docs+code) */
  description?: string | null;
};

export type ApplicationCreatedEventData = ApplicationEventBase & {
  /** (source: docs+code) ISO timestamp */
  created_at: string;
  /** (source: docs+code) First client's OAuth config */
  config: ApplicationClientConfig;
  /** (source: docs+code) */
  licensing: ApplicationLicensingInfo;
};

export type ApplicationUpdatedEventData = ApplicationEventBase & {
  /** (source: docs+code) */
  changed_fields: string[];
  /** (source: docs+code) */
  previous_values: Record<string, unknown>;
  /** (source: code; now also sent on enable/disable toggles) */
  licensing: ApplicationLicensingInfo;
  // NOT canonical: docs' `config` block was dropped from application.updated
  // — update paths don't load full client rows; config changes surface via
  // changed_fields/previous_values instead.
};

export type ApplicationDeletedEventData = {
  /** (source: docs+code) */
  application_id: string;
  /** (source: code) Always null — applications are instance-scoped */
  tenant_id: null;
  /** (source: docs+code) */
  name: string;
  /** (source: docs+code) */
  slug: string;
  /** (source: docs+code) */
  client_id: string | null;
  /** (source: docs+code) ISO timestamp */
  deleted_at: string;
};

// =============================================================================
// SSO PROVIDER EVENTS
// =============================================================================

/** Fields present on every sso.provider_* event. */
type SsoProviderEventBase = {
  /** (source: docs+code) The provider enum key (e.g. 'GOOGLE') — canonical identifier, not a row id */
  provider_id: string;
  /** (source: code) Always null — SSO providers are instance-scoped */
  tenant_id: null;
  /** (source: docs+code) Same enum key as provider_id today */
  provider_type: string;
};

export type SsoProviderAddedEventData = SsoProviderEventBase & {
  /** (source: docs+code) */
  display_name: string;
  /** (source: docs+code) */
  is_enabled: boolean;
};

export type SsoProviderUpdatedEventData = SsoProviderEventBase & {
  /** (source: docs+code) */
  changed_fields: string[];
};

export type SsoProviderRemovedEventData = SsoProviderEventBase & {
  /** (source: new) ISO timestamp — parity with deleted_at on other removal events */
  removed_at: string;
};

// =============================================================================
// BASE EVENT + UNION (mirrors the sync-events pattern)
// =============================================================================

/**
 * The wrapper SystemWebhookService POSTs to system webhook subscribers:
 * `{ event, timestamp, data }`. (Pub/Sub envelopes carry `data` unwrapped —
 * see pubsub-envelope.types.ts.)
 */
export interface BaseSystemEvent<T extends SystemEventType, D> {
  /** Event type */
  event: T;
  /** ISO 8601 timestamp of dispatch */
  timestamp: string;
  /** Event-specific data */
  data: D;
}

export type TenantCreatedSystemEvent = BaseSystemEvent<'tenant.created', TenantCreatedEventData>;
export type TenantUpdatedSystemEvent = BaseSystemEvent<'tenant.updated', TenantUpdatedEventData>;
export type TenantDeletedSystemEvent = BaseSystemEvent<'tenant.deleted', TenantDeletedEventData>;
export type TenantSuspendedSystemEvent = BaseSystemEvent<'tenant.suspended', TenantSuspendedEventData>;
export type TenantAppGrantedSystemEvent = BaseSystemEvent<'tenant.app.granted', TenantAppGrantedEventData>;
export type TenantAppRevokedSystemEvent = BaseSystemEvent<'tenant.app.revoked', TenantAppRevokedEventData>;
export type ApplicationCreatedSystemEvent = BaseSystemEvent<'application.created', ApplicationCreatedEventData>;
export type ApplicationUpdatedSystemEvent = BaseSystemEvent<'application.updated', ApplicationUpdatedEventData>;
export type ApplicationDeletedSystemEvent = BaseSystemEvent<'application.deleted', ApplicationDeletedEventData>;
export type SsoProviderAddedSystemEvent = BaseSystemEvent<'sso.provider_added', SsoProviderAddedEventData>;
export type SsoProviderUpdatedSystemEvent = BaseSystemEvent<'sso.provider_updated', SsoProviderUpdatedEventData>;
export type SsoProviderRemovedSystemEvent = BaseSystemEvent<'sso.provider_removed', SsoProviderRemovedEventData>;

/** Every system event, as a discriminated union on `event`. */
export type SystemEvent =
  | TenantCreatedSystemEvent
  | TenantUpdatedSystemEvent
  | TenantDeletedSystemEvent
  | TenantSuspendedSystemEvent
  | TenantAppGrantedSystemEvent
  | TenantAppRevokedSystemEvent
  | ApplicationCreatedSystemEvent
  | ApplicationUpdatedSystemEvent
  | ApplicationDeletedSystemEvent
  | SsoProviderAddedSystemEvent
  | SsoProviderUpdatedSystemEvent
  | SsoProviderRemovedSystemEvent;

/** Payload type for a given system event type (derived — never drifts). */
export type SystemEventDataOf<T extends SystemEventType> = Extract<
  SystemEvent,
  { event: T }
>['data'];

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isTenantSystemEvent(
  event: SystemEvent,
): event is
  | TenantCreatedSystemEvent
  | TenantUpdatedSystemEvent
  | TenantDeletedSystemEvent
  | TenantSuspendedSystemEvent {
  return event.event.startsWith('tenant.') && !event.event.startsWith('tenant.app.');
}

export function isTenantAppSystemEvent(
  event: SystemEvent,
): event is TenantAppGrantedSystemEvent | TenantAppRevokedSystemEvent {
  return event.event.startsWith('tenant.app.');
}

export function isApplicationSystemEvent(
  event: SystemEvent,
): event is
  | ApplicationCreatedSystemEvent
  | ApplicationUpdatedSystemEvent
  | ApplicationDeletedSystemEvent {
  return event.event.startsWith('application.');
}

export function isSsoProviderSystemEvent(
  event: SystemEvent,
): event is
  | SsoProviderAddedSystemEvent
  | SsoProviderUpdatedSystemEvent
  | SsoProviderRemovedSystemEvent {
  return event.event.startsWith('sso.');
}
