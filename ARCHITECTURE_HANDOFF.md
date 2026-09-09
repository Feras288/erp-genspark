# Architecture Handoff Pack — ERP System

> **Audience:** Cursor (and any successor engineer picking up this monorepo).
> **Goal:** A single document that maps the system, what's done, what's pending,
> and the strict working conventions so the next phases are landed without
> surprises.
> **Last verified HEAD:** `ef5ac4311b25ccbea7dac8754c10c7d252551db8`
> **Branch:** `main`

---

## 1. Project Structure

This is a **pnpm monorepo** running a NestJS backend, a Next.js frontend, and a
PostgreSQL database accessed through Prisma. The whole thing is runnable
locally via Docker Compose — there is no Cloudflare / hosted stack.

```
erp-system/
├── backend/                 # NestJS 10 + Prisma 5.22 (TypeScript)
│   ├── src/
│   │   ├── auth/            # JwtAuthGuard, PermissionsGuard, decorators
│   │   ├── users/
│   │   ├── products/
│   │   ├── inventory/       # stock levels + stock movements
│   │   ├── warehouses/
│   │   ├── partners/        # customers + suppliers
│   │   ├── sales/           # SalesInvoices + 10A AR payments controller
│   │   ├── purchases/       # PurchaseInvoices + lifecycle
│   │   ├── payments/        # 10A AR side + 10B AP skeleton (same module)
│   │   ├── reports/         # AR/AP summary + AR/AP aging (read-only)
│   │   ├── accounting/      # chart of accounts + journal entries
│   │   └── pos/             # POS quick-sale
│   ├── prisma/
│   │   ├── schema.prisma    # single source of truth for the DB model
│   │   ├── migrations/      # one folder per migration, timestamp-named
│   │   │                    #   20260906222542_init
│   │   │                    #   20260907002406_phase2_products_partners
│   │   │                    #   ...
│   │   │                    #   20260908215449_phase10a_payments    ← Payment table + RBAC catalog (ar_payments.*)
│   │   │                    #   20260908233949_phase10b_ap_payments_permissions  ← RBAC catalog only (ap_payments.*)
│   │   └── seed.ts          # idempotent catalog + admin user + base roles
│   └── test/                # Jest e2e (e.gemigrations applied first)
│       ├── app.e2e-spec.ts        # smoke + admin-agent + cashier bootstrap
│       └── reports.e2e-spec.ts    # AR/AP summary + AR/AP aging + 10A AR payments
├── frontend/                # Next.js 14.2.13 + React 18 + TypeScript
│   └── src/
│       ├── app/             # App Router: /dashboard /login /sales /purchases /reports /pos /...
│       ├── lib/
│       │   ├── api.ts       # central axios client (api.* functions + types)
│       │   ├── auth.tsx     # JWT-in-memory, refresh-on-401, useAuth().hasPermission(key)
│       │   └── auth-types.ts # SafeUser.permissions: string[] (JWT claim)
│       └── ...
├── docker-compose.yml       # local Postgres + backend + frontend dev servers
├── pnpm-workspace.yaml
├── package.json             # root scripts delegate via pnpm --filter
└── README.md                # canonical per-phase closure log (Phase 0 … Phase 10A)
```

Workspace commands all run from the repo root:

```bash
pnpm --filter @erp/backend <script>
pnpm --filter @erp/frontend <script>
```

---

## 2. Core Modules

