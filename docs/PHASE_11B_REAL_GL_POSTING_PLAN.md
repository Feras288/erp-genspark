# Phase 11B — Real GL Posting Architecture Plan

> Status: **scoping plan only**. No schema, no code, no migration, no RBAC change, no test, no frontend change belong to this artefact. All concrete tables, columns, indexes, transactions, services, controllers, DTOs, e2e tests, frontend pages, and permission constants are deferred to the sub-phases listed in section 9. This plan **inherits and is bounded by** Phase 11A (foundation — done) and Phase 6 (Accounting Core — done).

## 1. Goal & Scope of Real GL Posting

The Real GL Posting phase wires the **source-document layer** (SalesInvoice, PurchaseInvoice, AR Payment, AP Payment) to the **double-entry ledger** (JournalEntry + JournalEntryLine) introduced in Phase 6 and RBAC-hardened read-side in Phase 11A. After Phase 11B, every committed source-document state transition produces an immutable, balanced journal entry automatically — without any manual journal creation from the UI.

### 1.1 What this phase delivers

- **Auto-posting on source-document transitions** — a single `postingOnTransition` mechanism in the same `prisma.$transaction` as the source-document write, so no event can be created without its ledger entry (or vice versa).
- **Idempotency on posting** — every source document links to **at most one** journal entry per `(companyId, sourceType, sourceId)` triple via a new unique index; reruns / network retries / transaction replay produce zero extra entries.
- **Per-event journal templates** — four concrete, double-entry-balanced templates (SalesInvoice ISSUED, PurchaseInvoice RECEIVED, AR Payment POSTED, AP Payment POSTED), all of which produce `totalDebit.equals(totalCredit)`.
- **Account-mapping strategy** — six required `accountCode` placeholders (one per required leg type) that the seed layer exposes for each company on first login, surfaced via the chart-of-accounts endpoint and referenced by name on the DTO of every event template.
- **Cancellation / reversal strategy** — strictly via **reversing entries** (mirrored + linked). In-place updates and deletes on `JournalEntry.status === 'POSTED'` remain rejected by the service layer introduced in Phase 6; Phase 11B adds the explicit reversing-entry helpers that respect the Phase 11A Fork A wording preserved in section 6 below.
- **Tenant isolation** — every ledger row carries `companyId` from the JWT only; the new unique index is `@@unique([companyId, sourceType, sourceId])` (NOT just `[sourceType, sourceId]`).
- **Decimal precision** — `Prisma.Decimal` only via the existing `decimalToString` boundary; `Number()` in any posting math path is forbidden.

### 1.2 What this phase explicitly is *not*

- It is *not* a replacement for the source documents: `SalesInvoice` and `PurchaseInvoice` remain the contracts of record. The post-Phase-11B reality is that committing a document automatically spawns the ledger entry; nothing in the API surface or DTOs changes from the caller's perspective.
- It is *not* a reconciliation system: matching GL lines to bank statements remains **out of scope** (section 6).
- It is *not* a financial-statement generator: Phase 7B-6 reports and the future GL-readout phases remain the only reporting surface; Trial Balance, P&L, Balance Sheet are deferred.
- It is *not* an FX layer: single base currency (`SAR`) only.

## 2. In Scope for Phase 11B (concrete itemised list)

The phase is broken into **eight** concrete deliverables. Each is mapped to one sub-phase in section 9.

| # | Deliverable | Sub-phase |
|---|---|---|
| 1 | Auto-post on SalesInvoice transition DRAFT → ISSUED | 11B-B-2 |
| 2 | Auto-post on PurchaseInvoice transition DRAFT → RECEIVED | 11B-B-3 |
| 3 | Auto-post on AR Payment `status: POSTED` insertion (Phase 10A flow) | 11B-B-4 |
| 4 | Auto-post on AP Payment `status: POSTED` insertion (Phase 10B flow) | 11B-B-5 |
| 5 | Idempotency guards on every auto-post (no duplicate entries per source) | 11B-B-1 + each B-2..B-5 |
| 6 | Account-mapping seed required-roles bundle (6 codes) per company on first login | 11B-B-1 |
| 7 | Reversing-entry helpers + cancellation transitions for source documents | 11B-B-1 (helpers) + 11B-B-2..5 (caller hooks) |
| 8 | e2e coverage + frontend read-only visibility on the resulting posted entries | 11B-B-6 + 11B-C |

