// =====================================================
// Phase 10A: AR Payments + Settlement Tracking.
//
// Phase 10A-B-1: PaymentsModule — controller + service skeleton.
//
//   * Mounted under /api/sales-invoices/:invoiceId/payments.
//   * Routes: GET (list) + POST (register). Both skeleton
//     responses in this phase; real aggregation, idempotency
//     and overpayment guards land in Phase 10A-B-2.
//   * RBAC: ar_payments.read for GET, ar_payments.write for POST.
//   * Tenant scope: companyId from JWT (Phase 7B-1 contract).
//
// Strict (Phase 10A-B-1):
//   * No settlement calculations.
//   * No PAID / PARTIALLY_PAID status enum (deferred — T-2 lock).
//   * No AR-Aging source change.
//   * No AP payments (Phase 10B, separate domain).
//   * No GL / bank reconciliation / drill-down statements.
//   * No frontend, no README change.
// =====================================================
import { Module } from '@nestjs/common';
import { ApPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController, ApPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
