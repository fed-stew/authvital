-- =============================================================================
-- App Client Split (Entra-style container + credential model)
--
-- Splits OAuth client credentials out of `applications` (now the container/
-- product) into a new `application_clients` table (the credential). Existing
-- client_id values are PRESERVED unchanged - no credentials are re-issued.
--
-- Each application currently has exactly one credential row, so the backfill
-- from applications -> application_clients is strictly 1:1.
-- =============================================================================

-- CreateTable: application_clients (the OAuth credential)
CREATE TABLE "application_clients" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "type" "ApplicationType" NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT,
    "redirect_uris" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "post_logout_redirect_uris" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "initiate_login_uri" TEXT,
    "allowed_web_origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "access_token_ttl" INTEGER NOT NULL DEFAULT 3600,
    "refresh_token_ttl" INTEGER NOT NULL DEFAULT 604800,
    "m2m_trusted_all_tenants" BOOLEAN NOT NULL DEFAULT false,
    "m2m_allowed_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_clients_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- DATA MIGRATION: one credential row per existing application.
-- client_id / client_secret / URIs / TTLs / M2M authz are copied verbatim so
-- existing clients keep working with the exact same credentials.
-- The new id uses gen_random_uuid() (available via pgcrypto/pg13+); if your
-- environment lacks it, substitute md5(random()::text || clock_timestamp()::text).
-- -----------------------------------------------------------------------------
INSERT INTO "application_clients" (
    "id",
    "application_id",
    "type",
    "client_id",
    "client_secret",
    "redirect_uris",
    "post_logout_redirect_uris",
    "initiate_login_uri",
    "allowed_web_origins",
    "access_token_ttl",
    "refresh_token_ttl",
    "m2m_trusted_all_tenants",
    "m2m_allowed_scopes",
    "is_active",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid()::text,
    a."id",
    a."type",
    a."client_id",
    a."client_secret",
    a."redirect_uris",
    a."post_logout_redirect_uris",
    a."initiate_login_uri",
    a."allowed_web_origins",
    a."access_token_ttl",
    a."refresh_token_ttl",
    a."m2m_trusted_all_tenants",
    a."m2m_allowed_scopes",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "applications" a;

-- Indexes / uniqueness for application_clients
CREATE UNIQUE INDEX "application_clients_client_id_key" ON "application_clients"("client_id");
CREATE INDEX "application_clients_client_id_idx" ON "application_clients"("client_id");
CREATE INDEX "application_clients_application_id_idx" ON "application_clients"("application_id");
-- Invariant: <= 1 SPA + <= 1 MACHINE credential per application.
CREATE UNIQUE INDEX "application_clients_application_id_type_key" ON "application_clients"("application_id", "type");

-- FK application_clients -> applications
ALTER TABLE "application_clients"
    ADD CONSTRAINT "application_clients_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "applications"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Repoint authorization_codes: application_id -> application_client_id
-- =============================================================================
ALTER TABLE "authorization_codes" ADD COLUMN "application_client_id" TEXT;

UPDATE "authorization_codes" ac
SET "application_client_id" = c."id"
FROM "application_clients" c
WHERE c."application_id" = ac."application_id";

-- Every row must be backfilled (1:1 credential per app existed for all rows).
ALTER TABLE "authorization_codes" ALTER COLUMN "application_client_id" SET NOT NULL;

DROP INDEX IF EXISTS "authorization_codes_application_id_idx";
ALTER TABLE "authorization_codes" DROP CONSTRAINT IF EXISTS "authorization_codes_application_id_fkey";
ALTER TABLE "authorization_codes" DROP COLUMN "application_id";

CREATE INDEX "authorization_codes_application_client_id_idx" ON "authorization_codes"("application_client_id");
ALTER TABLE "authorization_codes"
    ADD CONSTRAINT "authorization_codes_application_client_id_fkey"
    FOREIGN KEY ("application_client_id") REFERENCES "application_clients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Repoint refresh_tokens: application_id -> application_client_id
-- =============================================================================
ALTER TABLE "refresh_tokens" ADD COLUMN "application_client_id" TEXT;

UPDATE "refresh_tokens" rt
SET "application_client_id" = c."id"
FROM "application_clients" c
WHERE c."application_id" = rt."application_id";

ALTER TABLE "refresh_tokens" ALTER COLUMN "application_client_id" SET NOT NULL;

DROP INDEX IF EXISTS "refresh_tokens_application_id_idx";
ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_application_id_fkey";
ALTER TABLE "refresh_tokens" DROP COLUMN "application_id";

CREATE INDEX "refresh_tokens_application_client_id_idx" ON "refresh_tokens"("application_client_id");
ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_application_client_id_fkey"
    FOREIGN KEY ("application_client_id") REFERENCES "application_clients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Repoint m2m_tenant_grants: application_id -> application_client_id
-- =============================================================================
ALTER TABLE "m2m_tenant_grants" ADD COLUMN "application_client_id" TEXT;

UPDATE "m2m_tenant_grants" g
SET "application_client_id" = c."id"
FROM "application_clients" c
WHERE c."application_id" = g."application_id";

ALTER TABLE "m2m_tenant_grants" ALTER COLUMN "application_client_id" SET NOT NULL;

DROP INDEX IF EXISTS "m2m_tenant_grants_application_id_idx";
DROP INDEX IF EXISTS "m2m_tenant_grants_application_id_tenant_id_key";
ALTER TABLE "m2m_tenant_grants" DROP CONSTRAINT IF EXISTS "m2m_tenant_grants_application_id_fkey";
ALTER TABLE "m2m_tenant_grants" DROP COLUMN "application_id";

CREATE INDEX "m2m_tenant_grants_application_client_id_idx" ON "m2m_tenant_grants"("application_client_id");
CREATE UNIQUE INDEX "m2m_tenant_grants_application_client_id_tenant_id_key" ON "m2m_tenant_grants"("application_client_id", "tenant_id");
ALTER TABLE "m2m_tenant_grants"
    ADD CONSTRAINT "m2m_tenant_grants_application_client_id_fkey"
    FOREIGN KEY ("application_client_id") REFERENCES "application_clients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Drop the now-moved credential columns from applications (container only).
-- =============================================================================
DROP INDEX IF EXISTS "applications_client_id_key";
DROP INDEX IF EXISTS "applications_client_id_idx";

ALTER TABLE "applications" DROP COLUMN "type";
ALTER TABLE "applications" DROP COLUMN "client_id";
ALTER TABLE "applications" DROP COLUMN "client_secret";
ALTER TABLE "applications" DROP COLUMN "redirect_uris";
ALTER TABLE "applications" DROP COLUMN "post_logout_redirect_uris";
ALTER TABLE "applications" DROP COLUMN "initiate_login_uri";
ALTER TABLE "applications" DROP COLUMN "allowed_web_origins";
ALTER TABLE "applications" DROP COLUMN "access_token_ttl";
ALTER TABLE "applications" DROP COLUMN "refresh_token_ttl";
ALTER TABLE "applications" DROP COLUMN "m2m_trusted_all_tenants";
ALTER TABLE "applications" DROP COLUMN "m2m_allowed_scopes";
