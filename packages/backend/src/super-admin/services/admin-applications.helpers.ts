import { BadRequestException } from '@nestjs/common';
import type {
  ApplicationCreatedEventData,
  ApplicationDeletedEventData,
  ApplicationLicensingInfo,
  ApplicationUpdatedEventData,
} from '@authvital/shared';
import { validateSafeUrl } from '../../common/utils/url-validation.utils';

// ===========================================================================
// ADMIN APPLICATIONS — PURE HELPERS
// ===========================================================================
// Behavior-preserving helpers extracted from AdminApplicationsService to keep
// the service focused on orchestration/DI. These are plain functions (no DI):
//   - the Prisma include shape reused by list/detail reads
//   - the container -> AppWithClients DTO mapper
//   - branding/webhook URL validation (shared by create + update)
//   - webhook payload builders (pure object construction; dispatch stays in
//     the service so all side-effects/error handling are unchanged)
// ===========================================================================

// Include shape reused by getApplications (list) and getApplication (detail).
export const APP_INCLUDE = {
  clients: { orderBy: { createdAt: 'asc' as const } },
  _count: { select: { roles: true, licenseTypes: true } },
  roles: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isDefault: true,
    },
    orderBy: { name: 'asc' as const },
  },
  licenseTypes: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      features: true,
      displayOrder: true,
    },
    orderBy: { displayOrder: 'asc' as const },
  },
};

/**
 * Map a loaded Application (+clients/roles/licenseTypes) to the container-model
 * AppWithClients shape. Credentials are exposed EXPLICITLY as a clients[]
 * array — never flattened to a single "sole client" (app-client-split).
 *
 * `mapClient` maps a raw client row to its public shape
 * (AdminApplicationClientsService.toPublicClient).
 */
export function mapAppWithClients(app: any, mapClient: (c: any) => any) {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    description: app.description,
    isActive: app.isActive,
    licensingMode: app.licensingMode,
    accessMode: app.accessMode,
    defaultLicenseTypeId: app.defaultLicenseTypeId,
    defaultSeatCount: app.defaultSeatCount,
    autoProvisionOnSignup: app.autoProvisionOnSignup,
    autoGrantToOwner: app.autoGrantToOwner,
    availableFeatures: app.availableFeatures,
    allowMixedLicensing: app.allowMixedLicensing,
    webhookUrl: app.webhookUrl,
    webhookEnabled: app.webhookEnabled,
    webhookEvents: app.webhookEvents,
    brandingName: app.brandingName,
    brandingLogoUrl: app.brandingLogoUrl,
    brandingIconUrl: app.brandingIconUrl,
    brandingPrimaryColor: app.brandingPrimaryColor,
    brandingBackgroundColor: app.brandingBackgroundColor,
    brandingAccentColor: app.brandingAccentColor,
    brandingSupportUrl: app.brandingSupportUrl,
    brandingPrivacyUrl: app.brandingPrivacyUrl,
    brandingTermsUrl: app.brandingTermsUrl,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    clients: (app.clients ?? []).map((c: any) => mapClient(c)),
    roles: (app.roles ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      isDefault: r.isDefault,
    })),
    licenseTypes: (app.licenseTypes ?? []).map((lt: any) => ({
      id: lt.id,
      name: lt.name,
      slug: lt.slug,
      status: lt.status,
      features: lt.features,
      displayOrder: lt.displayOrder,
    })),
    roleCount: app._count?.roles,
    licenseTypeCount: app._count?.licenseTypes,
  };
}

/**
 * Validate a set of branding/webhook URL fields for SSRF-safety. Throws a
 * BadRequestException on the first invalid value (identical behavior to the
 * inline loops it replaces).
 */
export function validateBrandingUrls(
  fields: { name: string; value: string | null | undefined }[],
): void {
  for (const { name: _name, value } of fields) {
    if (value) {
      const result = validateSafeUrl(value);
      if (!result.valid) {
        throw new BadRequestException(result.error);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Webhook payload builders (pure). Return types are the CANONICAL contracts
// from @authvital/shared (system-events.types.ts) — compile-time enforced.
// ---------------------------------------------------------------------------

/** Licensing block shared by created/updated/status payloads (DRY). */
function buildLicensingInfo(app: any): ApplicationLicensingInfo {
  return {
    mode: app.licensingMode,
    allow_mixed: app.allowMixedLicensing,
    default_seat_count: app.defaultSeatCount ?? null,
    auto_provision_on_signup: app.autoProvisionOnSignup,
    auto_grant_to_owner: app.autoGrantToOwner,
  };
}

export function buildApplicationCreatedPayload(
  app: any,
  client: any,
): ApplicationCreatedEventData {
  return {
    application_id: app.id,
    tenant_id: null,
    name: app.name,
    description: app.description,
    slug: app.slug,
    client_id: client?.clientId ?? null,
    application_type: app.accessMode,
    is_active: true,
    created_at: app.createdAt.toISOString(),
    config: {
      redirect_uris: client?.redirectUris ?? [],
      post_logout_redirect_uris: client?.postLogoutRedirectUris ?? [],
      initiate_login_uri: client?.initiateLoginUri ?? null,
      access_token_ttl_seconds: client?.accessTokenTtl ?? null,
      refresh_token_ttl_seconds: client?.refreshTokenTtl ?? null,
    },
    licensing: buildLicensingInfo(app),
  };
}

export function buildApplicationUpdatedPayload(params: {
  applicationId: string;
  result: any;
  clientId: string | undefined;
  changedFields: string[];
  previousValues: Record<string, unknown>;
}): ApplicationUpdatedEventData {
  const { applicationId, result, clientId, changedFields, previousValues } = params;
  return {
    application_id: applicationId,
    tenant_id: null,
    name: result.name,
    description: result.description,
    slug: result.slug,
    client_id: clientId ?? null,
    application_type: result.accessMode,
    is_active: result.isActive,
    changed_fields: changedFields,
    previous_values: previousValues,
    licensing: buildLicensingInfo(result),
  };
}

/**
 * application.updated payload for the enable/disable toggles. `source` is the
 * application row whose name/description/slug/accessMode are reported;
 * `isActive` is the new state and `previous_values` is derived as its inverse.
 */
export function buildApplicationStatusChangedPayload(
  source: any,
  clientId: string | undefined,
  isActive: boolean,
): ApplicationUpdatedEventData {
  return {
    application_id: source.id,
    tenant_id: null,
    name: source.name,
    description: source.description,
    slug: source.slug,
    client_id: clientId ?? null,
    application_type: source.accessMode,
    is_active: isActive,
    changed_fields: ['is_active'],
    previous_values: { is_active: !isActive },
    // Canonical requires licensing on every application.updated — the full
    // application row is available on both enable/disable paths.
    licensing: buildLicensingInfo(source),
  };
}

export function buildApplicationDeletedPayload(
  app: any,
  applicationId: string,
  clientId: string | undefined,
): ApplicationDeletedEventData {
  return {
    application_id: applicationId,
    tenant_id: null,
    name: app.name,
    slug: app.slug,
    client_id: clientId ?? null,
    deleted_at: new Date().toISOString(),
  };
}
