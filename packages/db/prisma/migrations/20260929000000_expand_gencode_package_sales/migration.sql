-- GenCode packages are first-class B2B products. They can be the partner's
-- first purchase, carry their own activation-trial terms and accept coupons.

-- Classify Genealogiq partners independently from their legal entity type.
CREATE TYPE "PartnerSegment" AS ENUM (
    'FUNERAL_HOME',
    'MARBLE_SHOP',
    'CEMETERY',
    'URN_MANUFACTURER',
    'PLAQUE_PRINTER'
);

ALTER TABLE "tenants"
    ADD COLUMN "business_segment" "PartnerSegment" NOT NULL DEFAULT 'FUNERAL_HOME';

CREATE INDEX "tenants_business_segment_idx" ON "tenants"("business_segment");

-- A package snapshots the B2C benefit it promises, just like an annual plan.
ALTER TABLE "gencode_packages"
    ADD COLUMN "activation_trial_months" INTEGER NOT NULL DEFAULT 12,
    ADD COLUMN "activation_trial_plan_code" TEXT DEFAULT 'PREMIUM';

ALTER TABLE "gencode_packages"
    ADD CONSTRAINT "gencode_packages_activation_trial_months_check"
    CHECK ("activation_trial_months" >= 0);

-- Package orders no longer depend on an annual subscription. Discounts and
-- activation terms are snapshotted so later catalogue edits do not rewrite a
-- sale that was already offered to a customer.
ALTER TABLE "gencode_orders"
    ALTER COLUMN "partner_subscription_id" DROP NOT NULL,
    ADD COLUMN "discount_coupon_id" TEXT,
    ADD COLUMN "discount_code" VARCHAR(32),
    ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "activation_trial_months" INTEGER NOT NULL DEFAULT 12,
    ADD COLUMN "activation_trial_plan_code" TEXT DEFAULT 'PREMIUM';

ALTER TABLE "gencode_orders" DROP CONSTRAINT "gencode_orders_total_amount_check";

ALTER TABLE "gencode_orders"
    ADD CONSTRAINT "gencode_orders_discount_amount_check"
      CHECK ("discount_amount" >= 0 AND "discount_amount" <= "unit_price" * "quantity"),
    ADD CONSTRAINT "gencode_orders_total_amount_check"
      CHECK ("total_amount" = "unit_price" * "quantity" - "discount_amount"),
    ADD CONSTRAINT "gencode_orders_activation_trial_months_check"
      CHECK ("activation_trial_months" >= 0);

ALTER TABLE "gencode_orders" DROP CONSTRAINT "gencode_orders_partner_subscription_id_fkey";

ALTER TABLE "gencode_orders"
    ADD CONSTRAINT "gencode_orders_partner_subscription_id_fkey"
    FOREIGN KEY ("partner_subscription_id") REFERENCES "partner_subscriptions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "gencode_orders"
    ADD CONSTRAINT "gencode_orders_discount_coupon_id_fkey"
    FOREIGN KEY ("discount_coupon_id") REFERENCES "discount_coupons"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "gencode_orders_discount_coupon_id_idx" ON "gencode_orders"("discount_coupon_id");

-- Coupon product restrictions now cover both annual plans and GenCode package
-- products. An empty pair of restriction tables still means "all products".
CREATE TABLE "_CouponGenCodePackages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CouponGenCodePackages_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_CouponGenCodePackages_B_index" ON "_CouponGenCodePackages"("B");

ALTER TABLE "_CouponGenCodePackages"
    ADD CONSTRAINT "_CouponGenCodePackages_A_fkey"
    FOREIGN KEY ("A") REFERENCES "discount_coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_CouponGenCodePackages"
    ADD CONSTRAINT "_CouponGenCodePackages_B_fkey"
    FOREIGN KEY ("B") REFERENCES "gencode_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
