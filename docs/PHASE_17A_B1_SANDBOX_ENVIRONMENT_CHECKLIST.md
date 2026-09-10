# Phase 17A-B-1: Sandbox Environment Checklist

> Status: **Operational Checklist Document**. The Financial ERP MVP milestone is formally closed (Phase 16A). This document establishes an operational, manual checklist for preparing, verifying, securing, resetting, and operating a dedicated evaluation sandbox for controlled partner trials. Zero backend code, frontend code, database schema models, migrations, automated tests, RBAC seed catalogs, deployment automation scripts, or README files are modified as part of this deliverable.

---

## 1. Purpose

The purpose of this checklist is to guide system operators, DevOps engineers, and evaluation coordinators in establishing a safe, fully verified, and isolated sandbox environment for controlled partner trials of the Financial ERP MVP.

### Operational Boundaries & Scope Clarification:
- **Sandbox Preparation Only**: This checklist defines the verification gates, configuration checks, and operational procedures required to run partner trials safely.
- **Not Production Certification**: This document does not constitute a production release sign-off, SOC2 certification, or public commercial deployment guide.
- **No Deployment Automation**: This document is an operational procedure manual. It does not introduce CI/CD automation pipelines, infrastructure-as-code scripts, or cloud provisioning code.
- **Zero New Product Features**: No application code or functional modifications are introduced.
- **Zero Credentials in Git**: All configuration values referenced herein use abstract placeholders. No real secrets, passwords, connection strings, or cryptographic keys are committed to source control.

---

## 2. Sandbox Environment Principles

To guarantee evaluation safety, regulatory compliance, data isolation, and operational resilience, all sandbox operations must strictly adhere to the following eleven principles:

1. **Sandbox Only**: All trial activities occur on an isolated staging server or dedicated virtual instance completely disconnected from any live financial systems.
2. **Synthetic Data Only**: All master data (customers, vendors, accounts), transactional records (invoices, payments, journals), and statements must be 100% artificially generated.
3. **No Real Customer, Vendor, Bank, or Financial Data**: Real company tax identifiers (TINs), real bank accounts, real customer identities, and real financial balances are strictly prohibited.
4. **Isolated Database**: The sandbox must run against its own isolated database instance (`<SANDBOX_DATABASE_NAME>`), with zero network access to production or developmental test databases.
5. **Limited User Access**: Only designated evaluation participants receive credentials. User accounts are created with least-privilege role mappings tailored to evaluation workflows.
6. **Time-Boxed Trial Window**: Partner access is granted for a fixed, predetermined window (e.g., 5 to 10 business days), after which credentials expire or are rotated.
7. **Resettable Environment**: Operators must be able to restore the sandbox to a clean baseline state within minutes using verified snapshots and reset procedures.
8. **Audit Logs Enabled**: The system audit logging subsystem must remain fully active to capture logins, permission failures, financial postings, and data modifications.
9. **Error Logs Sanitized**: Application and web server logs must mask sensitive values (passwords, tokens, cookies) and avoid logging raw payload dumps.
10. **No Public Unrestricted Access**: The sandbox must not be indexed by search engines, exposed to public directories, or accessible without authenticated credentials.
11. **No Partner Reliance for Official Accounting**: Partners must be explicitly informed in writing that trial outputs, statement previews, and reports are exploratory and cannot be used for statutory, tax, or legal accounting.

---

## 3. Environment Inventory Checklist

The following table details each infrastructure and platform component required for the sandbox. The assigned operator must verify and sign off on each item prior to granting partner access.