Phase 11B must not introduce anything outside this list. Cross-phase invariants in section 7 also apply.

## 3. Accounting Events (the four trigger points)

Each event produces exactly **one** `JournalEntry` per source-document state transition. The trigger lives inside the **same `prisma.$transaction`** as the source-document write; either both succeed or both fail. The events are:

### 3.1 `sales_invoice_issued`

- **Trigger**: `SalesIssueService` (or equivalent) writing `status: 'ISSUED'` on a `SalesInvoice` row inside a `prisma.$transaction`.
- **Source identity (for idempotency)**: `{ sourceType: 'SALES_INVOICE', sourceId: salesInvoice.id }`.
- **Frequency**: at most once per `salesInvoiceId` over the lifetime of the invoice (re-issue is a separate Phase, not in 11B).
- **Cancellation hook**: if `SalesInvoice.status` later transitions `ISSUED → CANCELLED`, section 3.5's reversing-entry flow applies; this is **not** an in-place delete of the original entry.

### 3.2 `purchase_invoice_received`

- **Trigger**: `PurchaseInvoiceReceiveService` (or equivalent) writing `status: 'RECEIVED'` on a `PurchaseInvoice` row.
- **Source identity**: `{ sourceType: 'PURCHASE_INVOICE', sourceId: purchaseInvoice.id }`.
- **Frequency**: at most once per `purchaseInvoiceId`.
- **Cancellation hook**: `RECEIVED → CANCELLED` triggers the reversing flow.

### 3.3 `ar_payment_posted`

- **Trigger**: `PaymentsService` (Phase 10A-B-2) inside the `$transaction` that inserts the AR `Payment` row with `status: 'POSTED'`. The trigger fires unconditionally when an AR payment commits — there is no second-stage "settle" call.
- **Source identity**: `{ sourceType: 'AR_PAYMENT', sourceId: payment.id }`. The polymorphic `salesInvoiceId` on the source row is preserved as the **invoice being settled**, used only inside the journal description / memo — it is **not** a second posting source.
- **Frequency**: one per AR Payment row; multiple AR Payments on the same `salesInvoiceId` are allowed (partial settlement) and each produces its own balanced entry.
- **Cancellation hook**: `status: 'POSTED' → 'CANCELLED'` (soft cancel `cancelledAt`/`cancelledById` from the Phase 10A-B-2 schema) **does not** itself produce a reversing-entry in Phase 11B; the reverse must be explicit via a new POST endpoint introduced only if Phase 11B-B-4 opens that path. For Phase 11B the rule is: **soft-cancelled AR Payments keep their journal entry** (the payment row is canonical); reversal of the GL side **only** fires when the user code-pair explicitly invokes the helper. This avoids coupling the GL reversal to soft-cancel settings of an unrelated model.

### 3.4 `ap_payment_posted`

- **Trigger**: `PaymentsService` (Phase 10B-B-2) inside the `$transaction` that inserts the AP `Payment` row with `status: 'POSTED'`.
- **Source identity**: `{ sourceType: 'AP_PAYMENT', sourceId: payment.id }`. The polymorphic `purchaseInvoiceId` on the source row is the **invoice being settled**, mirrored into the memo only.
- **Frequency**: one per AP Payment row; multiple AP Payments on the same `purchaseInvoiceId` (partial settlement) each produce their own balanced entry.
- **Cancellation hook**: same rule as 3.3 — soft-cancelled AP Payments keep their journal entry; reversal is explicit-only in 11B-B-5.

