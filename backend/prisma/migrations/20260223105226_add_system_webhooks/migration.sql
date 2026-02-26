-- CreateTable
CREATE TABLE "system_webhooks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "headers" JSONB,
    "last_triggered_at" TIMESTAMP(3),
    "last_status" INTEGER,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" INTEGER,
    "response" TEXT,
    "duration" INTEGER,
    "error" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_webhook_deliveries_webhook_id_idx" ON "system_webhook_deliveries"("webhook_id");

-- CreateIndex
CREATE INDEX "system_webhook_deliveries_attempted_at_idx" ON "system_webhook_deliveries"("attempted_at");

-- AddForeignKey
ALTER TABLE "system_webhook_deliveries" ADD CONSTRAINT "system_webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "system_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