| Item | Required State | Verification Method | Owner | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Application URL** | Reachable via HTTPS at `<SANDBOX_FRONTEND_URL>` | Browser navigation & TLS certificate inspection | Lead Operator | Pending |
| **Backend API URL** | Reachable via HTTPS at `<SANDBOX_API_URL>` | HTTPS GET request to `<SANDBOX_API_URL>/api/health` | Lead Operator | Pending |
| **Frontend URL** | Fully rendered Next.js application | Browser check; verify dashboard loads without console errors | Frontend Engineer | Pending |
| **Database Name** | Dedicated sandbox database (`<SANDBOX_DATABASE_NAME>`) | Direct psql / query inspection | DBA / Lead Operator | Pending |
| **Database Isolation** | Standalone database user with restricted permissions; no cross-DB access | Verify connection string points exclusively to sandbox DB | DBA / DevOps | Pending |
| **Environment Variables Reviewed** | All variables set via server environment or secure manager (outside git) | Check server runtime config; verify no `.env` files in git repo | DevOps / Security | Pending |
| **JWT / Refresh Cookie Configuration** | Independent sandbox secrets; `HttpOnly`, `SameSite=Lax`, `Secure=true` | Inspect response headers on `/api/auth/login` | Security Lead | Pending |
| **CORS Configuration** | Restricted strictly to `<SANDBOX_FRONTEND_URL>`; no wildcard `*` allowed | Inspect `Access-Control-Allow-Origin` header | Security Lead | Pending |
| **File Upload Directory / Storage** | Isolated sandbox upload directory or bucket with 2MB size enforcement | Upload synthetic 1.5MB CSV; verify storage location and access bounds | Backend Engineer | Pending |
| **Mail / SMS Sandboxed or Disabled** | Outbound notification services disabled or routed to local mock sink (e.g., MailHog) | Trigger password reset / notification; verify no external transmission | DevOps / Backend | Pending |
| **Logging Configured** | `NODE_ENV=production` logging active; JSON format; sensitive fields redacted | Inspect server stdout/stderr; confirm token masking | Lead Operator | Pending |
| **Backups / Snapshots Configured** | Baseline database snapshot taken immediately after demo seed (`erp_sandbox_baseline.sql`) | Execute test restoration against scratch database | DBA / Lead Operator | Pending |
| **Health Endpoint Reachable** | Returns HTTP 200 with `{ "status": "ok", "timestamp": "..." }` | Run `curl -fsS <SANDBOX_API_URL>/api/health` | Lead Operator | Pending |

---

## 4. Required Environment Variables Review

All configuration settings must be supplied via host environment variables or secure secret managers outside of the Git repository. **Never store real secrets in Git, commit history, or shared channels.**

| Variable Category | Purpose | Security & Isolation Rules |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | PostgreSQL connection string | Must be configured outside git. Must point strictly to `<SANDBOX_DATABASE_NAME>`. Must **not** point to production or staging. No access to live customer data. |
| **`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`** | Signs authentication tokens | Must be configured outside git. Must be high-entropy, sandbox-unique strings (minimum 64 characters). Must **never** match development or production secrets. |
| **`COOKIE_SECRET` / Cookie Settings** | Protects refresh token cookies | Must enforce `HttpOnly=true`, `SameSite=Lax`, and `Secure=true` (for HTTPS). Configured outside git. |
| **`CORS_ORIGINS`** | Controls cross-origin API access | Must be restricted exclusively to `<SANDBOX_FRONTEND_URL>`. Wildcard `*` is strictly prohibited. |
| **`API_BASE_URL`** | Backend API base URL | Must point to `<SANDBOX_API_URL>`. Configured outside git. |
| **`FRONTEND_BASE_URL`** | Next.js application root URL | Must point to `<SANDBOX_FRONTEND_URL>`. Configured outside git. |
| **`FILE_UPLOAD_LIMIT_MB`** | Enforces maximum CSV upload size | Hard-capped at 2MB. Rejects larger payloads with `413 Payload Too Large`. |
| **`LOG_LEVEL`** | Application logging verbosity | Set to `info` or `warn`. Sensitive parameters (passwords, tokens) must remain masked via `maskSensitiveData`. |
| **Mail / SMS Provider Sandbox Settings** | Outbound messaging credentials | If present, must use mock/sandbox credentials (e.g., Ethereal, MailHog, test Twilio SID). Outbound delivery to real phone numbers or emails is strictly prohibited. |

---

## 5. Database Preparation Checklist

The database must be set up systematically from schema migration through synthetic data population.

- [ ] **Step 1: Create Dedicated Sandbox Database**
  - Provision a fresh PostgreSQL database instance named `<SANDBOX_DATABASE_NAME>`.
  - Create a dedicated database user with least-privilege permissions scoped only to this database.
- [ ] **Step 2: Apply Migrations**
  - Run standard Prisma migration deployment:
    ```bash
    pnpm --filter @erp/backend prisma:migrate:deploy
    ```
