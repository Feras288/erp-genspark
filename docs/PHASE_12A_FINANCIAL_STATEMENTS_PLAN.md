# Phase 12A — Financial Statements Architecture Plan

> Status: **scoping plan only**. No schema, no code, no migration, no RBAC change, no test, no frontend change, and no README change belong to this artefact. All concrete controllers, services, DTOs, e2e tests, and the read-only reports page are deferred to the sub-phases listed in section 10. This plan **inherits and is bounded by** Phase 11B (Real GL Posting — done), Phase 11A (GL Foundation — done), and Phase 6 (Accounting Core — done).

## 1. Goal & Scope of Financial Statements

Phase 12A is the first **GL readout layer**. After Phase 11B, every committed source-document transition produces an immutable, balanced `JournalEntry`. This phase does **not** post, reverse, or mutate those entries. It **reads** `Account` + `JournalEntry` + `JournalEntryLine` and produces three standard statements:

1. **Trial Balance** — per-account debit/credit totals with opening / period / closing logic and a date-range filter.
2. **Income Statement** (P&L) — period-based revenue, expenses, and net income.
3. **Balance Sheet** — as-of-date assets, liabilities, equity, plus computed retained earnings and current-period net income.

Cash Flow is **optional later** and is explicitly out of scope here (section 9).

### 1.1 What this phase delivers

- **Read-only aggregations** over POSTED journal lines, tenant-scoped by `companyId` from the JWT.
- **Three GET endpoints** under `/api/accounting/reports/*` (accounting module — not `ReportsModule`).
- **Decimal-safe math** via `Prisma.Decimal` only; JSON amounts are decimal strings (`toFixed(4)`).
- **A read-only frontend reports page** that displays the three statements and never posts, edits, or reverses journals.
- **e2e smoke** proving TB balance, IS net-income fixture, BS equation, RBAC 403, tenant isolation, and CANCELLED exclusion.

### 1.2 What this phase explicitly is *not*

- It is *not* a posting or reversal system. Phase 6 / 11A / 11B remain the write path. 12A never calls `createJournalEntry`, `postJournalEntry`, `cancelJournalEntry`, or `reverseJournalEntry`.
- It is *not* a replacement for Phase 7B-6 / 9 / 10 operational reports (`/api/reports/ar-summary`, `ap-aging`, `accounting-summary`, …). Those stay on source documents. `GET /api/reports/accounting-summary` remains a journal **count/totals** readout, not a financial statement.
- It is *not* a period-close / year-end close. Temporary accounts (REVENUE / EXPENSE) are **not** written into a Retained Earnings account. The Balance Sheet *computes* RE and current NI as synthetic lines.
- It is *not* Cash Flow, bank reconciliation, tax filing, multi-currency, PDF export, or an external-accounting sync.

## 2. Linkage to Prior Phases (read-only)

| Artefact | Phase | 12A relevance |
|---|---|---|
| `Account`, `JournalEntry`, `JournalEntryLine` | Phase 6 | Sole data source. No new models. |
| `JournalEntryStatus = DRAFT \| POSTED \| CANCELLED` | Phase 6 / 11A Fork A | Reports include **POSTED only**. |
| `gl_accounts.read` / `gl_journal.read` / `gl_journal.write` | Phase 11A-B-1 / 11A-B-4 | 12A **reuses** `gl_journal.read`. No new catalog key. |
| Auto-post templates + 8 required codes | Phase 11B | Statements consume whatever was posted (manual + auto). |
| `JournalEntry.reversalOf` + reversing entries | Phase 11B | Reversing entries that are themselves `POSTED` **are included** so they net the original. |
| `Company.fiscalYearStartMonth` (default `1`) | schema init | Income Statement default window + Balance Sheet RE / current-NI split. |
| `GET /api/reports/accounting-summary` | Phase 7B-5 | Unrelated operational summary. Do **not** extend or replace it. |
| `/accounting/gl` read-only ledger | Phase 11A-C / 11B-C | Unchanged. 12A adds a **new** `/accounting/reports` page. |

