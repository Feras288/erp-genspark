# Phase 11A — GL / Accounting Architecture Plan

> Status: **scoping plan only**. No schema, no code, no migration, no RBAC changes are part of this artefact. All concrete tables, models, columns, indexes, controllers, services, DTOs, e2e tests, frontend pages, or permission constants are deferred to the sub-phases listed in section 5.

## 1. Goal & Scope of the General Ledger (GL) layer

The General Ledger (GL) is the **double-entry ledger** of the ERP — every financial event that affects the books of the company is recorded as an immutable journal entry composed of balanced journal lines, one per account. It sits one level below the source documents (SalesInvoice, PurchaseInvoice, AR Payment, AP Payment) and above the reporting layer that already exists in `Phase 7B-6` (`/api/reports/...`).

### 1.1 What the GL layer owns

- **Chart of accounts** (`Account` model) — the master list of ledger accounts the company posts to. Hierarchical by nature (Asset / Liability / Equity / Revenue / Expense), with a stable `code` and a localised `name`.
- **Journal entries** (`JournalEntry` model) — the immutable header for a single posting event. Holds the posting date, source-document reference, fiscal period, and posting status.
- **Journal lines** (`JournalLine` model) — the individual debit/credit lines that belong to a journal entry. Every entry must be balanced (sum of debits == sum of credits).
- **Posting from invoices/payments** — the act of deriving journal entries from SalesInvoice (POSTED), PurchaseInvoice (RECEIVED), AR Payment, and AP Payment source documents.
- **Audit trail** — every journal entry/line is immutable once posted. Reversal is performed by posting a **reversing entry**, never by mutating or deleting the original.
- **Tenant isolation by companyId** — accounts, entries, lines, and reports are all scoped to the `companyId` of the JWT; cross-tenant data must be unreachable from any read path.

### 1.2 What the GL layer is *not*

- It is *not* a sub-ledger: AR and AP remain in the source documents (SalesInvoice / PurchaseInvoice + payments). The GL only mirrors the economic effect.
- It is *not* a reconciliation system: matching to bank statements is **out of scope for Phase 11A** (explicit below).
- It is *not* a reporting generator: the existing reports module (Phase 7B-6) keeps its current computation model and will be re-pointed only when Phase 11 sub-phase B-4 (out of scope for 11A) is opened.

## 2. In Scope for Phase 11A

Phase 11A delivers a **skeleton** of the GL layer — enough to be tested and verified locally, but explicitly narrow:

- **GL schema skeleton** — the minimal set of tables (`accounts`, `journal_entries`, `journal_lines`) plus their FK shape; concrete columns and indexes are defined in 11A-B-1, *not* in this plan.
- **Account model** (`Account`) — id, companyId, code, name, type/accountClass, parentId (self-reference for hierarchy), and audit fields.
- **Journal entry model** (`JournalEntry`) — id, companyId, postingDate, fiscalPeriod reference, source-document reference (polymorphic), status (`DRAFT | POSTED | REVERSED`), reversal-of (self-reference), createdById, postedById, audit fields.
- **Journal lines model** (`JournalLine`) — id, journalEntryId (FK), accountId (FK), direction (`DEBIT | CREDIT`), amount (Decimal), currency (single-currency for 11A), line memo, and audit fields.
- **Immutability of posted entries** — once a `JournalEntry` transitions to `POSTED`, its header and lines reject in-place updates and deletes at the service level; corrections happen via reversing entries.
- **No bank reconciliation yet** — explicit non-goal, listed in section 3.
- **Single currency assumption** — Phase 11A posts in the company's base currency only; multi-currency translation gain/loss is deferred.

## 3. Out of Scope for Phase 11A (Explicit)

The following items are *intentionally* excluded from 11A and either deferred to a later phase or rejected outright. They must not leak into 11A-B-* commits:

- **Bank reconciliation** — no matching between journal lines and bank statements, no statement import, no reconciliation UI.
- **Tax filing** — no VAT/WHT/withholding tax returns, no periodic filing flows, no tax-period control tables.
- **Financial statements** — no balance sheet, no income statement, no cash-flow statement export. Phase 7B-6 reports remain the source of truth for reporting through 11A.
- **Multi-currency** — no FX rate table, no translation gain/loss, no revaluation; single base currency only.
- **External integrations** — no accounting SaaS sync, no payment-gateway webhooks affecting the ledger, no bank-API feeds, no payroll/HR import.
- **Deployment** — no Cloudflare Pages, no hosted CF resources, no Worker for Platform, no Docker Compose orchestration changes, no hosted identity. 11A continues to run on local Docker Compose + local NestJS + local Next.js, exactly like 9E/10A/10B.

