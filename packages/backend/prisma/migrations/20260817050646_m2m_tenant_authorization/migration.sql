-- AlterTable: Add M2M authorization columns to applications
ALTER TABLE "applications" ADD COLUMN "m2m_trusted_all_tenants" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "applications" ADD COLUMN "m2m_allowed_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable: Per-tenant M2M authorization grants (deny-by-default)
CREATE TABLE "m2m_tenant_grants" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "m2m_tenant_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "m2m_tenant_grants_application_id_idx" ON "m2m_tenant_grants"("application_id");

-- CreateIndex
CREATE INDEX "m2m_tenant_grants_tenant_id_idx" ON "m2m_tenant_grants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "m2m_tenant_grants_application_id_tenant_id_key" ON "m2m_tenant_grants"("application_id", "tenant_id");

-- AddForeignKey
ALTER TABLE "m2m_tenant_grants" ADD CONSTRAINT "m2m_tenant_grants_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "m2m_tenant_grants" ADD CONSTRAINT "m2m_tenant_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