Phase 11B README §8 listed financial statements as an explicit future item. This plan is that item.

## 3. In Scope for Phase 12A (itemised)

| # | Deliverable | Sub-phase |
|---|---|---|
| 1 | Types, query DTOs, `FinancialStatementsService` skeleton, three GET routes | 12A-B-1 |
| 2 | Trial Balance calculation (opening / period / closing) | 12A-B-2 |
| 3 | Income Statement calculation (period P&L + net income) | 12A-B-3 |
| 4 | Balance Sheet calculation (as-of + computed RE / NI + equation check) | 12A-B-4 |
| 5 | Backend e2e smoke | 12A-B-5 |
| 6 | Frontend read-only reports page + `api.ts` wrappers | 12A-C |
| 7 | Final verification (backend build / e2e / frontend build) | 12A-D-1 |
| 8 | README closure | 12A-D-2 |

Phase 12A must not introduce anything outside this list. Cross-phase invariants in section 8 also apply.

## 4. Data Source & Isolation Rules (locked)

### 4.1 Models

Only these three Prisma models are read:

- `Account` — `id`, `companyId`, `code`, `name`, `nameAr`, `type`, `normalBalance`, `isActive`, `deletedAt`
- `JournalEntry` — `id`, `companyId`, `status`, `entryDate`, `reversalOf`, `sourceType`, `sourceId`
- `JournalEntryLine` — `id`, `companyId`, `entryId`, `debitAccountId`, `creditAccountId`, `debit`, `credit`

No `SalesInvoice`, `PurchaseInvoice`, `Payment`, or `StockLevel` is queried for statement math. The ledger is the source of truth.

### 4.2 Status filter

```
JournalEntry.status === POSTED
```

- `DRAFT` — excluded (not on the books).
- `CANCELLED` — excluded (Phase 6 cancel of a DRAFT, or any CANCELLED header).
- `POSTED` reversing entries (`reversalOf != null`) — **included**. They are committed books and net the original. The original stays `POSTED` (11B never mutates it).

### 4.3 Date axis

`JournalEntry.entryDate` is the **only** date used for filters. Do not use `postedAt` or `createdAt`.

Inclusive UTC window, matching `backend/src/reports/reports.service.ts`:

- `fromDate` → `new Date(`${fromDate}T00:00:00.000Z`)` (gte, or exclusive-lt for opening)
- `toDate` / `asOfDate` → `new Date(`${toDate}T23:59:59.999Z`)` (lte)

### 4.4 Tenant isolation

`companyId` comes **exclusively** from the JWT (`@CurrentUser()`). Never from URL, query, or body. Every Prisma `where` includes `{ companyId }`. Cross-tenant reads return empty data (or 404 on a by-id path — statements have no by-id path).

### 4.5 Line aggregation

Phase 6 lines have exactly one of `debitAccountId` / `creditAccountId`. A line contributes:

- to the debit account: `debit` amount
- to the credit account: `credit` amount

Aggregate in the service with `Prisma.Decimal.add`. Do not rely on SQL `SUM` coerced through `Number`.

### 4.6 Which accounts appear

Default: include an account if it has any **non-zero** opening or period activity (Trial Balance) or a non-zero presented balance (IS / BS). Soft-deleted / inactive accounts **are included** when they have activity, so historical statements stay complete.

Optional query flag `includeZero=true` includes zero-activity accounts (Trial Balance only). Default `false`.

## 5. Precision (locked)

Reuse existing helpers — **do not invent a new math primitive**:

- `backend/src/accounting/posting-events/decimal.ts` — `toDecimal`, `DECIMAL_ZERO`, `sumDebitCredit`
- `AccountingService` private `dec()` / `fmt4()` pattern (`value.toFixed(4)`)

Rules:

- All intermediate math is `Prisma.Decimal`.
- `Number()` is **forbidden** in any accounting math path (summing, netting, equation checks, opening+period).
- JSON output amounts are **decimal strings** (`"1234.5000"`), never JS numbers.
- Equality checks use `Prisma.Decimal.equals(...)`, never `===` on floats.
- Frontend display may format strings for locale (the existing `/accounting/gl` `fmtMoney` pattern). Display formatting is not accounting math.

