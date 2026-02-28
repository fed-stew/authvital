-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('SPA', 'MACHINE');

-- CreateEnum
CREATE TYPE "LicensingMode" AS ENUM ('FREE', 'PER_SEAT', 'TENANT_WIDE');

-- CreateEnum
CREATE TYPE "AccessMode" AS ENUM ('AUTOMATIC', 'MANUAL_AUTO_GRANT', 'MANUAL_NO_DEFAULT', 'DISABLED');

-- CreateEnum
CREATE TYPE "CodeChallengeMethod" AS ENUM ('S256', 'PLAIN');

-- CreateEnum
CREATE TYPE "SigningKeyStatus" AS ENUM ('ACTIVE', 'PASSIVE', 'ARCHIVED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SsoProviderType" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MfaPolicy" AS ENUM ('DISABLED', 'OPTIONAL', 'ENCOURAGED', 'REQUIRED');

-- CreateEnum
CREATE TYPE "PendingSignupStatus" AS ENUM ('PENDING', 'VERIFIED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LicenseTypeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('GRANTED', 'INVITED', 'AUTO_FREE', 'AUTO_TENANT', 'AUTO_OWNER');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LicenseAuditAction" AS ENUM ('GRANTED', 'REVOKED', 'CHANGED');

-- CreateTable
CREATE TABLE "super_admins" (
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
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "mfa_backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mfa_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sso_links" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "raw_profile" JSONB,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "admin_sso_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instance_meta" (
    "id" TEXT NOT NULL DEFAULT 'instance',
    "instance_uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'AuthVital IDP',
    "allow_sign_up" BOOLEAN NOT NULL DEFAULT false,
    "auto_create_tenant" BOOLEAN NOT NULL DEFAULT true,
    "allow_generic_domains" BOOLEAN NOT NULL DEFAULT true,
    "allow_anonymous_sign_up" BOOLEAN NOT NULL DEFAULT false,
    "required_user_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "default_tenant_role_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "single_tenant_mode" BOOLEAN NOT NULL DEFAULT false,
    "default_tenant_id" TEXT,
    "branding_name" TEXT,
    "branding_logo_url" TEXT,
    "branding_icon_url" TEXT,
    "branding_primary_color" TEXT,
    "branding_background_color" TEXT,
    "branding_accent_color" TEXT,
    "branding_support_url" TEXT,
    "branding_privacy_url" TEXT,
    "branding_terms_url" TEXT,
    "initiate_login_uri" TEXT,
    "super_admin_mfa_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instance_api_keys" (
    "id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY['instance:*']::TEXT[],
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_webhooks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "headers" JSONB,
    "last_triggered_at" TIMESTAMP(3),
    "last_status" INTEGER,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" INTEGER,
    "response" TEXT,
    "duration" INTEGER,
    "error" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_webhook_deliveries_pkey" PRIMARY KEY ("id")
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
    "password_hash" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "mfa_backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mfa_verified_at" TIMESTAMP(3),
    "is_machine" BOOLEAN NOT NULL DEFAULT false,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "password_reset_token" TEXT,
    "password_reset_expires" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" "ApplicationType" NOT NULL DEFAULT 'SPA',
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT,
    "redirect_uris" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "post_logout_redirect_uris" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "initiate_login_uri" TEXT,
    "allowed_web_origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "access_token_ttl" INTEGER NOT NULL DEFAULT 3600,
    "refresh_token_ttl" INTEGER NOT NULL DEFAULT 604800,
    "branding_name" TEXT,
    "branding_logo_url" TEXT,
    "branding_icon_url" TEXT,
    "branding_primary_color" TEXT,
    "branding_background_color" TEXT,
    "branding_accent_color" TEXT,
    "branding_support_url" TEXT,
    "branding_privacy_url" TEXT,
    "branding_terms_url" TEXT,
    "licensing_mode" "LicensingMode" NOT NULL DEFAULT 'FREE',
    "default_license_type_id" TEXT,
    "default_seat_count" INTEGER NOT NULL DEFAULT 5,
    "auto_provision_on_signup" BOOLEAN NOT NULL DEFAULT false,
    "auto_grant_to_owner" BOOLEAN NOT NULL DEFAULT true,
    "available_features" JSONB NOT NULL DEFAULT '[]',
    "allow_mixed_licensing" BOOLEAN NOT NULL DEFAULT false,
    "access_mode" "AccessMode" NOT NULL DEFAULT 'AUTOMATIC',
    "webhook_url" TEXT,
    "webhook_enabled" BOOLEAN NOT NULL DEFAULT false,
    "webhook_events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorization_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "scope" TEXT,
    "state" TEXT,
    "nonce" TEXT,
    "code_challenge" TEXT,
    "code_challenge_method" "CodeChallengeMethod",
    "tenant_id" TEXT,
    "tenant_subdomain" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,

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
CREATE TABLE "signing_keys" (
    "id" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'RS256',
    "status" "SigningKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signing_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_providers" (
    "id" TEXT NOT NULL,
    "provider" "SsoProviderType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "client_id" TEXT NOT NULL,
    "client_secret_enc" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowed_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "auto_create_user" BOOLEAN NOT NULL DEFAULT true,
    "auto_link_existing" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_sso_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" "SsoProviderType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "client_id" TEXT,
    "client_secret_enc" TEXT,
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "allowed_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_sso_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sso_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "SsoProviderType" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "raw_profile" JSONB,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sso_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "initiate_login_uri" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "mfa_policy" "MfaPolicy" NOT NULL DEFAULT 'OPTIONAL',
    "mfa_grace_period_days" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT,
    "invited_by_id" TEXT,
    "consumed_by_id" TEXT,
    "membership_id" TEXT,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "domain_name" TEXT NOT NULL,
    "verification_token" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "verification_token" TEXT NOT NULL,
    "tenant_name" TEXT,
    "given_name" TEXT,
    "family_name" TEXT,
    "redirect_uri" TEXT,
    "application_id" TEXT,
    "selected_license_type_id" TEXT,
    "status" "PendingSignupStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_signups_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "application_id" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membership_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tenant_roles" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membership_id" TEXT NOT NULL,
    "tenant_role_id" TEXT NOT NULL,

    CONSTRAINT "membership_tenant_roles_pkey" PRIMARY KEY ("id")
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
    "access_type" "AccessType" NOT NULL DEFAULT 'GRANTED',
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
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_username_key" ON "super_admins"("username");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE INDEX "super_admins_username_idx" ON "super_admins"("username");

-- CreateIndex
CREATE INDEX "admin_sso_links_admin_id_idx" ON "admin_sso_links"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sso_links_provider_provider_user_id_key" ON "admin_sso_links"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sso_links_admin_id_provider_key" ON "admin_sso_links"("admin_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "instance_meta_instance_uuid_key" ON "instance_meta"("instance_uuid");

-- CreateIndex
CREATE INDEX "instance_api_keys_prefix_idx" ON "instance_api_keys"("prefix");

-- CreateIndex
CREATE INDEX "system_webhook_deliveries_webhook_id_idx" ON "system_webhook_deliveries"("webhook_id");

-- CreateIndex
CREATE INDEX "system_webhook_deliveries_attempted_at_idx" ON "system_webhook_deliveries"("attempted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_is_machine_idx" ON "users"("is_machine");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("prefix");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "applications_client_id_key" ON "applications"("client_id");

-- CreateIndex
CREATE INDEX "applications_client_id_idx" ON "applications"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_slug_key" ON "applications"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "authorization_codes_code_key" ON "authorization_codes"("code");

-- CreateIndex
CREATE INDEX "authorization_codes_code_idx" ON "authorization_codes"("code");

-- CreateIndex
CREATE INDEX "authorization_codes_user_id_idx" ON "authorization_codes"("user_id");

-- CreateIndex
CREATE INDEX "authorization_codes_application_id_idx" ON "authorization_codes"("application_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_application_id_idx" ON "refresh_tokens"("application_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_revoked_idx" ON "refresh_tokens"("revoked");

-- CreateIndex
CREATE UNIQUE INDEX "signing_keys_kid_key" ON "signing_keys"("kid");

-- CreateIndex
CREATE INDEX "signing_keys_status_idx" ON "signing_keys"("status");

-- CreateIndex
CREATE INDEX "signing_keys_kid_idx" ON "signing_keys"("kid");

-- CreateIndex
CREATE UNIQUE INDEX "sso_providers_provider_key" ON "sso_providers"("provider");

-- CreateIndex
CREATE INDEX "tenant_sso_configs_tenant_id_idx" ON "tenant_sso_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_sso_configs_tenant_id_provider_key" ON "tenant_sso_configs"("tenant_id", "provider");

-- CreateIndex
CREATE INDEX "user_sso_links_user_id_idx" ON "user_sso_links"("user_id");

-- CreateIndex
CREATE INDEX "user_sso_links_email_idx" ON "user_sso_links"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_sso_links_provider_provider_user_id_key" ON "user_sso_links"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sso_links_user_id_provider_key" ON "user_sso_links"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_idx" ON "memberships"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_tenant_id_key" ON "memberships"("user_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_membership_id_key" ON "invitations"("membership_id");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_idx" ON "invitations"("tenant_id");

-- CreateIndex
CREATE INDEX "invitations_client_id_idx" ON "invitations"("client_id");

-- CreateIndex
CREATE INDEX "domains_tenant_id_idx" ON "domains"("tenant_id");

-- CreateIndex
CREATE INDEX "domains_domain_name_idx" ON "domains"("domain_name");

-- CreateIndex
CREATE UNIQUE INDEX "domains_domain_name_tenant_id_key" ON "domains"("domain_name", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_signups_verification_token_key" ON "pending_signups"("verification_token");

-- CreateIndex
CREATE INDEX "pending_signups_status_idx" ON "pending_signups"("status");

-- CreateIndex
CREATE INDEX "pending_signups_verification_token_idx" ON "pending_signups"("verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "pending_signups_email_key" ON "pending_signups"("email");

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

-- CreateIndex
CREATE INDEX "roles_application_id_idx" ON "roles"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_application_id_key" ON "roles"("slug", "application_id");

-- CreateIndex
CREATE INDEX "membership_roles_membership_id_idx" ON "membership_roles"("membership_id");

-- CreateIndex
CREATE INDEX "membership_roles_role_id_idx" ON "membership_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_roles_membership_id_role_id_key" ON "membership_roles"("membership_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_roles_slug_key" ON "tenant_roles"("slug");

-- CreateIndex
CREATE INDEX "membership_tenant_roles_membership_id_idx" ON "membership_tenant_roles"("membership_id");

-- CreateIndex
CREATE INDEX "membership_tenant_roles_tenant_role_id_idx" ON "membership_tenant_roles"("tenant_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tenant_roles_membership_id_tenant_role_id_key" ON "membership_tenant_roles"("membership_id", "tenant_role_id");

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
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_idx" ON "audit_logs"("target_type");

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

-- AddForeignKey
ALTER TABLE "admin_sso_links" ADD CONSTRAINT "admin_sso_links_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "super_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_webhook_deliveries" ADD CONSTRAINT "system_webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "system_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_default_license_type_id_fkey" FOREIGN KEY ("default_license_type_id") REFERENCES "license_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_codes" ADD CONSTRAINT "authorization_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_codes" ADD CONSTRAINT "authorization_codes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_sso_configs" ADD CONSTRAINT "tenant_sso_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sso_links" ADD CONSTRAINT "user_sso_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_consumed_by_id_fkey" FOREIGN KEY ("consumed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_groups" ADD CONSTRAINT "membership_groups_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_groups" ADD CONSTRAINT "membership_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tenant_roles" ADD CONSTRAINT "membership_tenant_roles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tenant_roles" ADD CONSTRAINT "membership_tenant_roles_tenant_role_id_fkey" FOREIGN KEY ("tenant_role_id") REFERENCES "tenant_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