> ⚠️ Note on partial settlement: the AR/AP runtime-outstanding formula (`max(0, outstanding) - paidAmount accumulation`) is **already** what Phase 10A/10B manage at the source-document layer. Phase 11B does **not** edit that formula or the running balance on `SalesInvoice.paidAmount`; the journal entry it creates is the **economic mirror** of the change, computed from the four numbers already stored on the source document (subtotal, vatTotal, discountTotal, total). Updating the running outstanding balance from the GL is **not** in scope.

### 3.5 Cancellation / reversal strategy (locked)

Phase 11A-Fork A wording is **preserved**: cancelling a `JournalEntry` whose `status` is `'POSTED'` is rejected with `ConflictException` carrying the literal message:

> *"Posted journal entries require reversing entries, which is out of scope in Phase 6."*

Phase 11B widens this to a **single explicit helper** that produces a reversing entry. The reversal contract:

- The original `JournalEntry` is **never** mutated or deleted.
- A new `JournalEntry` is created inside the same `$transaction` as the reversal trigger; its `lines` mirror the original lines with `debit ↔ credit` swapped per leg and **the exact same `Prisma.Decimal` amount** (sign-flipped). Sum of debits and sum of credits both match the original entry's totals.
- A new column `reversalOf: String?` (FK self-reference, nullable) is added on `JournalEntry` to link the new entry to the original; this column exists **only** for future GL-readout / Phase 12 use — no Phase 11B code path reads from it.
- `JournalEntryStatus` enum **stays at `DRAFT | POSTED | CANCELLED`** — same as Phase 6 — no `REVERSED` value added. Reversing entries are themselves `POSTED` (committed) with `reversalOf` linking them to the original. The audit trail is the `reversalOf` FK + the original entry's `cancelledAt / cancelledById` field groups if those columns exist.
- The helper name pattern (locked for 11B-B-1, finalised at 11B-D-1): `reverseJournalEntry(companyId, originalId, reason, userId)` — returns the new `JournalEntry` row.
- Cancelled **source documents** (SalesInvoice `CANCELLED`, PurchaseInvoice `CANCELLED`) trigger the reversing helper **automatically**, inside the same `$transaction` as the source-document status change. Soft-cancelled source documents do **not** trigger reversal unless and until they themselves transition to a "hard" cancellation endpoint that Phase 11B introduces as part of 11B-B-2/3.
- Invoice / payment cancellation in Phase 11B does **not** change the source document's status enum (the three-state locks stay). The "this document is cancelled" flag is implemented as a **reversal** of the original posting only.

## 4. Journal Entry Templates (one per event)

All four templates are guaranteed balanced. "Total debit = Total credit" is verified by the existing `validateJournalBalances` helper introduced in Phase 11A-B-2 (commit `bfe9377`) using `Prisma.Decimal.equals(...)` strict equality on `Decimal(18, 4)`. The helper is reused; **no new math primitive is introduced**.

### 4.1 `sales_invoice_issued` template

```
Dr  AR_CONTROL                    invoice.total      // = subtotal + vatTotal - discountTotal
   Cr SALES_REVENUE               invoice.subtotal
   Cr VAT_OUTPUT                  invoice.vatTotal   // 0 if the invoice has no VAT line
   Cr SALES_DISCOUNTS             invoice.discountTotal // 0 if no discounts
```

Notes:
- `invoice.total` is the field already on `SalesInvoice` (Phase 4 financial model). The ledger entry derives from it; it does **not** invent a new total.
- `VAT_OUTPUT` leg may be omitted (skip the line entirely) if `invoice.vatTotal.equals(0)`, but for Phase 11B we **always include it** for symmetry, even when zero — simpler audit and the `equals-0` case still passes the balance test.
- `SALES_DISCOUNTS` leg follows the same rule.
- The `registerId`/invoice number on `JournalEntry.entryNumber` is **derived** from the source's invoice number, prefixed by a `SL-` literal e.g. `SL-{entryNumber}`. The exact format is locked in 11B-B-1.

### 4.2 `purchase_invoice_received` template

```
Dr  INVENTORY_OR_EXPENSE         invoice.total
Dr  VAT_INPUT                    invoice.vatTotal   // 0 if no VAT line
   Cr AP_CONTROL                 invoice.total + invoice.vatTotal
```

