-- =====================================================
-- Phase 15A: Audit Trail & Activity Log
--
-- Phase 15A-B-1: Audit Log schema and RBAC skeleton.
--
-- Creates/Updates:
--   - Enums: AuditActorType, AuditSeverity, AuditStatus, AuditCategory
--   - Tables:
--       * updates audit_logs to centralized enterprise model
--   - Foreign keys & indexes (tenant isolation via companyId)
--   - RBAC permissions:
--       * audit_log.read
--       * audit_log.export
--       * audit_log.admin
-- =====================================================

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'SECURITY');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('SUCCESS', 'FAILURE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('AUTH', 'USER', 'RBAC', 'ACCOUNTING', 'FINANCIAL_REPORTING', 'SALES', 'PURCHASES', 'PAYMENTS', 'RECONCILIATION', 'PERIOD_CLOSE', 'SYSTEM');

-- DropIndex
DROP INDEX IF EXISTS "audit_logs_action_idx";

-- DropIndex
DROP INDEX IF EXISTS "audit_logs_userId_idx";

-- AlterTable
ALTER TABLE "audit_logs"
ADD COLUMN IF NOT EXISTS "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
ADD COLUMN IF NOT EXISTS "actorUserId" TEXT,
ADD COLUMN IF NOT EXISTS "after" JSONB,
ADD COLUMN IF NOT EXISTS "before" JSONB,
ADD COLUMN IF NOT EXISTS "category" "AuditCategory" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN IF NOT EXISTS "entityType" TEXT,
ADD COLUMN IF NOT EXISTS "event" TEXT NOT NULL DEFAULT 'SYSTEM_EVENT',
ADD COLUMN IF NOT EXISTS "ipAddress" TEXT,
ADD COLUMN IF NOT EXISTS "message" TEXT,
ADD COLUMN IF NOT EXISTS "method" TEXT,
ADD COLUMN IF NOT EXISTS "requestId" TEXT,
ADD COLUMN IF NOT EXISTS "route" TEXT,
ADD COLUMN IF NOT EXISTS "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
ADD COLUMN IF NOT EXISTS "status" "AuditStatus" NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN IF NOT EXISTS "entity" TEXT,
ADD COLUMN IF NOT EXISTS "ip" TEXT,
ADD COLUMN IF NOT EXISTS "userId" TEXT,
ALTER COLUMN "companyId" DROP NOT NULL,
ALTER COLUMN "action" DROP NOT NULL;

-- Ensure orphan references are cleaned up before adding foreign keys
UPDATE "audit_logs" SET "companyId" = NULL WHERE "companyId" IS NOT NULL AND "companyId" NOT IN (SELECT "id" FROM "companies");
UPDATE "audit_logs" SET "actorUserId" = NULL WHERE "actorUserId" IS NOT NULL AND "actorUserId" NOT IN (SELECT "id" FROM "users");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_companyId_category_createdAt_idx" ON "audit_logs"("companyId", "category", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_companyId_entityType_entityId_idx" ON "audit_logs"("companyId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_category_event_idx" ON "audit_logs"("category", "event");
CREATE INDEX IF NOT EXISTS "audit_logs_severity_createdAt_idx" ON "audit_logs"("severity", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_status_createdAt_idx" ON "audit_logs"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- AddForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_companyId_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actorUserId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 15A-B-1 RBAC: register the three new permissions required by
-- the audit log module. Idempotent on Postgres via ON CONFLICT.
INSERT INTO "permissions" ("id", "key", "module", "action", "description")
VALUES
  (gen_random_uuid()::text, 'audit_log.read',   'audit_log', 'read',   'View tenant audit logs'),
  (gen_random_uuid()::text, 'audit_log.export', 'audit_log', 'export', 'Export or preview audit log exports'),
  (gen_random_uuid()::text, 'audit_log.admin',  'audit_log', 'admin',  'Administer broader audit log visibility and system audit access')
ON CONFLICT ("key") DO NOTHING;
