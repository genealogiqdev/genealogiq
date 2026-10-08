CREATE TABLE "consumer_access_grants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "request_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "app_user_id" TEXT,
    "app_sale_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "notes" VARCHAR(500),
    "email_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consumer_access_grants_period_check" CHECK ("expires_at" > "starts_at"),
    CONSTRAINT "consumer_access_grants_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "consumer_access_grants_app_sale_id_fkey" FOREIGN KEY ("app_sale_id") REFERENCES "app_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "consumer_access_grants_request_id_key" ON "consumer_access_grants"("request_id");
CREATE UNIQUE INDEX "consumer_access_grants_result_id_key" ON "consumer_access_grants"("result_id");
CREATE UNIQUE INDEX "consumer_access_grants_app_sale_id_key" ON "consumer_access_grants"("app_sale_id");
CREATE INDEX "consumer_access_grants_recipient_id_expires_at_idx" ON "consumer_access_grants"("recipient_id", "expires_at");
CREATE INDEX "consumer_access_grants_app_user_id_created_at_idx" ON "consumer_access_grants"("app_user_id", "created_at" DESC);
