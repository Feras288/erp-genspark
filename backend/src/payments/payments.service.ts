// =====================================================
// Phase 10A: AR Payments + Settlement Tracking.
//
// Phase 10A-B-2: PaymentsService — settlement calculations.
//
// GET /api/sales-invoices/:invoiceId/payments  (ar_payments.read)
//   * JWT-only companyId (Phase 7B-1 contract).
//   * WHERE companyId = JWT AND salesInvoiceId = :invoiceId
//          AND deletedAt = NULL
//          AND (paidAt >= fromDate if fromDate)
//          AND (paidAt <= toDate   if toDate)
//   * ORDER BY paidAt DESC, createdAt DESC.
//   * Tenant-isolation: companyId always from JWT, never from query.
//
// POST /api/sales-invoices/:invoiceId/payments  (ar_payments.write)
//   * JWT-only companyId.
//   * Idempotency-Key (DTO body field, idempotencyKey):
//       - Before inserting, SELECT existing Payment with the same
//         (companyId, salesInvoiceId, idempotencyKey, deletedAt null).
//       - If found, return it as-is without creating a new row.
//   * SalesInvoice lookup:
//       - WHERE id = :invoiceId AND companyId = JWT AND deletedAt null.
//       - Must be present, otherwise 404 NotFound.
//       - Must have status = ISSUED (T-2 lock: PAID/PARTIALLY_PAID not
//         yet an enum value; CANCELLED + DRAFT rejected with 409).
//   * existingPaid = SUM(Payment.amount) WHERE invoiceId+companyId+deletedAt null.
//   * outstanding = max(0, invoice.total − existingPaid).
//   * Overpayment guard (S-2 lock): if dto.amount > outstanding → 409 Conflict.
//   * Prisma $transaction wrapper:
//       1) salesInvoice.findFirst(...)
//       2) payment.aggregate(_sum.amount ...)         (existingPaid)
//       3) overpayment check
//       4) payment.create (POSTED, invoiceType=SALES, salesInvoiceId=...,
//          purchaseInvoiceId=null, status=POSTED, idempotencyKey=dto.idempotencyKey)
//       5) salesInvoice.update paidAmount = existingPaid + amount
//          [M-A bridge — Phase 9 arAging reads SalesInvoice.paidAmount
//          as a cache column; this writeback keeps the Phase 9
//          invariant max(0, total − paidAmount) intact. NO change
//          to SalesInvoice.status (T-2 lock).]
//   * AuditLog writes are deferred to a later sub-phase (out of 10A-B-2 scope).
//
// Decimal arithmetic:
//   * No `Number()` arithmetic on money. All math uses Prisma.Decimal.
//   * inbound dto.amount is a Decimal string (/^\d{1,14}(\.\d{1,4})?$/ per DTO).
//   * SUM aggregate returns Decimal | null; treat null as 0.
//   * All Decimal columns serialize to string at the JSON boundary.
//
// Strict (Phase 10A-B-2):
//   * No PAID / PARTIALLY_PAID status enum (T-2 lock).
//   * No AR-Aging source change (writeback to paidAmount keeps invariant).
//   * No AP payments (10B).
//   * No GL / bank reconciliation / drill-down.
//   * No frontend / no schema change.
// =====================================================
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PaymentMethod, PaymentStatus, SalesInvoiceStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

import type { AuthenticatedUser } from '../common/types/auth.types';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { PaymentsQueryDto } from './dto/payments-query.dto';

// ---------------------------------------------------------------------
// Response shape — single source of truth across GET and POST.
//
// Phase 10A-B-2 §5: response must carry id, invoiceId, invoiceType,
//   amount, paymentMethod, paidAt, reference, notes, status,
//   idempotencyKey, createdAt.
//
// `invoiceId` is the polymorphic surface (salesInvoiceId OR
// purchaseInvoiceId). 10A-B-2 only emits Sales, so we always return
// the salesInvoiceId. 10B will symmetrically inverse the polarity.
// ---------------------------------------------------------------------
export interface PaymentResponseRow {
  id: string;
  invoiceId: string; // salesInvoiceId in 10A-B-2
  invoiceType: 'SALES';
  amount: string; // Decimal serialized to string
  paymentMethod: PaymentMethod;
  paidAt: Date;
  reference: string | null;
  notes: string | null;
  status: PaymentStatus;
  idempotencyKey: string | null;
  createdAt: Date;
}

