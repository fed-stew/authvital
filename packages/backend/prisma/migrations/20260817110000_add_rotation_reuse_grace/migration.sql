-- Rotation reuse grace interval + revocation forensics.
--
-- Refresh-token rotation currently treats ANY replay of a revoked token as
-- theft and nukes the whole token family. That also fires for benign races
-- (multi-tab BFFs, parallel requests, multi-instance deployments). Each
-- ApplicationClient now carries rotation_reuse_interval_seconds: within that
-- window after a token was ROTATED, replaying the old token is forgiven and
-- the refresh proceeds. 0 (the default) keeps the current strict behavior.
--
-- refresh_tokens additionally records WHY a session was revoked
-- (revoked_reason) and WHICH session replaced it at rotation (successor_id)
-- for audit/forensic chaining. Existing revoked rows keep NULL for both,
-- which the grace check treats as ineligible (strict response preserved).

-- CreateEnum
CREATE TYPE "RevokedReason" AS ENUM ('ROTATED', 'REUSE_DETECTED', 'LOGOUT', 'ADMIN');

-- AlterTable: application_clients gains the grace interval (0 = strict)
ALTER TABLE "application_clients" ADD COLUMN "rotation_reuse_interval_seconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: refresh_tokens gains revocation forensics
ALTER TABLE "refresh_tokens" ADD COLUMN "revoked_reason" "RevokedReason",
ADD COLUMN "successor_id" TEXT;
