# Phase 16A: Financial ERP MVP Closure Plan

> Status: **Documentation-Only Planning Phase**. No backend code, frontend code, database schema, migrations, tests, RBAC seed catalogs, deployment configurations, or README edits belong to this phase. Concrete verification, hardening, and closure steps are defined herein and deferred to subsequent sub-phases.

---

## 1. Purpose and MVP Goal

The objective of Phase 16A is to finalize, stabilize, verify, and formally close the current codebase as a **Partner-Trial-Ready Financial ERP Minimum Viable Product (MVP)**.

Across Phases 1 through 15A, the system has constructed an enterprise-grade core covering multi-tenant identity, hierarchical chart of accounts, balanced double-entry General Ledger posting, financial statements (Trial Balance, Income Statement, Balance Sheet, AP/AR aging), commercial invoicing, payments settlement, bank reconciliation, period close guardrails, and centralized audit logging.

Rather than expanding into new product domains (e.g., Inventory, Payroll, Manufacturing, HR, Fixed Assets, Budgeting), Phase 16A focuses on:
- **Stabilization**: Ensuring zero regressions, clean builds, and consistent runtime behavior.
- **Verification**: Validating all 216 automated e2e tests and end-to-end user journeys.
- **Usability & UX Consistency**: Ensuring permission gating, error boundaries, navigation links, and bilingual Arabic/English interfaces operate seamlessly.
- **Controlled Scope Boundary**: Explicitly documenting system capabilities, operational prerequisites, and known boundaries so partners can conduct evaluation trials safely and effectively.

---

## 2. Current MVP Capabilities

The system currently provides a comprehensive Financial ERP foundation with **216 passing end-to-end tests** and complete frontend-backend parity:

1. **Authentication & Multi-Tenant Isolation**:
   - Secure credential verification (bcrypt), in-memory Access Tokens, and HttpOnly Refresh Cookies.
   - Strict tenant isolation via JWT-derived `companyId` preventing cross-company leakage.
   - `SafeUser` contract ensuring sensitive credential fields are never exposed.

2. **Role-Based Access Control (RBAC)**:
   - Granular permission keys across all operational domains.
   - Gated endpoints via `@RequirePermissions` and UI element guards via `hasPermission()`.