const PAYMENT_SELECT = {
  id: true,
  companyId: true,
  paymentMethod: true,
  amount: true,
  paidAt: true,
  reference: true,
  notes: true,
  salesInvoiceId: true,
  purchaseInvoiceId: true,
  invoiceType: true,
  status: true,
  idempotencyKey: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  updatedById: true,
  cancelledAt: true,
  cancelledById: true,
  deletedAt: true,
} as const;

type RawPayment = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // GET — list payments for a Sales invoice, tenant-scoped by JWT.
  // -------------------------------------------------------------------
  async list(
    companyId: string,
    invoiceId: string,
    q: PaymentsQueryDto,
  ): Promise<PaymentResponseRow[]> {
    // 1. Tenant scope: companyId always from JWT (never from query/body).
    //    Defensive verification — controllers MUST pass me.companyId only.
    if (!companyId || typeof companyId !== 'string') {
      throw new BadRequestException('companyId (jwt) is required');
    }

    // 2. Verify the invoice exists and belongs to this company (cross-tenant
    //    protection; returns 404 if mismatch so we don't leak existence).
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, companyId, deletedAt: null },
      select: { id: true, companyId: true, status: true, deletedAt: true },
    });
    if (!invoice) {
      throw new NotFoundException(
        `Sales invoice ${invoiceId} not found in tenant ${companyId}`,
      );
    }

    // 3. WHERE clause (Prisma AND-of-AND): tenant-scoped, anchored to the
    //    invoice, soft-delete-aware, optional paidAt range. We always
    //    anchor to salesInvoiceId; we do NOT touch the polymorphic
    //    purchaseInvoiceId field on this read.
    const where: Prisma.PaymentWhereInput = {
      companyId,
      salesInvoiceId: invoiceId,
      deletedAt: null,
    };

    // 4. Optional paidAt range — class-validator already gated these to
    //    ISO date strings or undefined. Empty strings (after trim) reduce
    //    to undefined.
    const from = (q.fromDate ?? '').trim() || undefined;
    const to = (q.toDate ?? '').trim() || undefined;
    if (from || to) {
      where.paidAt = {};
      if (from) (where.paidAt as Prisma.DateTimeFilter).gte = new Date(`${from}T00:00:00.000Z`);
      if (to) (where.paidAt as Prisma.DateTimeFilter).lte = new Date(`${to}T23:59:59.999Z`);
    }

    // 5. Fetch + order.
    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      select: PAYMENT_SELECT,
    });

    // 6. Map to response shape. Decimals serialize to string; the
    //    polymorphic invoiceId surfaces as salesInvoiceId (10A-B-2 only).
    return rows.map((p) => this.toResponseRow(p));
  }

  // -------------------------------------------------------------------
  // POST — register a payment (idempotency + overpayment guard + tx).
  // -------------------------------------------------------------------
  async register(
    me: AuthenticatedUser,
    invoiceId: string,
    dto: CreatePaymentDto,
  ): Promise<PaymentResponseRow> {
    const companyId = me.companyId;
    if (!companyId || typeof companyId !== 'string') {
      throw new BadRequestException('companyId (jwt) is required');
    }

    // 0. Idempotency short-circuit BEFORE the transaction. If there is an
    //    active payment with the same (companyId, salesInvoiceId,
    //    idempotencyKey) — soft-delete-aware — return it. This intentionally
    //    breaks the strict-serializability of the POST so a network retry
    //    does not double-charge.
    if (dto.idempotencyKey && dto.idempotencyKey.length >= 8) {
      const existing = await this.prisma.payment.findFirst({
        where: {
          companyId,
          salesInvoiceId: invoiceId,
          idempotencyKey: dto.idempotencyKey,
          deletedAt: null,
        },
        select: PAYMENT_SELECT,
      });
      if (existing) {
        return this.toResponseRow(existing);
      }
    }

    // 1..5. All-or-nothing transaction.
    const created = await this.prisma.$transaction(async (tx) => {
      // 1. SalesInvoice lookup — must exist, belong to JWT.companyId, not
      //    soft-deleted. Status gate: ISSUED only (T-2 lock).
      const invoice = await tx.salesInvoice.findFirst({
        where: { id: invoiceId, companyId, deletedAt: null },
        select: {
          id: true,
          companyId: true,
          status: true,
          total: true,
          paidAmount: true,
          deletedAt: true,
        },
      });
      if (!invoice) {
        throw new NotFoundException(
          `Sales invoice ${invoiceId} not found in tenant ${companyId}`,
        );
      }
      if (invoice.status !== SalesInvoiceStatus.ISSUED) {
        throw new ConflictException(
          `Cannot register payment: Sales invoice ${invoiceId} status is ${invoice.status}; expected ISSUED.`,
        );
      }

      // 2. existingPaid = SUM(Payment.amount) WHERE invoice+tenant+not-deleted.
      //    The aggregate returns Decimal | null — treat null as 0.
      const agg = await tx.payment.aggregate({
        where: {
          companyId,
          salesInvoiceId: invoiceId,
          deletedAt: null,
        },
        _sum: { amount: true },
      });
      const existingPaid: Prisma.Decimal = agg._sum.amount ?? new Prisma.Decimal(0);

      // 3. outstanding = max(0, invoice.total − existingPaid). Decimal math only.
      const total: Prisma.Decimal = new Prisma.Decimal(invoice.total.toString());
      const outstanding: Prisma.Decimal = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        total.minus(existingPaid),
      );

      const requested = new Prisma.Decimal(dto.amount);
      if (requested.greaterThan(outstanding)) {
        throw new ConflictException(
          // S-2 lock: overpayment rejected.
          `Overpayment guard: requested ${requested.toString()} > outstanding ${outstanding.toString()} on Sales invoice ${invoiceId}.`,
        );
      }

      // 4. INSERT Payment — invoiceType=SALES, salesInvoiceId=explicit,
      //    purchaseInvoiceId=null (exactly-one-FK CHECK enforced at DB
      //    level — Phase 10A-B-1 migration adds the constraint).
      const payment = await tx.payment.create({
        data: {
          companyId,
          paymentMethod: dto.paymentMethod,
          amount: requested,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          salesInvoiceId: invoiceId,
          purchaseInvoiceId: null,
          invoiceType: 'SALES',
          status: 'POSTED',
          idempotencyKey: dto.idempotencyKey ?? null,
          createdById: me.id ?? null,
          updatedById: me.id ?? null,
        },
        select: PAYMENT_SELECT,
      });

      // 5. Writeback SalesInvoice.paidAmount. Bridge strategy: Phase 9
      //    arAging reads SalesInvoice.paidAmount as the cache column.
      //    recompute = existingPaid + requested (both already-computed,
      //    transactionally consistent with the insert above).
      const recomputed = existingPaid.plus(requested);
      await tx.salesInvoice.update({
        where: { id: invoiceId, companyId },
        data: { paidAmount: recomputed, updatedById: me.id ?? null },
        select: { id: true, paidAmount: true },
      });

      return payment;
    });

    return this.toResponseRow(created);
  }

  // -------------------------------------------------------------------
  // Internal — Decimal / Date / polymorphic-invoiceId mapper.
  // -------------------------------------------------------------------
  private toResponseRow(p: RawPayment): PaymentResponseRow {
    // 10A-B-2 only emits SALES — salesInvoiceId is always populated.
    // The CHECK constraint from Phase 10A-B-1's migration guarantees this.
    const invoiceId = p.salesInvoiceId ?? '';
    return {
      id: p.id,
      invoiceId,
      invoiceType: 'SALES',
      amount: p.amount.toString(),
      paymentMethod: p.paymentMethod,
      paidAt: p.paidAt,
      reference: p.reference,
      notes: p.notes,
      status: p.status,
      idempotencyKey: p.idempotencyKey,
      createdAt: p.createdAt,
    };
  }
}
