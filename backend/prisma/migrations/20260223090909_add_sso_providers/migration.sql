-- CreateEnum
CREATE TYPE "SsoProviderType" AS ENUM ('GOOGLE', 'MICROSOFT');

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

-- AddForeignKey
ALTER TABLE "tenant_sso_configs" ADD CONSTRAINT "tenant_sso_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sso_links" ADD CONSTRAINT "user_sso_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
