-- CreateEnum
CREATE TYPE "PubSubOutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "pub_sub_outbox_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_source" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "application_id" TEXT,
    "payload" JSONB NOT NULL,
    "topic" TEXT NOT NULL,
    "ordering_key" TEXT,
    "status" "PubSubOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "last_error" TEXT,
    "message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pub_sub_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pub_sub_outbox_events_status_created_at_idx" ON "pub_sub_outbox_events"("status", "created_at");

-- CreateIndex
CREATE INDEX "pub_sub_outbox_events_event_type_idx" ON "pub_sub_outbox_events"("event_type");

-- CreateIndex
CREATE INDEX "pub_sub_outbox_events_tenant_id_idx" ON "pub_sub_outbox_events"("tenant_id");

-- CreateIndex
CREATE INDEX "pub_sub_outbox_events_created_at_idx" ON "pub_sub_outbox_events"("created_at");