- [ ] **Step 3: Confirm Migration Count**
  - Verify that exactly 14 migrations are applied sequentially:
    1. `20260228000001_init`
    2. `20260301000001_rbac_foundation`
    3. `20260301000002_gl_foundation`
    4. `20260301000003_real_gl_posting`
    5. `20260301000004_chart_of_accounts`
    6. `20260301000005_tax_foundation`
    7. `20260301000006_sales_invoicing`
    8. `20260301000007_purchases_invoicing`
    9. `20260301000008_ar_ap_settlement`
    10. `20260301000009_financial_statements`
    11. `20260301000010_bank_reconciliation`
    12. `20260301000011_reconciliation_rules`
    13. `20260301000012_period_close`
    14. `20260301000013_audit_trail`
- [ ] **Step 4: Confirm No Pending Migrations**
  - Verify migration status output indicates zero pending or unapplied migrations.
- [ ] **Step 5: Generate Prisma Client**
  - Generate the latest type-safe Prisma client:
    ```bash
    pnpm --filter @erp/backend prisma:generate
    ```
- [ ] **Step 6: Load Synthetic Demo Data Only**
  - Seed the demo organization, Chart of Accounts, fiscal year, periods, customers, vendors, and sample transactions as specified in the Demo Data Guide.
  - Verify zero real personal, corporate, or financial records are introduced.
- [ ] **Step 7: Verify Tenant / Company Isolation**
  - Confirm all master and transaction records contain the designated synthetic `companyId`.
  - Confirm foreign key relationships are strictly scoped to the demo company.
- [ ] **Step 8: Verify No Production Backup Was Restored**
  - Audit database tables to confirm no external dumps, legacy customer backups, or live data exist.
- [ ] **Step 9: Create Baseline Backup / Snapshot for Rapid Reset**
  - Generate a clean baseline dump immediately after seeding:
    ```bash
    pg_dump -U <SANDBOX_DB_USER> -d <SANDBOX_DATABASE_NAME> -F c -f erp_sandbox_baseline.dump
    ```
- [ ] **Step 10: Verify Reset Process Is Documented & Tested**
  - Perform a dry-run restoration on a scratch database to certify the snapshot restores cleanly in under 2 minutes.

---

## 6. Build and Verification Checklist

Every sandbox deployment must pass the exact compilation and test baseline verified during Phase 16A closure. Run the following commands in sequence:

```bash
# 1. Generate Prisma Client
pnpm --filter @erp/backend prisma:generate

# 2. Deploy Database Migrations
pnpm --filter @erp/backend prisma:migrate:deploy

# 3. Build Backend NestJS Application
pnpm --filter @erp/backend build

# 4. Run Automated E2E Regression Suite
pnpm --filter @erp/backend test:e2e

# 5. Build Frontend Next.js Production Bundle
pnpm --filter @erp/frontend build
```

### Expected Execution Results:
| Verification Gate | Expected Status | Success Criteria |
| :--- | :--- | :--- |
| **Prisma Generate** | `PASS` | Client generated successfully for `@prisma/client` |
| **Migrate Deploy** | `PASS` | All 14 migrations applied, zero pending migrations |
| **Backend Build** | `PASS` | Clean TypeScript compilation; `dist/` created; 0 errors |
| **Backend E2E Suite** | `PASS` | **216 passed, 216 total** across `reports.e2e-spec.ts` and `app.e2e-spec.ts` |
| **Frontend Build** | `PASS` | Production build successful; 20 static pages prerendered |

---

## 7. Access and User Setup Checklist

The sandbox provides pre-configured evaluation personas representing distinct organizational roles. Real passwords must never be used or published. All accounts must use strong, unique sandbox passwords distributed via secure channels.

### Persona Specifications:

#### 1. Trial Admin
- **Identifier**: `<TRIAL_ADMIN_EMAIL>`
- **Purpose**: Evaluation coordinator and system administrator.
- **Required Permissions**: Super-admin role or full permission set across accounting, sales, purchases, payments, reconciliation, period close, and audit trail (`audit_log.read`, `audit_log.export`).
- **Trial Tasks**: Oversee overall system health, configure company profile, review audit logs, observe period close restrictions.
- **Restrictions**: Must not disable audit logging or expose backend secrets.

#### 2. Accountant (Chief Accountant / Financial Controller)
- **Identifier**: `<ACCOUNTANT_EMAIL>`
- **Purpose**: Core financial accounting evaluation.
- **Required Permissions**: Full GL permissions (`gl.account.read/create/update`, `gl.journal.read/create/post`), financial reports (`report.trial_balance`, `report.income_statement`, `report.balance_sheet`), period close (`period_close.read`, `period_close.close`, `period_close.reopen`).
- **Trial Tasks**: Inspect Chart of Accounts, post manual journal entries, generate financial statements, perform period close and reopen workflows.
- **Restrictions**: Cannot view administrative audit logs unless explicitly granted.

