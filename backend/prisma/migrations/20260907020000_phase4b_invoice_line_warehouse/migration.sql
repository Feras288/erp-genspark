-- Phase 4B: per-line warehouseId on sales invoice lines.
-- Adds nullable warehouseId column to sales_invoice_lines for transparency:
-- the warehouse that stock is being deducted FROM for each PRODUCT line.
-- SERVICE lines have warehouseId = null. DRAFT lines may have null until issue;
-- ISSUE flow requires non-null warehouseId for any PRODUCT-type line.
ALTER TABLE "sales_invoice_lines"
  ADD COLUMN "warehouseId" TEXT;

-- CreateIndex
CREATE INDEX "sales_invoice_lines_companyId_warehouseId_idx"
  ON "sales_invoice_lines"("companyId", "warehouseId");

-- AddForeignKey (SetNull so warehouse deletion does not cascade-delete issued invoice history)
ALTER TABLE "sales_invoice_lines"
  ADD CONSTRAINT "sales_invoice_lines_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