3. **Chart of Accounts (COA)**:
   - Hierarchical account structure with strict parent-child relationships.
   - Standard account types: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`.
   - Enforced normal balances (`DEBIT` vs. `CREDIT`) and deletion conflict protections.

4. **General Ledger (GL) & Double-Entry Posting**:
   - Balanced double-entry manual journal entries (`DRAFT`, `POSTED`, `CANCELLED`).
   - Automated real-time GL posting on commercial and settlement events:
     - Sales invoice issuance (`SALES_INVOICE`)
     - Purchase invoice receipt (`PURCHASE_INVOICE`)
     - Customer AR payment receipt (`AR_PAYMENT`)
     - Supplier AP payment disbursement (`AP_PAYMENT`)
   - Idempotency guarantees via `@@unique([companyId, sourceType, sourceId])`.

5. **Financial Statements & Reports**:
   - Real-time generation of Trial Balance (ميزان المراجعة), Income Statement (قائمة الدخل), and Balance Sheet (الميزانية العمومية).
   - Aging reports: AR Aging and AP Aging with aging buckets (`current`, `1-30`, `31-60`, `61-90`, `+90`).
   - Strict mathematical precision using `Prisma.Decimal` on the backend and formatted string representations on the frontend.

6. **Commercial Invoicing & Settlements**:
   - Sales Invoices: Customer assignment, line items, 15% VAT calculations, DRAFT/ISSUED/CANCELLED lifecycle.
   - Purchase Invoices: Supplier assignment, line items, VAT calculations, DRAFT/RECEIVED/CANCELLED lifecycle.
   - Payments: Direct allocation to invoices, cumulative settlement tracking, and strict overpayment prevention (`409 Conflict`).

7. **Bank Reconciliation**:
   - Bank account master data with IBAN, currency, and book/bank balance tracking.
   - CSV bank statement parsing and ingestion with SHA-256 duplicate statement detection.
   - Automated suggestion engine (Exact / Suggested matches based on amount, date proximity, and reference).
   - Manual matching, unmatching, and comprehensive unmatched transaction reporting.
   - Complete architectural decoupling from GL posting and `Payment.status`.

8. **Period Close & Fiscal Closing Guardrails**:
   - Monthly period close and fiscal year closing workflows (`OPEN`, `CLOSING`, `CLOSED`, `REOPENED`).
   - Pre-close validation engine checking for unposted drafts, unbalanced journals, and trial balance integrity.
   - Centralized server-side posting guard (`assertPeriodIsOpen`) blocking journal and invoice postings in closed periods.
   - Retained earnings entry intentionally isolated and deferred.

9. **Centralized Audit Trail & Activity Logging**:
   - Centralized, append-only, tenant-scoped `AuditLog` table.
   - 11 taxonomy categories, actor context, correlation `requestId`, route, IP, and user-agent capture.
   - Automatic masking of sensitive keys (`password`, `token`, `secret`, `iban`, `apiKey`).
   - Read-only APIs and dedicated frontend viewer at `/admin/audit-logs`.
   - Export preview calculation without direct file download.

10. **Frontend Workspaces & Route Coverage**:
    - Next.js 14 RTL-first workspace covering `/dashboard`, `/accounting`, `/accounting/gl`, `/accounting/reports`, `/accounting/reconciliation`, `/accounting/period-close`, `/admin/audit-logs`, `/sales`, `/purchases`, `/pos`, `/users`, `/partners`, `/products`, and `/warehouses`.

---

## 3. MVP Scope Boundary

To ensure delivery of a robust, production-grade Financial ERP MVP, boundaries are strictly established:

### In-Scope (Phase 16A Closure & Hardening):
- Codebase stabilization and health audit.
- Verification of database migrations, Prisma Client generation, and build artifacts.
- End-to-end regression validation (216/216 passing test suite).
- Permission consistency review between backend guards and frontend UI components.
- Navigation flow and error state polish (handling 401, 403, 404, 409 gracefully).
- Partner trial documentation, trial pack proposal, and operator runbooks.
- Documentation closure in `README.md`.

### Out-of-Scope (Deferred to Future Major Versions):
- **Inventory & Stock Valuation**: Multi-warehouse stock tracking, FIFO/weighted-average costing, stock movements, and inventory GL adjustments.
- **Payroll & Human Resources**: Employee directory, payroll calculation, GOSI contributions, end-of-service benefits, and WPS compliance.
- **Manufacturing & Work Orders**: Bill of Materials (BOM), work orders, job costing, and assembly lines.
- **Fixed Assets**: Asset register, depreciation schedules, impairment, and asset disposal.
- **Budgeting & Cost Centers**: Budget vs. actual tracking, department allocations, and cost center reporting.
- **Multi-Currency**: FX rate tables, realized/unrealized foreign exchange gain/loss revaluations.
- **Automated External Bank Feeds**: Open Banking APIs, live banking aggregator connections.
- **Real File Exports**: Automated generation and streaming of Excel, PDF, or CSV export files from audit logs or financial statements.
- **ZATCA Phase 2 E-Invoicing**: Cryptographic stamp generation, QR code CSID signing, and direct ZATCA clearance/reporting portal integration.
- **Mobile Applications**: Dedicated iOS / Android native clients.
- **Infrastructure / Cloud Deployment**: Changes to Docker, Kubernetes, AWS/GCP pipelines, or external production environments.

---

## 4. Partner Trial Readiness Criteria

Before releasing the system to external partners for trial evaluation, all of the following criteria must be satisfied:

| # | Criterion | Verification Method | Status / Requirement |
|---|---|---|---|
| 1 | **Clean Build** | `pnpm --filter @erp/backend build` & `pnpm --filter @erp/frontend build` | Must compile with 0 errors and 0 lint warnings |
| 2 | **E2E Test Suite** | `pnpm --filter @erp/backend test:e2e` | 216/216 tests passing across all test suites |
| 3 | **Database Schema Health** | `prisma migrate status` / `prisma:generate` | Schema in sync, 0 unapplied migrations |
| 4 | **Working Tree Cleanliness** | `git status --short -uall` | Clean working tree, no untracked or modified files |
| 5 | **Authentication & Roles** | Seed script execution | Standard roles (`ADMIN`, `ACCOUNTANT`, `SALES`, `VIEWER`) seeded |
| 6 | **Permission Boundary** | UI click-through with restricted user | Unauthorized views show clear 403 / Forbidden states |
| 7 | **Accounting Invariants** | Automated tests & manual verification | Balanced debits/credits, no floating-point arithmetic |
| 8 | **Closed Period Integrity** | Attempting backdated postings | Server rejects with `409 Conflict` |
| 9 | **Audit Immutability** | Database review | Zero delete/update operations on `AuditLog` |
| 10| **Trial Documentation** | Documentation pack | Partner trial guide, test scripts, and known limitations available |

---

## 5. Critical User Journeys to Smoke Test

The following 15 critical user journeys must be smoke-tested to confirm partner trial readiness:

1. **User Authentication & Session Lifecycle**:
   - Login with valid credentials; verify JWT access token is stored in memory and HttpOnly cookie is set.
   - Verify token refresh on expiry and clean state teardown upon logout.
2. **Dashboard & Module Navigation**:
   - Access `/dashboard`; verify health status and permission-gated navigation cards.
3. **Chart of Accounts Exploration & Management**:
   - Access `/accounting`; view hierarchical accounts; create an account; edit name/nameAr; verify deletion guard on accounts with posted lines.
4. **Manual Journal Entry Lifecycle**:
   - Create a multi-line balanced `DRAFT` journal entry; verify live debit/credit total computation.
   - Post the entry; verify status flips to `POSTED` and lines become read-only.
5. **Real-Time Financial Statement Inspection**:
   - Access `/accounting/reports`; inspect Trial Balance, Income Statement, and Balance Sheet; confirm debit/credit equality.
6. **Commercial Sales Invoicing & Auto-GL Posting**:
   - Create and issue a Sales Invoice under `/sales`; verify status becomes `ISSUED` and automated GL entry is created.
7. **Commercial Purchase Invoicing & Auto-GL Posting**:
   - Create and receive a Purchase Invoice under `/purchases`; verify status becomes `RECEIVED` and automated GL entry is created.
8. **Accounts Receivable (AR) Customer Payment Settlement**:
   - Record an AR Payment against an issued invoice; verify invoice paid amount updates and overpayment is rejected.
9. **Accounts Payable (AP) Supplier Payment Disbursement**:
   - Record an AP Payment against a received invoice; verify invoice paid amount updates and overpayment is rejected.
10. **Bank Account Configuration & CSV Statement Import**:
    - Configure a bank account under `/accounting/reconciliation`; import a standard CSV statement.
    - Attempt to re-import the exact same CSV; verify duplicate rejection via SHA-256 hash check.
11. **Bank Reconciliation Matching & Unmatched Reports**:
    - Execute automated matching suggestions; perform manual match; view unmatched bank transactions and ERP payments reports.
12. **Monthly Accounting Period Close & Reopen**:
    - Access `/accounting/period-close`; execute pre-close validation; close a period; verify postings within that date range are rejected with `409 Conflict`.
    - Reopen the period with a mandatory justification note; verify postings are once again permitted.
13. **Fiscal Year Close & Reopen**:
    - Execute fiscal year validation; verify requirement that all internal monthly periods must be closed; close fiscal year; reopen with justification.
14. **Centralized Audit Log Inspection**:
    - Access `/admin/audit-logs`; filter events by category, date range, and entity; inspect details modal; view entity timeline; execute export preview.
15. **RBAC Restriction Verification**:
    - Log in as a user lacking `audit_log.read` or `period_close.close`; verify appropriate views are hidden or display graceful access-denied messages.

---

## 6. Technical Hardening Checklist

The following technical checks ensure codebase integrity before partner trials:

- [ ] **Prisma Schema & Migrations**: Run `prisma:generate` and ensure client matches schema without drift.
- [ ] **Backend Compilation**: Run `nest build` and ensure TypeScript strict mode emits 0 errors.
- [ ] **Frontend Compilation**: Run `next build` and ensure all static routes prerender cleanly.
- [ ] **E2E Test Suite**: Execute Jest e2e test runner; confirm all 216 test cases pass without timeouts or flaky assertions.
- [ ] **Decimal Invariant**: Confirm no monetary calculations use Javascript native floating-point math; all monetary fields use `Prisma.Decimal` on the backend and formatted string representations on the frontend.
- [ ] **Payment Status Decoupling**: Confirm `Payment.status` remains strictly confined to payment settlement lifecycle and is never mutated by reconciliation or period closing.
- [ ] **Posting Guard Integrity**: Confirm `assertPeriodIsOpen()` is called consistently across all GL, commercial, and payment write flows.
- [ ] **Audit Trail Redaction**: Confirm `maskSensitiveData()` actively scrubs passwords, tokens, API keys, IBANs, and credentials before writing to `AuditLog`.
- [ ] **Tenant Boundary Validation**: Confirm every database query in services enforces `companyId` filtering derived exclusively from the authenticated JWT session.

---

## 7. Suggested MVP Hardening Sub-Phases

To structure the final closure and hardening of the MVP, the following incremental sub-phases are proposed:

### Sub-Phase 16A-B-1: Repository and Build Health Audit
- **Focus**: Verify workspace dependencies, TypeScript strict checks, Prisma client synchronization, and clean build outputs across `@erp/backend` and `@erp/frontend`.
- **Allowed Changes**: Configuration tweaks, minor linting or typing fixes if strictly necessary.
- **Suggested Commit**: `chore(phase-16a): audit repository and build health`

### Sub-Phase 16A-B-2: Permission and Navigation Consistency Review
- **Focus**: Verify all frontend navigation buttons and cards align with server-side `@RequirePermissions` decorators; ensure 403 Forbidden states render uniformly across all screens.
- **Allowed Changes**: Minor frontend button guards, route link checks, and unauthorized state copy.
- **Suggested Commit**: `fix(phase-16a): standardize permission gating and navigation links`

### Sub-Phase 16A-B-3: Critical Workflow Smoke Test Pass
- **Focus**: Conduct the 15 critical user journeys; verify error boundary responses on edge cases (e.g. overpayment, duplicate CSV, closed period posting).
- **Allowed Changes**: Non-breaking bug fixes identified during smoke testing.
- **Suggested Commit**: `fix(phase-16a): address workflow smoke test edge cases`

### Sub-Phase 16A-B-4: Known Limitations and Partner Trial Notes
- **Focus**: Compile partner trial operator notes, test account setup guidelines, and clear documentation of system boundaries.
- **Allowed Changes**: Creation of `docs/PARTNER_TRIAL_GUIDE.md` or trial documentation artifacts.
- **Suggested Commit**: `docs(phase-16a): add partner trial guide and operator runbook`

### Sub-Phase 16A-C-1: Final Full Verification
- **Focus**: Execute complete test and build suites in a clean state (`prisma:generate`, `backend build`, `backend test:e2e`, `frontend build`). Verification-only phase.
- **Allowed Changes**: None (verification only).
- **Suggested Commit**: None.

### Sub-Phase 16A-C-2: README MVP Closure
- **Focus**: Update `README.md` to document Phase 16A completion and formally announce the Financial ERP MVP milestone.
- **Allowed Changes**: `README.md` only.
- **Suggested Commit**: `docs(phase-16a): update README for financial erp mvp closure`

---

## 8. Risks and Known Limitations

When presenting the MVP to trial partners, the following operational realities must be communicated:

1. **No Inventory / Stock Ledger**:
   - While product master data exists, the MVP does not track physical warehouse stock levels, stock movements, or inventory valuation.
2. **No Payroll or HR Management**:
   - Employee salaries, deductions, leave tracking, and GOSI filings are not supported in the MVP.
3. **No Direct File Downloads**:
   - Audit logs and statement reports provide on-screen views and export preview metadata, but direct file generation (PDF/Excel) is deferred.
4. **Manual CSV Bank Ingestion**:
   - Statement reconciliation relies on user-uploaded standard CSV files; live bank feeds via Open Banking APIs are not present.
5. **Desktop & Tablet Optimized**:
   - Complex accounting tables, journal grids, and audit viewers are optimized for desktop and tablet screens; mobile phone viewports are not guaranteed for all operations.
6. **Data Hygiene & Test Isolation**:
   - Partner evaluations should be conducted using synthetic or test data, not live unverified financial transactions.
7. **Configuration Sensitivity**:
   - Accuracy of automated GL postings depends on initial account code mapping in the Chart of Accounts; trial setups must verify default accounts prior to testing.

---

## 9. Partner Trial Pack Proposal

To facilitate external evaluation by accounting firms and business partners, the following trial package should be assembled:

1. **Evaluation Environment**:
   - Cloud or local sandbox instance running PostgreSQL, NestJS backend, and Next.js frontend.
2. **Pre-Seeded Demo Tenant**:
   - Company: `شركة تجريبية للحلول المالية (Demo Financial Co.)`
   - Default Currency: `SAR (ريال سعودي)`
   - Pre-configured standard Saudi Chart of Accounts (Assets, Liabilities, Equity, Revenue, Expense).
3. **Pre-Seeded Roles & Credentials**:
   - `admin@demo.com` (Full Admin role with all permissions)
   - `accountant@demo.com` (Accounting & Reporting role)
   - `auditor@demo.com` (Read-only audit & reporting role)
4. **Sample Data Sets**:
   - Sample sales invoices and customer profiles.
   - Sample purchase bills and supplier profiles.
   - Sample CSV bank statement matching ERP payments for reconciliation demonstration.
5. **Evaluation Guide (Trial Script)**:
   - 30-minute structured walkthrough testing invoicing -> payment -> GL posting -> financial statements -> bank reconciliation -> period close -> audit review.
6. **Partner Feedback Channel**:
   - Structured feedback template covering usability, speed, Arabic localization quality, and reporting completeness.

---

## 10. Verification Expectations

Every sub-phase in the Phase 16A sequence must satisfy the full technical verification pipeline:

```bash
# 1. Prisma Client generation
pnpm --filter @erp/backend prisma:generate