`@db.Decimal(18, 4)` remains the column contract. Do not relax it.

## 6. Statement Definitions (locked)

### 6.1 Shared presentation helpers

Per account, in Decimal:

```
debitTotal
creditTotal
rawNet        = debitTotal − creditTotal
presentedNet  = normalBalance === DEBIT
                ? debitTotal − creditTotal
                : creditTotal − debitTotal
```

Contra accounts keep their `Account.type` + `normalBalance` from the chart. `SALES_DISCOUNTS` is `REVENUE` + `DEBIT` (11B seed) — it **reduces** revenue on the Income Statement. `INVENTORY_OR_EXPENSE` is `EXPENSE` + `DEBIT` (11B seed) — purchases hit **P&L**, not a Balance Sheet inventory asset. That 11B mapping is inherited and must be documented on the BS/IS pages, not “fixed” in 12A.

### 6.2 Trial Balance

**Query:** `fromDate?`, `toDate?`, `includeZero?`

| Bucket | POSTED lines where |
|---|---|
| Opening | `entryDate < fromDate` (all zeros if `fromDate` omitted) |
| Period | `fromDate <= entryDate <= toDate` (missing `fromDate` = beginning of time; missing `toDate` = end of today UTC) |
| Closing | Opening + Period (Decimal add on debit and on credit separately) |

Per-account row (proposal; exact JSON locked in 12A-B-1 / 12A-B-2):

```
accountId, code, name, nameAr, type, normalBalance
openingDebit, openingCredit
periodDebit, periodCredit
closingDebit, closingCredit
netBalance          // presentedNet on closing
```

Header totals:

- `totals.periodDebit` / `totals.periodCredit` — must `equals`
- `totals.closingDebit` / `totals.closingCredit` — must `equals`

If they do not equal, the service still returns the report and sets `balanced: false` plus the Decimal difference string. It does **not** throw (a TB imbalance is a data signal, not an HTTP error). e2e fixtures must produce `balanced: true`.

All-time TB (no dates): opening zeros, period = all POSTED history, closing = period.

### 6.3 Income Statement

**Period-based only.** Query: `fromDate?`, `toDate?`.

Default window when both omitted: current fiscal YTD.

```
fyStartMonth = Company.fiscalYearStartMonth   // default 1
fyStart      = UTC date of 1st of fyStartMonth
               in the fiscal year that contains today (or toDate if provided)
fromDate     = fyStart
toDate       = today UTC (or the provided toDate)
```

Sections:

- **Revenue** — `Account.type === REVENUE`. Presented amount = `presentedNet` for the period (CREDIT-normal revenue is credit−debit; DEBIT-normal contra like `SALES_DISCOUNTS` is debit−credit and reduces the revenue total).
- **Expenses** — `Account.type === EXPENSE`. Presented amount = `presentedNet` (debit−credit for DEBIT-normal).
- **Net income** = `totalRevenue − totalExpenses` (Decimal).

Do **not** include ASSET, LIABILITY, or EQUITY accounts.

Empty period (no POSTED activity): totals `"0.0000"`, empty section arrays, `netIncome: "0.0000"`.

### 6.4 Balance Sheet

**As-of only.** Query: `asOfDate?` (default today UTC). Cumulative POSTED lines with `entryDate <= asOfDate`.

Permanent sections (real `Account` rows):

- **Assets** — `type === ASSET`
- **Liabilities** — `type === LIABILITY`
- **Equity** — `type === EQUITY` (chart equity only; may be empty if the tenant never created an equity account)

Temporary accounts are **not** listed on the Balance Sheet. They are rolled into two **synthetic** equity lines (not `Account` rows — no schema, no `RETAINED_EARNINGS` seed):

| Synthetic code | Meaning | Formula |
|---|---|---|
| `RETAINED_EARNINGS_COMPUTED` | Prior fiscal years' net income | NI of all REVENUE/EXPENSE with `entryDate < fiscalYearStart(asOfDate)` |
| `CURRENT_PERIOD_NET_INCOME` | Current fiscal YTD net income | NI of all REVENUE/EXPENSE with `fiscalYearStart <= entryDate <= asOfDate` |

