-- CreateEnum
CREATE TYPE "AccessMode" AS ENUM ('AUTOMATIC', 'MANUAL_AUTO_GRANT', 'MANUAL_NO_DEFAULT', 'DISABLED');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN "access_mode" "AccessMode" NOT NULL DEFAULT 'AUTOMATIC';