# 2. Database migration status
pnpm --filter @erp/backend prisma:migrate deploy

# 3. Backend compilation
pnpm --filter @erp/backend build

# 4. Backend End-to-End Test Suite
pnpm --filter @erp/backend test:e2e

# 5. Frontend compilation & static page generation
pnpm --filter @erp/frontend build
```

**Expected Results**:
- Prisma Generate: `PASS`
- Backend Build: `PASS`
- Backend E2E Tests: `PASS` (Exact test count: **216/216**)
- Frontend Build: `PASS` (All 20 static routes generated cleanly)

---

## 11. Plan Closure Checklist

Before concluding this planning phase and committing the architecture document, verify:

- [x] Document created at `docs/PHASE_16A_MVP_CLOSURE_PLAN.md`.
- [x] All 11 required sections detailed and formatted.
- [x] Strict scope boundary defined (Financial ERP MVP only, no new modules).
- [x] Pre-commit check confirms **only** `docs/PHASE_16A_MVP_CLOSURE_PLAN.md` is modified:
  ```bash
  git diff --name-only
  git status --short -uall
  ```
- [x] Explicit git add and commit:
  ```bash
  git add docs/PHASE_16A_MVP_CLOSURE_PLAN.md
  git commit -m "docs(phase-16a): add financial erp mvp closure plan"
  git push origin main
  ```
- [x] Post-push verification:
  ```bash
  git rev-parse HEAD
  git status --short -uall
  ```