#### 3. Auditor / Viewer
- **Identifier**: `<AUDITOR_EMAIL>`
- **Purpose**: External compliance and read-only inspection.
- **Required Permissions**: Read-only access (`gl.account.read`, `gl.journal.read`, `report.*`, `audit_log.read`).
- **Trial Tasks**: Inspect posted journals, verify statement balances, review audit logs and export previews.
- **Restrictions**: Strictly zero write permissions. Cannot post journals, issue invoices, execute payments, close periods, or modify records.

#### 4. Sales User (Accounts Receivable Specialist)
- **Identifier**: `<SALES_USER_EMAIL>`
- **Purpose**: Commercial revenue and customer billing workflow.
- **Required Permissions**: `sales.invoice.read/create/issue`, `payment.read/create`.
- **Trial Tasks**: Create draft sales invoices, issue invoices (15% VAT), record customer payments.
- **Restrictions**: No access to purchase invoices, journal entries, period close, or audit logs.

#### 5. Purchases User (Accounts Payable Specialist)
- **Identifier**: `<PURCHASES_USER_EMAIL>`
- **Purpose**: Vendor procurement and expense settlement workflow.
- **Required Permissions**: `purchases.invoice.read/create/receive`, `payment.read/create`.
- **Trial Tasks**: Create draft purchase invoices, receive invoices, record supplier payments.
- **Restrictions**: No access to sales invoices, manual journal entries, period close, or audit logs.

#### 6. Reconciliation User (Treasury / Cash Management)
- **Identifier**: `<RECONCILIATION_USER_EMAIL>`
- **Purpose**: Bank statement reconciliation workflow.
- **Required Permissions**: `reconciliation.read`, `reconciliation.import`, `reconciliation.match`.
- **Trial Tasks**: Upload synthetic CSV bank statements, review auto-suggestions, execute manual match/unmatch actions, view unmatched item reports.
- **Restrictions**: Cannot close accounting periods or modify general ledger accounts.

#### 7. Optional Executive Viewer
- **Identifier**: `<EXECUTIVE_VIEWER_EMAIL>`
- **Purpose**: High-level financial reporting overview.
- **Required Permissions**: `report.trial_balance`, `report.income_statement`, `report.balance_sheet`.
- **Trial Tasks**: View Trial Balance, Income Statement, and Balance Sheet dashboards.
- **Restrictions**: Strictly read-only; no access to operational screens or administration.

---

## 8. Permission Verification Checklist

Before opening the sandbox to partners, verify both positive (allowed) and negative (forbidden) permission behaviors:

### Positive Access Tests (Allowed Actions):
- [ ] **Dashboard Navigation**: All users can access `/dashboard` and see cards matching their role permissions.
- [ ] **Accounting**: Accountant can view Chart of Accounts (`/accounting/accounts`) and create journal entries (`/accounting/journal-entries`).
- [ ] **Reports**: Accountant, Auditor, and Executive Viewer can generate Trial Balance, Income Statement, and Balance Sheet at `/reports`.
- [ ] **Sales**: Sales User and Trial Admin can access `/sales/invoices`, draft an invoice, and issue it.
- [ ] **Purchases**: Purchases User and Trial Admin can access `/purchases/invoices`, draft an invoice, and receive it.
- [ ] **Payments**: Sales and Purchases users can access `/payments` to record settlements.
- [ ] **Reconciliation**: Reconciliation User can access `/reconciliation`, upload CSVs, and match transactions.
- [ ] **Period Close**: Accountant and Trial Admin can access `/accounting/periods` to execute close and reopen.
- [ ] **Audit Logs**: Trial Admin and Auditor can access `/admin/audit-logs` and inspect system activity.

### Negative Access Tests (Forbidden Actions & Graceful Boundaries):
- [ ] **Viewer Write Safeguard**: Auditor / Viewer cannot see "Create", "Post", or "Edit" buttons; direct POST/PATCH API requests return `403 Forbidden`.
- [ ] **Audit Log Boundary**: Sales User and Purchases User accessing `/admin/audit-logs` receive graceful `403 Access Denied` UI; link is omitted from navigation.
- [ ] **Statement Upload Boundary**: Users lacking `reconciliation.import` cannot see the CSV file upload widget; API rejects unauthorized uploads with `403 Forbidden`.
- [ ] **Period Close Action Boundary**: Users lacking `period_close.close` or `period_close.reopen` see closed period badges but cannot trigger close/reopen dialogs.
- [ ] **Audit Export Preview Boundary**: Users lacking `audit_log.export` cannot trigger the export record count preview modal.

