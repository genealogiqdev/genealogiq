-- One-time virtual GenCode packages are top-ups on an active B2B contract.
-- They are intentionally separate from partner_plans: the latter are annual,
-- recurring contracts, while each package order has its own price snapshot,
-- payment lifecycle and 12-month credit grant.

-- CreateEnum
CREATE TYPE "GenCodeOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "gencode_packages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "minimum_quantity" INTEGER NOT NULL DEFAULT 20,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "stripe_product_id" TEXT,
    "stripe_price_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gencode_packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gencode_packages_currency_check" CHECK ("currency" = 'BRL'),
    CONSTRAINT "gencode_packages_unit_price_check" CHECK ("unit_price" > 0),
    CONSTRAINT "gencode_packages_minimum_quantity_check" CHECK ("minimum_quantity" >= 20)
);

-- CreateTable
CREATE TABLE "gencode_orders" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "partner_subscription_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "credit_grant_id" TEXT,
    "status" "GenCodeOrderStatus" NOT NULL DEFAULT 'PENDING',
    "quantity" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "checkout_expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "credit_expires_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gencode_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gencode_orders_currency_check" CHECK ("currency" = 'BRL'),
    CONSTRAINT "gencode_orders_quantity_check" CHECK ("quantity" >= 20),
    CONSTRAINT "gencode_orders_unit_price_check" CHECK ("unit_price" > 0),
    CONSTRAINT "gencode_orders_total_amount_check" CHECK ("total_amount" = "unit_price" * "quantity")
);

-- AlterTable
ALTER TABLE "gencodes" ADD COLUMN "minted_in_order_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "gencode_packages_code_key" ON "gencode_packages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "gencode_packages_stripe_product_id_key" ON "gencode_packages"("stripe_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "gencode_packages_stripe_price_id_key" ON "gencode_packages"("stripe_price_id");

-- CreateIndex
CREATE UNIQUE INDEX "gencode_orders_credit_grant_id_key" ON "gencode_orders"("credit_grant_id");

-- CreateIndex
CREATE UNIQUE INDEX "gencode_orders_stripe_checkout_session_id_key" ON "gencode_orders"("stripe_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "gencode_orders_stripe_payment_intent_id_key" ON "gencode_orders"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "gencode_orders_tenant_id_created_at_idx" ON "gencode_orders"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "gencode_orders_partner_subscription_id_idx" ON "gencode_orders"("partner_subscription_id");

-- CreateIndex
CREATE INDEX "gencode_orders_status_created_at_idx" ON "gencode_orders"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "gencodes_minted_in_order_id_idx" ON "gencodes"("minted_in_order_id");

-- AddForeignKey
ALTER TABLE "gencode_orders" ADD CONSTRAINT "gencode_orders_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "gencode_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gencode_orders" ADD CONSTRAINT "gencode_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gencode_orders" ADD CONSTRAINT "gencode_orders_partner_subscription_id_fkey" FOREIGN KEY ("partner_subscription_id") REFERENCES "partner_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gencode_orders" ADD CONSTRAINT "gencode_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gencode_orders" ADD CONSTRAINT "gencode_orders_credit_grant_id_fkey" FOREIGN KEY ("credit_grant_id") REFERENCES "credit_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gencodes" ADD CONSTRAINT "gencodes_minted_in_order_id_fkey" FOREIGN KEY ("minted_in_order_id") REFERENCES "gencode_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the single BRL product requested for launch. Stripe ids are filled by
-- the explicit BMS sync action after deployment.
INSERT INTO "gencode_packages" (
    "id",
    "code",
    "name",
    "unit_price",
    "currency",
    "minimum_quantity",
    "is_active",
    "created_at",
    "updated_at"
) VALUES (
    'gencode_package_brl',
    'GENCODE_VIRTUAL_BRL',
    'Pacote de Gencodes',
    150.00,
    'BRL',
    20,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
