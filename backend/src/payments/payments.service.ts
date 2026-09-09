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
//
// ----------------------------------------------------=-------------
// Phase 10B-B-2: AP PaymentsService — settlement.
//   Symmetric to 10A. Uses polymorphic Payment with
//   invoiceType=PURCHASE. Same idempotency / overpayment / tx shape.
//   Deltas from AR (commit decisions):
//     * NO PurchaseInvoice.paidAmount column → NO writeback.
//     * NO PurchaseInvoice.status mutation (RECEIVED stays RECEIVED).
//     * NO new status enum (no PAID/PARTIALLY_PAID equivalent).
// =====================================================
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PaymentMethod,
  PaymentStatus,
  PurchaseInvoiceStatus,
  SalesInvoiceStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

import type { AuthenticatedUser } from '../common/types/auth.types';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { PaymentsQueryDto } from './dto/payments-query.dto';
import {
  postApPaymentPosted,
  postArPaymentPosted,
} from '../accounting/posting-events';

// ---------------------------------------------------------------------
// Response shape — single source of truth across GET and POST.
//
// Phase 10A-B-2 §5: response must carry id, invoiceId, invoiceType,
//   amount, paymentMethod, paidAt, reference, notes, status,
//   idempotencyKey, createdAt.
//
// Phase 10B-B-2: invoiceType widened to 'SALES' | 'PURCHASE'; the
//   polymorphic invoiceId surfaces salesInvoiceId OR purchaseInvoiceId.
//   The schema's CHECK constraint from Phase 10A-B-1 guarantees
//   exactly-one-FK, so the mapper branches on invoiceType.
// ---------------------------------------------------------------------
export interface PaymentResponseRow {
  id: string;
  invoiceId: string; // salesInvoiceId OR purchaseInvoiceId (per invoiceType)
  invoiceType: 'SALES' | 'PURCHASE';
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

      // 6. Auto-post one POSTED JournalEntry (Phase 11B-B-4)
      //    linked by sourceType=AR_PAYMENT / sourceId=payment.id.
      //    Unique (companyId, sourceType, sourceId) makes retries
      //    idempotent. Same $transaction as payment insert.
      await postArPaymentPosted(tx, {
        companyId,
        userId: me.id,
        payment: {
          id: payment.id,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          salesInvoiceId: invoiceId,
          reference: payment.reference,
        },
      });

