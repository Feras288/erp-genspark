-- =====================================================
-- Phase 11B-B-1: GL posting linkage skeleton.
--
-- Schema (additive):
--   * JournalEntrySourceType enum
--   * journal_entries.sourceType / sourceId (polymorphic soft pointer)
--   * unique (companyId, sourceType, sourceId) — idempotency guard
--   * CHECK: sourceType and sourceId are both null or both set
--   * journal_entries.reversalOf self-FK (nullable; unused in 11B-B-1)
--
-- Required account mapping:
--   Idempotent INSERT of the eight required GL account codes for
--   every company that already exists at migrate time.
--   ON CONFLICT against the Phase 6 partial unique index
--   accounts_companyId_code_active_uniq (companyId, code)
--   WHERE deletedAt IS NULL.
--
-- Delivery vehicle locked in 11B-B-1 (plan §5.3 / §10):
--   1. This migration backfills existing companies on
--      `prisma migrate deploy` (idempotent).
--   2. `prisma db seed` calls ensureRequiredGlAccounts() for
--      every company (covers the demo tenant and re-runs).
--   3. Opportunistic first-invoice ensure is exported from
--      `backend/src/accounting/required-gl-accounts.ts` but is
--      NOT wired in 11B-B-1 (no auto-post yet).
--
-- Strict (Phase 11B-B-1):
--   * No auto-post $transaction.
--   * No trigger wiring to sales / purchases / payments.
--   * No RBAC catalog change (gl_journal.write already exists).
--   * No JournalEntryStatus change (DRAFT | POSTED | CANCELLED).
-- =====================================================

-- CreateEnum
CREATE TYPE "JournalEntrySourceType" AS ENUM (
  'SALES_INVOICE',
  'PURCHASE_INVOICE',
  'AR_PAYMENT',
  'AP_PAYMENT'
);

-- AlterTable
ALTER TABLE "journal_entries"
  ADD COLUMN "sourceType" "JournalEntrySourceType",
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "reversalOf" TEXT;

-- Pair completeness: manual Phase 6 journals keep both null;
-- auto-posted entries (later 11B-B-2..) must set both.
ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_source_pair"
  CHECK (
    (("sourceType" IS NULL)::int + ("sourceId" IS NULL)::int) IN (0, 2)
  );

-- Unique protection per company / source document.
-- Postgres treats NULL as distinct, so multiple (companyId, NULL, NULL)
-- rows remain legal for Phase 6 manual journals.
CREATE UNIQUE INDEX "journal_entries_company_source_uniq"
  ON "journal_entries"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_sourceType_idx"
  ON "journal_entries"("companyId", "sourceType");

-- CreateIndex
CREATE INDEX "journal_entries_reversalOf_idx"
  ON "journal_entries"("reversalOf");

-- AddForeignKey
ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_reversalOf_fkey"
  FOREIGN KEY ("reversalOf") REFERENCES "journal_entries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Eight required GL accounts per existing company.
-- Idempotent against the Phase 6 partial unique index.
INSERT INTO "accounts" (
  "id",
  "companyId",
  "code",
  "name",
  "nameAr",
  "type",
  "normalBalance",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  c."id",
  v.code,
  v.name,
  v.name_ar,
  v.type::"AccountType",
  v.normal_balance::"NormalBalance",
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "companies" c
CROSS JOIN (
  VALUES
    ('AR_CONTROL',            'Accounts Receivable Control',     'حساب المدينين',                 'ASSET',     'DEBIT'),
    ('AP_CONTROL',            'Accounts Payable Control',        'حساب الدائنين',                 'LIABILITY', 'CREDIT'),
    ('CASH_OR_BANK',          'Cash / Bank',                     'النقدية / البنك',               'ASSET',     'DEBIT'),
    ('SALES_REVENUE',         'Sales Revenue',                   'إيرادات المبيعات',              'REVENUE',   'CREDIT'),
    ('INVENTORY_OR_EXPENSE',  'Inventory or Purchases Expense',  'المخزون أو مصروف المشتريات',   'EXPENSE',   'DEBIT'),
    ('VAT_OUTPUT',            'VAT Output (Sales)',              'ضريبة القيمة المضافة مخرجات',  'LIABILITY', 'CREDIT'),
    ('VAT_INPUT',             'VAT Input (Purchases)',           'ضريبة القيمة المضافة مدخلات',  'ASSET',     'DEBIT'),
    ('SALES_DISCOUNTS',       'Sales Discounts',                 'خصومات المبيعات',               'REVENUE',   'DEBIT')
) AS v(code, name, name_ar, type, normal_balance)
ON CONFLICT ("companyId", "code") WHERE "deletedAt" IS NULL DO NOTHING;