## 4. Linkage to Prior Phases (Read-only, No Coupling in 11A)

Phase 11A does **not** wire the source documents to the ledger yet (that is 11A-B-2's job). For planning context only:

| Prior artefact | Phase | GL relevance |
|---|---|---|
| `SalesInvoice` + `Payment` (AR) | Phase 10A | Future posting on `POSTED` (issue) and on AR Payment `POSTED` |
| `PurchaseInvoice` + `Payment` (AP) | Phase 10B | Future posting on `RECEIVED` and on AP Payment `POSTED` |
| `Partner` register | Phase 4 | Code-of-account linkage party dimension (sub-ledger mirror) |
| `Product` cost/price | Phase 3 | Inventory-side postings (out of 11A scope but reserved for a later phase) |
| Reports module (`purchasesSummary`, `salesSummary`, `apAging`, `arAging`) | Phase 7B-6 / 9E | Will be re-pointed to the GL in a later phase — *not* in 11A |

The link in 11A is **architectural only**: a journal entry carries a polymorphic source-document reference (salesInvoiceId / purchaseInvoiceId / arPaymentId / apPaymentId) so any future posting logic has a stable FK target. The actual `POST` transaction that creates the entry on source-document write is **not** added in 11A.

### 4.1 Tenant isolation guarantees inherited from prior phases

- `companyId` is the only tenant boundary; it comes from the JWT, never from the URL or the body.
- All new GL models follow the same `companyId` indexing pattern already used by `Account` (future) and the existing source documents (SalesInvoice / PurchaseInvoice / Payment).
- The polymorphic source-document FK on `JournalEntry` is *not* a substitute for tenant filtering — it only describes *where* the entry came from; *who* owns it is always `companyId`.

## 5. Proposed Sub-Phases

Each sub-phase is a single-domain commit, mirroring the discipline established in Phase 9E/10A/10B.

### 11A-B-1 — Schema + RBAC skeleton (backend)

- `Account`, `JournalEntry`, `JournalLine` models in `backend/prisma/schema.prisma`.
- Migration: `2026xxxxxxxx_phase11a_gl_skeleton`.
- `GlModule`, `GlController`, `GlService` skeleton — read endpoints only, no posting transaction yet.
- RBAC: `gl_accounts.read`, `gl_journals.read` (proposed names; final names locked in 11A-B-1).
- Seed: chart-of-accounts seed for the default company (idempotent, deterministic).
- Forbidden: no posting logic, no entry creation from source documents, no frontend.

### 11A-B-2 — Posting logic (backend)

- `JournalService` (or equivalent) — balanced-entry construction in `prisma.$transaction`.
- Posting triggers (service-level, not DB-level): SalesInvoice POSTED, PurchaseInvoice RECEIVED, AR Payment POSTED, AP Payment POSTED.
- Reversing-entry helpers — `reverseJournalEntry(id, reason)` posts a new entry that mirrors the original with negated lines and links via `reversalOf`.
- Immutability guard — `JournalEntry.status === 'POSTED'` rejects update/delete at the service layer; the only legal state transition is `POSTED -> REVERSED`.
- Decimal arithmetic via `Prisma.Decimal` + `decimalToString` (no `Number()` in the math path).
- Forbidden: no frontend, no reported-period-close, no bank reconciliation, no tax calc.

### 11A-B-3 — e2e smoke

- Append a `describe('Phase 11A-B-3')` block inside the existing e2e suite.
- Coverage:
  - 1a — GET chart of accounts returns seeded accounts, tenant-scoped.
  - 1b — GET a posted journal entry returns the entry + its lines (debits == credits).
  - 2a — Posting from SalesInvoice POSTED creates a balanced entry.
  - 2b — Posting from PurchaseInvoice RECEIVED creates a balanced entry.
  - 2c — AR Payment POSTED creates a balanced cash/debit + AR/credit entry.
  - 2d — AP Payment POSTED creates a balanced AP/debit + cash/credit entry.
  - 3a — Reversing entry creates a *new* POSTED entry linked via `reversalOf`, not an in-place mutation.
  - 3b — Cross-company read returns 404/empty (tenant isolation).
- Forbidden: no contract changes to source-document endpoints, no new permissions, no schema edits beyond what 11A-B-1 introduces.

### 11A-C — Frontend minimal ledger view

- Read-only ledger page under `frontend/src/app/accounting/gl/page.tsx` (or the existing `/accounting` entry point).
- Components: account tree picker, journal entry list (paginated by fiscal period), journal entry detail (header + balanced lines).
- API client additions in `frontend/src/lib/api.ts`: `listAccounts`, `listJournalEntries({ periodId?, fromDate?, toDate? })`, `getJournalEntry(id)`.
- Permission gates: `canReadGlAccounts = hasPermission('gl_accounts.read')`, `canReadGlJournals = hasPermission('gl_journals.read')`.
- Hard rule: **read-only** — no posting UI, no reversing UI, no manual journal creation from the frontend in 11A. Posting remains a backend-only concern driven by source-document state transitions.
- Forbidden: no write actions, no new dependencies, no new routes beyond the ledger view listed above.

### 11A-D-1 — Final verification

- `pnpm --filter @erp/backend build` PASS.
- `pnpm --filter @erp/backend test:e2e` PASS with the new 7 tests from 11A-B-3 absorbed into the existing suite (total expected: 129 + new tests). The exact final count is locked at 11A-D-1, not here.
- `pnpm --filter @erp/frontend build` PASS.
- `git status --short` empty, HEAD unchanged.
- Forbidden: no reruns of e2e without an explicit reset.

### 11A-D-2 — README closure

- One new H2 section `## Phase 11A: General Ledger + Posting` appended after the 10B closure line.
- Same structure as the 10A/10B sections (Commits / Schema / Permissions / Endpoints / Posting behavior / Frontend / Verification / Out-of-scope / Hard prohibitions / Recommendation).
- Allowed change: `README.md` only.
- Forbidden: same as 11A-D-1.

## 6. Cross-Phase Invariants (Locked for 11A)

These invariants are inherited from prior phases and **must not** be relaxed in 11A:

- Tenant boundary is `companyId` from JWT only, never from URL or body.
- All amounts handled via `Prisma.Decimal` + `decimalToString`; no `Number()` in the posting math path.
- RBAC enforcement is server-side via `@RequirePermissions` + `PermissionsGuard`, mirrored client-side via `useAuth().hasPermission(...)` reading from the JWT claim — no fallback in app JavaScript.
- Mirroring the prior phases' commit discipline: `git add <file>...` explicitly, never `git add .` / `git add -A`.
- No skills activated across the 11A loop — CF Pages WRangler deploy, hosted identity, hosted CF resources, and SB-Git design handoff are all out of scope for an ERP running on localhost with Postgres + Prisma.
- No deployment orchestration change — local Docker Compose + local NestJS + local Next.js only.

## 7. Open Questions Deferred to Sub-Phases

These questions are intentionally **not** answered in this plan; they belong to the B-level sub-phases that own the concrete implementation:

- Final RBAC permission names (currently proposed as `gl_accounts.read`, `gl_journals.read`).
- Exact column shape for `Account.parentId` vs. a separate `AccountGroup` table.
- Whether reversal links are stored on the *original* entry, the *reversing* entry, or both.
- Whether journal entries become the source of truth for invoice totals in later phases, or whether they remain a derived mirror indefinitely.
- The chosen pagination strategy on the journal entry list (offset vs. cursor) for 11A-C.

## 8. Recommendation

Phase 11A is opened as a **scoping plan** only. The first concrete commit will be 11A-B-1 (schema + RBAC skeleton), at which point this plan becomes the contract that 11A-B-1 / 11A-B-2 / 11A-B-3 / 11A-C / 11A-D-1 / 11A-D-2 deliver against. Any change to scope above requires a `docs/PHASE_11A_GL_PLAN.md` amendment first, *then* the corresponding sub-phase commit.

> **No code, no schema, no migration, no RBAC change, no test, and no deployment belong to this commit. The plan file is the only artefact.**
