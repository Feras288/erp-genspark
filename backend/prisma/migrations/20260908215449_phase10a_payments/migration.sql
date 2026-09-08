-- CreateEnum
CREATE TYPE "PaymentInvoiceType" AS ENUM ('SALES', 'PURCHASE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "salesInvoiceId" TEXT,
    "purchaseInvoiceId" TEXT,
    "invoiceType" "PaymentInvoiceType" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_companyId_status_idx" ON "payments"("companyId", "status");

-- CreateIndex
CREATE INDEX "payments_companyId_paidAt_idx" ON "payments"("companyId", "paidAt");

-- CreateIndex
CREATE INDEX "payments_companyId_deletedAt_idx" ON "payments"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "payments_companyId_invoiceType_idx" ON "payments"("companyId", "invoiceType");

-- CreateIndex
CREATE INDEX "payments_salesInvoiceId_idx" ON "payments"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "payments_purchaseInvoiceId_idx" ON "payments"("purchaseInvoiceId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce exactly-one of salesInvoiceId / purchaseInvoiceId.
-- Phase 10A-B-1 contract: polymorphic FK enforced by CHECK because
-- Prisma cannot express polymorphic FK + exactly-one in one declaration.
-- Phase 10A-B-2 (settlement calculations) relies on this invariant.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_invoice_fk_exactly_one"
  CHECK (
    (("salesInvoiceId" IS NOT NULL)::int + ("purchaseInvoiceId" IS NOT NULL)::int) = 1
  );

-- Phase 10A-B-1 RBAC: register the two new permissions required by
-- the payments module. Idempotent on Postgres via ON CONFLICT.
INSERT INTO "permissions" ("id", "key", "module", "action", "description")
VALUES
  (gen_random_uuid()::text, 'ar_payments.read',  'ar_payments', 'read',  'List / get payments on a sales invoice'),
  (gen_random_uuid()::text, 'ar_payments.write', 'ar_payments', 'write', 'Register / soft-cancel a payment on a sales invoice')
ON CONFLICT ("key") DO NOTHING;
