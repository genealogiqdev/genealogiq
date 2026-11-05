BEGIN;

-- AlterTable
ALTER TABLE "gencodes" ADD COLUMN     "business_sale_id" TEXT;

-- CreateTable
CREATE TABLE "business_customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade_name" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_country_code" TEXT NOT NULL DEFAULT '55',
    "phone" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "address_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_gencode_sales" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "requested_code" TEXT NOT NULL DEFAULT '',
    "codes" TEXT[],
    "unit_value" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sold_by_id" TEXT NOT NULL,

    CONSTRAINT "business_gencode_sales_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "business_gencode_sales" ADD CONSTRAINT "business_sale_quantity" CHECK ("quantity" BETWEEN 1 AND 100);
ALTER TABLE "business_gencode_sales" ADD CONSTRAINT "business_sale_price" CHECK ("unit_value" IS NULL OR "unit_value" >= 0);
ALTER TABLE "business_gencode_sales" ADD CONSTRAINT "business_sale_codes" CHECK ("codes" IS NOT NULL AND cardinality("codes") = "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "business_customers_address_id_key" ON "business_customers"("address_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_customers_tenant_id_tax_id_key" ON "business_customers"("tenant_id", "tax_id");

-- CreateIndex
CREATE INDEX "business_gencode_sales_tenant_id_customer_id_idx" ON "business_gencode_sales"("tenant_id", "customer_id");

-- AddForeignKey
ALTER TABLE "business_customers" ADD CONSTRAINT "business_customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_customers" ADD CONSTRAINT "business_customers_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_gencode_sales" ADD CONSTRAINT "business_gencode_sales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_gencode_sales" ADD CONSTRAINT "business_gencode_sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "business_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_gencode_sales" ADD CONSTRAINT "business_gencode_sales_sold_by_id_fkey" FOREIGN KEY ("sold_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gencodes" ADD CONSTRAINT "gencodes_business_sale_id_fkey" FOREIGN KEY ("business_sale_id") REFERENCES "business_gencode_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
