CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "context" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_until" TIMESTAMP(3),
    "claim_token" TEXT,
    "sent_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_outbox_attempts_nonnegative" CHECK ("attempts" >= 0)
);

CREATE INDEX "email_outbox_pending" ON "email_outbox"("sent_at", "canceled_at", "available_at");
