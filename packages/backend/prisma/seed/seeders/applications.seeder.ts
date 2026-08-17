
// =============================================================================
// APPLICATIONS SEEDER — applications, their roles, license types & licensing
// =============================================================================
// Populates ctx.appIdMap (slug -> { id, clientSecret? }) so users and
// subscriptions seeded later can resolve application slugs to ids.

import { ApplicationType, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  validateRedirectUriPatterns,
  validateSafeUrl,
  validateSafeUrls,
} from '../../../src/common/utils/url-validation.utils';
import { SALT_ROUNDS } from '../constants';
import { AppRef, SeedApplication, SeedCredential } from '../types';
import { normalizeCredentials } from '../normalize';
import { Seeder } from '../context';
import { log, logSection } from '../logger';

export async function seedApplications(
  prisma: PrismaClient,
  apps: SeedApplication[],
): Promise<Map<string, AppRef>> {
  logSection('Applications');

  // Map of slug -> { id, clientSecret } for later reference.
  // Stores the raw (unhashed) secret if it was provided or generated.
  const appIdMap = new Map<string, AppRef>();

  for (const appConfig of apps) {
    // Resolve the container's credentials, accepting BOTH the new nested shape
    // and the old flat single-credential shape (see ./normalize.ts).
    const credentials = normalizeCredentials(appConfig);

    // Container-level URLs (webhook) validated once; OAuth URLs validated
    // per-credential (covers both the nested and normalized-flat shapes).
    validateApplicationUrls(appConfig);
    for (const cred of credentials) {
      validateCredentialUrls(appConfig.slug, cred);
    }

    // Container (product) upsert — no OAuth credential fields; those live on the
    // child ApplicationClient rows created below.
    const app = await prisma.application.upsert({
      where: { slug: appConfig.slug },
      update: {
        name: appConfig.name,
        ...(appConfig.description !== undefined && { description: appConfig.description }),
        ...webhookUpsertData(appConfig),
      },
      create: {
        name: appConfig.name,
        slug: appConfig.slug,
        ...(appConfig.description !== undefined && { description: appConfig.description }),
        ...webhookUpsertData(appConfig),
      },
    });

    log('', `${app.name} (${credentials.map((c) => c.type).join(' + ')})`);

    // One ApplicationClient per credential. The MACHINE credential's raw secret
    // (if we minted/were-given one) is what we surface to the operator, so it
    // becomes the app's AppRef.clientSecret.
    let appClientSecret: string | undefined;
    for (const cred of credentials) {
      const rawSecret = await seedCredential(prisma, app.id, appConfig.slug, cred);
      if (cred.type === 'MACHINE') appClientSecret = rawSecret;
    }

    appIdMap.set(appConfig.slug, { id: app.id, clientSecret: appClientSecret });

    if (appConfig.webhook_url !== undefined || appConfig.webhook_enabled !== undefined) {
      const filter = appConfig.webhook_events?.length
        ? appConfig.webhook_events.join(', ')
        : '(all events)';
      log(
        '  ',
        `Webhook:       ${appConfig.webhook_enabled ? 'enabled' : 'disabled'} -> ${
          appConfig.webhook_url || '(none)'
        } [${filter}]`,
      );
    }

    await seedApplicationRoles(prisma, app.id, appConfig);
    await seedApplicationLicensing(prisma, app.id, appConfig);
  }

  return appIdMap;
}

/**
 * Upsert a single OAuth credential (ApplicationClient) under an app container.
 * Keyed by (applicationId, type): at most one SPA + one MACHINE per app.
 * Returns the raw client secret if a MACHINE secret was provided/generated.
 */