Notes:
- `INVENTORY_OR_EXPENSE` is a **single required account-code** in the seed bundle. Whether a tenant uses it as inventory or expense is up to the company's account configuration, but Phase 11B publishes only **one** placeholder code. Splitting into inventory-only and expense-only is a future phase.
- `VAT_INPUT` likewise is a single required code, included even when zero.
- The model **does not** invent tax amounts; both legs read from the existing `PurchaseInvoice` columns (`subtotal`, `vatTotal`, `discountTotal`, `total`). Phase 5's totals are reused; no re-computation of VAT.

### 4.3 `ar_payment_posted` template

```
Dr  CASH_OR_BANK                  payment.amount
   Cr AR_CONTROL                  payment.amount
```

Notes:
- The AR control account is **the same** account referenced by the `sales_invoice_issued` template (`AR_CONTROL`). Symmetry is mandatory: paying an invoice reduces the receivable that the invoice originally created.
- The cash / bank account (`CASH_OR_BANK`) is a **single required code** placeholder. Phase 11B does not model multiple bank accounts; one is enough.
- A `paymentMethod` enum value (`CASH | CARD | TRANSFER | OTHER` from Phase 10A-B-1) is preserved in the journal `memo` field as a label, **not** as a separate leg or filter.
- All payments are partial-aware: the same `payment.amount` field drives both legs; the ratio of paid-to-outstanding is computed by Phase 10A's existing logic on `SalesInvoice.paidAmount`, never by Phase 11B.
- A separate revenue / invoice-side accounting adjustment for partial payments is **not** introduced; Phase 11B treats each payment as its own balanced event, period.

### 4.4 `ap_payment_posted` template

```
Dr  AP_CONTROL                    payment.amount
   Cr CASH_OR_BANK                payment.amount
```

Symmetrically the same six required codes appear across the four templates. The full required-codes list is locked in 11B-B-1 as:

```
AR_CONTROL, AP_CONTROL, SALES_REVENUE, INVENTORY_OR_EXPENSE,
CASH_OR_BANK, VAT_INPUT, VAT_OUTPUT, SALES_DISCOUNTS
```

Eight codes total — five of which are mandatory in every event, three (`VAT_OUTPUT`, `VAT_INPUT`, `SALES_DISCOUNTS`) are always-written but may have a zero amount.

## 5. Required Account Mapping & Seed Strategy

### 5.1 Required account codes (final list, locked at 11B-B-1)

| Code (slug, ≤ 32 chars) | Display name | AccountType | NormalBalance | Required? |
|---|---|---|---|---|
| `AR_CONTROL` | Accounts Receivable Control | `ASSET` | `DEBIT` | ✅ mandatory |
| `AP_CONTROL` | Accounts Payable Control | `LIABILITY` | `CREDIT` | ✅ mandatory |
| `CASH_OR_BANK` | Cash / Bank | `ASSET` | `DEBIT` | ✅ mandatory |
| `SALES_REVENUE` | Sales Revenue | `REVENUE` | `CREDIT` | ✅ mandatory |
| `INVENTORY_OR_EXPENSE` | Inventory or Purchases Expense | `EXPENSE` | `DEBIT` | ✅ mandatory |
| `VAT_OUTPUT` | VAT Output (Sales) | `LIABILITY` | `CREDIT` | ✅ mandatory (zero allowed) |
| `VAT_INPUT` | VAT Input (Purchases) | `ASSET` | `DEBIT` | ✅ mandatory (zero allowed) |
| `SALES_DISCOUNTS` | Sales Discounts | `REVENUE` (contra) | `DEBIT` | ✅ mandatory (zero allowed) |

Validation enforced inside the seed migration (`2026xxxxxxxx_phase11b_required_accounts_seed`) using `@@unique([companyId, code])` already present on `Account` from Phase 6. The seed is **idempotent** (`upsert` per `(companyId, code)` triple) — repeat runs are safe and never duplicate rows.