---

## 9. Demo Data Readiness Checklist

Verify that the synthetic evaluation company contains cohesive, ready-to-test records:

- [ ] **Demo Company Created**: `شركة المجد للتجارة والخدمات المحدودة (Al-Majd Trading & Services Co. Ltd.)` active with SAR currency and synthetic TIN `300000000000003`.
- [ ] **Chart of Accounts Loaded**: Standard hierarchical COA active with all 5 classes (Assets, Liabilities, Equity, Revenue, Expenses) and default accounts mapped.
- [ ] **Fiscal Year and Periods Available**: Fiscal Year 2026 configured with 12 monthly periods (`2026-01` through `2026-12`), with early periods closed and current period `OPEN`.
- [ ] **Customers Created**: Synthetic customer profiles active (e.g., `مؤسسة الأفق التقنية` and `شركة الإنشاءات الحديثة`).
- [ ] **Suppliers Created**: Synthetic supplier profiles active (e.g., `شركة التوريدات المكتبية الكبرى` and `مؤسسة الاتصالات المتقدمة`).
- [ ] **Sales Invoices Available**: Existing issued invoices with 15% VAT and automated GL posting entries.
- [ ] **Purchase Invoices Available**: Existing received invoices with 15% VAT and automated GL posting entries.
- [ ] **AR/AP Payments Available**: Settled customer receipts and supplier disbursements linked to invoices.
- [ ] **Bank Account Available**: Primary bank ledger account (`1101 - Alinma Bank`) active with a non-zero opening balance.
- [ ] **Sample CSV Statement Available**: Pre-formatted synthetic CSV file (`synthetic_bank_statement_2026_01.csv`) ready for partner upload testing.
- [ ] **Reconciliation Examples Available**: Pre-existing reconciled records alongside unmatched items ready for suggestion engine demonstration.
- [ ] **Period Close Scenario Available**: A prior month available for the pre-close check and close/reopen demonstration.
- [ ] **Audit Logs Populated**: Baseline audit events recorded showing organization setup, invoice issuances, and user logins.

---

## 10. File Upload and CSV Safety

Bank statement reconciliation file uploads must be strictly controlled:

- [ ] **Synthetic CSV Only**: Only synthetic CSV files provided in the demo kit are permitted for upload.
- [ ] **No Real Bank Statements**: Explicit warnings on UI and in documentation advising partners never to upload real bank PDFs, scanned images, or proprietary company statements.
- [ ] **Confirm CSV Size Limit**: The API strictly enforces the 2MB payload threshold. Test with a file >2MB and verify `413 Payload Too Large` is returned gracefully.
- [ ] **Confirm Duplicate Upload Behavior**: Uploading the identical CSV file twice returns HTTP `409 Conflict` via SHA-256 hash deduplication (`BankStatementFile` checksum check).
- [ ] **Confirm Rejected Duplicates Safe**: The `409 Conflict` response returns a clean error message without exposing database stack traces or server file paths.
- [ ] **Confirm Uploaded Samples Resettable**: Uploaded files and imported statement rows can be cleared or reverted via the standard environment reset procedure.
- [ ] **Confirm No Raw Bank Secrets Logged**: Bank account numbers, routing numbers, and statement tokens are never written to unmasked console logs.

---

## 11. Audit and Logging Checklist

Verify that administrative tracing and diagnostic logging operate securely:

- [ ] **Audit Logs Enabled**: Confirm all key business actions (login, logout, invoice issue, invoice receive, payment record, journal post, period close, period reopen) generate immutable audit trail entries.
- [ ] **Login and Business Actions Appear**: Perform a login and post a journal entry; confirm entries appear immediately in `/admin/audit-logs`.
- [ ] **Redaction Works**: Confirm sensitive fields (e.g., `password`, `refreshToken`, `token`, `secret`) are masked with `[REDACTED]` in audit record `beforeState` and `afterState` JSON diffs.
- [ ] **No Secrets in Server Output**: Inspect standard output / standard error streams; verify that no raw JWT tokens, database passwords, or cookie values are logged in plain text.
- [ ] **Audit Viewer Access Control**: Confirm `/admin/audit-logs` requires `audit_log.read` permission.
- [ ] **Export Preview Safe**: Confirm that the "Export Preview" modal estimates record count and filters without initiating real file generation or disk writes.
- [ ] **Diagnostic Utility**: Confirm that log timestamps and request IDs are sufficient for operators to troubleshoot partner-reported issues.

