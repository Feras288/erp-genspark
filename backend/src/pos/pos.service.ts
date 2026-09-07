// =====================================================
// PosService — Phase 4B-4.
//
// Reuses SalesService for invoice writing so the lifecycle (DRAFT→ISSUED),
// stock deduction, SALE_OUT movements, and audit trail are exactly the
// inventory-grade guarantees that the Sales issue flow locked in Phase 4B-3.
//
// POS create = create DRAFT of type=POS with payment fields + issue it
// immediately in two calls. Audit includes a dedicated pos.sale.created
// entry for downstream reporting.
//
// Phase 4B-4 intentionally excludes:
//   - no payment gateway
//   - no cash drawer
//   - no shift management
//   - no receipt printer
//   - no refunds / no accounting / no ZATCA
import { Injectable } from '@nestjs/common';
import { Prisma, SalesInvoiceType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SalesService } from '../sales/sales.service';
import {
  CreatePosSaleDto,
  PosSalesQueryDto,
} from './dto/create-pos-sale.dto';

// Read shape (header + customer + line count).
const POS_LIST_SELECT = {
  id: true,
  companyId: true,
  invoiceNumber: true,
  status: true,
  type: true,
  customerId: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  vatTotal: true,
  discountTotal: true,
  total: true,
  paymentMethod: true,
  paidAmount: true,
  notes: true,
  cancelledAt: true,
  issuedAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  updatedById: true,
  issuedById: true,
  cancelledById: true,
  _count: { select: { lines: true } },
  customer: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sales: SalesService,
  ) {}

  // -------------------- list --------------------

  async list(companyId: string, q: PosSalesQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.SalesInvoiceWhereInput = {
      companyId,
      deletedAt: null,
      type: SalesInvoiceType.POS,
    };
    if (q.search) {
      const s = q.search;
      where.OR = [
        { invoiceNumber: { contains: s, mode: 'insensitive' } },
        { notes: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (q.customerId) where.customerId = q.customerId;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.salesInvoice.count({ where }),
      this.prisma.salesInvoice.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: POS_LIST_SELECT,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  // -------------------- create (POS = createDraft POS + issue) --------------------

  async create(
    companyId: string,
    actorUserId: string,
    dto: CreatePosSaleDto,
  ) {
    // 1. Create draft as POS with payment fields (re-uses SalesService for the
    //    DRAFT-create transaction: customer/product validation + Decimal
    //    arithmetic + invoice-number SI-YYYYMMDD-NNNN).
    const draft = await this.sales.createDraft(
      companyId,
      actorUserId,
      {
        customerId: dto.customerId,
        notes: dto.notes,
        lines: dto.lines,
      },
      {
        type: SalesInvoiceType.POS,
        paymentMethod: dto.paymentMethod ?? null,
        paidAmount: dto.paidAmount ?? null,
      },
    );

    // 2. Immediately issue it. Same $transaction that Phase 4B-3 validated:
    //    PRODUCT lines deduct StockLevel + append SALE_OUT StockMovement with
    //    referenceType='sales_invoice'. SERVICE lines are pass-through.
    const final = await this.sales.issue(
      companyId,
      draft.id,
      actorUserId,
      {},
    );

    // 3. POS-specific audit trail. (SalesService also fires
    //    sales.invoice.created + sales.invoice.issued automatically.)
    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'pos.sale.created',
      entity: 'SalesInvoice',
      entityId: final.id,
      metadata: {
        invoiceId: final.id,
        invoiceNumber: final.invoiceNumber,
        total: final.total,
        paymentMethod: dto.paymentMethod ?? null,
        paidAmount: dto.paidAmount ?? null,
      },
    });

    return final;
  }
}