### 5.2 Tax accounts (proposal — Phase 11B scope confirmation)

`VAT_OUTPUT`, `VAT_INPUT` are mandatory placeholders even outside Saudi Arabia. The plan deliberately **does not** introduce: Withholding Tax, Zakat, Excise, Real-Estate Tax. Each of these is a future standalone phase. The user-spec line "`tax accounts if applicable later`" is interpreted as **future-phase tax expansion** — Phase 11B ships only the two general VAT placeholders above.

### 5.3 Account mapping delivery

- **Backend seed**: Phase 11B-B-1 migration inserts the eight required accounts for any pre-existing company on `prisma migrate deploy` is **not** the trigger — the seed hooks into the existing `prisma db seed` entry under `companyId = JWT scope`, and also runs opportunistically when a company issues its first invoice. The exact delivery vehicle is locked in 11B-B-1.
- **Per-company activation**: a tenant (`companyId`) without all eight codes cannot post — the auto-post transaction throws `BadRequestException` listing the missing codes by slug. The frontend ledger view shows the missing codes as an inline banner so admins can pre-create them.
- **Customisation**: tenants can rename codes / set individual GL codes manually using the existing `POST /api/accounting/accounts` and `PATCH /api/accounting/accounts/:id` endpoints (Phase 6). Phase 11B does **not** introduce a rename handler; the existing endpoints cover it.
- **No required fields beyond the slug**: each tenant owns their mapping. Phase 11B never hard-codes GL account IDs; it works by `code` lookup per `companyId` inside the `$transaction`.

## 6. Idempotency Strategy

### 6.1 Uniqueness guarantee

The phase introduces **one new column** on `JournalEntry` (Phase 11B-B-1 schema):

- `sourceType: JournalEntrySourceType` enum, nullable (`'SALES_INVOICE' | 'PURCHASE_INVOICE' | 'AR_PAYMENT' | 'AP_PAYMENT' | null`).
- `sourceId: String?` (FK string — soft pointer to the source row; **not** a Prisma foreign key because the source row lives on a different model per type and Prisma does not have a clean polymorphic FK without a side table; cross-table referential integrity is enforced by application-level checks, see 6.3).
- `@@unique([companyId, sourceType, sourceId])` — the index that prevents duplicates. This index **prevents a rerun, retry, or duplicate trigger** from inserting a second entry for the same source.

### 6.2 Why companyId is part of the index

A bare `[sourceType, sourceId]` index would *theoretically* prevent duplicates across tenants, but it does not protect against test data contamination or accidental cross-tenant replay. Including `companyId` in the unique key matches the multi-tenant invariant: tenant identity is the company boundary, not the global row identity. Phase 11A-B-3's cross-tenant 404 invariant (commit `d993e54`) is preserved.

### 6.3 FK integrity on sourceId

Because `sourceId` is a polymorphic opaque string, referential integrity is enforced **inside the `prisma.$transaction`** that creates the posting:

1. `SELECT <source_table> WHERE id = sourceId AND companyId = companyId`.
2. If 404 → throw `NotFoundException("source document not found for posting")`.
3. If 200 → continue.
4. Insert the `JournalEntry` row; the unique index catches any non-transient duplicate.

This pattern reuses the existing transaction-logic style of Phase 10A-B-2 + Phase 10B-B-2 (`prisma.payment.aggregate` inside the `$transaction`). No new helpers; the integrity check is inlined into each B-* auto-post call site.

### 6.4 What is NOT in scope for idempotency

- **Idempotency-Key on the client side** (Phase 10A pattern) is **not** added to the auto-post path. The phase adds an idempotency *guarantee on the server side* via the unique index; clients do not need to send an Idempotency-Key for posting, because posting is triggered internally inside a transaction-bound write on the source document.

## 7. Cross-Phase Invariants (Locked for 11B)

These invariants are inherited from prior phases and must **not** be relaxed:

- **Tenant boundary** is `companyId` from JWT only, never from URL or body. The `payments.service.ts` and `purchase-invoices.service.ts` patterns (Phases 10A / 5A) are reused.
- All amounts handled via `Prisma.Decimal` + `decimalToString`; `Number()` is **forbidden** in the posting math path. The existing `dec()` / `fmt4()` / `decimalToString` primitives in `accounting.service.ts` are reused.
- RBAC enforcement is server-side via `@RequirePermissions` + `PermissionsGuard`, mirrored client-side via `useAuth().hasPermission(...)` (no fallback in app JavaScript).
- Commit discipline: every commit uses `git add <file>...` explicitly — `git add .` and `git add -A` are forbidden.
- The four-test guard from Phase 11A-D-1 (backend build PASS / e2e PASS / frontend build PASS / working tree clean) extends to **include an e2e delta**: Phase 11B-B-6 adds tests, and the total count must grow by ≥ N tests (exact N locked at 11B-B-6 time).
- The four CF-deploy skills (`cf-byok-deploy`, `designer-handoff`, `gsk-hosted-deploy`, `gsk-hosted-identity`) are NOT activated across the 11B loop. ERP continues to run on local Docker Compose + local NestJS + local Next.js.

## 8. Out of Scope for Phase 11B (Explicit)

The following are **deliberately outside** this phase. Each belongs to a separate future phase:

- **Financial statements** — no Trial Balance report, no P&L export, no Balance Sheet, no Cash-Flow Statement, no Equity statement. The existing reports module (`Phase 7B-6` + Phase 9/10A/10B additions) remains the source of truth for reporting during Phase 11B.
- **Bank reconciliation** — no matching between journal lines and bank statements, no statement import, no reconciliation UI.
- **Tax filing** — no VAT/WHT return flows, no ZATCA e-invoicing, no tax-period control tables. Only the **VAT placeholders** (5.1) are introduced.
- **Multi-currency** — no FX rate table, no translation gain/loss, no revaluation. Phase 11B is **single base currency** (`SAR`).
- **External integrations** — no bank API feeds, no payment-gateway webhooks, no accounting SaaS sync (Xero / QuickBooks / Zoho Books), no HR/payroll/COGS sync.
- **Other-than-required account codes** — only the eight seeds from 5.1 are inserted. Tenants may add more; Phase 11B does not create any other account.
- **Manual journal creation beyond DRAFT** — Phase 11B does not deprecate the existing `POST /api/journal` endpoint introduced in Phase 6; it adds the auto-post path **alongside**, not replacing it. Phase 11B is *additive*; existing Phase 6 endpoints continue to be wired exactly as today (the only change is that future commits should not add new ad-hoc auto-post outside the templates defined here — a `docs` follow-up in 11B-D-1 will formalise this rule).
- **Default seed/demo chart of accounts beyond the eight required** — Phase 6 deliberately ships no seed chart; Phase 11B deliberately ships only the eight required codes by slug. No additional demo / sample GL accounts are added.
- **Deployment** — no Cloudflare, no hosted CF, no Docker Compose orchestration change, no wrangler, no hosted identity. Localhost only.

## 9. Proposed Sub-Phases (each is single-domain)

Sub-phases mirror the Phase 11A single-domain discipline. Each sub-phase produces **one** commit on `main`; the commit message format is fixed in sub-phase header.

### 9.1 `11B-B-1` — Schema + linking skeleton (backend)

Commit message: `feat(phase-11b): add GL posting schema + idempotency link + account seed`

Allowed files:
- `backend/prisma/schema.prisma` — adds `JournalEntry.sourceType` enum + `JournalEntry.sourceId String?` + `@@unique([companyId, sourceType, sourceId])` + the eight required account code UPserts in seed.
- `backend/prisma/migrations/2026xxxxxxxx_phase11b_required_accounts_seed/migration.sql` — idempotent INSERTs via `ON CONFLICT (companyId, code) DO NOTHING`.
- `backend/src/accounting/reversal.ts` (new) — exports `reverseJournalEntry(companyId, originalId, reason, userId)`.
- `backend/src/accounting/posting-events/` — new directory with **read-only** type definitions and per-event template builders (no `$transaction` invocation yet — just `buildTemplate(source) -> { lines: [...] }`).