| Module | Path | Status |
|---|---|---|
| Auth / RBAC | `backend/src/auth` | Complete — JwtAuthGuard + PermissionsGuard + `@CurrentUser()`, `@RequirePermissions()` |
| Users | `backend/src/users` | Complete — owned by Phase 1 |
| Products | `backend/src/products` | Complete — owned by Phase 2 |
| Partners | `backend/src/partners` | Complete — type=CUSTOMER/SUPPLIER/BOTH |
| Warehouses | `backend/src/warehouses` | Complete — owned by Phase 3 |
| Inventory + stock movements | `backend/src/inventory` | Complete — owned by Phase 3 |
| Sales + POS | `backend/src/sales`, `backend/src/pos` | Complete — DRAFT → ISSUED → CANCELLED, stock deduction on issue |
| Purchases | `backend/src/purchases` | Complete — DRAFT → RECEIVED → CANCELLED, stock credit on receive |
| Reports | `backend/src/reports` | Complete — AR/AP summary + AR/AP aging (read-only aggregations) |
| Payments (AR + AP) | `backend/src/payments` | **Phase 10A complete; Phase 10B skeleton only** |
| Accounting | `backend/src/accounting` | Complete — chart of accounts + journal entries (double-entry posting) |

All controllers are mounted under the global `api` prefix (set in `main.ts`),
so a controller declared as `@Controller('sales-invoices/:invoiceId/payments')`
becomes `/api/sales-invoices/:invoiceId/payments` at runtime.

---

## 3. RBAC — The Catalog the Server & Client Share

Authorization is enforced server-side by `JwtAuthGuard` + `PermissionsGuard`
decorated with `@RequirePermissions('key.one', 'key.two')`. The client mirrors
the same keys via `useAuth().hasPermission('key.one')` reading the JWT's
`permissions: string[]` claim — there is no server-side role re-check on the
client beyond the JWT-call roundtrip itself.

Keys relevant TODAY (full catalog is in `backend/prisma/seed.ts`):

| Catalog key | Used by | Notes |
|---|---|---|
| `reports.read` | AR summary, AP summary, AR aging, AP aging, all reports.* endpoints | Read-only |
| `ar_payments.read` | `GET /api/sales-invoices/:invoiceId/payments` | Phase 10A complete |
| `ar_payments.write` | `POST /api/sales-invoices/:invoiceId/payments` | Phase 10A complete + idempotency + 409 overpayment + writeback on `SalesInvoice.paidAmount` |
| `ap_payments.read` | `GET /api/purchase-invoices/:invoiceId/payments` | **Phase 10B-B-1 skeleton** — returns `[]` |
| `ap_payments.write` | `POST /api/purchase-invoices/:invoiceId/payments` | **Phase 10B-B-1 skeleton** — throws `NotImplementedException` (handled server-side as **501 Not Implemented**) |

**Tenancy rule (everywhere):** `companyId` is sourced **exclusively** from the
JWT (no `companyId` in URL paths, query strings, or request bodies). Services
guard against cross-tenant access by always `where: { companyId, … }`. The
client never crafts `companyId` — it just reads it from `state.user.companyId`.

---

## 4. Reports — Status (all READY)

All four reports are `ReportsService`-backed read-only aggregations. Each
returns `{ status: 'READY', report, companyId, filters, generatedAt, data }`
once the server has computed it. No background job is involved.

| Report | Route | Returns |
|---|---|---|
| **AR summary** | `GET /api/reports/ar-summary` | customers + outstanding totals for sales invoices |
| **AP summary** | `GET /api/reports/ap-summary` | suppliers + outstanding totals for purchase invoices |
| **AR aging** | `GET /api/reports/ar-aging` | bucketed `0-30 / 31-60 / 61-90 / 90+` for ISSUED sales invoices |
| **AP aging** | `GET /api/reports/ap-aging` | bucketed `0-30 / 31-60 / 61-90 / 90+` for RECEIVED purchase invoices (date fallback = `receivedAt ?? dueDate ?? purchaseDate`) |

Every report is gated by `@RequirePermissions('reports.read')` and the
JWT-claim `hasPermission('reports.read')` on the frontend. Smoke proof lives
in `backend/test/reports.e2e-spec.ts` (the relevant `it('…'` blocks).

---

## 5. Payments — Status (splits the AR/AP barbell)

### 5a. AR Payments — Phases 10A-B-1 → 10A-D-2 — **complete and sealed**

