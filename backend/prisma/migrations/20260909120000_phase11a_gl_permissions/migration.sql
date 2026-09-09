-- =====================================================
-- Phase 11A: General Ledger + Posting.
--
-- Phase 11A-B-1: RBAC catalog seed for the GL module.
--
--   This migration ONLY inserts three RBAC catalog rows:
--     gl_accounts.read
--     gl_journal.read
--     gl_journal.write
--
--   NO table changes. NO new enums. NO new columns. NO model
--   duplication. The `Account` / `JournalEntry` / `JournalEntryLine`
--   Prisma models from Phase 6 are REUSED as-is — Phase 11A reuses
--   them, it does not create new copies. No rename of
--   `JournalEntryLine` to `JournalLine`. No change to the existing
--   `JournalEntryStatus` enum (`DRAFT | POSTED | CANCELLED`) — if a
--   `REVERSED` value is ever needed, it lives in a later phase as
--   an additive enum migration, NOT in this phase.
--
--   Reason this is a migration (not a seed edit):
--     Phase 10A planted `ar_payments.*` in
--     `20260908215449_phase10a_payments/migration.sql`, Phase 10B
--     planted `ap_payments.*` in
--     `20260908233949_phase10b_ap_payments_permissions/migration.sql`.
--     Mirroring that decision keeps the RBAC catalog row history in
--     sync with the committed migrations, so any environment that
--     runs `prisma migrate deploy` (instead of `prisma db seed`) lands
--     these keys too. This also avoids editing
--     `backend/prisma/seed.ts` — strict Phase 11A-B-1 file scope
--     forbids that.
--
--   Idempotent on Postgres via ON CONFLICT on the unique
--   permission "key" column (defined by Phase 1's RBAC schema).
--
-- Strict (Phase 11A-B-1):
--   * No schema model duplication (`Account` / `JournalEntry`
--     / `JournalEntryLine` are re-used from Phase 6 unchanged).
--   * No enum migration (`JournalEntryStatus`
--     `DRAFT | POSTED | CANCELLED` stays as-is — `REVERSED` is out
--     of scope; if needed it lands in a separate, additive phase).
--   * No `app.module.ts` edit (Phase 6 `AccountingModule` is already
--     registered and unchanged).
--   * No accounting controller / service / module edits in this phase.
--   * No frontend page, no reports endpoint change, no payment-logic
--     change, no deployment change.
--   * No edits to `_prisma_migrations` (Prisma owns that table).
-- =====================================================

-- Phase 11A-B-1 RBAC: register the three new keys required by the
-- upcoming GL module. Idempotent on Postgres via ON CONFLICT on the
-- unique permission "key" column (defined by Phase 1's RBAC schema).
INSERT INTO "permissions" ("id", "key", "module", "action", "description")
VALUES
  (gen_random_uuid()::text, 'gl_accounts.read',  'gl_accounts', 'read',  'Read access to the General Ledger chart of accounts'),
  (gen_random_uuid()::text, 'gl_journal.read',   'gl_journal',   'read',  'Read access to the General Ledger journal entries'),
  (gen_random_uuid()::text, 'gl_journal.write',  'gl_journal',   'write', 'Write access to the General Ledger journal entries (create / post / cancel)')
ON CONFLICT ("key") DO NOTHING;
