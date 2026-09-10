# Phase 17A-B-2: Demo Data Preparation Guide

> Status: **Operational Guide Document**. The Financial ERP MVP milestone is formally closed (Phase 16A). This document defines the comprehensive synthetic demonstration dataset for controlled partner trials. Zero automated seed scripts, backend code, frontend code, database schema models, migrations, automated tests, RBAC seed catalogs, deployment files, or README files are modified as part of this deliverable.

---

## 1. Purpose

The purpose of this guide is to define the exact synthetic demonstration dataset required to populate the isolated partner trial sandbox. It provides operators, QA engineers, and evaluation coordinators with a blueprint of fictional entities, chart of accounts, master records, invoices, payments, bank statements, reconciliation rules, period-close test cases, and audit events.

### Operational Boundaries & Scope Clarification:
- **Specification Only (Not Automated Code)**: This document is a structured reference guide. It does not introduce automated database seed scripts, executable SQL migrations, or backend fixtures.
- **Zero Real Data**: All company profiles, customer identities, vendor accounts, bank numbers, tax identifiers, and transaction records are 100% synthetic.
- **Zero Credentials in Git**: All persona credentials use abstract placeholders (`<TRIAL_ADMIN_EMAIL>`, etc.). No plaintext passwords, API keys, or secrets are stored in Git.
- **Zero New Product Features**: No application code, UI components, or schema models are added.

---

## 2. Demo Data Principles

To guarantee evaluation integrity, safety, and operational repeatability, all demonstration data must adhere to the following ten principles:

1. **Synthetic-Only**: Every single entity and transaction must be artificially generated for evaluation purposes.
2. **Zero Personally Identifiable Information (PII)**: No real individuals' names, personal telephone numbers, national IDs, or personal email addresses may be used.
3. **No Real Bank Account Numbers or IBANs**: Bank accounts must use standard dummy formatting (e.g., `SA0300000000000000000000` or masked `SA****************0001`).
4. **No Real Tax Identifiers**: Tax Identification Numbers (TINs) must use synthetic test sequences (e.g., `300000000000003`).
5. **No Real Customer / Vendor Legal Entities**: Counterparties must be fictional entities with descriptive demo titles (e.g., *Riyadh Retail Demo Customer*).
6. **Resettable and Repeatable**: The dataset must be cleanly re-creatable from a documented snapshot or baseline dump within 3 minutes.
7. **Curated for Guided 45-Minute Trials**: The dataset size must remain compact enough to avoid UI clutter while offering sufficient depth to test end-to-end accounting flows.
8. **Rich Workflow Coverage**: Master records must cover all 5 accounting classes, sales and purchase invoicing, partial and full settlements, CSV bank reconciliation, period close enforcement, and audit trail tracing.
9. **Consistent Accounting Dates & Fiscal Periods**: All transactions belong to Fiscal Year 2026, centering on an active evaluation window in **September 2026**, with historical closed periods (Jan–Aug 2026) and future open periods (Oct–Dec 2026).
10. **Human-Verifiable Round Amounts**: Transaction amounts and 15% VAT calculations should use clean, easily verifiable numbers (e.g., 1,000.00 SAR + 150.00 VAT = 1,150.00 SAR) to allow evaluators to instantly verify GL debit/credit balance equality.

---

## 3. Demo Company Profile

The sandbox organization represents a fictional mid-sized commercial and professional services firm based in Saudi Arabia:

| Attribute | Synthetic Specification |
| :--- | :--- |
| **Legal Entity Name (English)** | `Al-Majd Trading & Services Co. Ltd.` |
| **Legal Entity Name (Arabic)** | `شركة المجد للتجارة والخدمات المحدودة` |
| **Short Commercial Name** | `Al-Majd Demo / شركة المجد التجريبية` |
| **Country of Operation** | `Saudi Arabia (SA)` |
| **Base Currency** | `SAR (Saudi Riyal / ر.س)` |
| **Fiscal Year** | `2026 (Calendar Year: 2026-01-01 to 2026-12-31)` |
| **Standard VAT Rate** | `15.00%` (ZATCA standard rate) |
| **Tax Identification Number (TIN)** | `300000000000003` (Fictional test TIN) |
| **Commercial Registration (CR)** | `1010000001` (Synthetic CR) |
| **Business Scope** | B2B Commercial Goods Resale & Consulting Services |
| **Primary Evaluation Window** | **September 2026** (`2026-09-01` to `2026-09-30`) |
| **Legal Status Notice** | *Fictional demo organization solely for technical evaluation. Not a registered legal entity.* |

