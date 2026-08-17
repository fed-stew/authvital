-- CreateTable: single-use JWT ledger (MFA enrollment resume tokens).
-- Redemption atomically INSERTs the token's jti; a primary-key violation means
-- the token was already consumed. Expired rows are cleaned up hourly.
CREATE TABLE "consumed_jtis" (
    "jti" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumed_jtis_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex: cheap range-delete of expired rows
CREATE INDEX "consumed_jtis_expires_at_idx" ON "consumed_jtis"("expires_at");