---

## 12. Reset and Recovery Checklist

Operators must be prepared to restore the sandbox environment to a pristine state between trial cohorts or in the event of configuration corruption:

- [ ] **Baseline Snapshot Available**: Verified copy of `erp_sandbox_baseline.dump` stored in a secure, accessible staging directory.
- [ ] **Reset Procedure Documented**: Step-by-step restoration commands ready for operator execution:
  ```bash
  # Example Reset Procedure:
  # 1. Terminate active application connections
  # 2. Drop and recreate sandbox database
  dropdb -U <SANDBOX_DB_USER> <SANDBOX_DATABASE_NAME>
  createdb -U <SANDBOX_DB_USER> <SANDBOX_DATABASE_NAME>
  # 3. Restore clean baseline snapshot
  pg_restore -U <SANDBOX_DB_USER> -d <SANDBOX_DATABASE_NAME> erp_sandbox_baseline.dump
  # 4. Restart backend service to clear in-memory caches
  ```
- [ ] **Reset Tested Before Partner Access**: Operator has executed the reset procedure at least once in staging, verifying that data returns to the exact baseline.
- [ ] **Trial User Passwords Rotatable**: Procedure documented to rotate or re-hash evaluation persona passwords between partner cohorts.
- [ ] **Uploaded Files Cleared**: Any temporary CSV files stored during statement uploads are purged from the upload directory upon reset.
- [ ] **Audit Data Reset Policy Defined**: Audit logs are preserved for evaluation review or reset alongside the database according to partner cohort policy.
- [ ] **Recovery Owner Identified**: A designated primary operator and backup engineer are assigned to handle environment recovery during trial windows.
- [ ] **Estimated Reset Time Recorded**: Total environment reset must be proven to execute in **under 3 minutes**.

---

## 13. Pre-Launch Sign-off

Before delivering evaluation credentials to external partners, the trial coordinator and engineering lead must complete and sign this pre-launch sign-off:

- [ ] **Build / Test Verification Complete**: Prisma generate, migration deployment, NestJS build, Next.js build, and 216/216 E2E tests verified.
- [ ] **Demo Data Verified**: Organization profile, COA, customers, suppliers, invoices, and bank statements verified in the UI.
- [ ] **Permissions Verified**: All positive and negative permission checks passed across all evaluation personas.
- [ ] **Trial Users Verified**: Evaluation persona credentials verified and tested for login via `<SANDBOX_FRONTEND_URL>`.
- [ ] **Partner Trial Notes Shared**: Known limitations, supported browsers, and scope boundaries shared with the partner.
- [ ] **Known Limitations Shared**: Explicit documentation provided stating out-of-scope modules (inventory, payroll, live bank feeds, binary file exports).
- [ ] **Feedback Form Shared**: Evaluation script and feedback collection link/template ready for the partner cohort.
- [ ] **Support Window Scheduled**: Technical support contact and operating hours communicated to the evaluation partner.
- [ ] **Rollback / Reset Plan Ready**: Database snapshot verified and recovery operator on standby.

---

## 14. Risks and Mitigations