---

## 4. Trial Users and Personas

The sandbox environment must be configured with seven evaluation personas. Passwords are never committed to Git and must be distributed to trial participants via secure channels.

| Persona | Placeholder Email | Purpose | Suggested Permissions | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Trial Admin** | `<TRIAL_ADMIN_EMAIL>` | Evaluation coordinator & system overseer | Super-admin permissions; full access to GL, Sales, Purchases, Payments, Reconciliation, Period Close, and Audit Trail (`audit_log.read`, `audit_log.export`). | Coordinates cohort testing; monitors `/admin/audit-logs`. |
| **Accountant** | `<ACCOUNTANT_EMAIL>` | Primary financial controller / certified accountant | Full GL permissions (`gl.account.*`, `gl.journal.*`), reports (`report.*`), period close (`period_close.*`), payments (`payment.read`). | Evaluates COA, manual journal entries, financial statements, and monthly period closure. |
| **Auditor / Viewer** | `<AUDITOR_EMAIL>` | External compliance officer / statutory auditor | Read-only access (`gl.account.read`, `gl.journal.read`, `report.*`, `audit_log.read`). | Strictly zero write actions. Verifies Trial Balance, Balance Sheet, and audit trail diffs. |
| **Sales User** | `<SALES_EMAIL>` | Commercial sales billing specialist | `sales.invoice.read/create/issue`, `payment.read/create`, `partner.read/create`. | Tests draft sales invoices, 15% VAT calculation, issuing, and recording customer receipts. |
| **Purchases User** | `<PURCHASES_EMAIL>` | Procurement & vendor payable specialist | `purchases.invoice.read/create/receive`, `payment.read/create`, `partner.read/create`. | Tests draft purchase bills, receiving bills, and recording supplier disbursements. |
| **Reconciliation User** | `<RECONCILIATION_EMAIL>` | Cash management & treasury specialist | `reconciliation.read`, `reconciliation.import`, `reconciliation.match`, `bank_account.read`. | Evaluates CSV statement ingestion, duplicate check, auto-suggestions, and manual match/unmatch. |
| **Executive Viewer** | `<EXECUTIVE_EMAIL>` | C-Suite / Managing Director | Read-only reports (`report.trial_balance`, `report.income_statement`, `report.balance_sheet`). | Evaluates high-level executive dashboard and statement readability. |

---

## 5. Chart of Accounts (COA) Demo Structure

The Chart of Accounts utilizes a standard 4-digit hierarchical numbering structure across all five fundamental accounting classes.

> [!IMPORTANT]
> **Inventory Accounting Scope Clarification**:
> Account `1301 - Inventory / Deferred Stock Placeholder` is provided strictly as a balance sheet holding placeholder. Stock quantities, automated cost-of-goods-sold valuation (FIFO/weighted average), and warehouse movements are **explicitly out of scope** in the Financial ERP MVP.