`fiscalYearStart(asOfDate)` uses `Company.fiscalYearStartMonth` against the as-of year (roll back one year if `asOfDate.month < fyStartMonth`).

Accounting equation (must hold because every POSTED entry is balanced):

```
Assets = Liabilities + Equity + RETAINED_EARNINGS_COMPUTED + CURRENT_PERIOD_NET_INCOME
```

Compare with `Prisma.Decimal.equals`. Return `balanced: true|false` and a Decimal `difference` string. Do not throw on imbalance.

**11B mapping note (locked):** `INVENTORY_OR_EXPENSE` is EXPENSE, so received purchases do not appear as an inventory asset. `VAT_INPUT` is ASSET; `VAT_OUTPUT` is LIABILITY; `AR_CONTROL` / `CASH_OR_BANK` are ASSET; `AP_CONTROL` is LIABILITY. 12A reports what the chart and postings actually are.

## 7. API Proposals (locked routes; JSON shapes locked in 12A-B-1)

All three live on the **accounting** module. Global prefix `api` (see `main.ts`).

| Method | Path | Permission |
|---|---|---|
| GET | `/api/accounting/reports/trial-balance` | `gl_journal.read` |
| GET | `/api/accounting/reports/income-statement` | `gl_journal.read` |
| GET | `/api/accounting/reports/balance-sheet` | `gl_journal.read` |

**RBAC decision (locked for the whole 12A loop):** reuse existing `gl_journal.read`. No new permission, no seed edit, no RBAC migration. Frontend mirrors `hasPermission('gl_journal.read')`. `gl_journal.write` is **not** required and must not be used as a gate (read-only surface).

Envelope (mirror Phase 7B `ReadyResponse`, but these reports are GL-owned):

```
{
  status: 'READY',
  report: 'trial-balance' | 'income-statement' | 'balance-sheet',
  companyId: string,          // from JWT, echoed
  filters: { ... },           // resolved dates, includeZero, fiscalYearStart
  generatedAt: string,        // ISO
  data: { ... }
}
```

12A-B-1 may ship the envelope with empty/zero `data` (`status: 'READY'` still — no `PLANNED` half-state once the route exists). B-2 / B-3 / B-4 fill `data`.

Query DTO rules:

- No `companyId` field.
- Dates are optional ISO date strings (`YYYY-MM-DD`), max length 40, same style as `ReportQueryDto`.
- Trial Balance: `fromDate?`, `toDate?`, `includeZero?`
- Income Statement: `fromDate?`, `toDate?`
- Balance Sheet: `asOfDate?` only (ignore a stray `fromDate` if sent)

Implementation home (proposal, finalised at 12A-B-1):

```
backend/src/accounting/financial-statements/
  types.ts
  financial-statements.service.ts
  dto/financial-statements-query.dto.ts
backend/src/accounting/financial-statements.controller.ts
  @Controller('accounting/reports')
```

Register the controller on the existing `AccountingModule`. Do **not** add routes to `ReportsController`. Do **not** edit `accounting.service.ts` posting / CRUD paths.

## 8. Cross-Phase Invariants (locked for 12A)

These invariants are inherited and **must not** be relaxed:

1. Tenant boundary is `companyId` from JWT only.
2. Money is `Prisma.Decimal` + decimal strings; no `Number()` in the math path.
3. `@db.Decimal(18, 4)` and the existing DTO amount regex stay untouched (12A is read-only).
4. RBAC is server-side `@RequirePermissions('gl_journal.read')` + `PermissionsGuard`, mirrored client-side via JWT `permissions`. No app-JS access fallback.
5. Posted journals remain immutable. 12A has no write endpoints.
6. Commit discipline: `git add <file>...` explicitly — never `git add .` / `git add -A`.
7. No Cloudflare / hosted identity / wrangler / Docker Compose / Dockerfile changes. Localhost only.
8. No frontend e2e (Playwright / Cypress). Backend Jest + `next build` only.
9. No skills activated (`cf-byok-deploy`, `designer-handoff`, `gsk-hosted-deploy`, `gsk-hosted-identity`).

