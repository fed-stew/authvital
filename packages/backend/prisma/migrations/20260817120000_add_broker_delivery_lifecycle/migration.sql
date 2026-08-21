-- Broker webhook-delivery lifecycle for outbox events (authvital-broker).
-- Additive only: the existing GCP publish lifecycle columns are untouched.
-- Webhook delivery and Pub/Sub topic export are independent consumers of the
-- same outbox row, so each gets its own status/attempt tracking.

-- CreateEnum
CREATE TYPE "BrokerDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "pub_sub_outbox_events"
  ADD COLUMN "delivery_status" "BrokerDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "delivery_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_delivery_attempt_at" TIMESTAMP(3),
  ADD COLUMN "last_delivery_error" TEXT;

-- CreateIndex
CREATE INDEX "pub_sub_outbox_events_delivery_status_created_at_idx"
  ON "pub_sub_outbox_events"("delivery_status", "created_at");