async function seedCredential(
  prisma: PrismaClient,
  applicationId: string,
  slug: string,
  cred: SeedCredential,
): Promise<string | undefined> {
  const type: ApplicationType = cred.type === 'MACHINE' ? 'MACHINE' : 'SPA';

  const { clientSecret, rawSecret, existing } = await resolveClientSecret(
    prisma,
    applicationId,
    cred,
    type,
  );

  // Only write a new secret when we actually minted one (never clobber an
  // existing MACHINE secret we can't reproduce the raw value for).
  const isNewSecret = clientSecret && !existing?.clientSecret;

  const client = await prisma.applicationClient.upsert({
    where: { applicationId_type: { applicationId, type } },
    update: {
      redirectUris: cred.redirect_uris ?? [],
      postLogoutRedirectUris: cred.post_logout_redirect_uris ?? [],
      allowedWebOrigins: cred.allowed_web_origins ?? [],
      ...(cred.initiate_login_uri !== undefined && {
        initiateLoginUri: cred.initiate_login_uri,
      }),
      ...(cred.access_token_ttl !== undefined && {
        accessTokenTtl: cred.access_token_ttl,
      }),
      ...(cred.refresh_token_ttl !== undefined && {
        refreshTokenTtl: cred.refresh_token_ttl,
      }),
      m2mTrustedAllTenants: cred.m2m_trusted_all_tenants ?? false,
      m2mAllowedScopes: cred.m2m_allowed_scopes ?? [],
      ...(isNewSecret && { clientSecret }),
    },
    create: {
      applicationId,
      type,
      ...(cred.client_id && { clientId: cred.client_id }),
      redirectUris: cred.redirect_uris ?? [],
      postLogoutRedirectUris: cred.post_logout_redirect_uris ?? [],
      allowedWebOrigins: cred.allowed_web_origins ?? [],
      ...(cred.initiate_login_uri && { initiateLoginUri: cred.initiate_login_uri }),
      ...(cred.access_token_ttl !== undefined && {
        accessTokenTtl: cred.access_token_ttl,
      }),
      ...(cred.refresh_token_ttl !== undefined && {
        refreshTokenTtl: cred.refresh_token_ttl,
      }),
      m2mTrustedAllTenants: cred.m2m_trusted_all_tenants ?? false,
      m2mAllowedScopes: cred.m2m_allowed_scopes ?? [],
      ...(clientSecret && { clientSecret }),
    },
  });

  log('  ', `${type} credential`);
  log('    ', `Client ID:     ${client.clientId}`);
  if (type === 'SPA') {
    log('    ', `Redirect URIs: ${(cred.redirect_uris ?? []).join(', ') || '(none)'}`);
  }
  return rawSecret;
}

/**
 * Validate container-level URL fields (currently just the webhook endpoint).
 * Per-credential OAuth URLs are checked by validateCredentialUrls so the rules
 * live in exactly one place and run once per credential (DRY).
 */
function validateApplicationUrls(appConfig: SeedApplication): void {
  if (appConfig.webhook_url) {
    // Webhook endpoints may legitimately be plain http:// on an internal
    // container network (e.g. http://bff-express:3000/webhooks), so we do NOT
    // require https here — auth is JWKS-signature based, not TLS based.
    const result = validateSafeUrl(appConfig.webhook_url, {});
    if (!result.valid) {
      throw new Error(
        `Seed validation failed for application "${appConfig.slug}" webhook_url: ${result.error}`,
      );
    }
  }
}

/**
 * Validate the OAuth URL fields on a single credential. Applies to BOTH the new
 * nested-credential shape and the old flat shape (normalize.ts folds the flat
 * fields into a synthetic credential before we get here).
 */
function validateCredentialUrls(slug: string, cred: SeedCredential): void {
  if (cred.redirect_uris?.length) {
    const result = validateRedirectUriPatterns(cred.redirect_uris);
    if (!result.valid) {
      throw new Error(
        `Seed validation failed for application "${slug}" redirect_uris: ${result.error}`,
      );
    }
  }

  if (cred.post_logout_redirect_uris?.length) {
    const result = validateRedirectUriPatterns(cred.post_logout_redirect_uris);
    if (!result.valid) {
      throw new Error(
        `Seed validation failed for application "${slug}" post_logout_redirect_uris: ${result.error}`,
      );
    }
  }

  if (cred.allowed_web_origins?.length) {
    const result = validateSafeUrls(cred.allowed_web_origins, {
      allowWildcards: false,
      allowTenantPlaceholder: true,
    });
    if (!result.valid) {
      throw new Error(
        `Seed validation failed for application "${slug}" allowed_web_origins: ${result.error}`,
      );
    }
  }

  if (cred.initiate_login_uri) {
    const result = validateSafeUrl(cred.initiate_login_uri, {
      allowTenantPlaceholder: true,
    });
    if (!result.valid) {
      throw new Error(
        `Seed validation failed for application "${slug}" initiate_login_uri: ${result.error}`,
      );
    }
  }
}