## 9. Out of Scope for Phase 12A (explicit)

The following must not leak into any 12A-* commit:

- **Cash Flow statement** — deferred to a later optional phase.
- **Bank reconciliation** — no statement import, no matching UI.
- **Tax filing / ZATCA** — no VAT return, no e-invoicing, no CSID/XML.
- **Multi-currency / FX** — single base currency `SAR`.
- **External integrations** — no Xero / QuickBooks / bank API / payment-gateway webhooks.
- **PDF / Excel / audit export** — screen readout only unless a later phase opens export.
- **Period locking / year-end close writeback** — no closing journals, no new `RETAINED_EARNINGS` account, no schema.
- **Deployment** — no Docker / Cloudflare / hosted identity changes.
- **RBAC catalog changes** — no new permission keys.
- **Prisma schema / migrations / seed** — no model, enum, column, or seed chart changes.
- **Mutation of journals or source documents** — no post / cancel / reverse / issue / receive.
- **Extending `/api/reports/*`** — operational reports stay as they are.
- **Write controls on `/accounting/gl`** — that page stays read-only ledger, not statements.

## 10. Proposed Sub-Phases (each is single-domain)

Sub-phases mirror the Phase 11A / 11B single-domain discipline. Each implementation sub-phase produces **one** commit on `main` (D-1 is verification-only and may have no commit).

### 10.1 `12A-B-1` — Backend skeleton / types

Commit message: `feat(phase-12a): add financial statements skeleton and types`

Allowed files (proposal; exact list locked at 12A-B-1):

- `backend/src/accounting/financial-statements/types.ts`
- `backend/src/accounting/financial-statements/financial-statements.service.ts`
- `backend/src/accounting/financial-statements/dto/financial-statements-query.dto.ts`
- `backend/src/accounting/financial-statements.controller.ts` (or equivalent name)
- `backend/src/accounting/accounting.module.ts` — register controller + service only

Behaviour: three GET routes, JWT `companyId`, `@RequirePermissions('gl_journal.read')`, envelope with empty/zero `data`. No real aggregation yet.

Forbidden: no Prisma/schema/migration, no seed, no RBAC catalog, no e2e, no frontend, no README, no edits to posting handlers or `accounting.service.ts` write paths.

### 10.2 `12A-B-2` — Trial Balance calculation

Commit message: `feat(phase-12a): calculate trial balance from posted journals`

Allowed files: financial-statements service + types/DTO only (plus controller only if a query field must be wired).

Implements section 6.2. Forbidden: no IS/BS math yet, no frontend, no e2e, no schema.

### 10.3 `12A-B-3` — Income Statement calculation

Commit message: `feat(phase-12a): calculate income statement from posted journals`

Implements section 6.3. Forbidden: no BS math yet, no frontend, no e2e, no schema.

### 10.4 `12A-B-4` — Balance Sheet calculation

Commit message: `feat(phase-12a): calculate balance sheet from posted journals`

Implements section 6.4 (as-of, synthetic RE / NI, equation check). Forbidden: no frontend, no e2e, no schema, no new equity account.

### 10.5 `12A-B-5` — e2e smoke

Commit message: `test(phase-12a): add financial statements e2e smoke`

Allowed files: `backend/test/app.e2e-spec.ts` (append a `describe('Phase 12A-B-5: financial statements smoke')` block). Do **not** start a new test file unless 12A-B-5 proves the existing suite cannot host the block.

Minimum coverage (exact N locked at 12A-B-5):

- TB: POSTED fixture → `balanced: true`; period/closing debit equals credit.
- TB/IS/BS: CANCELLED (and DRAFT) entries excluded.
- IS: known revenue/expense fixture → expected `netIncome` string.
- BS: equation holds (`balanced: true`).
- GET 403 with a JWT that lacks `gl_journal.read` (cashier / no-GL agent).
- Cross-company isolation: tenant A activity is invisible on tenant B.
- Missing/invalid dates return 400 (if the DTO validates) or a documented default — locked at 12A-B-5.