- **`Payment` model** (polymorphic): `salesInvoiceId` + `purchaseInvoiceId` + `invoiceType: SALES | PURCHASE` + `status: POSTED | CANCELLED` + `idempotencyKey` + soft-delete + audit fields.
- **Migration** `20260908215449_phase10a_payments`: creates `payments` table + 6 indexes + `payments_invoice_fk_exactly_one` CHECK constraint + inserts `ar_payments.read` + `ar_payments.write` into the RBAC catalog.
- **Backend logic** (`backend/src/payments/payments.{controller,service,module}.ts`): `list()` + `register()` with **Prisma `$transaction`** wrapping:
  1. find `SalesInvoice` (tenant + `status = ISSUED` + not deleted)
  2. `SUM(amount)` of existing active payments → `existingPaid`
  3. compare `outstanding = max(0, invoice.total − existingPaid)` ⇒ **409 ConflictException** when `requested > outstanding`
  4. `INSERT Payment` with `invoiceType = SALES` + `salesInvoiceId` set
  5. writeback `SalesInvoice.paidAmount = existingPaid + requested` (so Phase 9E aging keeps its invariant — `max(0, total − COALESCE(paidAmount, 0))`)
- **Idempotency**: short-circuit before the transaction — if an active payment with the same `(companyId, salesInvoiceId, idempotencyKey)` exists, return it unchanged.
- **`SalesInvoice.status` is NOT changed** — Phase 10A keeps the 3-state lock (`DRAFT | ISSUED | CANCELLED`) and does **not** introduce `PAID / PARTIALLY_PAID`. Settlement ratio is computed client-side via `outstanding / total`.
- **E2E smoke**: `Phase 10A-B-3: AR Payments backend (e2e smoke)` block in `backend/test/reports.e2e-spec.ts` — 6 tests covering GET 200/403 + POST 200/201 + 409 overpayment + idempotency duplicate + 404 missing invoice.
- **Frontend** (`frontend/src/lib/api.ts` + `frontend/src/app/sales/page.tsx`): `listArPayments(invoiceId, params?)` + `createArPayment(invoiceId, payload)` + `ArPayment` polymorphic type + 4 supporting types; `المدفوععات (N)` toggle per row + register-payment form + `crypto.randomUUID()` per submit attempt.
- **README closure**: `Phase 10A: AR Payments + Settlement Tracking` section in `README.md` (added by commit `dc5e71f`).

### 5b. AP Payments — Phase 10B-B-1 — **skeleton only**

- **RBAC catalog only**: insertion of `ap_payments.read` + `ap_payments.write` via migration `20260908233949_phase10b_ap_payments_permissions` (idempotent `ON CONFLICT ("key") DO NOTHING`).
- **Endpoints skeleton** (`ApPaymentsController` in `backend/src/payments/payments.controller.ts`, registered in the same `PaymentsModule`):
  - `GET  /api/purchase-invoices/:invoiceId/payments`  → `ap_payments.read` → returns `[]`
  - `POST /api/purchase-invoices/:invoiceId/payments` → `ap_payments.write` → throws `NotImplementedException` → server responds **501 Not Implemented**
- **Service skeleton** (`listPurchasePayments` + `registerPurchasePayment` in `backend/src/payments/payments.service.ts`): both validate `me.companyId` defensively before returning the stub result.
- **Pending** (next phases):
  - **Phase 10B-B-2**: tenant-scoped findFirst on `PurchaseInvoice` + AP-side `SUM(Payment.amount)` aggregator + `status = RECEIVED` guard + idempotency short-circuit + 409 overpayment + Prisma `$transaction` + status unchanged.
  - **Phase 10B-B-3**: e2e smoke mirroring the 10A pattern (GET 200/403 + POST 200/201/409 + idempotency duplicate + 404).
  - **Phase 10B-C-code**: add `api.listApPayments(invoiceId, params?)` + `api.createApPayment(invoiceId, payload)` + AP-side types in `frontend/src/lib/api.ts`; expand `/purchases` page with an inline expander (mirroring the 10A `/sales` expander) — **no new route**.
  - **Phase 10B-D-1** + **Phase 10B-D-2**: verification + README closure.

