import { PrismaClient, ApplicationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  validateSafeUrl,
  validateSafeUrls,
  validateRedirectUriPatterns,
} from '../src/common/utils/url-validation.utils';

// =============================================================================
// TYPES — Shape of the YAML config
// =============================================================================

export interface SeedBranding {
  name?: string;
  logo_url?: string;
  icon_url?: string;
  primary_color?: string;
  background_color?: string;
  accent_color?: string;
  support_url?: string;
  privacy_url?: string;
  terms_url?: string;
}

export interface SeedInstance {
  name?: string;
  allow_sign_up?: boolean;
  auto_create_tenant?: boolean;
  allow_generic_domains?: boolean;
  allow_anonymous_sign_up?: boolean;
  branding?: SeedBranding;
}

export interface SeedSuperAdmin {
  email: string;
  password: string;
  display_name?: string;
}

export interface SeedRole {
  name: string;
  slug: string;
  description?: string;
  is_default?: boolean;
}

export interface SeedLicenseType {
  name: string;
  slug: string;
  description?: string;
  max_members?: number | null;
  features?: Record<string, boolean>;
  status?: 'ACTIVE' | 'DRAFT' | 'HIDDEN';
  display_order?: number;
}

export interface SeedApplication {
  name: string;
  slug: string;
  type?: 'SPA' | 'MACHINE';
  client_id?: string;
  client_secret?: string;
  redirect_uris?: string[];
  post_logout_redirect_uris?: string[];
  allowed_web_origins?: string[];
  initiate_login_uri?: string;
  access_token_ttl?: number;
  refresh_token_ttl?: number;
  roles?: SeedRole[];

  // NEW: Licensing configuration
  license_types?: SeedLicenseType[];
  licensing_mode?: 'FREE' | 'TENANT_WIDE' | 'PER_SEAT';
  default_seat_count?: number;
  auto_provision?: boolean;
  auto_grant_to_owner?: boolean;
}

export interface SeedTenant {
  id?: string;  // Optional explicit ID
  name: string;
  slug: string;
}

export interface SeedMembershipAppRoles {
  [appSlug: string]: string[];
}

export interface SeedMembership {
  tenant: string; // tenant slug
  tenant_role: 'owner' | 'admin' | 'member';
  app_roles?: SeedMembershipAppRoles;
}

export interface SeedUser {
  email: string;
  password: string;
  given_name?: string;
  family_name?: string;
  display_name?: string;
  phone?: string;
  memberships?: SeedMembership[];
}

