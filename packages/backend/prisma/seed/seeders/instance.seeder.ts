// =============================================================================
// INSTANCE SEEDER — instance metadata + branding
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { validateSafeUrl } from '../../../src/common/utils/url-validation.utils';
import { Seeder } from '../context';
import { log, logSection } from '../logger';
import { SeedInstance } from '../types';

export async function seedInstanceMeta(
  prisma: PrismaClient,
  config: SeedInstance,
): Promise<void> {
  logSection('Instance Configuration');

  const branding = config.branding || {};

  // Validate branding URLs for security
  const brandingUrlFields: { name: string; value: string | undefined }[] = [
    { name: 'branding.logo_url', value: branding.logo_url },
    { name: 'branding.icon_url', value: branding.icon_url },
    { name: 'branding.support_url', value: branding.support_url },
    { name: 'branding.privacy_url', value: branding.privacy_url },
    { name: 'branding.terms_url', value: branding.terms_url },
  ];

  for (const { name, value } of brandingUrlFields) {
    if (value) {
      const result = validateSafeUrl(value);
      if (!result.valid) {
        throw new Error(`Seed validation failed for instance.${name}: ${result.error}`);
      }
    }
  }

  const data = {
    name: config.name ?? 'AuthVital IDP',
    allowSignUp: config.allow_sign_up ?? true,
    autoCreateTenant: config.auto_create_tenant ?? true,
    allowGenericDomains: config.allow_generic_domains ?? true,
    allowAnonymousSignUp: config.allow_anonymous_sign_up ?? false,
    brandingName: branding.name,
    brandingLogoUrl: branding.logo_url,
    brandingIconUrl: branding.icon_url,
    brandingPrimaryColor: branding.primary_color,
    brandingBackgroundColor: branding.background_color,
    brandingAccentColor: branding.accent_color,
    brandingSupportUrl: branding.support_url,
    brandingPrivacyUrl: branding.privacy_url,
    brandingTermsUrl: branding.terms_url,
  };

  const instance = await prisma.instanceMeta.upsert({
    where: { id: 'instance' },
    update: data,
    create: { id: 'instance', ...data },
  });

  log('', `Instance: ${instance.name}`);
  log('', `Instance UUID: ${instance.instanceUuid}`);
}

export const instanceSeeder: Seeder = {
  name: 'instance',
  shouldRun: (ctx) => !!ctx.config.instance,
  run: async (ctx) => {
    if (ctx.config.instance) {
      await seedInstanceMeta(ctx.prisma, ctx.config.instance);
    }
  },
};