/**
 * Build the subset of Application webhook columns to upsert. Only the keys the
 * operator actually specified are emitted, so re-seeding never clobbers values
 * that were tuned elsewhere. Shared between the create + update branches so the
 * mapping lives in exactly one place (DRY).
 */
function webhookUpsertData(appConfig: SeedApplication): {
  webhookUrl?: string;
  webhookEnabled?: boolean;
  webhookEvents?: string[];
} {
  return {
    ...(appConfig.webhook_url !== undefined && { webhookUrl: appConfig.webhook_url }),
    ...(appConfig.webhook_enabled !== undefined && {
      webhookEnabled: appConfig.webhook_enabled,
    }),
    ...(appConfig.webhook_events !== undefined && {
      webhookEvents: appConfig.webhook_events,
    }),
  };
}

/**
 * Decide the client secret for a MACHINE app: keep existing, use provided, or
 * generate a fresh one. SPA apps get no secret.
 */
async function resolveClientSecret(
  prisma: PrismaClient,
  applicationId: string,
  cred: SeedCredential,
  appType: ApplicationType,
): Promise<{
  clientSecret: string | null;
  rawSecret: string | undefined;
  existing: { clientSecret: string | null } | null;
}> {
  if (appType !== 'MACHINE') {
    return { clientSecret: null, rawSecret: undefined, existing: null };
  }

  const existing = await prisma.applicationClient.findUnique({
    where: { applicationId_type: { applicationId, type: 'MACHINE' } },
    select: { clientSecret: true },
  });

  if (existing?.clientSecret) {
    // Keep existing secret - we don't know the raw value
    return { clientSecret: existing.clientSecret, rawSecret: undefined, existing };
  }

  if (cred.client_secret) {
    // Use provided client_secret from YAML
    const rawSecret = cred.client_secret;
    const clientSecret = await bcrypt.hash(rawSecret, SALT_ROUNDS);
    log('', `  Client Secret (from config): ${rawSecret}`);
    return { clientSecret, rawSecret, existing };
  }

  // Generate a random secret
  const rawSecret = `secret_${crypto.randomBytes(24).toString('base64url')}`;
  const clientSecret = await bcrypt.hash(rawSecret, SALT_ROUNDS);
  log('', `  Client Secret (SAVE THIS): ${rawSecret}`);
  return { clientSecret, rawSecret, existing };
}

/** Upsert an application's roles, enforcing a single default role. */
async function seedApplicationRoles(
  prisma: PrismaClient,
  applicationId: string,
  appConfig: SeedApplication,
): Promise<void> {
  if (!appConfig.roles?.length) {
    return;
  }

  // Validate: only one default role per app
  const defaultRoles = appConfig.roles.filter((r) => r.is_default);
  if (defaultRoles.length > 1) {
    throw new Error(
      `Application "${appConfig.slug}" has ${defaultRoles.length} roles marked is_default. Only one is allowed.`,
    );
  }

  for (const roleConfig of appConfig.roles) {
    // If setting as default, unset existing defaults first
    if (roleConfig.is_default) {
      await prisma.role.updateMany({
        where: { applicationId, isDefault: true },
        data: { isDefault: false },
      });
    }

    await prisma.role.upsert({
      where: {
        slug_applicationId: { slug: roleConfig.slug, applicationId },
      },
      update: {
        name: roleConfig.name,
        description: roleConfig.description,
        isDefault: roleConfig.is_default ?? false,
      },
      create: {
        name: roleConfig.name,
        slug: roleConfig.slug,
        description: roleConfig.description,
        applicationId,
        isDefault: roleConfig.is_default ?? false,
      },
    });

    const defaultTag = roleConfig.is_default ? ' (default)' : '';
    log('  ', `  Role: ${roleConfig.name}${defaultTag}`);
  }
}