> **Design note:** The `Payment` model is already polymorphic. AP uses
> `invoiceType = PURCHASE` + `purchaseInvoiceId` set + `salesInvoiceId = NULL`,
> so **no schema change is required** for the 10B route. The
> `outstanding = max(0, total − SUM(Payment.amount))` math is computed inline
> in Phase 10B-B-2 (there is no `PurchaseInvoice.paidAmount` column by design —
> the AR writeback column is intentionally not mirrored to keep AP aging on the
> Phase 9E invariant `outstanding = max(0, total)` until 10B contracts that
> invariant deliberately).

---

## 6. Database — Migrations + Critical Constraint

### 6a. Migrations chronology (from `backend/prisma/migrations/`)

```
20260906222542_init                                    ← companies, users, roles, permissions, partners
20260907002406_phase2_products_partners               ← products, suppliers/customers, stock_levels foundation
20260907005059_phase3_inventory_core                  ← stock_levels + stock_movements
20260907011403_phase4_sales_pos                       ← sales_invoices + pos
20260907020000_phase4b_invoice_line_warehouse         ← invoice line + per-warehouse stock
20260907225332_phase5_purchases_core                  ← purchase_invoices
20260907230948_phase6_accounting_core                 ← accounts + journal_entries + double-entry
20260908215449_phase10a_payments                      ← payments table + polymorphic CHECK + ar_payments.*
20260908233949_phase10b_ap_payments_permissions       ← RBAC catalog only (ap_payments.*) — no table changes
```

### 6b. The Critical Polymorphic CHECK Constraint

The `Payment` table has **exactly one** of `salesInvoiceId` / `purchaseInvoiceId`.
This is enforced both at the application layer AND at the database level via a
Postgres CHECK constraint added in migration `20260908215449_phase10a_payments`:

```sql
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_invoice_fk_exactly_one"
  CHECK (
    (("salesInvoiceId" IS NOT NULL)::int + ("purchaseInvoiceId" IS NOT NULL)::int) = 1
  );
```

> **Why this matters for Cursor:** Prisma cannot express polymorphic FK + CHECK
> in one model declaration. Don't add `@relation` between `Payment` and both
> invoice schemas simultaneously without the CHECK constraint — the migration
> must enforce the invariant. Any 10B code MUST set exactly one of the two FKs
> based on the request URL (`/sales-invoices/.../payments` → salesInvoiceId,
> `/purchase-invoices/.../payments` → purchaseInvoiceId) and leave the other
> column `NULL`.

The `invoiceType` enum column is the source-of-truth hint (`SALES | PURCHASE`),
but the CHECK constraint is what mechanically rejects malformed inserts.

---

## 7. Build / Test / Migrate Commands

These four are the canonical verification commands at every phase boundary
(use them in this exact order before any commit):

```bash
# 1. Backend compile (TypeScript → JS via nest build)
pnpm --filter @erp/backend build

# 2. Backend e2e (Jest against DB-migrated state)
#    The test DB has all 9 migrations applied automatically via the
#    test/setup script — first run after a fresh checkout needs
#    `pnpm prisma:migrate:deploy` once on the dev DB.
pnpm --filter @erp/backend test:e2e

# 3. Frontend compile (Next.js 14.2 production build)
pnpm --filter @erp/frontend build

# 4. Apply pending migrations to a target DB (CI / staging / prod-style deploy)
pnpm prisma:migrate:deploy
#   alias: `pnpm --filter @erp/backend prisma:migrate:deploy`
```

Expected outputs at a healthy boundary:

| Command | Healthy result |
|---|---|
| `pnpm --filter @erp/backend build` | exit 0, prints `nest build` only |
| `pnpm --filter @erp/backend test:e2e` | `Test Suites: 2 passed, 2 total / Tests: 121 passed, 121 total` (count grows per phase) |
| `pnpm --filter @erp/frontend build` | exit 0, all 15 static pages generated, `/sales` and `/purchases` + `/reports` routes present |
| `pnpm prisma:migrate:deploy` | `All migrations have been successfully applied.` |

The e2e baseline at the last verified HEAD (`dc5e71f`, pre-10B) was **121/121**.
At the current HEAD (`ef5ac43`, post-10B-B-1) it is **still 121/121** because
Phase 10B-B-1 is RBAC + skeleton only — no new e2e tests ship until Phase 10B-B-3.

---

## 8. Cursor's Next Tasks (in order)

The Phase ARCH-1 close-out moves the project from "AR complete" to
"AR complete + AP scaffolded". Cursor's job is to land Phase 10B to parity,
then pick up the next domain.

### 8a. Phase 10B-B-2 — AP settlement logic

- Mirror the AR-side patterns in `backend/src/payments/payments.service.ts`:
  - `listPurchasePayments(me.companyId, invoiceId, q)` → real `purchaseInvoice.findFirst` (cross-tenant 404, status = RECEIVED) +
    `payment.findMany` with `purchaseInvoiceId = invoiceId` + fromDate/toDate paidAt range + soft-delete filter,
    ordered by `paidAt DESC, createdAt DESC`, mapped through a purchase-side `toResponseRow` that returns `invoiceId = purchaseInvoiceId`,
    `invoiceType = 'PURCHASE'`.
  - `registerPurchasePayment(me, invoiceId, dto)` → inside a Prisma `$transaction`:
    1. `purchaseInvoice.findFirst` (company + RECEIVED + not deleted)
    2. `payment.aggregate({ _sum: { amount } })` → `existingPaid`
    3. `outstanding = max(0, PurchaseInvoice.total - Sum.toString())` — **no writeback column** in 10B by design (Phase 9E invariant)
    4. `requested.greaterThan(outstanding)` → `ConflictException` (HTTP 409)
    5. `INSERT Payment` with `invoiceType = PURCHASE`, `purchaseInvoiceId`, `salesInvoiceId = NULL`
    6. Idempotency short-circuit BEFORE the transaction (same `(companyId, purchaseInvoiceId, idempotencyKey)` lookup as AR)
    7. `PurchaseInvoice.status` is **NOT** changed (still DRAFT/RECEIVED/CANCELLED lock)
  - Reuse `CreatePaymentDto` unchanged (already polymorphic — no `invoiceId` in the body).
- **Do NOT** add `PurchaseInvoice.paidAmount` column — committed decision.
- **Do NOT** edit `backend/src/payments/payments.controller.ts` route signatures — they already point at the right service methods.
- **Do NOT** edit `backend/src/reports/reports.service.ts` — Phase 9E AP aging invariant stays as `max(0, total)` until 10B-2 explicitly rewrites it.

### 8b. Phase 10B-B-3 — AP e2e smoke

- Add a `describe('Phase 10B-B-3: AP Payments backend (e2e smoke)', …)` block AFTER the existing `Phase 10A-B-3` block in
  `backend/test/reports.e2e-spec.ts`. Mirror the 10A pattern:
  - GET 200 on a `RECEIVED` purchase invoice with `ap_payments.read`
  - GET 403 with cashier JWT
  - POST 200/201 + actual `Payment` row landed with `invoiceType = PURCHASE`
  - POST 409 overpayment
  - POST idempotency duplicate returns the existing row (not a new one)
  - POST 404 on a non-existent invoice id
- Use the Phase 10A-B-3 admin-agent pattern as a template for an AP-payments admin agent — but seed the **cashier_e2e** user without `ap_payments.*` so the 403 path holds.
- Verification target: `Tests: 127 passed, 127 total` (121 + 6 new).

