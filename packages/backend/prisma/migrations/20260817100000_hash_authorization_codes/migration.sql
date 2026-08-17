-- Hash authorization codes at rest.
--
-- Previously the plaintext code was stored in a unique "code" column, so a
-- database dump (or backup) taken within a code's short lifetime yielded
-- directly redeemable codes. Codes are now generated with 256 bits of
-- CSPRNG entropy and only their SHA-256 hex digest is persisted in
-- "code_hash"; the token grant looks up by digest.
--
-- No data preservation: authorization codes are single-use and live only
-- minutes. Any in-flight codes at deploy time are invalidated — affected
-- users simply re-run the authorize redirect.

-- Invalidate in-flight codes (their plaintext column is about to vanish).
DELETE FROM "authorization_codes";

-- DropIndex: explicit @@index([code]) (redundant with the old unique, both go)
DROP INDEX IF EXISTS "authorization_codes_code_idx";

-- AlterTable: drop plaintext column (its unique index goes with it),
-- add the hash column.
ALTER TABLE "authorization_codes" DROP COLUMN "code";
ALTER TABLE "authorization_codes" ADD COLUMN "code_hash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "authorization_codes_code_hash_key" ON "authorization_codes"("code_hash");
