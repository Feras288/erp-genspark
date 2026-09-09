-- =====================================================
-- Phase 13A: Bank Reconciliation Architecture
--
-- Phase 13A-B-1: Reconciliation schema and RBAC skeleton.
--
-- Creates:
--   - Enums: StatementStatus, BankTransactionType, ReconciliationStatus, MatchType
--   - Tables:
--       * bank_accounts
--       * bank_statements
--       * bank_transactions
--       * reconciliation_matches
--   - Foreign keys & indexes (tenant isolation via companyId)
--   - PostgreSQL partial unique indexes for active matches (unmatchedAt IS NULL):
--       * reconciliation_match_active_bank_tx_uniq
--       * reconciliation_match_active_payment_uniq
--   - RBAC permissions:
--       * reconciliation.read
--       * reconciliation.write
--       * reconciliation.import
-- =====================================================

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('DRAFT', 'RECONCILED');

-- CreateEnum
CREATE TYPE "BankTransactionType" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('EXACT', 'SUGGESTED', 'MANUAL');

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "glAccountId" TEXT,
    "openingBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementIdentifier" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(18,4) NOT NULL,
    "closingBalance" DECIMAL(18,4) NOT NULL,
    "totalInflow" DECIMAL(18,4) NOT NULL,
    "totalOutflow" DECIMAL(18,4) NOT NULL,
    "rawFileName" TEXT,
    "fileHash" TEXT NOT NULL,
    "status" "StatementStatus" NOT NULL DEFAULT 'DRAFT',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "type" "BankTransactionType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "balanceAfter" DECIMAL(18,4),
    "reference" TEXT,
    "description" TEXT,
    "payerPayee" TEXT,
    "fingerprint" TEXT NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_matches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "matchType" "MatchType" NOT NULL,
    "confidenceScore" INTEGER,
    "notes" TEXT,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedById" TEXT,
    "unmatchedAt" TIMESTAMP(3),
    "unmatchedById" TEXT,

    CONSTRAINT "reconciliation_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: bank_accounts
CREATE UNIQUE INDEX "bank_accounts_companyId_iban_key" ON "bank_accounts"("companyId", "iban");
CREATE INDEX "bank_accounts_companyId_isActive_idx" ON "bank_accounts"("companyId", "isActive");
CREATE INDEX "bank_accounts_companyId_idx" ON "bank_accounts"("companyId");

-- CreateIndex: bank_statements
CREATE UNIQUE INDEX "bank_statements_companyId_fileHash_key" ON "bank_statements"("companyId", "fileHash");
CREATE INDEX "bank_statements_companyId_bankAccountId_startDate_endDate_idx" ON "bank_statements"("companyId", "bankAccountId", "startDate", "endDate");

-- CreateIndex: bank_transactions
CREATE UNIQUE INDEX "bank_transactions_companyId_bankAccountId_fingerprint_key" ON "bank_transactions"("companyId", "bankAccountId", "fingerprint");
CREATE INDEX "bank_transactions_companyId_bankAccountId_transactionDate_idx" ON "bank_transactions"("companyId", "bankAccountId", "transactionDate");
CREATE INDEX "bank_transactions_companyId_status_idx" ON "bank_transactions"("companyId", "status");

-- CreateIndex: reconciliation_matches
CREATE INDEX "reconciliation_matches_companyId_matchedAt_idx" ON "reconciliation_matches"("companyId", "matchedAt");
CREATE INDEX "reconciliation_matches_companyId_bankTransactionId_idx" ON "reconciliation_matches"("companyId", "bankTransactionId");
CREATE INDEX "reconciliation_matches_companyId_paymentId_idx" ON "reconciliation_matches"("companyId", "paymentId");

-- Partial unique indexes: active matches uniqueness (WHERE "unmatchedAt" IS NULL)
CREATE UNIQUE INDEX "reconciliation_match_active_bank_tx_uniq"
  ON "reconciliation_matches"("companyId", "bankTransactionId")
  WHERE "unmatchedAt" IS NULL;

CREATE UNIQUE INDEX "reconciliation_match_active_payment_uniq"
  ON "reconciliation_matches"("companyId", "paymentId")
  WHERE "unmatchedAt" IS NULL;

-- AddForeignKey: bank_accounts
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: bank_statements
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: bank_transactions
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: reconciliation_matches
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_unmatchedById_fkey" FOREIGN KEY ("unmatchedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 13A-B-1 RBAC: register the three new permissions required by
-- the reconciliation module. Idempotent on Postgres via ON CONFLICT.
INSERT INTO "permissions" ("id", "key", "module", "action", "description")
VALUES
  (gen_random_uuid()::text, 'reconciliation.read',   'reconciliation', 'read',   'Read access to bank accounts, bank transactions, and reconciliation reports'),
  (gen_random_uuid()::text, 'reconciliation.write',  'reconciliation', 'write',  'Create and manage bank accounts, matches, and unmatching workflows'),
  (gen_random_uuid()::text, 'reconciliation.import', 'reconciliation', 'import', 'Upload and import bank statements')
ON CONFLICT ("key") DO NOTHING;