      return payment;
    });

    return this.toResponseRow(created);
  }

  // -------------------------------------------------------------------
  // Internal — Decimal / Date / polymorphic-invoiceId mapper.
  // -------------------------------------------------------------------
  private toResponseRow(p: RawPayment): PaymentResponseRow {
    // Phase 10A-B-2 + Phase 10B-B-2: polymorphic — exactly-one-FK
    // guaranteed by CHECK constraint from Phase 10A-B-1's migration.
    // Branch on invoiceType to surface the right FK as invoiceId.
    const invoiceType = p.invoiceType;
    const invoiceId =
      invoiceType === 'PURCHASE' ? (p.purchaseInvoiceId ?? '') : (p.salesInvoiceId ?? '');
    return {
      id: p.id,
      invoiceId,
      invoiceType,
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

  // --- Phase 10B-B-2: AP payments settlement (Read+Write) --- mirror of AR ---
  //   Symfony of PaymentsService.list anchored on purchaseInvoiceId.
  //   See contract block at top of file.
  async listPurchasePayments(
    companyId: string,
    invoiceId: string,
    q: PaymentsQueryDto,
  ): Promise<PaymentResponseRow[]> {
    if (!companyId || typeof companyId !== 'string') {
      throw new BadRequestException('companyId (jwt) is required');
    }
    if (!invoiceId || typeof invoiceId !== 'string') {
      throw new BadRequestException('invoiceId is required');
    }

    // Validate the invoice lives in this tenant before any payment read.
    const invoice = await this.prisma.purchaseInvoice.findFirst({
      where: { id: invoiceId, companyId, deletedAt: null },
      select: { id: true, companyId: true, status: true, deletedAt: true },
    });
    if (!invoice) {
      throw new NotFoundException(
        `Purchase invoice ${invoiceId} not found in tenant ${companyId}`,
      );
    }

    const where: Prisma.PaymentWhereInput = {
      companyId,
      purchaseInvoiceId: invoiceId,
      deletedAt: null,
    };

    const from = (q.fromDate ?? '').trim() || undefined;
    const to = (q.toDate ?? '').trim() || undefined;
    if (from || to) {
      where.paidAt = {};
      if (from) (where.paidAt as Prisma.DateTimeFilter).gte = new Date(`${from}T00:00:00.000Z`);
      if (to) (where.paidAt as Prisma.DateTimeFilter).lte = new Date(`${to}T23:59:59.999Z`);
    }

    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      select: PAYMENT_SELECT,
    });

    return rows.map((p) => this.toResponseRow(p));
  }

  async registerPurchasePayment(
    me: AuthenticatedUser,
    invoiceId: string,
    dto: CreatePaymentDto,
  ): Promise<PaymentResponseRow> {
    const companyId = me.companyId;
    if (!companyId || typeof companyId !== 'string') {
      throw new BadRequestException('companyId (jwt) is required');
    }

    // Idempotency short-circuit (parallel to AR path).
    if (dto.idempotencyKey && dto.idempotencyKey.length >= 8) {
      const existing = await this.prisma.payment.findFirst({
        where: {
          companyId,
          purchaseInvoiceId: invoiceId,
          idempotencyKey: dto.idempotencyKey,
          deletedAt: null,
        },
        select: PAYMENT_SELECT,
      });
      if (existing) {
        return this.toResponseRow(existing);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // 1. PurchaseInvoice lookup — must exist + tenant + not soft-deleted.
      //    Status gate: RECEIVED only (commit decision: DRAFT/CANCELLED → 409).
      const invoice = await tx.purchaseInvoice.findFirst({
        where: { id: invoiceId, companyId, deletedAt: null },
        select: {
          id: true,
          companyId: true,
          status: true,
          total: true,
          deletedAt: true,
        },
      });
      if (!invoice) {
        throw new NotFoundException(
          `Purchase invoice ${invoiceId} not found in tenant ${companyId}`,
        );
      }
      if (invoice.status !== PurchaseInvoiceStatus.RECEIVED) {
        throw new ConflictException(
          `Cannot register payment: Purchase invoice ${invoiceId} status is ${invoice.status}; expected RECEIVED.`,
        );
      }

      // 2. existingPaid = SUM(Payment.amount) WHERE invoice+tenant+not-deleted.
      const agg = await tx.payment.aggregate({
        where: {
          companyId,
          purchaseInvoiceId: invoiceId,
          deletedAt: null,
        },
        _sum: { amount: true },
      });
      const existingPaid: Prisma.Decimal = agg._sum.amount ?? new Prisma.Decimal(0);

      // 3. outstanding = max(0, invoice.total − existingPaid).
      const total: Prisma.Decimal = new Prisma.Decimal(invoice.total.toString());
      const outstanding: Prisma.Decimal = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        total.minus(existingPaid),
      );

      const requested = new Prisma.Decimal(dto.amount);
      if (requested.greaterThan(outstanding)) {
        throw new ConflictException(
          `Overpayment guard: requested ${requested.toString()} > outstanding ${outstanding.toString()} on Purchase invoice ${invoiceId}.`,
        );
      }

      // 4. INSERT Payment — invoiceType=PURCHASE, purchaseInvoiceId=explicit,
      //    salesInvoiceId=null. Exactly-one-FK CHECK enforced at DB level.
      const payment = await tx.payment.create({
        data: {
          companyId,
          paymentMethod: dto.paymentMethod,
          amount: requested,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          salesInvoiceId: null,
          purchaseInvoiceId: invoiceId,
          invoiceType: 'PURCHASE',
          status: 'POSTED',
          idempotencyKey: dto.idempotencyKey ?? null,
          createdById: me.id ?? null,
          updatedById: me.id ?? null,
        },
        select: PAYMENT_SELECT,
      });

      // 5. COMMIT DECISION (Phase 10B-architect-1):
      //      - NO PurchaseInvoice.paidAmount writeback (no such column).
      //      - NO PurchaseInvoice.status mutation (RECEIVED stays RECEIVED).
      //    AP settlement is registered purely via this Payment row, and
      //    any future AP-Aging computation will sum Payment rows directly
      //    (parallel to the AR writeback cache, but without the column).
      //    Intentionally divergent from AR; documented in the contract
      //    block at top of file.

      // 6. Auto-post one POSTED JournalEntry (Phase 11B-B-5)
      //    linked by sourceType=AP_PAYMENT / sourceId=payment.id.
      //    Unique (companyId, sourceType, sourceId) makes retries
      //    idempotent. Same $transaction as payment insert.
      await postApPaymentPosted(tx, {
        companyId,
        userId: me.id,
        payment: {
          id: payment.id,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          purchaseInvoiceId: invoiceId,
          reference: payment.reference,
        },
      });

      return payment;
    });

    return this.toResponseRow(created);
  }
}