Forbidden in 11B-B-1:
- No `$transaction` invocation of auto-post.
- No trigger wiring.
- No service-level method calls from sales/purchases/payments.
- No e2e tests.
- No frontend change.
- No RBAC `permissions` table changes (the existing `gl_journal.write` permission from 11A-B-1 covers posting).

### 9.2 `11B-B-2` — `sales_invoice_issued` auto-post (backend)

Commit message: `feat(phase-11b): auto-post on SalesInvoice ISSUED transition`

Allowed files:
- `backend/src/accounting/posting-events/handlers/sales-invoice-issued.handler.ts` — receives the validated source, calls `buildSalesInvoiceIsseudTemplate(invoice)`, inserts `JournalEntry.sourceType = 'SALES_INVOICE'`, `sourceId = invoice.id`, accepts unique-violation as success (idempotent).
- The existing sales service hook site (Phase 4) — adds the in-`$transaction` call **only** at the DRAFT → ISSUED transition (the existing service from Phase 4 picks up the change).

Forbidden in 11B-B-2:
- No new permissions.
- No new controller endpoints.
- No frontend change.
- No e2e tests (those land in 11B-B-6).

### 9.3 `11B-B-3` — `purchase_invoice_received` auto-post (backend)

Commit message: `feat(phase-11b): auto-post on PurchaseInvoice RECEIVED transition`

Allowed files: mirror of 11B-B-2 but for `PurchaseInvoice` + `sourceType = 'PURCHASE_INVOICE'`.

### 9.4 `11B-B-4` — `ar_payment_posted` auto-post (backend)

Commit message: `feat(phase-11b): auto-post on AR Payment POSTED`

Allowed files: handler for `sourceType = 'AR_PAYMENT'`. The **only** acceptable edit outside `posting-events/` is the in-`$transaction` call inside `payments.service.ts`'s Phase-10A-B-2 commit path.

### 9.5 `11B-B-5` — `ap_payment_posted` auto-post (backend)

Commit message: `feat(phase-11b): auto-post on AP Payment POSTED`

Allowed files: handler for `sourceType = 'AP_PAYMENT'`. Mirror of 11B-B-4 inside `payments.service.ts` Phase 10B-B-2 commit path.

### 9.6 `11B-B-6` — e2e coverage (backend)

Commit message: `test(phase-11b): add GL auto-posting e2e smoke`

Allowed files: `backend/test/app.e2e-spec.ts` — append a `describe('Phase 11B-B-6: GL auto-posting smoke')` block with N tests (N is locked at 11B-B-6 time):

- `1a) SalesInvoice ISSUED creates a `SALES_INVOICE` posting with debit = AR_CONTROL, credits split = SALES_REVENUE + VAT_OUTPUT + SALES_DISCOUNTS`.
- `1b) SalesInvoice second issue attempt triggers unique violation (idempotent path)`.
- `2a) PurchaseInvoice RECEIVED creates a `PURCHASE_INVOICE` posting with debit = INVENTORY_OR_EXPENSE + VAT_INPUT, credit = AP_CONTROL`.
- `3a) AR Payment POSTED creates an `AR_PAYMENT` posting with debit = CASH_OR_BANK, credit = AR_CONTROL`.
- `3b) Two AR payments on the same invoice each create their own balanced entry (partial-settlement parity)`.
- `4a) AP Payment POSTED creates an `AP_PAYMENT` posting with debit = AP_CONTROL, credit = CASH_OR_BANK`.
- `5a) Reversing entry on SalesInvoice `CANCELLED` produces a *new* `JournalEntry` linking via `reversalOf` with debits/credits swapped; `equals` totals match the original`.
- `5b) Reversing entry's source type remains source-document-bound (not a new auto-post on the source)`.
- `6a) Cross-company read of the posting returns 404/empty (tenant isolation)`.
- `6b) Missing required account code (deleting `AR_CONTROL` via POST then attempting to issue an invoice) throws `BadRequestException` listing the missing codes`.

