-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "type" "ProductType" NOT NULL DEFAULT 'PRODUCT',
    "barcode" TEXT,
    "unit" TEXT,
    "priceBeforeVat" DECIMAL(18,4),
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "type" "PartnerType" NOT NULL DEFAULT 'CUSTOMER',
    "vatNumber" TEXT,
    "commercialRegistration" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'SA',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_companyId_isActive_idx" ON "products"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "products_companyId_deletedAt_idx" ON "products"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "products_companyId_name_idx" ON "products"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_companyId_sku_key" ON "products"("companyId", "sku");

-- CreateIndex
CREATE INDEX "partners_companyId_isActive_idx" ON "partners"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "partners_companyId_deletedAt_idx" ON "partners"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "partners_companyId_type_idx" ON "partners"("companyId", "type");

-- CreateIndex
CREATE INDEX "partners_companyId_name_idx" ON "partners"("companyId", "name");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique indexes: allow multiple nulls but enforce uniqueness on non-null values.
-- Postgres treats NULL as distinct in standard UNIQUE, so we use a partial index instead.
CREATE UNIQUE INDEX "products_companyId_barcode_key"
  ON "products"("companyId", "barcode")
  WHERE "barcode" IS NOT NULL;

CREATE UNIQUE INDEX "partners_companyId_code_key"
  ON "partners"("companyId", "code")
  WHERE "code" IS NOT NULL;

-- VAT number (TIN) uniqueness per company when present.
CREATE UNIQUE INDEX "partners_companyId_vatNumber_key"
  ON "partners"("companyId", "vatNumber")
  WHERE "vatNumber" IS NOT NULL;