### 8c. Phase 10B-C-code — AP frontend wiring

- In `frontend/src/lib/api.ts`, add (mirroring the 10A names verbatim so polling / cache keys stay isomorphic):
  - `listApPayments(invoiceId, params?: { fromDate?; toDate? })` → GET
  - `createApPayment(invoiceId, data: CreateApPaymentInput)` → POST
  - Types: `ApPayment`, `CreateApPaymentInput`, `ApPaymentInvoiceTypeKey`, `ApPaymentStatusKey` — same shape as the AR ones but anchored on `invoiceType = 'PURCHASE'`
- In `frontend/src/app/purchases/page.tsx` (the existing list page, ~833 lines), add an **inline expander** per row using `<React.Fragment key={inv.id}>` — mirror the 10A pattern exactly:
  - "المدفوعات (N)" button in the actions `<div>` (gated on `RECEIVED && hasPermission('ap_payments.read')`)
  - Optional second `<tr>` with the AP payments sub-table + register-payment form
  - On 409 → "تجاوز السقف" overlay; on 403 → "لا تملك صلاحية"; on 401 → "انتهت الجلسة"; on 400 → "بيانات غير صحيحة"
  - `crypto.randomUUID()` per submit attempt for `Idempotency-Key`
- Scope discipline: `frontend/src/lib/api.ts` + `frontend/src/app/purchases/page.tsx` only. No new route, no new component, no new dep, no schema/seed/RBAC/backend/test/reports/README changes.

### 8d. Phase 10B-D-1 + 10B-D-2 — verification + README closure

- `pnpm --filter @erp/frontend build` — must PASS (15 static pages, `/purchases` route grows slightly).
- `pnpm --filter @erp/backend test:e2e` — must show **127/127 PASS** (121 baseline + 6 new AP tests).
- `git diff --name-only` — must show ONLY frontend files + (optional) README.
- README: append a `## Phase 10B: AP Payments + Settlement Tracking` section mirroring Phase 10A's structure but anchored on RECEIVED + 10B-specific decisions.

### 8e. After Phase 10B — the longer branch (in scope but not in flight)

The README closure of 10A explicitly deferred these to a **separate domain each** (do not bundle):