Final test count is **existing + 10** (subject to Phase 11B-B-6 verification).

### 9.7 `11B-C` — Frontend read-only visibility

Commit message: `feat(phase-11b): wire GL posting visibility on the frontend`

Allowed files:
- `frontend/src/lib/api.ts` — adds `listPostings`, `getPosting(id)`, `listPostingsBySource({ sourceType, sourceId })`, plus type aliases. **No write wrappers**.
- `frontend/src/app/accounting/gl/page.tsx` — extends the existing Phase 11A-C-code page to render the four event types with colour-coded badges (`AR-Payment`, `AP-Payment`, `Sales-Invoice`, `Purchase-Invoice`) and a "reversal" badge when `reversalOf` is set.
- `frontend/src/app/sales/page.tsx`, `frontend/src/app/purchases/page.tsx` — read-only link to the related posting row inline.

Hard rule: read-only, no manual create, no manual reverse, no POST button. The page surfaces what is already posted by the auto-post service.

### 9.8 `11B-D-1` — Final verification

Commit message: **none** (no commit — this is a verification phase only).

Checks:
- `pnpm --filter @erp/backend build` PASS.
- `pnpm --filter @erp/backend test:e2e` PASS with the new tests from 11B-B-6 absorbed (final count locked at this step).
- `pnpm --filter @erp/frontend build` PASS.
- `git status --short` empty after each B-* transition; HEAD unchanged after this check.
- No reruns of e2e without an explicit reset.

### 9.9 `11B-D-2` — README closure

Commit message: `docs(phase-11b): update README for GL posting closure`

Allowed files: `README.md` only — append one H2 section `## Phase 11B: Real GL Posting`. Same structural template as the 11A-D-2 closure.

## 10. Open Questions Deferred to Sub-Phases

These decisions are intentionally **not** made here; they belong to the B-level sub-phases:

- The exact column name for `JournalEntry.reverseOf: String?` on the schema (FK self-reference). Finalised at 11B-B-1.
- The exact event handler directory naming (`posting-events/` vs. `journal-events/`). Finalised at 11B-B-1.
- Whether the seed bundle for required accounts is materialised at company register time (a hook on user creation), at first-invoice time (lazy), or at migration time (eager). Finalised at 11B-B-1.
- Whether the `paymentMethod` enum is mirrored onto the journal `memo` field as `CASH|BANK|CARD|TRANSFER|OTHER` or as the localised string. Finalised at 11B-B-4 / 11B-B-5.
- Whether partial-settlement parity (3b) requires a separate `ap_payment_posted_partial` test or shares the 3b template. Finalised at 11B-B-6.
- The line on the frontend between "this source document reversed a posting" vs. "this source has no posting yet" — UX is finalised at 11B-C.

## 11. Recommendation — hand-off to Cursor

**Recommended to continue implementation in Cursor after this plan.**

This plan is intentionally a **scoping artefact** with no schema, no code, no migration, no RBAC, no test, no frontend change belonging to it. The next concrete commit on `main` will be `11B-B-1` (Schema + linking skeleton + account seed). The plan above is the **contract** that `11B-B-1 / 11B-B-2 / ... / 11B-D-2` deliver against.

Cursor is well-positioned to drive the implementation loop because:

- each sub-phase has **one commit** with one file-scope, exactly matching the discipline Cursor's commit-by-commit tooling expects;
- the four event templates are **deterministic** and testable in isolation;
- the unique-index idempotency guarantee is **mechanical** to verify with a single SQL `EXPLAIN` query;
- the reversing-entry helper can be implemented and unit-tested without coupling to the rest of the ERP.

Any change to scope above requires a `docs/PHASE_11B_REAL_GL_POSTING_PLAN.md` amendment first, *then* the corresponding sub-phase commit.

---

> **No code, no schema, no migration, no RBAC change, no test, no frontend change, no README change, no deployment belong to this commit. The plan file is the only artefact.**
