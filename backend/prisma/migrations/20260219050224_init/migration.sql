-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('SPA', 'MACHINE');

-- CreateEnum
CREATE TYPE "LicensingMode" AS ENUM ('FREE', 'PER_SEAT', 'TENANT_WIDE');

-- CreateEnum
CREATE TYPE "CodeChallengeMethod" AS ENUM ('S256', 'PLAIN');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LicenseTypeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('GRANTED', 'INVITED', 'AUTO_FREE', 'AUTO_TENANT', 'AUTO_OWNER');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LicenseAuditAction" AS ENUM ('GRANTED', 'REVOKED', 'CHANGED');

-- CreateEnum
CREATE TYPE "PendingSignupStatus" AS ENUM ('PENDING', 'VERIFIED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SigningKeyStatus" AS ENUM ('ACTIVE', 'PASSIVE', 'ARCHIVED', 'REVOKED');

-- CreateTable
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instance_meta" (
    "id" TEXT NOT NULL DEFAULT 'instance',
    "instanceUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'AuthVital IDP',
    "allowSignUp" BOOLEAN NOT NULL DEFAULT false,
    "autoCreateTenant" BOOLEAN NOT NULL DEFAULT true,
    "allowGenericDomains" BOOLEAN NOT NULL DEFAULT true,
    "allowAnonymousSignUp" BOOLEAN NOT NULL DEFAULT false,
    "requiredUserFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultTenantRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "single_tenant_mode" BOOLEAN NOT NULL DEFAULT false,
    "default_tenant_id" TEXT,
    "brandingName" TEXT,
    "brandingLogoUrl" TEXT,
    "brandingIconUrl" TEXT,
    "brandingPrimaryColor" TEXT,
    "brandingBackgroundColor" TEXT,
    "brandingAccentColor" TEXT,
    "brandingSupportUrl" TEXT,
    "brandingPrivacyUrl" TEXT,
    "brandingTermsUrl" TEXT,
    "initiate_login_uri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instance_api_keys" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY['instance:*']::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "display_name" TEXT,
    "given_name" TEXT,
    "family_name" TEXT,
    "middle_name" TEXT,
    "nickname" TEXT,
    "picture_url" TEXT,
    "website" TEXT,
    "gender" TEXT,
    "birthdate" TEXT,
    "zoneinfo" TEXT,
    "locale" TEXT,
    "email" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isMachine" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" "ApplicationType" NOT NULL DEFAULT 'SPA',
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "redirectUris" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postLogoutRedirectUris" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "initiate_login_uri" TEXT,
    "allowedWebOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessTokenTtl" INTEGER NOT NULL DEFAULT 3600,
    "refreshTokenTtl" INTEGER NOT NULL DEFAULT 604800,
    "brandingName" TEXT,
    "brandingLogoUrl" TEXT,
    "brandingIconUrl" TEXT,
    "brandingPrimaryColor" TEXT,
    "brandingBackgroundColor" TEXT,
    "brandingAccentColor" TEXT,
    "brandingSupportUrl" TEXT,
    "brandingPrivacyUrl" TEXT,
    "brandingTermsUrl" TEXT,
    "licensing_mode" "LicensingMode" NOT NULL DEFAULT 'FREE',
    "default_license_type_id" TEXT,
    "default_seat_count" INTEGER NOT NULL DEFAULT 5,
    "auto_provision_on_signup" BOOLEAN NOT NULL DEFAULT false,
    "auto_grant_to_owner" BOOLEAN NOT NULL DEFAULT true,
    "available_features" JSONB NOT NULL DEFAULT '[]',
    "allow_mixed_licensing" BOOLEAN NOT NULL DEFAULT false,
    "webhook_url" TEXT,
    "webhook_enabled" BOOLEAN NOT NULL DEFAULT false,
    "webhook_events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorization_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scope" TEXT,
    "state" TEXT,
    "nonce" TEXT,
    "codeChallenge" TEXT,
    "codeChallengeMethod" "CodeChallengeMethod",
    "tenantId" TEXT,
    "tenantSubdomain" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,

    CONSTRAINT "authorization_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "scope" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT,
    "tenant_subdomain" TEXT,
    "user_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "initiate_login_uri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "invitedById" TEXT,
    "consumedById" TEXT,
    "membershipId" TEXT,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membershipId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tenant_roles" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membershipId" TEXT NOT NULL,
    "tenantRoleId" TEXT NOT NULL,

    CONSTRAINT "membership_tenant_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "target_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "webhook_status" "WebhookStatus" NOT NULL DEFAULT 'PENDING',
    "webhook_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "display_price" TEXT,
    "application_id" TEXT NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "max_members" INTEGER,
    "status" "LicenseTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "license_type_id" TEXT NOT NULL,
    "quantity_purchased" INTEGER NOT NULL DEFAULT 0,
    "quantity_assigned" INTEGER NOT NULL DEFAULT 0,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "license_type_id" TEXT NOT NULL,
    "license_type_name" TEXT NOT NULL,

    CONSTRAINT "license_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_access" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "accessType" "AccessType" NOT NULL DEFAULT 'GRANTED',
    "status" "AccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "license_assignment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "user_name" TEXT,
    "application_id" TEXT NOT NULL,
    "application_name" TEXT NOT NULL,
    "license_type_id" TEXT NOT NULL,
    "license_type_name" TEXT NOT NULL,
    "action" "LicenseAuditAction" NOT NULL DEFAULT 'GRANTED',
    "previous_license_type_name" TEXT,
    "performed_by" TEXT NOT NULL,
    "performed_by_email" TEXT NOT NULL,
    "performed_by_name" TEXT,
    "membership_id" TEXT,
    "reason" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "domainName" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "tenant_name" TEXT,
    "given_name" TEXT,
    "family_name" TEXT,
    "redirectUri" TEXT,
    "applicationId" TEXT,
    "selected_license_type_id" TEXT,
    "status" "PendingSignupStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_signups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_keys" (
    "id" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'RS256',
    "status" "SigningKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signing_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_groups" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "instance_meta_instanceUuid_key" ON "instance_meta"("instanceUuid");

-- CreateIndex
CREATE INDEX "instance_api_keys_prefix_idx" ON "instance_api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_isMachine_idx" ON "users"("isMachine");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("prefix");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "applications_clientId_key" ON "applications"("clientId");

-- CreateIndex
CREATE INDEX "applications_clientId_idx" ON "applications"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_slug_key" ON "applications"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "authorization_codes_code_key" ON "authorization_codes"("code");

-- CreateIndex
CREATE INDEX "authorization_codes_code_idx" ON "authorization_codes"("code");

-- CreateIndex
CREATE INDEX "authorization_codes_userId_idx" ON "authorization_codes"("userId");

-- CreateIndex
CREATE INDEX "authorization_codes_applicationId_idx" ON "authorization_codes"("applicationId");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_application_id_idx" ON "refresh_tokens"("application_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_revoked_idx" ON "refresh_tokens"("revoked");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE INDEX "memberships_tenantId_idx" ON "memberships"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_tenantId_key" ON "memberships"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_membershipId_key" ON "invitations"("membershipId");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_tenantId_idx" ON "invitations"("tenantId");

-- CreateIndex
CREATE INDEX "invitations_clientId_idx" ON "invitations"("clientId");

-- CreateIndex
CREATE INDEX "roles_applicationId_idx" ON "roles"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_applicationId_key" ON "roles"("slug", "applicationId");

-- CreateIndex
CREATE INDEX "membership_roles_membershipId_idx" ON "membership_roles"("membershipId");

-- CreateIndex
CREATE INDEX "membership_roles_roleId_idx" ON "membership_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_roles_membershipId_roleId_key" ON "membership_roles"("membershipId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_roles_slug_key" ON "tenant_roles"("slug");

-- CreateIndex
CREATE INDEX "membership_tenant_roles_membershipId_idx" ON "membership_tenant_roles"("membershipId");

-- CreateIndex
CREATE INDEX "membership_tenant_roles_tenantRoleId_idx" ON "membership_tenant_roles"("tenantRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tenant_roles_membershipId_tenantRoleId_key" ON "membership_tenant_roles"("membershipId", "tenantRoleId");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_idx" ON "audit_logs"("targetType");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "sync_events_tenant_id_application_id_created_at_idx" ON "sync_events"("tenant_id", "application_id", "created_at");

-- CreateIndex
CREATE INDEX "sync_events_application_id_webhook_status_idx" ON "sync_events"("application_id", "webhook_status");

-- CreateIndex
CREATE INDEX "sync_events_event_type_idx" ON "sync_events"("event_type");

-- CreateIndex
CREATE INDEX "sync_events_created_at_idx" ON "sync_events"("created_at");

-- CreateIndex
CREATE INDEX "license_types_application_id_idx" ON "license_types"("application_id");

-- CreateIndex
CREATE INDEX "license_types_status_idx" ON "license_types"("status");

-- CreateIndex
CREATE UNIQUE INDEX "license_types_application_id_slug_key" ON "license_types"("application_id", "slug");

-- CreateIndex
CREATE INDEX "app_subscriptions_tenant_id_idx" ON "app_subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "app_subscriptions_application_id_idx" ON "app_subscriptions"("application_id");

-- CreateIndex
CREATE INDEX "app_subscriptions_license_type_id_idx" ON "app_subscriptions"("license_type_id");

-- CreateIndex
CREATE INDEX "app_subscriptions_status_idx" ON "app_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "app_subscriptions_tenant_id_application_id_license_type_id_key" ON "app_subscriptions"("tenant_id", "application_id", "license_type_id");

-- CreateIndex
CREATE INDEX "license_assignments_tenant_id_idx" ON "license_assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "license_assignments_user_id_idx" ON "license_assignments"("user_id");

-- CreateIndex
CREATE INDEX "license_assignments_subscription_id_idx" ON "license_assignments"("subscription_id");

-- CreateIndex
CREATE INDEX "license_assignments_application_id_idx" ON "license_assignments"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "license_assignments_tenant_id_user_id_application_id_key" ON "license_assignments"("tenant_id", "user_id", "application_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_access_license_assignment_id_key" ON "app_access"("license_assignment_id");

-- CreateIndex
CREATE INDEX "app_access_tenant_id_application_id_idx" ON "app_access"("tenant_id", "application_id");

-- CreateIndex
CREATE INDEX "app_access_user_id_idx" ON "app_access"("user_id");

-- CreateIndex
CREATE INDEX "app_access_status_idx" ON "app_access"("status");

-- CreateIndex
CREATE UNIQUE INDEX "app_access_user_id_tenant_id_application_id_key" ON "app_access"("user_id", "tenant_id", "application_id");

-- CreateIndex
CREATE INDEX "license_audit_logs_tenant_id_idx" ON "license_audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "license_audit_logs_user_id_idx" ON "license_audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "license_audit_logs_application_id_idx" ON "license_audit_logs"("application_id");

-- CreateIndex
CREATE INDEX "license_audit_logs_license_type_id_idx" ON "license_audit_logs"("license_type_id");

-- CreateIndex
CREATE INDEX "license_audit_logs_action_idx" ON "license_audit_logs"("action");

-- CreateIndex
CREATE INDEX "license_audit_logs_created_at_idx" ON "license_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "license_audit_logs_performed_by_idx" ON "license_audit_logs"("performed_by");

-- CreateIndex
CREATE INDEX "domains_tenantId_idx" ON "domains"("tenantId");

-- CreateIndex
CREATE INDEX "domains_domainName_idx" ON "domains"("domainName");

-- CreateIndex
CREATE UNIQUE INDEX "domains_domainName_tenantId_key" ON "domains"("domainName", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "pending_signups_verificationToken_key" ON "pending_signups"("verificationToken");

-- CreateIndex
CREATE INDEX "pending_signups_status_idx" ON "pending_signups"("status");

-- CreateIndex
CREATE INDEX "pending_signups_verificationToken_idx" ON "pending_signups"("verificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "pending_signups_email_key" ON "pending_signups"("email");

-- CreateIndex
CREATE UNIQUE INDEX "signing_keys_kid_key" ON "signing_keys"("kid");

-- CreateIndex
CREATE INDEX "signing_keys_status_idx" ON "signing_keys"("status");

-- CreateIndex
CREATE INDEX "signing_keys_kid_idx" ON "signing_keys"("kid");

-- CreateIndex
CREATE INDEX "groups_tenant_id_idx" ON "groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_tenant_id_slug_key" ON "groups"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "membership_groups_membership_id_idx" ON "membership_groups"("membership_id");

-- CreateIndex
CREATE INDEX "membership_groups_group_id_idx" ON "membership_groups"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_groups_membership_id_group_id_key" ON "membership_groups"("membership_id", "group_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_default_license_type_id_fkey" FOREIGN KEY ("default_license_type_id") REFERENCES "license_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_codes" ADD CONSTRAINT "authorization_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_codes" ADD CONSTRAINT "authorization_codes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_consumedById_fkey" FOREIGN KEY ("consumedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tenant_roles" ADD CONSTRAINT "membership_tenant_roles_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tenant_roles" ADD CONSTRAINT "membership_tenant_roles_tenantRoleId_fkey" FOREIGN KEY ("tenantRoleId") REFERENCES "tenant_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_types" ADD CONSTRAINT "license_types_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_subscriptions" ADD CONSTRAINT "app_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_subscriptions" ADD CONSTRAINT "app_subscriptions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_subscriptions" ADD CONSTRAINT "app_subscriptions_license_type_id_fkey" FOREIGN KEY ("license_type_id") REFERENCES "license_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "app_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_access" ADD CONSTRAINT "app_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_access" ADD CONSTRAINT "app_access_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_access" ADD CONSTRAINT "app_access_license_assignment_id_fkey" FOREIGN KEY ("license_assignment_id") REFERENCES "license_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_groups" ADD CONSTRAINT "membership_groups_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_groups" ADD CONSTRAINT "membership_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