export interface SeedConfig {
  instance?: SeedInstance;
  super_admin?: SeedSuperAdmin;
  applications?: SeedApplication[];
  tenants?: SeedTenant[];
  users?: SeedUser[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SALT_ROUNDS = 12;

const SYSTEM_TENANT_ROLES = [
  {
    name: 'Owner',
    slug: 'owner',
    description: 'Full control over the tenant. Cannot be removed if last owner.',
    permissions: ['tenant:*'],
  },
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Operational management of the tenant.',
    permissions: [
      'tenant:view',
      'tenant:manage',
      'members:view',
      'members:invite',
      'members:remove',
      'members:manage-roles',
      'licenses:view',
      'licenses:manage',
      'service-accounts:view',
      'service-accounts:manage',
      'domains:view',
      'domains:manage',
      'billing:view',
      'app-access:view',
      'app-access:manage',
      'tenant:sso:manage',
    ],
  },
  {
    name: 'Member',
    slug: 'member',
    description: 'Standard tenant membership with minimal permissions.',
    permissions: [
      'tenant:view',
      'members:view',
      'licenses:view',
      'app-access:view',
    ],
  },
];

// =============================================================================
// HELPERS
// =============================================================================

function log(emoji: string, message: string) {
  console.log(`${emoji}  ${message}`);
}

function logSection(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

/**
 * Resolve the YAML config file path.
 * Priority: seed.config.yaml (user copy) > seed.config.example.yaml (template)
 */
export function resolveConfigPath(): string | null {
  const dir = process.cwd(); // Root directory
  const candidates = ['seed.config.yaml', 'seed.config.example.yaml'];

  for (const file of candidates) {
    const filePath = path.join(dir, file);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

/**
 * Load and parse the YAML config file.
 */
export function loadConfig(filePath: string): SeedConfig {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const config = yaml.load(raw) as SeedConfig;

  if (!config || typeof config !== 'object') {
    throw new Error(`Invalid YAML config: expected an object, got ${typeof config}`);
  }

  return config;
}

// =============================================================================
// INDIVIDUAL SEED FUNCTIONS (exported for granular use)
// =============================================================================

export async function seedInstanceMeta(prisma: PrismaClient, config: SeedInstance) {
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

  log('🏢', `Instance: ${instance.name}`);
  log('🔑', `Instance UUID: ${instance.instanceUuid}`);
}

export async function seedSystemTenantRoles(prisma: PrismaClient) {
  logSection('System Tenant Roles');

  for (const roleData of SYSTEM_TENANT_ROLES) {
    await prisma.tenantRole.upsert({
      where: { slug: roleData.slug },
      update: {
        name: roleData.name,
        description: roleData.description,
        permissions: roleData.permissions,
        isSystem: true,
      },
      create: {
        name: roleData.name,
        slug: roleData.slug,
        description: roleData.description,
        permissions: roleData.permissions,
        isSystem: true,
      },
    });
    log('🛡️', `${roleData.name} (${roleData.permissions.length} permissions)`);
  }
}

export async function seedSuperAdmin(prisma: PrismaClient, config: SeedSuperAdmin) {
  logSection('Super Admin');

  const passwordHash = await bcrypt.hash(config.password, SALT_ROUNDS);

  await prisma.superAdmin.upsert({
    where: { email: config.email.toLowerCase() },
    update: {
      passwordHash,
      displayName: config.display_name ?? 'System Administrator',
    },
    create: {
      email: config.email.toLowerCase(),
      passwordHash,
      displayName: config.display_name ?? 'System Administrator',
    },
  });

  log('👤', `Email:    ${config.email}`);
  log('🔐', `Password: ${config.password}`);
}

export async function seedApplications(
  prisma: PrismaClient,
  apps: SeedApplication[],
): Promise<Map<string, { id: string; clientSecret?: string }>> {
  logSection('Applications');

  // Map of slug → { id, clientSecret } for later reference
  // Stores the raw (unhashed) secret if it was provided or generated
  const appIdMap = new Map<string, { id: string; clientSecret?: string }>();

  for (const appConfig of apps) {
    const appType: ApplicationType =
      appConfig.type === 'MACHINE' ? 'MACHINE' : 'SPA';

    // Validate application URLs for security (before database upsert)
    if (appConfig.redirect_uris?.length) {
      const result = validateRedirectUriPatterns(appConfig.redirect_uris);
      if (!result.valid) {
        throw new Error(`Seed validation failed for application "${appConfig.slug}" redirect_uris: ${result.error}`);
      }
    }

    if (appConfig.post_logout_redirect_uris?.length) {
      const result = validateRedirectUriPatterns(appConfig.post_logout_redirect_uris);
      if (!result.valid) {
        throw new Error(`Seed validation failed for application "${appConfig.slug}" post_logout_redirect_uris: ${result.error}`);
      }
    }

    if (appConfig.allowed_web_origins?.length) {
      const result = validateSafeUrls(appConfig.allowed_web_origins, { allowWildcards: false, allowTenantPlaceholder: true });
      if (!result.valid) {
        throw new Error(`Seed validation failed for application \"${appConfig.slug}\" allowed_web_origins: ${result.error}`);
      }
    }

    if (appConfig.initiate_login_uri) {
      const result = validateSafeUrl(appConfig.initiate_login_uri, { allowTenantPlaceholder: true });
      if (!result.valid) {
        throw new Error(`Seed validation failed for application "${appConfig.slug}" initiate_login_uri: ${result.error}`);
      }
    }

    // Determine client secret for MACHINE apps
    let clientSecret: string | null = null;
    let rawSecret: string | undefined = undefined;
    let existing: { clientSecret: string | null } | null = null;

    if (appType === 'MACHINE') {
      // Check if existing app already has a secret
      existing = await prisma.application.findUnique({
        where: { slug: appConfig.slug },
        select: { clientSecret: true },
      });

      if (existing?.clientSecret) {
        // Keep existing secret - we don't know the raw value
        clientSecret = existing.clientSecret;
      } else if (appConfig.client_secret) {
        // Use provided client_secret from YAML
        rawSecret = appConfig.client_secret;
        clientSecret = await bcrypt.hash(rawSecret, SALT_ROUNDS);
        log('🔑', `  Client Secret (from config): ${rawSecret}`);
      } else {
        // Generate a random secret
        rawSecret = `secret_${crypto.randomBytes(24).toString('base64url')}`;
        clientSecret = await bcrypt.hash(rawSecret, SALT_ROUNDS);
        log('🔑', `  Client Secret (SAVE THIS): ${rawSecret}`);
      }
    }

    // Track whether we generated a new secret (for SPA→MACHINE conversion or new apps)
    const isNewSecret = clientSecret && !existing?.clientSecret;

    // Prepare client_id if provided (only for new apps)
    const clientId = appConfig.client_id;

    const app = await prisma.application.upsert({
      where: { slug: appConfig.slug },
      update: {
        name: appConfig.name,
        type: appType,
        redirectUris: appConfig.redirect_uris ?? [],
        postLogoutRedirectUris: appConfig.post_logout_redirect_uris ?? [],
        allowedWebOrigins: appConfig.allowed_web_origins ?? [],
        ...(appConfig.initiate_login_uri !== undefined && { initiateLoginUri: appConfig.initiate_login_uri }),
        ...(appConfig.access_token_ttl !== undefined && { accessTokenTtl: appConfig.access_token_ttl }),
        ...(appConfig.refresh_token_ttl !== undefined && { refreshTokenTtl: appConfig.refresh_token_ttl }),
        ...(isNewSecret && { clientSecret }),
      },
      create: {
        name: appConfig.name,
        slug: appConfig.slug,
        type: appType,
        ...(clientId && { clientId }),
        redirectUris: appConfig.redirect_uris ?? [],
        postLogoutRedirectUris: appConfig.post_logout_redirect_uris ?? [],
        allowedWebOrigins: appConfig.allowed_web_origins ?? [],
        ...(appConfig.initiate_login_uri && { initiateLoginUri: appConfig.initiate_login_uri }),
        ...(appConfig.access_token_ttl !== undefined && { accessTokenTtl: appConfig.access_token_ttl }),
        ...(appConfig.refresh_token_ttl !== undefined && { refreshTokenTtl: appConfig.refresh_token_ttl }),
        ...(clientSecret && { clientSecret }),
      },
    });

    appIdMap.set(appConfig.slug, { id: app.id, clientSecret: rawSecret });

    log('📱', `${app.name} (${appType})`);
    log('  ', `Client ID:     ${app.clientId}`);
    log('  ', `Redirect URIs: ${(appConfig.redirect_uris ?? []).join(', ') || '(none)'}`);

    // Seed application roles
    if (appConfig.roles?.length) {
      // Validate: only one default role per app
      const defaultRoles = appConfig.roles.filter(r => r.is_default);
      if (defaultRoles.length > 1) {
        throw new Error(
          `Application "${appConfig.slug}" has ${defaultRoles.length} roles marked is_default. Only one is allowed.`
        );
      }

      for (const roleConfig of appConfig.roles) {
        // If setting as default, unset existing defaults first
        if (roleConfig.is_default) {
          await prisma.role.updateMany({
            where: { applicationId: app.id, isDefault: true },
            data: { isDefault: false },
          });
        }

        await prisma.role.upsert({
          where: {
            slug_applicationId: {
              slug: roleConfig.slug,
              applicationId: app.id,
            },
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
            applicationId: app.id,
            isDefault: roleConfig.is_default ?? false,
          },
        });

        const defaultTag = roleConfig.is_default ? ' (default)' : '';
        log('  ', `  Role: ${roleConfig.name}${defaultTag}`);
      }
    }

    // Seed license types and licensing configuration
    let defaultLicenseTypeId: string | undefined;

    // Always ensure license setup for proper app functioning
    // If no explicit config, default to FREE mode with auto-created license type
    const licensingMode = appConfig.licensing_mode ?? 'FREE';
    const needsLicenseSetup = licensingMode === 'FREE' || appConfig.licensing_mode || appConfig.license_types?.length;

    if (needsLicenseSetup) {
      log('📋', `  Licensing Mode: ${appConfig.licensing_mode || 'FREE (default)'}`);

      // If license_types provided, create them
      if (appConfig.license_types?.length) {
        log('  ', `  Creating ${appConfig.license_types.length} license type(s):`);

        for (const ltConfig of appConfig.license_types) {
          // Upsert license type
          const licenseType = await prisma.licenseType.upsert({
            where: {
              applicationId_slug: {
                applicationId: app.id,
                slug: ltConfig.slug,
              },
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
              applicationId: app.id,
            },
          });

          // Track the first license type as default
          if (!defaultLicenseTypeId) {
            defaultLicenseTypeId = licenseType.id;
          }

          log('  ', `    → ${ltConfig.name} (${ltConfig.slug})${ltConfig.max_members ? ` [max: ${ltConfig.max_members}]` : ''}`);
        }
      } else if (licensingMode === 'FREE') {
        // Auto-create "Free" license type for FREE mode apps
        log('  ', `  Creating default "Free" license type:`);

        const freeLicenseType = await prisma.licenseType.upsert({
          where: {
            applicationId_slug: {
              applicationId: app.id,
              slug: 'free',
            },
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
            applicationId: app.id,
            features: {},
            displayOrder: 0,
            status: 'ACTIVE',
            maxMembers: null,
          },
        });

        defaultLicenseTypeId = freeLicenseType.id;
        log('  ', `    → Free (free) [unlimited members]`);
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
        where: { id: app.id },
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
  }

  return appIdMap;
}

export async function seedTenants(
  prisma: PrismaClient,
  tenants: SeedTenant[],
): Promise<Map<string, string>> {
  logSection('Tenants');

  // Map of slug → tenant.id
  const tenantIdMap = new Map<string, string>();

  for (const tenantConfig of tenants) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: tenantConfig.slug },
      update: {
        name: tenantConfig.name,
      },
      create: {
        ...(tenantConfig.id && { id: tenantConfig.id }),  // Use explicit ID if provided
        name: tenantConfig.name,
        slug: tenantConfig.slug,
      },
    });

    tenantIdMap.set(tenantConfig.slug, tenant.id);
    const idDisplay = tenantConfig.id ? ` [id: ${tenant.id}]` : '';
    log('🏠', `${tenant.name} (${tenant.slug})${idDisplay}`);
  }

  return tenantIdMap;
}

export async function seedUsers(
  prisma: PrismaClient,
  users: SeedUser[],
  tenantIdMap: Map<string, string>,
  appIdMap: Map<string, { id: string; clientSecret?: string }>,
) {
  logSection('Users & Memberships');

  for (const userConfig of users) {
    const email = userConfig.email.toLowerCase();
    const passwordHash = await bcrypt.hash(userConfig.password, SALT_ROUNDS);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        givenName: userConfig.given_name,
        familyName: userConfig.family_name,
        displayName: userConfig.display_name,
        phone: userConfig.phone,
        emailVerified: true,
      },
      create: {
        email,
        passwordHash,
        givenName: userConfig.given_name,
        familyName: userConfig.family_name,
        displayName: userConfig.display_name,
        phone: userConfig.phone,
        emailVerified: true,
      },
    });

