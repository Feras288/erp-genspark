// =====================================================
// ERP Backend — root module
// Phase 1: Auth + RBAC + Audit
// Phase 2: Products + Partners (master data)
// Phase 3: Inventory core (Warehouses + Stock Levels +
//          Stock Movements + Adjustments + Transfers)
// Phase 4B-1: Sales backend skeleton (read-only list/get +
//             DTOs/build-only; full create/issue/cancel/POS
//             land in Phase 4B-2 and 4B-3).
// Phase 5: Purchases Core (DRAFT create/update/delete, receive, cancel).
// Phase 6: Accounting Core (Chart of Accounts + Manual Journal Entries only).
// Phase 7B-1: Reports Core backend skeleton (6 read-only endpoints,
//             `status: 'PLANNED'` payloads, no queries, no
//             aggregations, no seed change — real numbers land in
//             Phase 7B-2+). No ZATCA, no VAT, no Trial Balance,
//             no Balance Sheet, no P&L, no AR/AP, no payments,
//             no reconciliation, no automated posting.
// =====================================================
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RbacModule } from './rbac/rbac.module';
import { ProductsModule } from './products/products.module';
import { PartnersModule } from './partners/partners.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { PosModule } from './pos/pos.module';
import { PurchasesModule } from './purchases/purchases.module';
import { AccountingModule } from './accounting/accounting.module';
import { ReportsModule } from './reports/reports.module';
import { PaymentsModule } from './payments/payments.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], cache: true }),
    ThrottlerModule.forRoot([
      // 'short' = per-endpoint overrides using @Throttle({ short: { limit, ttl } }).
      // 'default' = bucket targeted by @Throttle({ default: { ... } }) /
      //              @Throttle({ global: { ... } }) depending on syntax.
      // 'global' = absolute per-IP ceiling (60 req/min/IP).
      { name: 'default', ttl: 60_000, limit: 60 },
      { name: 'global', ttl: 60_000, limit: 60 },
    ]),
    DatabaseModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RbacModule,
    ProductsModule,
    PartnersModule,
    // Phase 3 — inventory core
    WarehousesModule,
    InventoryModule,
    // Phase 4B-1 — sales backend skeleton only (list/get live, full CRUD later)
    SalesModule,
    // Phase 4B-4 — POS backend (reuses SalesService for DRAFT-create + issue).
    PosModule,
    // Phase 5 — Purchases Core (DRAFT create/update/delete, receive, cancel).
    // No accounting, no GL, no COGS, no supplier balance, no payments.
    PurchasesModule,
    // Phase 6 — Accounting Core (Chart of Accounts + Manual Journal Entries only).
    // No reports, no ZATCA, no automated posting, no AR/AP, no payments,
    // no cost accounting, no payroll, no SaaS billing, no returns/debit/credit notes.
    AccountingModule,
    // Phase 7B-1 — Reports Core backend skeleton only.
    // 6 read-only endpoints; `status: 'PLANNED'` payloads;
    // no aggregations, no seed change, no Prisma schema
    // change. Reuses the already-seeded `reports.read`.
    // No ZATCA, no VAT, no TB/BS/P&L, no AR/AP, no payments,
    // no reconciliation, no automated posting, no PDF/Excel.
    ReportsModule,
    // Phase 10A-B-1: AR Payments + Settlement Tracking.
    //   * Skeleton controller + service only; real settlement
    //     transactions land in 10A-B-2.
    //   * RBAC: ar_payments.read (GET) / ar_payments.write (POST).
    //   * JWT-only tenant scope (Phase 7B-1 contract).
    PaymentsModule,
    // Phase 13A: Bank Reconciliation
    ReconciliationModule,
    // Phase 15A: Centralized Audit Trail & Activity Log
    AuditLogsModule,
  ],
  providers: [
    // Apply throttling globally. Auth endpoints will override with @Throttle.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
