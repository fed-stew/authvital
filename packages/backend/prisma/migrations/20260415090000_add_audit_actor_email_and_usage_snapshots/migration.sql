-- AlterTable: denormalized actor email on the audit log (nullable, additive)
ALTER TABLE "audit_logs" ADD COLUMN "actor_email" TEXT;

-- CreateTable: daily license/seat usage snapshots for trend charts
CREATE TABLE "tenant_license_usage_snapshots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "license_type_id" TEXT NOT NULL,
    "application_name" TEXT NOT NULL,
    "license_type_name" TEXT NOT NULL,
    "total_seats" INTEGER NOT NULL,
    "seats_assigned" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_license_usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_snapshot_unique_day" ON "tenant_license_usage_snapshots"("tenant_id", "application_id", "license_type_id", "date");

-- CreateIndex
CREATE INDEX "usage_snapshot_tenant_date_idx" ON "tenant_license_usage_snapshots"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "usage_snapshot_tenant_app_idx" ON "tenant_license_usage_snapshots"("tenant_id", "application_id");
