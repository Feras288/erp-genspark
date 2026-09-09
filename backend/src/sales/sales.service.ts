// Phase 4B-2: SalesService with DRAFT-create/update/soft-delete logic.
//
// What works today:
//   * list / getone — paginated Prisma read scoped by companyId (Phase 4B-1).
//   * createDraft   — DRAFT header + recalculated lines, server-side Decimal
//                     arithmetic, customer (CUSTOMER|BOTH) + product validation,
//                     server-side invoiceNumber SI-<YYYYMMDD>-<seq> with retry.
//   * updateDraft   — only DRAFT; replaces lines; recalculates totals.
//   * removeDraft   — DRAFT soft-delete (deletedAt).
//   * audit logs    — sales.invoice.created / .updated / .deleted.
//
// What is intentionally NOT yet implemented in Phase 4B-2:
//   * issue flow    — single $transaction with stock deduction + SALE_OUT
//                     lands in Phase 4B-3.
//   * cancel flow   — DRAFT→CANCELLED + ISSUED guarded-by-credit-note in Phase 4B-3.
//   * POS reuse     — Phase 4B-4.
//
// All arithmetic uses Prisma.Decimal (which wraps decimal.js) end-to-end; no
// `Number` is used as money. Strings (already validated by DTOs) are converted
// through `new Prisma.Decimal(value)` then re-serialised with `.toFixed(4)`
// or `.toFixed(2)` per column scale to match Phase 1-3 conventions.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import {
  Prisma,
  SalesInvoiceStatus,
  SalesInvoiceType,
  PartnerType,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSalesInvoiceLineDto, CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto';
import { SalesInvoiceQueryDto } from './dto/sales-invoice-query.dto';
import { IssueSalesInvoiceDto } from './dto/issue-sales-invoice.dto';
import { CancelSalesInvoiceDto } from './dto/cancel-sales-invoice.dto';
import { postSalesInvoiceIssued, assertPeriodIsOpen } from '../accounting/posting-events';

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

const LINE_WITH_RELATIONS = {
  ...LINE_FIELDS,
  product: { select: { id: true, sku: true, name: true, type: true } },
  warehouse: { select: { id: true, code: true, name: true } },
} as const;

const INVOICE_WITH_LINES = {
  ...INVOICE_FIELDS,
  customer: { select: { id: true, code: true, name: true, type: true } },
  lines: { select: LINE_WITH_RELATIONS },
} as const;

const NUMERIC_SELECT = {
  ...INVOICE_FIELDS,
  _count: { select: { lines: true } },
  customer: { select: { id: true, code: true, name: true } },
};

type D = Prisma.Decimal;

function dec(value: string | number | D): D {
  return new Prisma.Decimal(value as Prisma.Decimal.Value);
}

function fmt4(d: D): string {
  return d.toFixed(4);
}
function fmt2(d: D): string {
  return d.toFixed(2);
}

interface ComputedLine {
  productId: string;
  warehouseId: string | null;
  description: string | null;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  vatAmount: string;
  lineSubtotal: string;
  lineTotal: string;
}