    const displayName = [userConfig.given_name, userConfig.family_name]
      .filter(Boolean)
      .join(' ') || email;

    log('👤', `${displayName} <${email}> — password: ${userConfig.password}`);

    // Process memberships
    if (userConfig.memberships?.length) {
      for (const membershipConfig of userConfig.memberships) {
        const tenantId = tenantIdMap.get(membershipConfig.tenant);
        if (!tenantId) {
          console.warn(`   ⚠️  Skipping membership: tenant "${membershipConfig.tenant}" not found. Available: ${Array.from(tenantIdMap.keys()).join(', ')}`);
          continue;
        }

        // Upsert membership
        const membership = await prisma.membership.upsert({
          where: {
            userId_tenantId: {
              userId: user.id,
              tenantId,
            },
          },
          update: {
            status: 'ACTIVE',
          },
          create: {
            userId: user.id,
            tenantId,
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        });

        log('  ', `  ↳ ${membershipConfig.tenant} (${membershipConfig.tenant_role}) - membership: ${membership.id.substring(0, 8)}...`);

        // Assign tenant role
        const tenantRole = await prisma.tenantRole.findUnique({
          where: { slug: membershipConfig.tenant_role },
        });

        if (tenantRole) {
          await prisma.membershipTenantRole.upsert({
            where: {
              membershipId_tenantRoleId: {
                membershipId: membership.id,
                tenantRoleId: tenantRole.id,
              },
            },
            update: {},
            create: {
              membershipId: membership.id,
              tenantRoleId: tenantRole.id,
            },
          });
        } else {
          const availableRoles = await prisma.tenantRole.findMany({ select: { slug: true } });
          console.warn(`   ⚠️  Tenant role "${membershipConfig.tenant_role}" not found. Available: ${availableRoles.map(r => r.slug).join(', ')}`);
        }

        // Assign app roles
        if (membershipConfig.app_roles) {
          for (const [appSlug, roleSlugs] of Object.entries(membershipConfig.app_roles)) {
            const appData = appIdMap.get(appSlug);
            if (!appData) {
              console.warn(`   ⚠️  Skipping app roles: application "${appSlug}" not found`);
              continue;
            }

            // Ensure app access exists for this user+tenant+app
            await prisma.appAccess.upsert({
              where: {
                userId_tenantId_applicationId: {
                  userId: user.id,
                  tenantId,
                  applicationId: appData.id,
                },
              },
              update: {
                status: 'ACTIVE',
              },
              create: {
                userId: user.id,
                tenantId,
                applicationId: appData.id,
                accessType: 'GRANTED',
                status: 'ACTIVE',
              },
            });

            log('  ', `    → AppAccess: ${appSlug} = ACTIVE`);

            for (const roleSlug of roleSlugs) {
              const role = await prisma.role.findUnique({
                where: {
                  slug_applicationId: {
                    slug: roleSlug,
                    applicationId: appData.id,
                  },
                },
              });

              if (role) {
                await prisma.membershipRole.upsert({
                  where: {
                    membershipId_roleId: {
                      membershipId: membership.id,
                      roleId: role.id,
                    },
                  },
                  update: {},
                  create: {
                    membershipId: membership.id,
                    roleId: role.id,
                  },
                });
                log('  ', `    → ${appSlug}: ${roleSlug}`);
              } else {
                console.warn(`   ⚠️  Role "${roleSlug}" not found for app "${appSlug}"`);
              }
            }
          }
        }
      }
    }
  }
}

