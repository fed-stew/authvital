-- CreateTable
CREATE TABLE "pub_sub_config" (
    "id" TEXT NOT NULL DEFAULT 'pubsub_config',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "topic" TEXT NOT NULL DEFAULT 'authvital-events',
    "ordering_enabled" BOOLEAN NOT NULL DEFAULT true,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pub_sub_config_pkey" PRIMARY KEY ("id")
);
