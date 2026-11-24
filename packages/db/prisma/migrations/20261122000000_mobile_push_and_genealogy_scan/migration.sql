-- Additive only: two new tables for the mobile app. No existing table changes.

-- Native (Expo) push destinations.
CREATE TABLE IF NOT EXISTS "app_device_push_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_device_push_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "app_device_push_tokens_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX IF NOT EXISTS "app_device_push_tokens_token_key" ON "app_device_push_tokens"("token");
CREATE INDEX IF NOT EXISTS "app_device_push_tokens_user_id_idx" ON "app_device_push_tokens"("user_id");

-- Genealogy Scan runs.
DO $$ BEGIN
    CREATE TYPE "GenealogyScanStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "app_genealogy_scans" (
    "id" TEXT NOT NULL,
    "app_user_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "anchors" JSONB,
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "status" "GenealogyScanStatus" NOT NULL DEFAULT 'RUNNING',
    "session_id" TEXT,
    "graph" JSONB,
    "node_count" INTEGER NOT NULL DEFAULT 0,
    "edge_count" INTEGER NOT NULL DEFAULT 0,
    "failure_code" TEXT,
    "list_cost_cents" INTEGER,
    "last_synced_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_genealogy_scans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "app_genealogy_scans_app_user_id_fkey" FOREIGN KEY ("app_user_id")
        REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX IF NOT EXISTS "app_genealogy_scans_request_id_key" ON "app_genealogy_scans"("request_id");
CREATE INDEX IF NOT EXISTS "app_genealogy_scans_app_user_id_created_at_idx" ON "app_genealogy_scans"("app_user_id", "created_at");