// =============================================================================
// MAIN — Entry point
// =============================================================================

/**
 * Seed database from YAML configuration.
 * 
 * @param skipSuperAdmin - If true, skips the super_admin seeding section.
 *                        Useful when bootstrap already handled super admin creation.
 * @returns true if YAML config was found and processed, false if no config found
 */
export async function seedFromYaml(skipSuperAdmin = false): Promise<boolean> {
  const configPath = resolveConfigPath();

  if (!configPath) {
    return false; // No YAML config found, caller should fall back
  }

  const fileName = path.basename(configPath);
  console.log('\n' + '='.repeat(60));
  console.log('  🌱 AuthVital YAML Seed');
  console.log('  ' + '─'.repeat(56));
  console.log(`  Config: ${fileName}`);
  console.log('='.repeat(60));

  const config = loadConfig(configPath);
  const prisma = new PrismaClient();

  try {
    // 1. Instance configuration
    if (config.instance) {
      await seedInstanceMeta(prisma, config.instance);
    }

    // 2. System tenant roles (always — required for memberships)
    await seedSystemTenantRoles(prisma);

    // 3. Super admin (unless skipped)
    if (!skipSuperAdmin && config.super_admin) {
      await seedSuperAdmin(prisma, config.super_admin);
    }

    // 4. Applications + roles
    const appIdMap = config.applications?.length
      ? await seedApplications(prisma, config.applications)
      : new Map<string, { id: string; clientSecret?: string }>();

    // 5. Tenants
    const tenantIdMap = config.tenants?.length
      ? await seedTenants(prisma, config.tenants)
      : new Map<string, string>();

    // 6. Users + memberships + role assignments
    if (config.users?.length) {
      await seedUsers(prisma, config.users, tenantIdMap, appIdMap);
    }

    // Summary
    logSection('Seed Complete ✅');

    if (config.super_admin && !skipSuperAdmin) {
      log('🔐', `Admin Panel:  /admin/login`);
      log('  ', `Email:        ${config.super_admin.email}`);
      log('  ', `Password:     ${config.super_admin.password}`);
    }

    if (config.applications?.length) {
      console.log('');
      log('📱', 'Applications:');
      for (const app of config.applications) {
        const appData = appIdMap.get(app.slug);
        if (appData) {
          const dbApp = await prisma.application.findUnique({
            where: { id: appData.id },
            select: { clientId: true, type: true },
          });
          let appLine = `  ${app.name}: client_id=${dbApp?.clientId}`;
          if (dbApp?.type === 'MACHINE') {
            // Show the secret if we have it (provided or generated)
            const secretToShow = appData.clientSecret || app.client_secret || '(existing - see above logs)';
            appLine += `, client_secret=${secretToShow}`;
          }
          log('  ', appLine);
        }
      }
    }

    if (config.users?.length) {
      console.log('');
      log('👤', 'Users (all passwords shown in output above)');
    }

    console.log('\n' + '='.repeat(60) + '\n');

    return true;
  } finally {
    await prisma.$disconnect();
  }
}
