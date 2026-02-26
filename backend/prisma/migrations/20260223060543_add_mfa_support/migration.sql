-- CreateEnum
CREATE TYPE "MfaPolicy" AS ENUM ('DISABLED', 'OPTIONAL', 'ENCOURAGED', 'REQUIRED');

-- AlterTable
ALTER TABLE "instance_meta" ADD COLUMN     "super_admin_mfa_required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "super_admins" ADD COLUMN     "mfaBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT,
ADD COLUMN     "mfa_verified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "mfa_grace_period_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "mfa_policy" "MfaPolicy" NOT NULL DEFAULT 'OPTIONAL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfa_backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfa_secret" TEXT,
ADD COLUMN     "mfa_verified_at" TIMESTAMP(3);