Forbidden: no production-logic edits except a bug-fix required for a red test (keep the diff in the statements module). No frontend. No README.

### 10.6 `12A-C` — Frontend read-only reports

Commit message: `feat(phase-12a): add read-only financial statements page`

Allowed files:

- `frontend/src/app/accounting/reports/page.tsx` — **new** route
- `frontend/src/lib/api.ts` — GET wrappers + types only (`getTrialBalance`, `getIncomeStatement`, `getBalanceSheet`)
- Optional: a single read-only link from `frontend/src/app/accounting/gl/page.tsx` and/or `frontend/src/app/accounting/page.tsx` / dashboard **if** gated on `gl_journal.read`. Prefer the smallest link-in that keeps the new page discoverable.

Hard rules:

- Read-only. No create / update / post / cancel / reverse buttons or forms that write.
- Date filter inputs are allowed (they only change GET query params).
- Do **not** put statements on `/reports` (that page is AR/AP/operational).
- Do **not** add write UI to `/accounting/gl`.
- Client gating: `hasPermission('gl_journal.read')`; missing permission → dashboard / forbidden empty state (same pattern as the GL page).
- Display money from decimal strings; do not `parseFloat` for arithmetic.

Forbidden: no new npm dependency, no backend edits, no schema, no README.

### 10.7 `12A-D-1` — Final verification

Commit: **none** (verification only).

Checks:

- `pnpm --filter @erp/backend build` PASS.
- `pnpm --filter @erp/backend test:e2e` PASS. Final count = 164 + N from 12A-B-5 (N locked at B-5).
- `pnpm --filter @erp/frontend build` PASS (new `/accounting/reports` static route present).
- `git status --short` empty after the last implementation commit.
- No e2e reruns without an explicit reset.

### 10.8 `12A-D-2` — README closure

Commit message: `docs(phase-12a): update README for financial statements closure`

Allowed files: `README.md` only — append `## Phase 12A: Financial Statements` after the Phase 11B section, same structural template (commits / endpoints / formulas / frontend / verification / out-of-scope / hard prohibitions).

## 11. Open Questions Deferred to Sub-Phases

These are intentionally **not** re-opened here; they belong to the B-level commits that own the concrete types:

- Exact TypeScript interface names and JSON field order for each `data` payload (12A-B-1).
- Whether `FinancialStatementsController` is a standalone file or methods on `AccountingController` (12A-B-1). Preference in this plan: standalone `@Controller('accounting/reports')`.
- Whether empty-chart companies return empty arrays or a structured “no accounts” banner (12A-C).
- Exact e2e fixture construction (reuse 11B auto-post invoices vs. insert POSTED journals directly) (12A-B-5).
- Whether the GL page gets a “القوائم المالية” link or only the dashboard / accounting hub does (12A-C).

Not deferred — already locked: routes, POSTED-only, `entryDate`, JWT `companyId`, `gl_journal.read`, Decimal strings, synthetic RE/NI, no Cash Flow, no schema, no new RBAC.

## 12. Recommendation — hand-off to Cursor

**Recommended to continue implementation in Cursor after this plan.**

This plan is a **scoping artefact**. The next concrete commit on `main` will be `12A-B-1` (backend skeleton / types). The sections above are the **contract** that `12A-B-1` … `12A-D-2` deliver against.

Cursor is well-positioned because:

- each sub-phase has one domain and one commit;
- the three formulas are deterministic over POSTED lines;
- the equation checks are mechanical `Prisma.Decimal.equals` assertions;
- no schema or RBAC migration is required.

Any change to scope above requires a `docs/PHASE_12A_FINANCIAL_STATEMENTS_PLAN.md` amendment first, *then* the corresponding sub-phase commit.

---

> **No code, no schema, no migration, no RBAC change, no test, no frontend change, no README change, no deployment belong to this commit. The plan file is the only artefact.**
