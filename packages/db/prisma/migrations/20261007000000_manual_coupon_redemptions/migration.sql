ALTER TABLE "discount_coupons"
    ADD COLUMN "redemption_mode" TEXT NOT NULL DEFAULT 'stripe';

ALTER TABLE "discount_coupons" ADD CONSTRAINT "discount_coupons_redemption_mode_check"
    CHECK ("redemption_mode" = 'stripe' OR (
        "redemption_mode" = 'manual' AND "discount_type" = 'percent'
        AND "percent_off" IS NOT NULL AND "percent_off" = 100 AND "duration" = 'once'
        AND "stripe_coupon_id" IS NULL AND "stripe_promotion_code_id" IS NULL
    ));

CREATE TABLE "_CouponSubscriptions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_CouponSubscriptions_AB_pkey" PRIMARY KEY ("A", "B"),
    CONSTRAINT "_CouponSubscriptions_A_fkey" FOREIGN KEY ("A") REFERENCES "discount_coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_CouponSubscriptions_B_fkey" FOREIGN KEY ("B") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "_CouponSubscriptions_B_index" ON "_CouponSubscriptions"("B");

CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "request_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cadence" TEXT,
    "source" TEXT NOT NULL,
    "reference" VARCHAR(160) NOT NULL,
    "external_amount" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL,
    "subtotal_amount" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gencode_order_id" TEXT,
    "subscription_cycle_id" TEXT,
    "app_sale_id" TEXT,
    CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "discount_coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "coupon_redemptions_gencode_order_id_fkey" FOREIGN KEY ("gencode_order_id") REFERENCES "gencode_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "coupon_redemptions_subscription_cycle_id_fkey" FOREIGN KEY ("subscription_cycle_id") REFERENCES "subscription_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "coupon_redemptions_app_sale_id_fkey" FOREIGN KEY ("app_sale_id") REFERENCES "app_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "coupon_redemptions_result_check" CHECK (
        ("kind" = 'package' AND "gencode_order_id" IS NOT NULL AND "gencode_order_id" = "result_id"
            AND "subscription_cycle_id" IS NULL AND "app_sale_id" IS NULL)
        OR ("kind" = 'partner' AND "subscription_cycle_id" IS NOT NULL AND "subscription_cycle_id" = "result_id"
            AND "gencode_order_id" IS NULL AND "app_sale_id" IS NULL)
        OR ("kind" = 'consumer' AND "gencode_order_id" IS NULL AND "subscription_cycle_id" IS NULL
            AND ("app_sale_id" IS NULL OR "app_sale_id" = "result_id"))
    ),
    CONSTRAINT "coupon_redemptions_amount_check" CHECK (
        "quantity" > 0 AND "subtotal_amount" > 0
        AND "discount_amount" = "subtotal_amount" AND "total_amount" = 0
        AND (("source" = 'external_payment' AND "external_amount" IS NOT NULL AND "external_amount" > 0)
          OR ("source" = 'legacy_stock' AND "external_amount" IS NULL))
    )
);
CREATE UNIQUE INDEX "coupon_redemptions_request_id_key" ON "coupon_redemptions"("request_id");
CREATE UNIQUE INDEX "coupon_redemptions_result_id_key" ON "coupon_redemptions"("result_id");
CREATE UNIQUE INDEX "coupon_redemptions_source_reference_key" ON "coupon_redemptions"("source", "reference");
CREATE UNIQUE INDEX "coupon_redemptions_gencode_order_id_key" ON "coupon_redemptions"("gencode_order_id");
CREATE UNIQUE INDEX "coupon_redemptions_subscription_cycle_id_key" ON "coupon_redemptions"("subscription_cycle_id");
CREATE UNIQUE INDEX "coupon_redemptions_app_sale_id_key" ON "coupon_redemptions"("app_sale_id");
CREATE INDEX "coupon_redemptions_coupon_id_created_at_idx" ON "coupon_redemptions"("coupon_id", "created_at" DESC);
CREATE INDEX "coupon_redemptions_recipient_id_idx" ON "coupon_redemptions"("recipient_id");

-- No Stripe object is created: only a privileged BMS action can redeem this
-- operational coupon. Preserve an existing operator-owned code on upgrade.
INSERT INTO "discount_coupons" (
    "id", "code", "description", "discount_type", "percent_off", "duration",
    "redemption_mode", "created_by_id", "is_active", "created_at", "updated_at"
)
SELECT 'gen2026-manual-coupon', 'Gen2026',
    '100% para vendas recebidas por outro gateway ou regularização de estoque. Aplicação pela equipe no BMS.',
    'percent', 100, 'once', 'manual', 'system:gen2026', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "discount_coupons" WHERE lower("code") = 'gen2026');