/** Upsert license types and apply the application's licensing configuration. */
async function seedApplicationLicensing(
  prisma: PrismaClient,
  applicationId: string,
  appConfig: SeedApplication,
): Promise<void> {
  let defaultLicenseTypeId: string | undefined;

  // Always ensure license setup for proper app functioning. If no explicit
  // config, default to FREE mode with an auto-created license type.
  const licensingMode = appConfig.licensing_mode ?? 'FREE';
  const needsLicenseSetup =
    licensingMode === 'FREE' || appConfig.licensing_mode || appConfig.license_types?.length;

  if (!needsLicenseSetup) {
    return;
  }

  log('', `  Licensing Mode: ${appConfig.licensing_mode || 'FREE (default)'}`);

  if (appConfig.license_types?.length) {
    log('  ', `  Creating ${appConfig.license_types.length} license type(s):`);

    for (const ltConfig of appConfig.license_types) {
      const licenseType = await prisma.licenseType.upsert({
        where: {
          applicationId_slug: { applicationId, slug: ltConfig.slug },
        },
        update: {
          name: ltConfig.name,
          description: ltConfig.description,
          maxMembers: ltConfig.max_members,
          features: ltConfig.features,
          status: ltConfig.status ?? 'ACTIVE',
          displayOrder: ltConfig.display_order ?? 1,
        },
        create: {
          name: ltConfig.name,
          slug: ltConfig.slug,
          description: ltConfig.description,
          maxMembers: ltConfig.max_members,
          features: ltConfig.features,
          status: ltConfig.status ?? 'ACTIVE',
          displayOrder: ltConfig.display_order ?? 1,
          applicationId,
        },
      });

      // Track the first license type as default
      if (!defaultLicenseTypeId) {
        defaultLicenseTypeId = licenseType.id;
      }

      log(
        '  ',
        `    -> ${ltConfig.name} (${ltConfig.slug})${
          ltConfig.max_members ? ` [max: ${ltConfig.max_members}]` : ''
        }`,
      );
    }
  } else if (licensingMode === 'FREE') {
    // Auto-create "Free" license type for FREE mode apps
    log('  ', `  Creating default "Free" license type:`);

    const freeLicenseType = await prisma.licenseType.upsert({
      where: {
        applicationId_slug: { applicationId, slug: 'free' },
      },
      update: {
        name: 'Free',
        description: 'Free tier - all members have access',
        status: 'ACTIVE',
      },
      create: {
        name: 'Free',
        slug: 'free',
        description: 'Free tier - all members have access',
        applicationId,
        features: {},
        displayOrder: 0,
        status: 'ACTIVE',
        maxMembers: null,
      },
    });

    defaultLicenseTypeId = freeLicenseType.id;
    log('  ', `    -> Free (free) [unlimited members]`);
  }

  // Update app with licensing configuration
  const updateData: {
    licensingMode: 'FREE' | 'TENANT_WIDE' | 'PER_SEAT';
    defaultLicenseTypeId?: string;
    defaultSeatCount?: number;
    autoProvisionOnSignup?: boolean;
    autoGrantToOwner?: boolean;
  } = {
    licensingMode,
    // For FREE mode, always auto-provision and auto-grant
    ...(licensingMode === 'FREE' && {
      autoProvisionOnSignup: true,
      autoGrantToOwner: true,
    }),
  };

  if (defaultLicenseTypeId) {
    updateData.defaultLicenseTypeId = defaultLicenseTypeId;
  }

  if (appConfig.default_seat_count !== undefined) {
    updateData.defaultSeatCount = appConfig.default_seat_count;
  }

  if (appConfig.auto_provision !== undefined) {
    updateData.autoProvisionOnSignup = appConfig.auto_provision;
  }

  if (appConfig.auto_grant_to_owner !== undefined) {
    updateData.autoGrantToOwner = appConfig.auto_grant_to_owner;
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: updateData,
  });

  // Log licensing configuration
  if (appConfig.default_seat_count !== undefined) {
    log('  ', `  Default Seats: ${appConfig.default_seat_count}`);
  }
  if (appConfig.auto_provision !== undefined) {
    log('  ', `  Auto Provision: ${appConfig.auto_provision ? 'Yes' : 'No'}`);
  }
  if (appConfig.auto_grant_to_owner !== undefined) {
    log('  ', `  Auto Grant to Owner: ${appConfig.auto_grant_to_owner ? 'Yes' : 'No'}`);
  }
}

export const applicationsSeeder: Seeder = {
  name: 'applications',
  shouldRun: (ctx) => !!ctx.config.applications?.length,
  run: async (ctx) => {
    if (!ctx.config.applications?.length) return;
    const map = await seedApplications(ctx.prisma, ctx.config.applications);
    for (const [slug, ref] of map) {
      ctx.appIdMap.set(slug, ref);
    }
  },
};
