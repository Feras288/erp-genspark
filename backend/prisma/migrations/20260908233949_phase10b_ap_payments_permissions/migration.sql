-- =====================================================
-- Phase 10B: AP Payments + Settlement Tracking.
--
-- Phase 10B-B-1: RBAC catalog seed for the AP payments module.
--
--   This migration ONLY inserts two RBAC catalog rows:
--     ap_payments.read
--     ap_payments.write
--
--   No table changes, no new enums, no new columns. The polymorphic
--   "Payment" model from Phase 10A is REUSED as-is — `invoiceType` is
--   already `SALES | PURCHASE` (Phase 10A-B-1) and the `purchaseInvoiceId`
--   FK + index + CHECK invariant are already in place.
--
--   Reason this is a migration (not a seed edit):
--     Phase 10A planted `ar_payments.*` the same way in
--     `20260908215449_phase10a_payments/migration.sql`. Mirroring that
--     decision keeps the RBAC catalog row history in sync with the
--     committed migrations, so any environment that runs `prisma migrate
--     deploy` (instead of `prisma db seed`) lands these keys too.
--     This also avoids editing `backend/prisma/seed.ts` — strict
--     Phase 10B-B-1 file scope forbids that.
--
--   Idempotent on Postgres via ON CONFLICT.
--
-- Strict (Phase 10B-B-1):
--   * No PAID / PARTIALLY_PAID status enum (T-2 lock — same as 10A).
--   * No PurchaseInvoice.paidAmount column (deferred; 10B-B-2 will
--     derive outstanding from SUM(Payment.amount) directly).
--   * No AP-Aging source change (Phase 9E invariants preserved).
--   * No GL / bank reconciliation / drill-down statements.
--   * No skeleton endpoint implementation in this migration.
-- =====================================================

-- Phase 10B-B-1 RBAC: register the two new permissions required by
-- the AP payments module. Idempotent on Postgres via ON CONFLICT on
-- the unique permission "key" column (defined by Phase 1's RBAC schema).
INSERT INTO "permissions" ("id", "key", "module", "action", "description")
VALUES
  (gen_random_uuid()::text, 'ap_payments.read',  'ap_payments', 'read',  'List / get payments on a purchase invoice'),
  (gen_random_uuid()::text, 'ap_payments.write', 'ap_payments', 'write', 'Register / soft-cancel a payment on a purchase invoice')
ON CONFLICT ("key") DO NOTHING;
