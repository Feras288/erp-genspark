// =====================================================
// Phase 10A: AR Payments + Settlement Tracking.
//
// Phase 10A-B-2: PaymentsController — wires settlement endpoints.
//
//   Mounted under /api/sales-invoices/:invoiceId/payments via the
//   global /api prefix set in main.ts.
//
//   Routes:
//     GET /api/sales-invoices/:invoiceId/payments
//        - Permission: ar_payments.read
//        - tenant scope: companyId from JWT only (Phase 7B-1 contract).
//        - Optional fromDate / toDate query: filter paidAt range.
//        - Excludes soft-deleted payments (deletedAt IS NULL).
//        - Orders by paidAt DESC, createdAt DESC.
//     POST /api/sales-invoices/:invoiceId/payments
//        - Permission: ar_payments.write
//        - tenant scope: companyId from JWT only.
//        - Idempotency-Key (DTO body field, idempotencyKey):
//            if a matching active Payment exists for
//            (companyId, salesInvoiceId, idempotencyKey, deletedAt null),
//            it returns that existing row without inserting.
//        - SalesInvoice must exist, belong to JWT.companyId,
//          not soft-deleted, status = ISSUED (T-2 lock).
//        - Partial payments allowed. existingPaid = SUM(Payment.amount).
//        - outstanding = max(0, invoice.total − existingPaid).
//        - Overpayment guard (S-2): dto.amount > outstanding → 409.
//        - On insert: SalesInvoice.paidAmount writeback (M-A bridge,
//          keeps Phase 9 arAging invariant `max(0,total-paidAmount)`
//          intact — no reports.service.ts edit required).
//        - SalesInvoice.status is NOT changed (T-2 lock).
//        - Idempotency-Key header (RFC-style) is intentionally NOT
//          read; the DTO body field is the canonical source.
//
// RBAC:
//   * JwtAuthGuard + PermissionsGuard at controller level (Phase 1 contract).
//   * PermissionsGuard reads @RequirePermissions metadata per route.
//
// Tenancy:
//   * companyId sourced exclusively from @CurrentUser() (JWT).
//   * invoiceId from URL path; tenant isolation enforced in service
//     layer + DB layer (SalesInvoice.companyId must match JWT).
//   * DTO does not expose companyId.
//
// Strict (Phase 10A-B-2):
//   * No PAID / PARTIALLY_PAID enum extension (T-2 lock).
//   * No AR-Aging source change (paidAmount writeback keeps invariant).
//   * No AP payments (10B future).
//   * No GL / bank reconciliation / drill-down statements.
//   * No regression on Phase 9 reports — same back-compat contract.
//   * No frontend / no schema change / no e2e edits in this commit.
// =====================================================
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/auth.types';

import { PaymentResponseRow, PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsQueryDto } from './dto/payments-query.dto';

@ApiTags('AR Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales-invoices/:invoiceId/payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Get()
  @RequirePermissions('ar_payments.read')
  list(
    @CurrentUser() me: AuthenticatedUser,
    @Param('invoiceId') invoiceId: string,
    @Query() q: PaymentsQueryDto,
  ): Promise<PaymentResponseRow[]> {
    // Phase 10A-B-2 contract:
    //   * tenant-scoped: companyId sourced from JWT (me.companyId).
    //   * 404 if invoice does not belong to me.companyId
    //     (defensive — never leaks cross-tenant existence).
    //   * Real listing. Phase 9 arAging invariants not touched here.
    return this.svc.list(me.companyId, invoiceId, q);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('ar_payments.write')
  register(
    @CurrentUser() me: AuthenticatedUser,
    @Param('invoiceId') invoiceId: string,
    @Body() body: CreatePaymentDto,
  ): Promise<PaymentResponseRow> {
    // Phase 10A-B-2 contract:
    //   * tenant-scoped: companyId from JWT (me.companyId).
    //   * Idempotency-Key via DTO body field (idempotencyKey):
    //       - if a matching active row exists (same companyId +
    //         salesInvoiceId + idempotencyKey + deletedAt null), the
    //         service returns it without creating a new row.
    //   * SalesInvoice must exist + same companyId + not deleted +
    //     status = ISSUED (T-2 lock: DRAFT/CANCELLED rejected).
    //   * Partial payments allowed. overpayment guard (S-2) ⇒ 409.
    //   * Prisma $transaction (atomic):
    //         read invoice → SUM existing payments → overpayment guard
    //         → INSERT Payment → UPDATE SalesInvoice.paidAmount.
    //   * Returns the response row (newly inserted OR idempotency hit).
    return this.svc.register(me, invoiceId, body);
  }
}

// --- Phase 10B-B-1: AP payments skeleton (Read+Write stubs) ---
@ApiTags('AP Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchase-invoices/:invoiceId/payments')
export class ApPaymentsController {
  constructor(private readonly svc: PaymentsService) {}
  @Get()
  @RequirePermissions('ap_payments.read')
  list(
    @CurrentUser() me: AuthenticatedUser,
    @Param('invoiceId') invoiceId: string,
    @Query() q: PaymentsQueryDto,
  ): Promise<PaymentResponseRow[]> {
    return this.svc.listPurchasePayments(me.companyId, invoiceId, q);
  }
  @Post()
  @HttpCode(201)
  @RequirePermissions('ap_payments.write')
  register(
    @CurrentUser() me: AuthenticatedUser,
    @Param('invoiceId') invoiceId: string,
    @Body() body: CreatePaymentDto,
  ): Promise<PaymentResponseRow> {
    return this.svc.registerPurchasePayment(me, invoiceId, body);
  }
}