| Code | Account Name (EN) | Account Name (AR) | Class / Type | Normal Balance | Purpose | Suggested Opening Balance (SAR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1101** | Primary Bank Account (Alinma) | الحساب البنكي الرئيسي (الإنماء) | `ASSET` | `DEBIT` | Primary commercial checking account for collections and disbursements | 150,000.00 Dr |
| **1102** | Petty Cash | صندوق النثرية | `ASSET` | `DEBIT` | Cash on hand for minor immediate administrative expenses | 5,000.00 Dr |
| **1201** | Accounts Receivable (A/R) | الذمم المدينة (العملاء) | `ASSET` | `DEBIT` | Outstanding customer invoice balances | 28,750.00 Dr |
| **1202** | VAT Input Tax Receivable | ضريبة القيمة المضافة للمشتريات (مدخلات) | `ASSET` | `DEBIT` | 15% VAT recoverable on commercial purchases and vendor services | 3,750.00 Dr |
| **1301** | Deferred Stock Placeholder | مخزون بضائع (حساب وسيط دفتري) | `ASSET` | `DEBIT` | Fictional non-stock ledger holding account | 10,000.00 Dr |
| **2101** | Accounts Payable (A/P) | الذمم الدائنة (الموردون) | `LIABILITY` | `CREDIT` | Outstanding vendor bills payable | 23,000.00 Cr |
| **2201** | VAT Output Tax Payable | ضريبة القيمة المضافة للمبيعات (مخرجات) | `LIABILITY` | `CREDIT` | 15% VAT collected on commercial sales and consulting invoices | 6,500.00 Cr |
| **3101** | Paid-in Share Capital | رأس المال المدفوع | `EQUITY` | `CREDIT` | Registered capital of the enterprise | 100,000.00 Cr |
| **3201** | Retained Earnings | الأرباح المبقاة | `EQUITY` | `CREDIT` | Cumulative net profits/losses from prior accounting years | 68,000.00 Cr |
| **4101** | Commercial Sales Revenue | إيرادات المبيعات التجارية | `REVENUE` | `CREDIT` | Gross sales revenue from trading goods | 0.00 (In-period) |
| **4201** | Consulting & Professional Services | إيرادات الخدمات والاستشارات | `REVENUE` | `CREDIT` | Revenue from consulting, installation, and advisory contracts | 0.00 (In-period) |
| **5101** | General & Administrative Expenses | مصروفات إدارية وعمومية | `EXPENSE` | `DEBIT` | Operating expenses, office supplies, software subscriptions | 0.00 (In-period) |
| **5102** | Office Rent & Utilities | إيجار ومرافق المكتب | `EXPENSE` | `DEBIT` | Facility lease expenses and electricity/water bills | 0.00 (In-period) |
| **5201** | Bank Service Charges & Fees | رسوم وعمولات بنكية | `EXPENSE` | `DEBIT` | Bank transfer charges, statement fees, and POS commissions | 0.00 (In-period) |
| **5301** | Direct Purchase Expenses | مصروفات مشتريات وتكاليف تشغيلية | `EXPENSE` | `DEBIT` | Non-stock commercial goods purchase costs | 0.00 (In-period) |

**Balance Check Verification**:
- Total Debits: `150,000.00 + 5,000.00 + 28,750.00 + 3,750.00 + 10,000.00 = 197,500.00 SAR`
- Total Credits: `23,000.00 + 6,500.00 + 100,000.00 + 68,000.00 = 197,500.00 SAR`
- Net Balance: **0.00 SAR (Balanced)**

---

## 6. Fiscal Calendar and Period Setup

Fiscal Year **2026** is pre-configured with 12 calendar monthly periods:

| Period Code | Period Name | Start Date | End Date | Baseline State in Sandbox | Purpose in Trial |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `2026-01` to `2026-08` | January – August 2026 | `2026-01-01` | `2026-08-31` | `CLOSED` | Demonstrates historical locked periods. Attempted postings return `409 Conflict`. |
| **`2026-09`** | **September 2026** | `2026-09-01` | `2026-09-30` | **`OPEN`** | **Active evaluation period**. All demo invoicing, payments, journals, and bank statements occur in this period. |
| `2026-10` to `2026-12` | October – December 2026 | `2026-10-01` | `2026-12-31` | `OPEN` | Future open periods for forward-testing. |

### Period Close Validation Scenario:
- Evaluator tests the Pre-Close Validation for `2026-09` (verifies balanced journals and period dates).
- Evaluator closes `2026-09`.
- Evaluator attempts to post an invoice dated `2026-09-15` &rarr; verifies that `assertPeriodIsOpen` rejects the request with HTTP `409 Conflict`.
- Evaluator reopens `2026-09` with a mandatory reason (*"Partner trial audit adjustment"*).
- Postings are permitted again.
- **Fiscal Year Close**: Demonstrated as validation-first; closing FY 2026 requires all 12 monthly periods to be closed first, and produces zero automated retained earnings entries (as specified in MVP design).

---

## 7. Customers (Accounts Receivable Directory)

Four synthetic B2B customers represent different commercial relationships:

| Customer Name | Type | Contact Placeholder | Synthetic VAT / TIN | Credit Terms | Evaluation Scenario |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Riyadh Retail Demo Customer**<br>*(شركة الرياض للتجزئة التجريبية)* | B2B Commercial | `<CUSTOMER_RIYADH_CONTACT>` | `300000000000011` | Net 30 | Fully paid invoice scenario matching bank CSV deposit. |
| **Jeddah Services Demo Customer**<br>*(مؤسسة جدة للخدمات التجريبية)* | B2B Corporate | `<CUSTOMER_JEDDAH_CONTACT>` | `300000000000012` | Net 15 | Partially paid sales invoice scenario. |
| **Dammam Wholesale Demo Customer**<br>*(شركة الدمام لتجارة الجملة)* | B2B Wholesale | `<CUSTOMER_DAMMAM_CONTACT>` | `300000000000013` | Net 45 | Open / unpaid sales invoice scenario. |
| **Khobar Consulting Demo Client**<br>*(مكتب الخبر للاستشارات التجريبي)* | SME Client | `<CUSTOMER_KHOBAR_CONTACT>` | `300000000000014` | Due on Receipt | Draft sales invoice creation and cancellation test. |

---

## 8. Suppliers (Accounts Payable Directory)

Four synthetic B2B suppliers represent standard operational expenses and direct purchasing:

| Supplier Name | Type | Contact Placeholder | Synthetic VAT / TIN | Payment Terms | Evaluation Scenario |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Gulf Office Supplies Demo Vendor**<br>*(شركة الخليج للتوريدات المكتبية)* | B2B Supplier | `<VENDOR_GULF_CONTACT>` | `300000000000021` | Net 30 | Fully settled purchase invoice matching bank transfer. |
| **Najd Technology Services Demo Vendor**<br>*(مؤسسة نجد للتقنية والبرمجيات)* | Service Provider | `<VENDOR_NAJD_CONTACT>` | `300000000000022` | Net 15 | Partially paid vendor bill scenario. |
| **Eastern Logistics Demo Vendor**<br>*(شركة الشرق للخدمات اللوجستية)* | Service Provider | `<VENDOR_EASTERN_CONTACT>` | `300000000000023` | Net 30 | Open / unpaid vendor bill scenario. |
| **Al-Amal Utilities Demo Supplier**<br>*(مؤسسة الأمل للصيانة والمرافق)* | Utility Vendor | `<VENDOR_AMAL_CONTACT>` | `300000000000024` | Net 7 | Draft purchase bill creation and review test. |

---

## 9. Products and Services Master Items

Even though inventory ledger tracking is out of scope, line items must be available for sales and purchase invoice generation:

| Item Name | Item Code | Type | Unit Price (SAR) | VAT Rate | Target GL Revenue/Expense | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **IT & ERP Consulting Service** | `SRV-001` | Service | 5,000.00 | 15% | `4201 - Consulting Revenue` | Non-stock consulting labor |
| **Cloud Software Subscription (Annual)** | `SRV-002` | Service | 2,400.00 | 15% | `5101 - General & Admin Expenses` | Vendor operational service |
| **Commercial Office Furniture Set** | `GDS-001` | Non-Stock Good | 4,000.00 | 15% | `5301 - Direct Purchase Expenses` | Physical item; zero stock balance tracked |
| **Wholesale Merchandise Pack** | `GDS-002` | Non-Stock Good | 10,000.00 | 15% | `4101 - Commercial Sales Revenue` | Physical trade good; zero stock ledger |
| **Express Delivery & Courier Service** | `SRV-003` | Service | 250.00 | 15% | `5101 - General & Admin Expenses` | Freight/courier charge |

---

## 10. Sales Invoice Scenarios

All invoices are dated within **September 2026** and enforce the mandatory 15% VAT rate:

| Invoice Number | Customer Name | Date | Line Items | Subtotal (SAR) | VAT 15% (SAR) | Total (SAR) | Target Status | Expected Accounting Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `INV-2026-001` | Riyadh Retail Demo Customer | `2026-09-02` | 1x Wholesale Pack (`GDS-002`) | 10,000.00 | 1,500.00 | **11,500.00** | `ISSUED` *(Fully Paid)* | Dr 1201 A/R 11,500.00<br>Cr 4101 Sales 10,000.00<br>Cr 2201 VAT 1,500.00 |
| `INV-2026-002` | Jeddah Services Demo Customer | `2026-09-05` | 2x IT Consulting (`SRV-001`) | 10,000.00 | 1,500.00 | **11,500.00** | `ISSUED` *(Partially Paid)* | Dr 1201 A/R 11,500.00<br>Cr 4201 Services 10,000.00<br>Cr 2201 VAT 1,500.00 |
| `INV-2026-003` | Dammam Wholesale Demo Customer | `2026-09-10` | 1x Consulting (`SRV-001`)<br>1x Express (`SRV-003`) | 5,250.00 | 787.50 | **6,037.50** | `ISSUED` *(Unpaid)* | Dr 1201 A/R 6,037.50<br>Cr Revenue accounts 5,250.00<br>Cr 2201 VAT 787.50 |
| `INV-2026-004` | Khobar Consulting Demo Client | `2026-09-18` | 1x IT Consulting (`SRV-001`) | 5,000.00 | 750.00 | **5,750.00** | `DRAFT` | No GL impact while in DRAFT status. |
| `INV-2026-005` | Khobar Consulting Demo Client | `2026-09-12` | 1x IT Consulting (`SRV-001`) | 5,000.00 | 750.00 | **5,750.00** | `CANCELLED` | Safely voided prior to settlement; no open balance. |

---

## 11. Purchase Invoice Scenarios

Purchase invoices reflect commercial operating costs and direct expenses:

| Bill Number | Supplier Name | Date | Line Items | Subtotal (SAR) | VAT 15% (SAR) | Total (SAR) | Target Status | Expected Accounting Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `BILL-2026-001` | Gulf Office Supplies Demo Vendor | `2026-09-03` | 1x Office Furniture (`GDS-001`) | 4,000.00 | 600.00 | **4,600.00** | `RECEIVED` *(Fully Paid)* | Dr 5301 Purchases 4,000.00<br>Dr 1202 VAT Rec 600.00<br>Cr 2101 A/P 4,600.00 |
| `BILL-2026-002` | Najd Technology Services Demo | `2026-09-06` | 2x Cloud Sub (`SRV-002`) | 4,800.00 | 720.00 | **5,520.00** | `RECEIVED` *(Partially Paid)* | Dr 5101 Expenses 4,800.00<br>Dr 1202 VAT Rec 720.00<br>Cr 2101 A/P 5,520.00 |
| `BILL-2026-003` | Eastern Logistics Demo Vendor | `2026-09-11` | 4x Express Courier (`SRV-003`) | 1,000.00 | 150.00 | **1,150.00** | `RECEIVED` *(Unpaid)* | Dr 5101 Expenses 1,000.00<br>Dr 1202 VAT Rec 150.00<br>Cr 2101 A/P 1,150.00 |
| `BILL-2026-004` | Al-Amal Utilities Demo Supplier | `2026-09-20` | 1x Facility Maintenance | 2,000.00 | 300.00 | **2,300.00** | `DRAFT` | No GL impact while in DRAFT status. |
| `BILL-2026-005` | Al-Amal Utilities Demo Supplier | `2026-09-14` | 1x Office Cleaning | 1,000.00 | 150.00 | **1,150.00** | `CANCELLED` | Safely voided; zero A/P liability. |

---

## 12. Payment Scenarios

> [!IMPORTANT]
> **Payment Status Semantics**:
> As established in the Financial ERP architecture, `Payment.status` uses the enum values `POSTED` and `CANCELLED`. Invoice settlement status (`PAID`, `PARTIALLY_PAID`, `UNPAID`) is computed dynamically based on the sum of active `POSTED` payment records linked to the invoice.

| Payment Reference | Type | Linked Invoice | Method | Payment Date | Amount (SAR) | Expected GL Impact | Scenario Objective |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `PAY-AR-001` | AR Receipt | `INV-2026-001` (Total: 11,500.00) | `TRANSFER` | `2026-09-08` | **11,500.00** | Dr 1101 Bank 11,500.00<br>Cr 1201 A/R 11,500.00 | **Full Settlement**: Clears invoice to 0.00 balance; matches bank CSV row. |
| `PAY-AR-002` | AR Receipt | `INV-2026-002` (Total: 11,500.00) | `TRANSFER` | `2026-09-09` | **5,000.00** | Dr 1101 Bank 5,000.00<br>Cr 1201 A/R 5,000.00 | **Partial Settlement**: Leaves 6,500.00 SAR outstanding balance. |
| `PAY-AP-001` | AP Disbursement | `BILL-2026-001` (Total: 4,600.00) | `TRANSFER` | `2026-09-07` | **4,600.00** | Dr 2101 A/P 4,600.00<br>Cr 1101 Bank 4,600.00 | **Full Settlement**: Clears bill to 0.00 balance; matches bank CSV row. |
| `PAY-AP-002` | AP Disbursement | `BILL-2026-002` (Total: 5,520.00) | `TRANSFER` | `2026-09-12` | **2,500.00** | Dr 2101 A/P 2,500.00<br>Cr 1101 Bank 2,500.00 | **Partial Settlement**: Leaves 3,020.00 SAR outstanding balance. |
| *Attempted Overpayment* | AR Receipt | `INV-2026-002` (Remaining: 6,500.00) | `TRANSFER` | `2026-09-15` | *7,000.00* | *None (Rejected)* | **Overpayment Guard**: API returns HTTP `409 Conflict` (`Payment amount exceeds remaining balance`). |

---

## 13. Bank Accounts

Two synthetic bank accounts are configured in the sandbox:

| Account Identifier | Bank Name (Placeholder) | Masked IBAN / Account | Currency | Linked GL Account | Initial Balance (SAR) | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Operating Bank Account** | `Alinma Commercial Demo Bank` | `SA****************0001` | `SAR` | `1101 - Primary Bank Account` | 150,000.00 | Primary account for all statement CSV imports and trial reconciliation matches. |
| **Savings / Reserve Account** | `Riyad Bank Reserve Demo` | `SA****************0002` | `SAR` | `1101` (or separate asset) | 50,000.00 | Secondary holding account for transfer demonstration. |

---

## 14. Bank Statement CSV Examples

The backend CSV parser accepts RFC-4180 CSV formats using standard aliases (`date`, `description`, `reference`, `amount` / `debit` / `credit`).

### Synthetic Statement File: `synthetic_bank_statement_2026_09.csv`

```csv
date,reference,description,amount
2026-09-07,TXN-9011,Transfer to Gulf Office Supplies, -4600.00
2026-09-08,TXN-9012,Payment from Riyadh Retail Customer, 11500.00
2026-09-10,TXN-9013,Transfer from Jeddah Services Co, 5000.00
2026-09-14,TXN-9014,Transfer to Najd Technology, -2500.00
2026-09-15,TXN-9015,Monthly Corporate Bank Account Fee, -150.00
2026-09-22,TXN-9016,Unidentified Direct Deposit Khobar, 1200.00
```

### Analysis of Sample Rows:
1. **Row 1 (`-4,600.00`)**: Exact match for AP Payment `PAY-AP-001` (dated `2026-09-07`).
2. **Row 2 (`+11,500.00`)**: Exact match for AR Payment `PAY-AR-001` (dated `2026-09-08`).
3. **Row 3 (`+5,000.00`)**: Exact amount match for AR Payment `PAY-AR-002`, with a 1-day date variance (`2026-09-10` on statement vs `2026-09-09` in ERP) &rarr; triggers the suggestion engine.
4. **Row 4 (`-2,500.00`)**: Matches AP Payment `PAY-AP-002` with a 2-day date variance &rarr; triggers suggestion engine.
5. **Row 5 (`-150.00`)**: Unmatched bank fee row &rarr; demonstrates recording a bank fee adjustment via manual journal entry.
6. **Row 6 (`+1,200.00`)**: Unmatched bank deposit &rarr; demonstrates an external deposit not yet recorded in the ERP ledger.

---

## 15. Reconciliation Scenarios

The reconciliation module provides automated suggestions and manual match/unmatch controls:

| Scenario | Input Data | Expected Outcome | Evaluator Verification Step |
| :--- | :--- | :--- | :--- |
| **Exact Match** | Statement row `TXN-9012` (+11,500.00, 2026-09-08) & Payment `PAY-AR-001` | Suggestion score: `EXACT (100)`. One-click match links statement line to payment. | Verify status transitions to `MATCHED` on both sides. |
| **Date Variance Match** | Statement row `TXN-9013` (+5,000.00, 2026-09-10) & Payment `PAY-AR-002` (2026-09-09) | Suggestion score: High confidence match based on exact amount and party name within the 3-day window. | Evaluator reviews suggestion card and approves match. |
| **Unmatched Bank Row** | Statement row `TXN-9015` (-150.00 Bank Fee) | Appears in Unmatched Statement Transactions report. | Evaluator notes item requires a bank fee journal entry. |
| **Unmatched ERP Item** | ERP Payment created without a corresponding statement line | Appears in Unmatched ERP Payments report. | Evaluator verifies report reflects ledger payments awaiting clearing. |
| **Duplicate File Rejection** | Re-uploading `synthetic_bank_statement_2026_09.csv` | HTTP `409 Conflict` (`Statement file with identical checksum already exists`). | Evaluator observes clear, non-technical error notification. |
| **Manual Match Creation** | Selecting an unmatched bank line and an unmatched ERP payment | Match created with `MatchType.MANUAL`. | Evaluator confirms custom match creation. |
| **Manual Unmatch / Remove** | Clicking "Unmatch" on previously matched `TXN-9012` | Match is decoupled; both statement row and payment return to `UNMATCHED` pool. | Audit log records `RECONCILIATION_UNMATCH` event. |

---

## 16. Manual Journal Entry Scenarios

Evaluators test the General Ledger manual journal entry lifecycle at `/accounting/journal-entries`:

| Scenario | Entry Date | Debit Line | Credit Line | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **1. Balanced Adjustment** | `2026-09-15` | Dr 5201 Bank Fees: 150.00 SAR | Cr 1101 Primary Bank: 150.00 SAR | Debits equal credits (150.00 = 150.00). Entry transitions `DRAFT` &rarr; `POSTED`. Updates Trial Balance. |
| **2. Unbalanced Rejection** | `2026-09-16` | Dr 5101 Expenses: 500.00 SAR | Cr 1101 Primary Bank: 450.00 SAR | Difference of 50.00 SAR. UI disables post button; API returns `400 Bad Request` (`Journal debits and credits must balance`). |
| **3. Draft Cancellation** | `2026-09-17` | Dr 1102 Petty Cash: 1,000.00 SAR | Cr 1101 Primary Bank: 1,000.00 SAR | Evaluator creates draft, reviews lines, and clicks "Cancel Draft". Entry status becomes `CANCELLED`; no GL effect. |
| **4. Closed-Period Block** | `2026-08-20` *(Closed Period)* | Dr 5101 Expenses: 300.00 SAR | Cr 1101 Primary Bank: 300.00 SAR | Entry date falls in closed period `2026-08`. System rejects posting with HTTP `409 Conflict` (`Cannot post into closed period`). |

---

## 17. Financial Report Expectations

All financial reports at `/reports` must reflect string-based decimal precision without floating-point inaccuracies. Evaluators verify the following checks:

### 1. Trial Balance Check:
- Total Debits must exactly equal Total Credits.
- Normal balances must be respected: Assets & Expenses carry debit balances; Liabilities, Equity & Revenue carry credit balances.
- Account `1101 - Primary Bank` balance must reflect initial opening balance + receipts - disbursements - posted bank fees.

### 2. Income Statement (P&L) Check:
- **Revenue**: Sum of `4101 Commercial Sales` (10,000.00) + `4201 Consulting` (10,000.00) = `20,000.00 SAR`.
- **Expenses**: Sum of `5101 Expenses` (4,800.00) + `5301 Purchases` (4,000.00) + `5201 Bank Fees` (150.00) = `8,950.00 SAR`.
- **Net Operating Income**: `20,000.00 - 8,950.00 = 11,050.00 SAR`.

### 3. Balance Sheet Check:
- **Total Assets** = `Bank (152,250.00) + Cash (5,000.00) + A/R (35,287.50) + VAT Rec (5,070.00) + Stock (10,000.00) = 207,607.50 SAR`.
- **Total Liabilities** = `A/P (21,570.00) + VAT Pay (9,037.50) = 30,607.50 SAR`.
- **Total Equity** = `Share Capital (100,000.00) + Retained Earnings (68,000.00) + Current Period Net Income (11,050.00) = 179,050.00 SAR`.
- **Equation**: `Assets (207,607.50) = Liabilities (30,607.50) + Equity (179,050.00)`. **Balanced!**

### 4. Read-Only Enforcement:
- Reports display strictly in view mode; no direct inline editing of financial figures is permitted.

---

## 18. Period Close Scenarios

Evaluators test the period close workflow at `/accounting/periods`:

1. **Pre-Close Validation**:
   - Evaluator opens Period `2026-09`.
   - Clicks "Run Pre-Close Check".
   - System confirms all journal entries in the period are balanced, no unposted drafts exist (or warns of drafts), and date boundaries align.
2. **Close Execution**:
   - Evaluator confirms period closure.
   - Period status transitions from `OPEN` to `CLOSED`.
3. **Closed Period Enforcement**:
   - Evaluator attempts to issue a sales invoice or post a manual journal entry dated `2026-09-15`.
   - System invokes `assertPeriodIsOpen` and halts the transaction with `409 Conflict`.
4. **Reopen with Mandatory Justification**:
   - Evaluator clicks "Reopen Period".
   - A modal requires a mandatory text explanation (e.g., *"Late vendor invoice correction approved by controller"*).
   - Period status returns to `OPEN`.
   - Audit trail records the reopen action along with the user's justification text.
5. **Fiscal Year Close**:
   - Evaluator navigates to Fiscal Year 2026.
   - System checks whether all 12 monthly periods are closed.
   - If any period remains open, year-close is blocked.
   - If all periods are closed, year-close transitions the year to `CLOSED`.
   - Confirms that zero automated retained earnings entries are generated (manual closing entries required).

---

## 19. Audit Log Demo Events

The audit log at `/admin/audit-logs` must show a continuous trail of baseline and trial actions. Evaluators verify the following event types:

| Event Category | Action | Target Entity | Sample Audit Summary | Redaction Verification |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `LOGIN` | User Session | User `<ACCOUNTANT_EMAIL>` logged in successfully | Passwords and refresh tokens masked as `[REDACTED]` |
| **General Ledger** | `JOURNAL_POST` | Journal Entry | Journal entry `JE-2026-001` posted (150.00 SAR) | Full debits/credits diff captured in JSON state |
| **Sales** | `INVOICE_ISSUE` | Sales Invoice | Sales invoice `INV-2026-001` issued to Riyadh Retail | Line items and tax calculations preserved |
| **Purchases** | `BILL_RECEIVE` | Purchase Invoice | Purchase bill `BILL-2026-001` received from Gulf Office | Expense accounts and input VAT logged |
| **Payments** | `PAYMENT_CREATE` | Payment | Payment `PAY-AR-001` (11,500.00 SAR) posted | Bank transfer reference recorded |
| **Reconciliation** | `STATEMENT_IMPORT` | Bank Statement | Statement CSV `synthetic_bank_statement_2026_09.csv` imported (6 rows) | File hash stored; raw file discarded |
| **Reconciliation** | `MATCH_CREATE` | Statement Line | Line `TXN-9012` matched to Payment `PAY-AR-001` | Match type recorded as `SYSTEM_EXACT` or `MANUAL` |
| **Period Close** | `PERIOD_CLOSE` | Accounting Period | Period `2026-09` closed | Timestamp and closing actor recorded |
| **Period Close** | `PERIOD_REOPEN` | Accounting Period | Period `2026-09` reopened; Justification: *"Late invoice audit"* | Reason text captured in audit payload |
| **Audit Log** | `EXPORT_PREVIEW` | Audit Trail | User requested export record count preview | Zero files generated on disk |

---

## 20. Trial Data Reset Guidance

Operators must follow these steps to restore the clean demo baseline between partner cohorts:

1. **Restore Baseline Snapshot**:
   - Terminate active application connections to `<SANDBOX_DATABASE_NAME>`.
   - Restore the baseline database dump:
     ```bash
     pg_restore -U <SANDBOX_DB_USER> -d <SANDBOX_DATABASE_NAME> --clean erp_sandbox_baseline.dump
     ```
2. **Rotate Trial User Passwords Outside Git**:
   - Update user passwords in the sandbox database using a secure password-hashing script.
   - Never commit or log the new passwords.
3. **Clear Uploaded CSV Files**:
   - Delete any temporary statement files uploaded during the session from the sandbox file directory.
4. **Audit Data Reset Policy**:
   - If evaluating a new partner cohort, reset the audit log table alongside the database restore so the new partner starts with a clean activity history.
5. **Migration Check**:
   - Run `pnpm --filter @erp/backend prisma:migrate:deploy` to verify migration status is current.
6. **Health Verification**:
   - Confirm backend returns HTTP 200 at `/api/health`.
   - Verify frontend loads cleanly at `/dashboard`.

---

## 21. Data Quality Checklist

Before delivering the sandbox to evaluation partners, the operator must verify every item on this quality checklist:

- [ ] **Zero Real Names**: All individuals and legal entities are fictional.
- [ ] **Zero Real VAT Numbers**: All TINs follow synthetic formats (e.g., `300000000000003`).
- [ ] **Zero Real IBANs**: Bank account numbers are masked placeholders.
- [ ] **Zero Production Data**: Confirmed no live customer or transactional records exist.
- [ ] **Mathematical Integrity**: Invoices correctly compute subtotal + 15% VAT = total.
- [ ] **Consistent 15% VAT**: Applied uniformly across commercial goods and services.
- [ ] **Balanced General Ledger**: Every journal entry has equal debits and credits.
- [ ] **Financial Reports Load**: Trial Balance, Income Statement, and Balance Sheet render with balanced totals.
- [ ] **Reconciliation Scenarios Tested**: Sample CSV uploads successfully, duplicates are rejected, and matches link cleanly.
- [ ] **Audit Trail Visible & Masked**: Audit events appear in `/admin/audit-logs` with credentials masked.
- [ ] **Permission Matrix Verified**: Personas can only access their authorized screens and actions.

---

## 22. Recommended Next Step

Upon completion of this guide, proceed to:

**Phase 17A-B-3 – Trial Access Pack and Feedback Form** (`docs/PHASE_17A_B3_TRIAL_ACCESS_PACK.md`):
- Partner trial invitation package and persona credentials guide.
- Step-by-step 45-minute guided evaluation script covering core workflows.
- Standardized partner feedback collection template and defect reporting instructions.
