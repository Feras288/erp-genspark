// Phase 4B-1 skeleton: build-safe SalesService.
//
// What works today:
//   * list / getone — paginated Prisma read scoped by companyId.
//
// What is intentionally NOT implemented yet (will land in Phase 4B-2+):
//   * create draft  — raises NotImplementedException at runtime; DTOs only.
//   * update draft  — raises NotImplementedException at runtime.
//   * delete draft  — raises NotImplementedException at runtime.
//   * issue flow    — must run as one $transaction with SALE_OUT movements.
//   * cancel flow   — DRAFT→CANCELLED allowed; ISSUED→blocked-by-credit-note.
//
// Stock deduction at issue time, SALE_OUT runtime, and POS reuse are all
// deferred to Phase 4B-2. Build must remain green and e2e must remain 41/41.
import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/auth.types';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto';
import { SalesInvoiceQueryDto } from './dto/sales-invoice-query.dto';
import { IssueSalesInvoiceDto } from './dto/issue-sales-invoice.dto';
import { CancelSalesInvoiceDto } from './dto/cancel-sales-invoice.dto';

const INVOICE_FIELDS = {
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
} as const;

const LINE_FIELDS = {
  id: true,
  companyId: true,
  invoiceId: true,
  productId: true,
  warehouseId: true,
  description: true,
  quantity: true,
  unitPrice: true,
  discountAmount: true,
  vatRate: true,
  vatAmount: true,
  lineSubtotal: true,
  lineTotal: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------- list / get --------------------

  async list(companyId: string, q: SalesInvoiceQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.SalesInvoiceWhereInput = {
      companyId,
      deletedAt: null,
    };
    if (q.search) {
      const s = q.search;
      where.OR = [
        { invoiceNumber: { contains: s, mode: 'insensitive' } },
        { notes: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;
    if (q.customerId) where.customerId = q.customerId;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.salesInvoice.count({ where }),
      this.prisma.salesInvoice.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: INVOICE_FIELDS,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async get(companyId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { ...INVOICE_FIELDS, lines: { select: LINE_FIELDS } },
    });
    if (!invoice) throw new NotFoundException('Sales invoice not found');
    return invoice;
  }

  // -------------------- unimplemented skeleton methods --------------------

  async create(
    companyId: string,
    _actorUserId: string,
    _dto: CreateSalesInvoiceDto,
  ): Promise<never> {
    // Real implementation will:
    //   * validate PRODUCTS, resolve warehouses per line,
    //   * persist the DRAFT header (status=DRAFT, type=STANDARD, invoice auto-number),
    //   * run server-side Decimal arithmetic and persist line totals.
    throw new NotImplementedException(
      'SalesService.create is not implemented in Phase 4B-1 skeleton',
    );
  }

  async update(
    companyId: string,
    _id: string,
    _actorUserId: string,
    _dto: UpdateSalesInvoiceDto,
  ): Promise<never> {
    throw new NotImplementedException(
      'SalesService.update is not implemented in Phase 4B-1 skeleton',
    );
  }

  async remove(
    companyId: string,
    _id: string,
    _actorUserId: string,
  ): Promise<never> {
    throw new NotImplementedException(
      'SalesService.remove is not implemented in Phase 4B-1 skeleton',
    );
  }

  async issue(
    companyId: string,
    _id: string,
    _actorUserId: string,
    _dto: IssueSalesInvoiceDto,
  ): Promise<never> {
    throw new NotImplementedException(
      'SalesService.issue is not implemented in Phase 4B-1 skeleton',
    );
  }

  async cancel(
    companyId: string,
    _id: string,
    _actorUserId: string,
    _dto: CancelSalesInvoiceDto,
  ): Promise<never> {
    throw new NotImplementedException(
      'SalesService.cancel is not implemented in Phase 4B-1 skeleton',
    );
  }
}

// Re-export the AuthenticatedUser type for callers that want to type-check
// currentUser plumbing without importing the path module.
export type { AuthenticatedUser };