| Risk | Impact | Mitigation Strategy | Owner |
| :--- | :--- | :--- | :--- |
| **Real Data Accidentally Uploaded** | Partner inadvertently uploads real bank statement or confidential customer data | Prominent UI warnings on file upload screens; strict 2MB limit; immediate snapshot reset capability; signed trial terms prohibiting live data. | Trial Coordinator / Security |
| **Permissions Misconfigured** | Partner persona assigned excessive or insufficient permissions, skewing evaluation | Mandatory pre-launch permission checklist verification; automated E2E tests validating RBAC guards prior to launch. | Lead Engineer |
| **Demo Data Incomplete or Inconsistent** | Trial users encounter empty dropdowns, broken links, or missing opening balances | Standardized synthetic demo data seed script; verification checklist covering all modules prior to sign-off. | QA / Operator |
| **CSV Format Mismatch** | Partner attempts to upload bank CSVs with custom column headers or delimiter errors | Provide standardized synthetic CSV template in trial kit; client-side and server-side CSV validation with clear error messages. | Backend Engineer |
| **Environment Outage / Downtime** | Sandbox server crashes during an active partner evaluation session | Dedicated host monitoring; automatic process supervisor (systemd / PM2); documented 3-minute snapshot recovery procedure. | DevOps / Lead Operator |
| **Browser Compatibility Issue** | UI elements render incorrectly on partner's legacy browser | Restrict recommended trial environment to modern evergreen browsers (Chrome, Edge, Firefox, Safari); test responsive views before launch. | Frontend Engineer |
| **Partners Expect Out-of-Scope Modules** | Partner attempts to test inventory, payroll, or live bank feeds and perceives absence as a defect | Explicit "Trial Notes" document defining out-of-scope boundaries distributed prior to trial kick-off; guided 45-minute script focusing strictly on financial ERP MVP. | Product Lead |
| **Logs Expose Sensitive Values** | Server logs capture cleartext passwords or session tokens during troubleshooting | Built-in `maskSensitiveData` interceptors; automated unit tests verifying token redaction; production log level enforcement. | Security Lead |
| **Reset Procedure Fails** | Database restore encounters locked connections or corrupted dump during reset | Pre-test snapshot restoration on clean database; use force-disconnect commands before database drop. | DBA / DevOps |

---

## 15. Operator Run Commands

The following commands are the safe, approved operational commands for validating and managing the codebase on the sandbox host. No environment secrets are embedded:

```bash
# 1. Update source code to latest verified release on main
git pull origin main

# 2. Verify working tree is clean and untracked files are absent
git status --short -uall

# 3. Confirm expected commit HEAD matches verified release
git rev-parse HEAD

# 4. Generate Prisma Client bindings
pnpm --filter @erp/backend prisma:generate

# 5. Apply all database schema migrations
pnpm --filter @erp/backend prisma:migrate:deploy

# 6. Compile NestJS backend service
pnpm --filter @erp/backend build

# 7. Execute automated regression test suite (verify 216/216 passing)
pnpm --filter @erp/backend test:e2e

# 8. Compile Next.js frontend production bundle
pnpm --filter @erp/frontend build
```

> [!CAUTION]
> Do not execute environment deployment commands that print or log unencrypted credentials. Always inject runtime environment variables through secure host-level configuration managers.

---

## 16. Acceptance Criteria

The sandbox environment is formally declared **Ready for Partner Trial** when all of the following conditions are met:

1. **Verified Codebase**: Latest `main` branch deployed at the verified commit HEAD.
2. **All Verification Commands Pass**:
   - `prisma:generate` completes without errors.
   - `prisma:migrate:deploy` reports 14 migrations applied and 0 pending.
   - Backend `build` compiles cleanly with zero TypeScript errors.
   - Backend `test:e2e` passes with **216 passed, 216 total** tests.
   - Frontend `build` compiles cleanly with 20 static pages prerendered.
3. **Synthetic Demo Data**: Complete, cohesive demonstration records populated for the demo organization. Zero real customer or bank data present.
4. **Authentication & Personas**: All evaluation personas (`Trial Admin`, `Accountant`, `Auditor`, `Sales`, `Purchases`, `Reconciliation`) can log in successfully via `<SANDBOX_FRONTEND_URL>`.
5. **Permission Boundaries Verified**: Positive and negative access controls behave exactly as specified in the RBAC matrix.
6. **Audit Trail Functional**: System events appear in `/admin/audit-logs` with sensitive fields masked.
7. **Snapshot & Reset Verified**: A baseline database dump exists and has been tested to restore in under 3 minutes.
8. **Trial Documentation Prepared**: Partner trial notes, known limitations, and structured feedback forms are ready for distribution.

---

## 17. Recommended Next Step

Upon completion of this checklist, proceed to:

**Phase 17A-B-2 – Demo Data Preparation Guide** (`docs/PHASE_17A_B2_DEMO_DATA_GUIDE.md`):
- Specification of the synthetic company master record (`Al-Majd Trading & Services Co. Ltd.`).
- Complete Chart of Accounts mapping and initial balances.
- Synthetic customer and vendor directories.
- Pre-populated sales and purchase invoices with 15% VAT.
- Synthetic bank statement CSV specifications and matching scenarios.