- **AR ↔ GL Integration** (12A) — auto-post outstanding receivables to the journal on `SalesInvoice.issue`.
- **AP ↔ GL Integration** (12A mirror) — same on `PurchaseInvoice.receivedAt`.
- **Bank reconciliation** (12B) — match `Payment` rows to bank-statement imports (CSV-only, no UI bloat).
- **Customer / Supplier statements** (11A) — drill-down per partner using `listArPayments` + `listApPayments` + the polymorphic `Payment` table.
- **Notifications** (13A) — email/SMS on overdue thresholds (depends on the partner channel config that's already in `Partner`).
- **Multi-currency** (14A) — `'SAR'` literal today; FX on issue if/when it becomes a requirement.

---

## 9. Known Constraints — Working Rules (don't bend these)

These are **non-negotiable** working rules established across Phases 1–10A
and repeated in every phase closure. Bending any of them breaks invariants
that downstream phases depend on.

1. **No Cloudflare / no deployment / no hosted identity.**
   The PRD explicitly forbids deployment from inside this workspace repo.
   `wrangler`, `pages deploy`, `gsk hosted_deploy`, `cf-byok-deploy`,
   `gsk-hosted-identity` are all off-limits. Local Docker Compose only.

2. **No `git add .` / `git add -A`.** Every commit must use explicit per-file
   `git add <path> …`. This keeps the diff scope auditable.

3. **Conventional Commits** for the message:
   `feat(phase-1b): …` / `test(phase-2c): …` / `docs(phase-3): …` etc.
   The prefix scope-disambiguates phase folders inside `reports.e2e-spec.ts`.

4. **Tenant isolation is JWT-only.** Never read or write `companyId` from URL,
   query string, or request body. The server `@CurrentUser()` decorator is the
   only allowed source.

5. **Money is Decimal-as-string.** No `Number()` math on money anywhere.
   All math uses `Prisma.Decimal`. Decimal columns serialize to strings at the
   JSON boundary, and the client treats them as strings throughout
   (no `parseFloat`, no `+`, no `*`). Display formatting happens via a single
   helper per UI surface (`fmtMoney` in component scope, `DecimalToString`
   helpers in services).

6. **Decimal precision is `@db.Decimal(18, 4)`.** The DTO regex
   `/^\d{1,14}(\.\d{1,4})?$/` is the contract. Don't relax it.

7. **`salesInvoice.status` / `PurchaseInvoice.status` are 3-state locks.**
   No `PAID` / `PARTIALLY_PAID` enum value. Settlement ratio is derived
   client-side; the backend keeps the lifecycle enum honest.

8. **Payments are polymorphic.** Exactly one of `salesInvoiceId` /
   `purchaseInvoiceId`. The DB CHECK constraint is the source of truth and the
   application-layer write code is a friendly hint, NOT a substitute.

9. **RBAC catalog is seeded via migrations, not via `seed.ts` edits.** Catalog
   rows go through Prisma migrations so any environment that runs `prisma
   migrate deploy` (instead of `prisma db seed`) still lands the keys.

10. **No `company_admin` owns payment keys by design.** Phase 10A + 10B
    deliberately assign `ar_payments.*` / `ap_payments.*` only to dedicated
    finance/admin agents created in e2e bootstrap. The `company_admin` role
    stays clean so the 403 paths are meaningful.

11. **No frontend e2e.** Backend Jest + a manual frontend `next build` are the
    only verification. No Playwright / Cypress / frontend integration tests.

12. **No README / e2e / RBAC / schema / docker / Dockerfile / docker-compose /
    seed / Prisma modifications outside the phase scope.** Each phase directive
    lists the exact files allowed; honor it exactly. `docs(phase-X)` commits
    touch `README.md` only and are the cleanest diffs in the history — keep
    that property.

13. **Conventional Phase Skills Audit Answer.** Every phase closure in
    `ARCHITECTURE_HANDOFF.md` (or future successor docs) ends with
    `No skills activated.` Skills (`cf-byok-deploy`, `designer-handoff`,
    `gsk-hosted-deploy`, `gsk-hosted-identity`) are Cloudflare ops skills and
    are deliberately NOT applicable to this local-only ERP codebase.

---

## 10. Quick Talking-Points (for an orientation call)

If you only have 5 minutes to onboard Cursor:

- **Stack:** NestJS + Prisma + PostgreSQL backend; Next.js 14 frontend; pnpm monorepo; Docker Compose for the DB. No cloud, no workers, no SaaS lock-in.
- **Auth:** JWT-only, in-memory on the client, refresh-on-401, `useAuth().hasPermission('key')` reads the JWT-claim `permissions` array.
- **RBAC:** Server-side enforced via `@RequirePermissions` + `PermissionsGuard` (401 / 403 stack). Client-side mirror reads the same JWT claim; **no app-JS access fallback**.
- **Money:** Decimal-as-string end-to-end; `@db.Decimal(18, 4)`; DTO regex `/^\d{1,14}(\.\d{1,4})?$/`.
- **Polymorphic Payment:** exactly-one invariant via Postgres CHECK; service code annotates which `invoiceType` is on each side.
- **AR is done, AP is scaffolded:** Phase 10A complete end-to-end; Phase 10B-B-1 has RBAC + endpoints skeleton; next phases are settlement logic + e2e + frontend + README.
- **No cloud, no deployment, no skills, no `git add .`/`-A`.** These are the project load-bearing constraints — repeat them on every phase closure.
