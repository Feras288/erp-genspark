-- =====================================================
-- Phase 14A: Period Close & Fiscal Year Close
--
-- Phase 14A-B-1: Period Close schema and RBAC skeleton.
--
-- Creates:
--   - Enums: PeriodCloseStatus, PeriodCloseAuditAction
--   - Tables:
--       * period_closes
--       * fiscal_year_closes
--       * period_close_audit_logs
--   - Foreign keys & indexes (tenant isolation via companyId)
--   - RBAC permissions:
--       * period_close.read
--       * period_close.close
--       * period_close.reopen
-- =====================================================

-- CreateEnum
CREATE TYPE "PeriodCloseStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "PeriodCloseAuditAction" AS ENUM ('CLOSE_STARTED', 'CLOSED', 'REOPENED', 'FAILED_VALIDATION');

-- CreateTable
CREATE TABLE "period_closes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodNumber" INTEGER,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PeriodCloseStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_year_closes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalYearStart" TIMESTAMP(3) NOT NULL,
    "fiscalYearEnd" TIMESTAMP(3) NOT NULL,
    "status" "PeriodCloseStatus" NOT NULL DEFAULT 'OPEN',
    "retainedEarningsJournalEntryId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_year_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_close_audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodCloseId" TEXT,
    "fiscalYearCloseId" TEXT,
    "action" "PeriodCloseAuditAction" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_close_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: period_closes
CREATE UNIQUE INDEX "period_closes_companyId_periodStart_periodEnd_key" ON "period_closes"("companyId", "periodStart", "periodEnd");
CREATE INDEX "period_closes_companyId_status_idx" ON "period_closes"("companyId", "status");
CREATE INDEX "period_closes_companyId_periodStart_periodEnd_idx" ON "period_closes"("companyId", "periodStart", "periodEnd");
CREATE INDEX "period_closes_companyId_fiscalYear_idx" ON "period_closes"("companyId", "fiscalYear");

-- CreateIndex: fiscal_year_closes
CREATE UNIQUE INDEX "fiscal_year_closes_companyId_fiscalYear_key" ON "fiscal_year_closes"("companyId", "fiscalYear");
CREATE UNIQUE INDEX "fiscal_year_closes_companyId_fiscalYearStart_fiscalYearEnd_key" ON "fiscal_year_closes"("companyId", "fiscalYearStart", "fiscalYearEnd");
CREATE INDEX "fiscal_year_closes_companyId_status_idx" ON "fiscal_year_closes"("companyId", "status");
CREATE INDEX "fiscal_year_closes_companyId_fiscalYearStart_fiscalYearEnd_idx" ON "fiscal_year_closes"("companyId", "fiscalYearStart", "fiscalYearEnd");

-- CreateIndex: period_close_audit_logs
CREATE INDEX "period_close_audit_logs_companyId_createdAt_idx" ON "period_close_audit_logs"("companyId", "createdAt");
CREATE INDEX "period_close_audit_logs_companyId_periodCloseId_idx" ON "period_close_audit_logs"("companyId", "periodCloseId");
CREATE INDEX "period_close_audit_logs_companyId_fiscalYearCloseId_idx" ON "period_close_audit_logs"("companyId", "fiscalYearCloseId");
CREATE INDEX "period_close_audit_logs_companyId_action_idx" ON "period_close_audit_logs"("companyId", "action");

-- AddForeignKey: period_closes
ALTER TABLE "period_closes" ADD CONSTRAINT "period_closes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "period_closes" ADD CONSTRAINT "period_closes_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "period_closes" ADD CONSTRAINT "period_closes_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: fiscal_year_closes
ALTER TABLE "fiscal_year_closes" ADD CONSTRAINT "fiscal_year_closes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_year_closes" ADD CONSTRAINT "fiscal_year_closes_retainedEarningsJournalEntryId_fkey" FOREIGN KEY ("retainedEarningsJournalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_year_closes" ADD CONSTRAINT "fiscal_year_closes_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_year_closes" ADD CONSTRAINT "fiscal_year_closes_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: period_close_audit_logs
ALTER TABLE "period_close_audit_logs" ADD CONSTRAINT "period_close_audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "period_close_audit_logs" ADD CONSTRAINT "period_close_audit_logs_periodCloseId_fkey" FOREIGN KEY ("periodCloseId") REFERENCES "period_closes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "period_close_audit_logs" ADD CONSTRAINT "period_close_audit_logs_fiscalYearCloseId_fkey" FOREIGN KEY ("fiscalYearCloseId") REFERENCES "fiscal_year_closes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "period_close_audit_logs" ADD CONSTRAINT "period_close_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 14A-B-1 RBAC: register the three new permissions required by
-- the period close module. Idempotent on Postgres via ON CONFLICT.
INSERT INTO "permissions" ("id", "key", "module", "action", "description")
VALUES
  (gen_random_uuid()::text, 'period_close.read',   'period_close', 'read',   'View period close status and audit logs'),
  (gen_random_uuid()::text, 'period_close.close',  'period_close', 'close',  'Close accounting periods/fiscal years'),
  (gen_random_uuid()::text, 'period_close.reopen', 'period_close', 'reopen', 'Reopen closed accounting periods/fiscal years with reason')
ON CONFLICT ("key") DO NOTHING;