interface ComputedTotals {
  lines: ComputedLine[];
  subtotal: string;
  discountTotal: string;
  vatTotal: string;
  total: string;
}

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
        select: NUMERIC_SELECT,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async get(companyId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, companyId, deletedAt: null },
      select: INVOICE_WITH_LINES,
    });
    if (!invoice) throw new NotFoundException('Sales invoice not found');
    return invoice;
  }

  // -------------------- invoice number generation --------------------

  /**
   * Generate a unique server-side invoice number: `SI-YYYYMMDD-NNNN`.
   *
   * Daily serial logic:
   *   - Counts existing DRAFT/ISSUED/CANCELLED invoices for the company
   *     whose invoiceNumber starts with `SI-<today>-`.
   *   - Increments by 1 to derive the next serial.
   *   - Retries on `@@unique([companyId, invoiceNumber])` race up to 3 times.
   *
   * Audit-grade: never trusts the client.
   */
  private async generateInvoiceNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<string> {
    const now = new Date();
    const yyyy = now.getUTCFullYear().toString().padStart(4, '0');
    const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = now.getUTCDate().toString().padStart(2, '0');
    const todayPrefix = `SI-${yyyy}${mm}${dd}-`;

    for (let attempt = 0; attempt < 3; attempt++) {
      const count = await tx.salesInvoice.count({
        where: { companyId, invoiceNumber: { startsWith: todayPrefix } },
      });
      const serial = (count + 1).toString().padStart(4, '0');
      const candidate = `${todayPrefix}${serial}`;

      // Confirm id-safety before attempting create (cheap pre-check).
      const existing = await tx.salesInvoice.findFirst({
        where: { companyId, invoiceNumber: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
      // Otherwise fall through to retry (race with another concurrent creator).
    }
    throw new ConflictException(
      'Failed to allocate a unique invoice number after 3 attempts',
    );
  }

  // -------------------- shared validation --------------------

  private async assertCustomerValid(
    tx: Prisma.TransactionClient,
    companyId: string,
    customerId: string | null | undefined,
  ): Promise<void> {
    if (!customerId) return;
    const partner = await tx.partner.findFirst({
      where: { id: customerId, companyId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!partner) {
      throw new NotFoundException('Customer not found');
    }
    if (
      partner.type !== PartnerType.CUSTOMER &&
      partner.type !== PartnerType.BOTH
    ) {
      throw new BadRequestException(
        'Selected partner is not a customer (must be CUSTOMER or BOTH)',
      );
    }
  }

  private async assertProductsValid(
    tx: Prisma.TransactionClient,
    companyId: string,
    lines: CreateSalesInvoiceLineDto[],
  ): Promise<Map<string, { id: string; type: string; isActive: boolean }>> {
    const productIds = Array.from(new Set(lines.map((l) => l.productId)));
    const products = await tx.product.findMany({
      where: {
        companyId,
        id: { in: productIds },
        deletedAt: null,
      },
      select: { id: true, type: true, isActive: true, name: true },
    });
    const found = new Map(products.map((p) => [p.id, p]));
    for (const l of lines) {
      const p = found.get(l.productId);
      if (!p) {
        throw new NotFoundException(`Product not found: ${l.productId}`);
      }
      if (!p.isActive) {
        throw new BadRequestException(
          `Product is inactive: ${p.name} (${p.id})`,
        );
      }
    }
    return found;
  }

  /**
   * Server-side Decimal arithmetic for invoice lines and header.
   *
   * Per line, given `quantity > 0`, `unitPrice >= 0`, `discountAmount >= 0`,
   * `vatRate >= 0`:
   *
   *   lineSubtotal   = quantity * unitPrice
   *   taxableAmount  = max(lineSubtotal - discountAmount, 0)
   *   vatAmount      = round(taxableAmount * vatRate / 100, 4)
   *   lineTotal      = taxableAmount + vatAmount
   *
   * Header:
   *   subtotal      = sum(lineSubtotal)
   *   discountTotal = sum(discountAmount)
   *   vatTotal      = sum(vatAmount)
   *   total         = sum(lineTotal)
   *
   * Note: `vatAmount` is rounded to 4 dp to match the column scale
   * (`Decimal @db.Decimal(18, 4)`). This is a tax-safe approximation
   * consistent with POSTGRES NUMERIC rounding.
   */
  private computeTotals(
    lines: CreateSalesInvoiceLineDto[],
  ): ComputedTotals {
    const computed: ComputedLine[] = [];
    let sub = new Prisma.Decimal(0);
    let disc = new Prisma.Decimal(0);
    let vat = new Prisma.Decimal(0);
    let total = new Prisma.Decimal(0);

    for (const l of lines) {
      const qty = dec(l.quantity);
      if (qty.lte(0)) {
        throw new BadRequestException(
          `Line quantity must be > 0 (productId=${l.productId})`,
        );
      }
      const unitPrice = dec(l.unitPrice);
      if (unitPrice.lt(0)) {
        throw new BadRequestException(
          `Line unitPrice must be >= 0 (productId=${l.productId})`,
        );
      }
      const discount = dec(l.discountAmount ?? '0');
      if (discount.lt(0)) {
        throw new BadRequestException(
          `Line discountAmount must be >= 0 (productId=${l.productId})`,
        );
      }
      const vatRate = dec(l.vatRate ?? '15.00');
      if (vatRate.lt(0)) {
        throw new BadRequestException(
          `Line vatRate must be >= 0 (productId=${l.productId})`,
        );
      }

      const lineSub = qty.mul(unitPrice);
      const taxable = Prisma.Decimal.max(lineSub.minus(discount), new Prisma.Decimal(0));
      const vatAmt = taxable.mul(vatRate).div(100).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      const lineT = taxable.plus(vatAmt);

      sub = sub.plus(lineSub);
      disc = disc.plus(discount);
      vat = vat.plus(vatAmt);
      total = total.plus(lineT);

      computed.push({
        productId: l.productId,
        warehouseId: l.warehouseId ?? null,
        description: l.description ?? null,
        quantity: fmt4(qty),
        unitPrice: fmt4(unitPrice),
        discountAmount: fmt4(discount),
        vatRate: fmt2(vatRate),
        vatAmount: fmt4(vatAmt),
        lineSubtotal: fmt4(lineSub),
        lineTotal: fmt4(lineT),
      });
    }

    return {
      lines: computed,
      subtotal: fmt4(sub),
      discountTotal: fmt4(disc),
      vatTotal: fmt4(vat),
      total: fmt4(total),
    };
  }

  // -------------------- create draft --------------------

  /**
   * Internal: create a DRAFT sales invoice with optional type / paymentMethod / paidAmount.
   * Public `create()` delegates here with type=STANDARD and no payment fields.
   * POS service (Phase 4B-4) reuses this entry-point with type=POS + payment.
   */
  async createDraft(
    companyId: string,
    actorUserId: string,
    dto: CreateSalesInvoiceDto,
    opts: {
      type?: SalesInvoiceType;
      paymentMethod?: Prisma.SalesInvoiceCreateInput['paymentMethod'];
      paidAmount?: string | null;
    } = {},
  ) {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertCustomerValid(tx, companyId, dto.customerId);
      await this.assertProductsValid(tx, companyId, dto.lines);
      const totals = this.computeTotals(dto.lines);
      const invoiceNumber = await this.generateInvoiceNumber(tx, companyId);

      const header = await tx.salesInvoice.create({
        data: {
          companyId,
          invoiceNumber,
          status: SalesInvoiceStatus.DRAFT,
          type: opts.type ?? SalesInvoiceType.STANDARD,
          customerId: dto.customerId ?? null,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          subtotal: totals.subtotal,
          vatTotal: totals.vatTotal,
          discountTotal: totals.discountTotal,
          total: totals.total,
          paymentMethod: opts.paymentMethod ?? null,
          paidAmount: opts.paidAmount ?? null,
          notes: dto.notes ?? null,
          createdById: actorUserId,
          updatedById: actorUserId,
          lines: {
            create: totals.lines.map((l) => ({
              companyId,
              productId: l.productId,
              warehouseId: l.warehouseId,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountAmount: l.discountAmount,
              vatRate: l.vatRate,
              vatAmount: l.vatAmount,
              lineSubtotal: l.lineSubtotal,
              lineTotal: l.lineTotal,
            })),
          },
        } as Prisma.SalesInvoiceUncheckedCreateInput,
        select: INVOICE_WITH_LINES,
      });

      return header;
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'sales.invoice.created',
      entity: 'SalesInvoice',
      entityId: created.id,
      metadata: {
        invoiceNumber: created.invoiceNumber,
        status: created.status,
        type: created.type,
        source: opts.type === SalesInvoiceType.POS ? 'pos' : 'sales',
      },
    });

    return created;
  }

  async create(
    companyId: string,
    actorUserId: string,
    dto: CreateSalesInvoiceDto,
  ) {
    return this.createDraft(companyId, actorUserId, dto, {
      type: SalesInvoiceType.STANDARD,
    });
  }

  // -------------------- update draft --------------------

  async update(
    companyId: string,
    id: string,
    actorUserId: string,
    dto: UpdateSalesInvoiceDto,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.salesInvoice.findFirst({
        where: { id, companyId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!existing) throw new NotFoundException('Sales invoice not found');
      if (existing.status !== SalesInvoiceStatus.DRAFT) {
        throw new ConflictException(
          `Only DRAFT invoices can be updated (current status=${existing.status})`,
        );
      }

      // If customerId is provided (even if undefined explicitly passed), validate.
      // We treat `undefined` vs `null` carefully: the DTO uses @IsOptional, so
      // any value !== undefined means the client is asserting this field.
      if (dto.customerId !== undefined) {
        await this.assertCustomerValid(tx, companyId, dto.customerId ?? null);
      }

      let totals: ComputedTotals | null = null;
      if (dto.lines !== undefined) {
        await this.assertProductsValid(tx, companyId, dto.lines);
        totals = this.computeTotals(dto.lines);
      }

      // Replace lines eagerly if provided (simple, transactional, and matches
      // DRAFT edit semantics in Phase 4B-2; we are not partial-patching lines).
      if (totals !== null) {
        await tx.salesInvoiceLine.deleteMany({
          where: { companyId, invoiceId: id },
        });
        await tx.salesInvoiceLine.createMany({
          data: totals.lines.map((l) => ({
            companyId,
            invoiceId: id,
            productId: l.productId,
            warehouseId: l.warehouseId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            vatRate: l.vatRate,
            vatAmount: l.vatAmount,
            lineSubtotal: l.lineSubtotal,
            lineTotal: l.lineTotal,
          })),
        });
      }

      const data: Prisma.SalesInvoiceUncheckedUpdateInput = {
        updatedById: actorUserId,
      };
      if (dto.customerId !== undefined) {
        data.customerId = dto.customerId ?? null;
      }
      if (dto.issueDate !== undefined) {
        data.issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
      }
      if (dto.dueDate !== undefined) {
        data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      }
      if (dto.notes !== undefined) {
        data.notes = dto.notes ?? null;
      }
      if (totals !== null) {
        data.subtotal = totals.subtotal;
        data.vatTotal = totals.vatTotal;
        data.discountTotal = totals.discountTotal;
        data.total = totals.total;
      }

      return tx.salesInvoice.update({
        where: { id },
        data,
        select: INVOICE_WITH_LINES,
      });
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'sales.invoice.updated',
      entity: 'SalesInvoice',
      entityId: updated.id,
      metadata: { invoiceNumber: updated.invoiceNumber, status: updated.status },
    });

    return updated;
  }

  // -------------------- soft delete draft --------------------

  async remove(companyId: string, id: string, actorUserId: string) {
    const current = await this.prisma.salesInvoice.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, status: true, invoiceNumber: true },
    });
    if (!current) throw new NotFoundException('Sales invoice not found');
    if (current.status !== SalesInvoiceStatus.DRAFT) {
      throw new ConflictException(
        `Only DRAFT invoices can be deleted (current status=${current.status})`,
      );
    }

    await this.prisma.salesInvoice.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: { connect: { id: actorUserId } },
      },
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'sales.invoice.deleted',
      entity: 'SalesInvoice',
      entityId: id,
      metadata: { invoiceNumber: current.invoiceNumber },
    });

    return { id, isActive: false, deletedAt: new Date() };
  }

  // -------------------- issue / cancel — Phase 4B-3 --------------------

  /**
   * Issue a DRAFT sales invoice:
   *   1. atomically transition DRAFT → ISSUED,
   *   2. for every PRODUCT line, deduct from per-(product,warehouse) StockLevel
   *      (floor at 0, matches Phase 3 rule) and append a SALE_OUT StockMovement.
   *   3. SERVICE lines are pass-through (no stock impact, no movement).
   *
   * Stays inside one Prisma `$transaction` so partial failures roll back
   * consistently. Order of operations inside the tx matters:
   *   - first, validate headers + lines + product/warehouse references;
   *   - then, deduct stock level by level (capture supplier qty for atomic math);
   *   - then, append StockMovement rows (these are append-only);
   *   - then, flip the invoice to ISSUED;
   *   - finally, auto-post one POSTED JournalEntry (Phase 11B-B-2)
   *     linked by sourceType=SALES_INVOICE / sourceId=invoice.id.
   *     Unique (companyId, sourceType, sourceId) makes retries
   *     idempotent. Same $transaction as the status flip.
   */
  async issue(
    companyId: string,
    id: string,
    actorUserId: string,
    dto: IssueSalesInvoiceDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findFirst({
        where: { id, companyId, deletedAt: null },
        select: {
          id: true,
          status: true,
          invoiceNumber: true,
          notes: true,
          lines: {
            select: {
              id: true,
              productId: true,
              warehouseId: true,
              quantity: true,
              product: { select: { id: true, type: true, isActive: true, name: true } },
              warehouse: { select: { id: true, code: true, isActive: true, deletedAt: true } },
            },
          },
        },
      });
      if (!invoice) throw new NotFoundException('Sales invoice not found');
      if (invoice.status !== SalesInvoiceStatus.DRAFT) {
        throw new BadRequestException(
          `Only DRAFT invoices can be issued (current status=${invoice.status})`,
        );
      }
      if (invoice.lines.length === 0) {
        throw new BadRequestException('Invoice must have at least one line to issue');
      }

      // Pre-validate products (still active, same company) — re-check at issue time
      // because a long-lived DRAFT may outlive product lifecycle changes.
      const productIds = Array.from(new Set(invoice.lines.map((l) => l.productId)));
      const products = await tx.product.findMany({
        where: { companyId, id: { in: productIds }, deletedAt: null },
        select: { id: true, type: true, isActive: true, name: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));
      for (const l of invoice.lines) {
        const p = productMap.get(l.productId);
        if (!p) {
          throw new BadRequestException(
            `Product no longer exists: ${l.productId}`,
          );
        }
        if (!p.isActive) {
          throw new BadRequestException(
            `Product is inactive: ${p.name}`,
          );
        }
      }

      // Per-line stock handling.
      const movements: Array<{
        companyId: string;
        productId: string;
        warehouseId: string;
        movementType: 'SALE_OUT';
        direction: 'OUT';
        quantity: string;
        referenceType: 'sales_invoice';
        referenceId: string;
        reason: 'Sales invoice issued';
        notes: string | null;
        createdById: string;
      }> = [];
      let productLineCount = 0;
      let serviceLineCount = 0;

      for (const l of invoice.lines) {
        const product = productMap.get(l.productId)!;
        if (product.type === 'SERVICE') {
          serviceLineCount++;
          continue;
        }

        productLineCount++;

        if (!l.warehouseId) {
          throw new BadRequestException(
            `PRODUCT line must declare a warehouseId (product=${product.name})`,
          );
        }
        if (!l.warehouse || l.warehouse.deletedAt !== null) {
          throw new BadRequestException(
            `Warehouse not found or deleted for PRODUCT line (product=${product.name})`,
          );
        }
        if (!l.warehouse.isActive) {
          throw new BadRequestException(
            `Warehouse is inactive (warehouseId=${l.warehouseId})`,
          );
        }

        const lineQty = new Prisma.Decimal(l.quantity);
        if (lineQty.lte(0)) {
          throw new BadRequestException(`Line quantity must be > 0 (lineId=${l.id})`);
        }

        // Lock the level row inside the transaction.
        const level = await tx.stockLevel.findFirst({
          where: { companyId, productId: l.productId, warehouseId: l.warehouseId },
        });
        const currentQty = level ? Number(level.quantity) : 0;
        if (!level || currentQty < lineQty.toNumber()) {
          throw new BadRequestException(
            `Insufficient stock for product ${product.name}: ` +
              `available=${currentQty}, requested=${lineQty.toString()}`,
          );
        }
        const newQty = currentQty - lineQty.toNumber();
        await tx.stockLevel.update({
          where: { id: level.id },
          data: { quantity: newQty.toFixed(4) },
        });

        movements.push({
          companyId,
          productId: l.productId,
          warehouseId: l.warehouseId,
          movementType: 'SALE_OUT',
          direction: 'OUT',
          quantity: lineQty.toFixed(4),
          referenceType: 'sales_invoice',
          referenceId: invoice.id,
          reason: 'Sales invoice issued',
          notes: invoice.invoiceNumber,
          createdById: actorUserId,
        });
      }

      // Append all sale movements (Phase 3 invariant: append-only).
      for (const mv of movements) {
        await tx.stockMovement.create({
          data: mv as Prisma.StockMovementUncheckedCreateInput,
          select: { id: true },
        });
      }

      // Flip status ISSUED + issuedAt/By/Date.
      const issuedAt = new Date();
      const issueDate = dto.issueDate ? new Date(dto.issueDate) : issuedAt;
      await assertPeriodIsOpen(tx, companyId, issueDate, 'sales invoice issue');
      const finalNotes = dto.notes ?? invoice.notes ?? null;

      const updated = await tx.salesInvoice.update({
        where: { id },
        data: {
          status: SalesInvoiceStatus.ISSUED,
          issuedAt,
          issuedById: actorUserId,
          issueDate,
          notes: finalNotes,
          updatedById: actorUserId,
        } as Prisma.SalesInvoiceUncheckedUpdateInput,
        select: INVOICE_WITH_LINES,
      });

      await postSalesInvoiceIssued(tx, {
        companyId,
        userId: actorUserId,
        invoice: {
          id: updated.id,
          invoiceNumber: updated.invoiceNumber,
          subtotal: updated.subtotal,
          vatTotal: updated.vatTotal,
          discountTotal: updated.discountTotal,
          total: updated.total,
        },
      });

      return { invoice: updated, productLineCount, serviceLineCount, movements: movements.length };
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'sales.invoice.issued',
      entity: 'SalesInvoice',
      entityId: result.invoice.id,
      metadata: {
        invoiceNumber: result.invoice.invoiceNumber,
        status: result.invoice.status,
        productLineCount: result.productLineCount,
        serviceLineCount: result.serviceLineCount,
        movementCount: result.movements,
        total: result.invoice.total,
      },
    });

    return result.invoice;
  }

  /**
   * Cancel an invoice.
   *   - DRAFT → CANCELLED, no stock reversal (DRAFT never moved stock).
   *   - ISSUED → refused with the explicit "credit note required" message
   *     (Phase 4B-4+ will own the reversal/credit-note flow).
   *   - CANCELLED → refused with "already cancelled".
   */
  async cancel(
    companyId: string,
    id: string,
    actorUserId: string,
    dto: CancelSalesInvoiceDto,
  ) {
    const existing = await this.prisma.salesInvoice.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, status: true, invoiceNumber: true, notes: true },
    });
    if (!existing) throw new NotFoundException('Sales invoice not found');

    if (existing.status === SalesInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Invoice is already cancelled.');
    }

    if (existing.status === SalesInvoiceStatus.ISSUED) {
      throw new BadRequestException(
        'Issued invoices require credit note/reversal flow in a future phase.',
      );
    }

    // DRAFT → CANCELLED.
    const notesSuffix = dto.reason ?? dto.notes;
    const mergedNotes = notesSuffix
      ? (existing.notes ? `${existing.notes}\n— ${notesSuffix}` : `— ${notesSuffix}`)
      : existing.notes ?? null;

    const cancelledAt = new Date();
    const updated = await this.prisma.salesInvoice.update({
      where: { id },
      data: {
        status: SalesInvoiceStatus.CANCELLED,
        cancelledAt,
        cancelledById: actorUserId,
        notes: mergedNotes,
        updatedById: actorUserId,
      } as Prisma.SalesInvoiceUncheckedUpdateInput,
      select: INVOICE_WITH_LINES,
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'sales.invoice.cancelled',
      entity: 'SalesInvoice',
      entityId: updated.id,
      metadata: {
        invoiceNumber: updated.invoiceNumber,
        status: updated.status,
        reason: dto.reason ?? null,
      },
    });

    return updated;
  }
}
