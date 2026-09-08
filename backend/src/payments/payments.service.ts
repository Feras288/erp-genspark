// =====================================================
// Phase 10A: AR Payments + Settlement Tracking.
//
// Phase 10A-B-1: PaymentsService — skeleton placeholder.
//
//   Phase 10A-B-1 contract:
//     * list() returns [] (no DB query in this phase).
//     * register() raises NotImplementedException; the
//       class-validator DTO pipeline still validates the
//       incoming POST body before this throws, so a malformed
//       body returns 400 BadRequestException which is the
//       expected surface for clients.
//
//   Phase 10A-B-2 will replace both methods with real
//   settlement logic inside a Prisma transaction:
//
//     list(companyId, invoiceId, query):
//       * WHERE companyId = ? AND salesInvoiceId = ? AND deletedAt = NULL
//       * Prisma.Decimal sum -> totals.outstanding
//       * ordered by paidAt DESC, return serialized rows.
//
//     register(companyId, invoiceId, dto, me):
//       * Idempotency-Key short-circuit: SELECT existing
//         payment within the last 24h; return 200 + row if found.
//       * SalesInvoice lookup: must belong to JWT.companyId and
//         status in (DRAFT, ISSUED). 409 if CANCELLED.
//       * Outstanding = SalesInvoice.total − sum(active payments).
//         If dto.amount > outstanding: 409 overpayment (S-2 lock).
//       * Prisma transaction:
//           - INSERT Payment row (POSTED, idempotencyKey persisted).
//           - UPDATE SalesInvoice.paidAmount to set
//             paidAmount = SUM(active payments). [M-A bridge.]
//           - INSERT AuditLog row.
//         All-or-nothing.
//
//   Strict (Phase 10A-B-1):
//     * No settlement calculations.
//     * No PAID / PARTIALLY_PAID status enum (deferred).
//     * No AR-Aging source change.
//     * No AP payments (10B).
//     * No GL / bank reconciliation / drill-down.
// =====================================================
import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class PaymentsService {
  async list(): Promise<unknown[]> {
    // Phase 10A-B-1 contract — empty skeleton.
    return [];
  }

  async register(): Promise<never> {
    // Phase 10A-B-1 contract — 501 NotImplemented; replaced by the
    // settlement transaction in 10A-B-2 (idempotency + overpayment
    // guard + paidAmount writeback).
    throw new NotImplementedException(
      'PaymentsService.register() lands in Phase 10A-B-2 (settlement calculations: idempotency-key, overpayment guard, paidAmount writeback, AuditLog).',
    );
  }
}
