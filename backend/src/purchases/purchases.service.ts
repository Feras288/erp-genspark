// Phase 5: Purchases Core — full lifecycle implementation.
//
// What works today:
//   * list / getone — paginated Prisma read scoped by companyId.
//   * createDraft   — DRAFT header + recomputed lines, server-side Decimal
//                     arithmetic, supplier (SUPPLIER | BOTH) + product
//                     validation, server-side invoiceNumber PI-<YYYYMMDD>-<seq>
//                     with 3-attempt race retry.
//   * updateDraft   — only DRAFT; replaces lines; recalculates totals.
//   * removeDraft   — DRAFT soft-delete (deletedAt).
//   * receive       — DRAFT → RECEIVED in a single $transaction. PRODUCT lines
//                     UPSERT StockLevel (+lineQuantity) and append a
//                     PURCHASE_IN StockMovement with referenceType
//                     'purchase_invoice' and referenceId=invoice.id. SERVICE
//                     lines are pass-through. No accounting, no COGS, no
//                     supplier balance, no payment.
//   * cancel        — DRAFT → CANCELLED. RECEIVED and CANCELLED rejected with
//                     explicit messages. CREDIT NOTE / DEBIT NOTE / RETURNS are
//                     out of scope for Phase 5 by user mandate.
//   * audit         — purchases.invoice.created / .updated / .deleted /
//                     .received / .cancelled via AuditService.record
//                     (best-effort; never breaks the flow).
//
// What is intentionally NOT in Phase 5 (per user prohibition list):
//   * Accounting, GL, journal entries, accounts payable, supplier balance.
//   * Payments, payment allocations, partial payments.
//   * Reports, financial reports, inventory valuation, landed cost.
//   * ZATCA, credit notes, debit notes, purchase returns, sales returns.
//   * Cost layers, FIFO/LIFO/weighted-average costing, COGS.
//   * Barcode hardware, receipt printers, cash drawers, shift management.
//   * Cloudflare / Wrangler / Workers / D1 / KV / R2 hosting.
//
// All arithmetic uses Prisma.Decimal (decimal.js under the hood). No `Number`
// is used for monetary math; string inputs are converted through `new
// Prisma.Decimal(value)` and re-serialised with `.toFixed(4)` / `.toFixed(2)`
// per column scale.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditCategory,
  AuditSeverity,
  Prisma,
  PurchaseInvoiceStatus,
  StockMovementType,
  StockMovementDirection,
  PartnerType,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreatePurchaseInvoiceLineDto,
  CreatePurchaseInvoiceDto,
} from './dto/create-purchase-invoice.dto';
import { UpdatePurchaseInvoiceDto } from './dto/update-purchase-invoice.dto';
import { PurchaseInvoiceQueryDto } from './dto/purchase-invoice-query.dto';
import { ReceivePurchaseInvoiceDto } from './dto/receive-purchase-invoice.dto';
import { CancelPurchaseInvoiceDto } from './dto/cancel-purchase-invoice.dto';
import { postPurchaseInvoiceReceived, assertPeriodIsOpen } from '../accounting/posting-events';

const INVOICE_FIELDS = {
  id: true,
  companyId: true,
  invoiceNumber: true,
  status: true,
  supplierId: true,
  purchaseDate: true,
  dueDate: true,
  subtotal: true,
  vatTotal: true,
  discountTotal: true,
  total: true,
  notes: true,
  receivedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  updatedById: true,
  receivedById: true,
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
  unitCost: true,
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
  supplier: { select: { id: true, code: true, name: true, type: true } },
  lines: { select: LINE_WITH_RELATIONS },
} as const;

const NUMERIC_SELECT = {
  ...INVOICE_FIELDS,
  _count: { select: { lines: true } },
  supplier: { select: { id: true, code: true, name: true } },
} as const;

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
  unitCost: string;
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
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // -------------------- list / get --------------------

  async list(companyId: string, q: PurchaseInvoiceQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.PurchaseInvoiceWhereInput = {
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
    if (q.supplierId) where.supplierId = q.supplierId;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.count({ where }),
      this.prisma.purchaseInvoice.findMany({
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
    const invoice = await this.prisma.purchaseInvoice.findFirst({
      where: { id, companyId, deletedAt: null },
      select: INVOICE_WITH_LINES,
    });
    if (!invoice) throw new NotFoundException('Purchase invoice not found');
    return invoice;
  }

  // -------------------- invoice number generation --------------------

  /**
   * Generate a unique server-side invoice number: `PI-YYYYMMDD-NNNN`.
   * Daily serial logic mirroring SalesService:
   *   - Counts existing invoices for the company whose invoiceNumber starts
   *     with `PI-<today>-`.
   *   - Increments by 1 to derive the next serial.
   *   - Retries on `@@unique([companyId, invoiceNumber])` race up to 3 times.
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
    const todayPrefix = `PI-${yyyy}${mm}${dd}-`;

    for (let attempt = 0; attempt < 3; attempt++) {
      const count = await tx.purchaseInvoice.count({
        where: { companyId, invoiceNumber: { startsWith: todayPrefix } },
      });
      const serial = (count + 1).toString().padStart(4, '0');
      const candidate = `${todayPrefix}${serial}`;

      const existing = await tx.purchaseInvoice.findFirst({
        where: { companyId, invoiceNumber: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }
    throw new ConflictException(
      'Failed to allocate a unique invoice number after 3 attempts',
    );
  }

  // -------------------- shared validation --------------------

  /**
   * Supplier must be a Partner of type SUPPLIER or BOTH belonging to the
   * same company. CUSTOMER-only partners are explicitly rejected
   * (per Phase 5 user scope).
   */
  private async assertSupplierValid(
    tx: Prisma.TransactionClient,
    companyId: string,
    supplierId: string | null | undefined,
  ): Promise<void> {
    if (!supplierId) return;
    const partner = await tx.partner.findFirst({
      where: { id: supplierId, companyId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!partner) {
      throw new NotFoundException('Supplier not found');
    }
    if (
      partner.type !== PartnerType.SUPPLIER &&
      partner.type !== PartnerType.BOTH
    ) {
      throw new BadRequestException(
        'Selected partner is not a supplier (must be SUPPLIER or BOTH)',
      );
    }
  }

  private async assertProductsValid(
    tx: Prisma.TransactionClient,
    companyId: string,
    lines: CreatePurchaseInvoiceLineDto[],
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
   * Server-side Decimal arithmetic for purchase invoice lines and header.
   *
   * Per line, given `quantity > 0`, `unitCost >= 0`, `discountAmount >= 0`,
   * `vatRate >= 0`:
   *
   *   lineSubtotal   = quantity * unitCost
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
   * `vatAmount` is rounded to 4 dp to match the column scale
   * (`Decimal @db.Decimal(18, 4)`). Tax-safe approximation consistent with
   * POSTGRES NUMERIC rounding.
   */
  private computeTotals(
    lines: CreatePurchaseInvoiceLineDto[],
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
      const unitCost = dec(l.unitCost);
      if (unitCost.lt(0)) {
        throw new BadRequestException(
          `Line unitCost must be >= 0 (productId=${l.productId})`,
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

      const lineSub = qty.mul(unitCost);
      const taxable = Prisma.Decimal.max(
        lineSub.minus(discount),
        new Prisma.Decimal(0),
      );
      const vatAmt = taxable
        .mul(vatRate)
        .div(100)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
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
        unitCost: fmt4(unitCost),
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

  async create(
    companyId: string,
    actorUserId: string,
    dto: CreatePurchaseInvoiceDto,
  ) {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertSupplierValid(tx, companyId, dto.supplierId);
      await this.assertProductsValid(tx, companyId, dto.lines);
      const totals = this.computeTotals(dto.lines);
      const invoiceNumber = await this.generateInvoiceNumber(tx, companyId);

      const header = await tx.purchaseInvoice.create({
        data: {
          companyId,
          invoiceNumber,
          status: PurchaseInvoiceStatus.DRAFT,
          supplierId: dto.supplierId ?? null,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          subtotal: totals.subtotal,
          vatTotal: totals.vatTotal,
          discountTotal: totals.discountTotal,
          total: totals.total,
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
              unitCost: l.unitCost,
              discountAmount: l.discountAmount,
              vatRate: l.vatRate,
              vatAmount: l.vatAmount,
              lineSubtotal: l.lineSubtotal,
              lineTotal: l.lineTotal,
            })),
          },
        } as Prisma.PurchaseInvoiceUncheckedCreateInput,
        select: INVOICE_WITH_LINES,
      });

      await this.auditLogsService.logSuccess(
        {
          companyId,
          actorUserId: actorUserId ?? null,
          category: AuditCategory.PURCHASES,
          event: 'PURCHASE_INVOICE_CREATED',
          action: 'CREATE',
          severity: AuditSeverity.INFO,
          entityType: 'PurchaseInvoice',
          entityId: header.id,
          metadata: {
            invoiceNumber: header.invoiceNumber,
            supplierId: header.supplierId ?? null,
            purchaseDate: header.purchaseDate
              ? (header.purchaseDate instanceof Date
                  ? header.purchaseDate.toISOString()
                  : String(header.purchaseDate))
              : null,
            totalAmount: header.total != null ? header.total.toString() : null,
            status: header.status,
          },
        },
        tx,
      );

      return header;
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'purchases.invoice.created',
      entity: 'PurchaseInvoice',
      entityId: created.id,
      metadata: {
        invoiceNumber: created.invoiceNumber,
        status: created.status,
      },
    });

    return created;
  }

  // -------------------- update draft --------------------

  async update(
    companyId: string,
    id: string,
    actorUserId: string,
    dto: UpdatePurchaseInvoiceDto,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseInvoice.findFirst({
        where: { id, companyId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!existing) throw new NotFoundException('Purchase invoice not found');
      if (existing.status !== PurchaseInvoiceStatus.DRAFT) {
        throw new ConflictException(
          `Only DRAFT invoices can be updated (current status=${existing.status})`,
        );
      }

      if (dto.supplierId !== undefined) {
        await this.assertSupplierValid(tx, companyId, dto.supplierId ?? null);
      }

      let totals: ComputedTotals | null = null;
      if (dto.lines !== undefined) {
        await this.assertProductsValid(tx, companyId, dto.lines);
        totals = this.computeTotals(dto.lines);
      }

      if (totals !== null) {
        await tx.purchaseInvoiceLine.deleteMany({
          where: { companyId, invoiceId: id },
        });
        await tx.purchaseInvoiceLine.createMany({
          data: totals.lines.map((l) => ({
            companyId,
            invoiceId: id,
            productId: l.productId,
            warehouseId: l.warehouseId,
            description: l.description,
            quantity: l.quantity,
            unitCost: l.unitCost,
            discountAmount: l.discountAmount,
            vatRate: l.vatRate,
            vatAmount: l.vatAmount,
            lineSubtotal: l.lineSubtotal,
            lineTotal: l.lineTotal,
          })),
        });
      }

      const data: Prisma.PurchaseInvoiceUncheckedUpdateInput = {
        updatedById: actorUserId,
      };
      if (dto.supplierId !== undefined) {
        data.supplierId = dto.supplierId ?? null;
      }
      if (dto.purchaseDate !== undefined) {
        data.purchaseDate = dto.purchaseDate
          ? new Date(dto.purchaseDate)
          : null;
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

      return tx.purchaseInvoice.update({
        where: { id },
        data,
        select: INVOICE_WITH_LINES,
      });
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'purchases.invoice.updated',
      entity: 'PurchaseInvoice',
      entityId: updated.id,
      metadata: {
        invoiceNumber: updated.invoiceNumber,
        status: updated.status,
      },
    });

    return updated;
  }

  // -------------------- soft delete draft --------------------

  async remove(companyId: string, id: string, actorUserId: string) {
    const current = await this.prisma.purchaseInvoice.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, status: true, invoiceNumber: true },
    });
    if (!current) throw new NotFoundException('Purchase invoice not found');
    if (current.status !== PurchaseInvoiceStatus.DRAFT) {
      throw new ConflictException(
        `Only DRAFT invoices can be deleted (current status=${current.status})`,
      );
    }

    await this.prisma.purchaseInvoice.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: { connect: { id: actorUserId } },
      },
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'purchases.invoice.deleted',
      entity: 'PurchaseInvoice',
      entityId: id,
      metadata: { invoiceNumber: current.invoiceNumber },
    });

    return { id, isActive: false, deletedAt: new Date() };
  }

  // -------------------- receive — Phase 5 receive flow --------------------

  /**
   * Receive a DRAFT purchase invoice:
   *   1. atomically transition DRAFT → RECEIVED,
   *   2. for every PRODUCT line, UPSERT the per-(product,warehouse) StockLevel
   *      with quantity += receivedQuantity, and append a PURCHASE_IN
   *      StockMovement with referenceType='purchase_invoice' and
   *      referenceId=invoice.id.
   *   3. SERVICE lines are pass-through (no stock impact, no movement).
   *   4. No accounting / GL / COGS / supplier balance is computed.
   *      No payments / allocations / cost layers are written.
   *
   * Stays inside one Prisma `$transaction` so partial failures roll back
   * consistently. Order of operations inside the tx matters:
   *   - validate headers + lines + product/warehouse references first;
   *   - then upsert stock levels (capture current qty for atomic math);
   *   - then append StockMovement rows (these are append-only);
   *   - then flip the invoice to RECEIVED;
   *   - finally auto-post one POSTED JournalEntry (Phase 11B-B-3)
   *     linked by sourceType=PURCHASE_INVOICE / sourceId=invoice.id.
   *     Unique (companyId, sourceType, sourceId) makes retries
   *     idempotent. Same $transaction as the status flip.
   */
  async receive(
    companyId: string,
    id: string,
    actorUserId: string,
    dto: ReceivePurchaseInvoiceDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.findFirst({
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
              product: {
                select: { id: true, type: true, isActive: true, name: true },
              },
              warehouse: {
                select: { id: true, code: true, isActive: true, deletedAt: true },
              },
            },
          },
        },
      });
      if (!invoice) throw new NotFoundException('Purchase invoice not found');
      if (invoice.status !== PurchaseInvoiceStatus.DRAFT) {
        throw new BadRequestException(
          `Only DRAFT invoices can be received (current status=${invoice.status})`,
        );
      }
      if (invoice.lines.length === 0) {
        throw new BadRequestException(
          'Invoice must have at least one line to receive',
        );
      }

      // Re-validate products at receive time (a long-lived DRAFT may have
      // outlived product lifecycle changes).
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
          throw new BadRequestException(`Product is inactive: ${p.name}`);
        }
      }

      const movements: Array<{
        companyId: string;
        productId: string;
        warehouseId: string;
        movementType: 'PURCHASE_IN';
        direction: 'IN';
        quantity: string;
        referenceType: 'purchase_invoice';
        referenceId: string;
        reason: 'Purchase invoice received';
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
          throw new BadRequestException(
            `Line quantity must be > 0 (lineId=${l.id})`,
          );
        }

        // Upsert the StockLevel row inside the transaction. This is the
        // first IN-flow that may legitimately create a fresh row (sales
        // and inventory OUT flows only ever update existing rows).
        const existingLevel = await tx.stockLevel.findFirst({
          where: {
            companyId,
            productId: l.productId,
            warehouseId: l.warehouseId,
          },
        });
        const currentQty = existingLevel
          ? new Prisma.Decimal(existingLevel.quantity)
          : new Prisma.Decimal(0);
        const newQty = currentQty.plus(lineQty);

        if (existingLevel) {
          await tx.stockLevel.update({
            where: { id: existingLevel.id },
            data: { quantity: newQty.toFixed(4) },
          });
        } else {
          await tx.stockLevel.create({
            data: {
              companyId,
              productId: l.productId,
              warehouseId: l.warehouseId,
              quantity: newQty.toFixed(4),
            } as Prisma.StockLevelUncheckedCreateInput,
            select: { id: true },
          });
        }

        movements.push({
          companyId,
          productId: l.productId,
          warehouseId: l.warehouseId,
          movementType: 'PURCHASE_IN',
          direction: 'IN',
          quantity: lineQty.toFixed(4),
          referenceType: 'purchase_invoice',
          referenceId: invoice.id,
          reason: 'Purchase invoice received',
          notes: invoice.invoiceNumber,
          createdById: actorUserId,
        });
      }

      // Append all purchase movements (Phase 3 invariant: append-only).
      for (const mv of movements) {
        await tx.stockMovement.create({
          data: mv as unknown as Prisma.StockMovementUncheckedCreateInput,
          select: { id: true },
        });
      }

      // Flip status RECEIVED + receivedAt / receivedBy / receivedDate.
      const receivedAt = new Date();
      const purchaseDate = dto.purchaseDate ? new Date(dto.purchaseDate) : receivedAt;
      await assertPeriodIsOpen(tx, companyId, purchaseDate, 'purchase invoice receive');
      const finalNotes = dto.notes ?? invoice.notes ?? null;

      const updated = await tx.purchaseInvoice.update({
        where: { id },
        data: {
          status: PurchaseInvoiceStatus.RECEIVED,
          receivedAt,
          receivedById: actorUserId,
          purchaseDate,
          notes: finalNotes,
          updatedById: actorUserId,
        } as Prisma.PurchaseInvoiceUncheckedUpdateInput,
        select: INVOICE_WITH_LINES,
      });

      const postedJournal = await postPurchaseInvoiceReceived(tx, {
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

      await this.auditLogsService.logSuccess(
        {
          companyId,
          actorUserId: actorUserId ?? null,
          category: AuditCategory.PURCHASES,
          event: 'PURCHASE_INVOICE_RECEIVED',
          action: 'RECEIVE',
          severity: AuditSeverity.INFO,
          entityType: 'PurchaseInvoice',
          entityId: updated.id,
          metadata: {
            invoiceNumber: updated.invoiceNumber,
            purchaseDate: updated.purchaseDate
              ? (updated.purchaseDate instanceof Date
                  ? updated.purchaseDate.toISOString()
                  : String(updated.purchaseDate))
              : null,
            journalEntryId: postedJournal?.id ?? null,
            status: updated.status,
          },
        },
        tx,
      );

      return {
        invoice: updated,
        productLineCount,
        serviceLineCount,
        movements: movements.length,
      };
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'purchases.invoice.received',
      entity: 'PurchaseInvoice',
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

  // -------------------- cancel — Phase 5 cancel flow --------------------

  /**
   * Cancel a purchase invoice.
   *   - DRAFT → CANCELLED, no stock reversal (DRAFT never moved stock).
   *   - RECEIVED → refused: requires returns/debit-note flow excluded from
   *     Phase 5.
   *   - CANCELLED → refused: already cancelled.
   */
  async cancel(
    companyId: string,
    id: string,
    actorUserId: string,
    dto: CancelPurchaseInvoiceDto,
  ) {
    const existing = await this.prisma.purchaseInvoice.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, status: true, invoiceNumber: true, notes: true },
    });
    if (!existing) throw new NotFoundException('Purchase invoice not found');

    if (existing.status === PurchaseInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Invoice is already cancelled.');
    }

    if (existing.status === PurchaseInvoiceStatus.RECEIVED) {
      throw new BadRequestException(
        'Received purchase invoices require returns/debit-note flow in a future phase.',
      );
    }

    // DRAFT → CANCELLED.
    const notesSuffix = dto.reason ?? dto.notes;
    const mergedNotes = notesSuffix
      ? existing.notes
        ? `${existing.notes}\n— ${notesSuffix}`
        : `— ${notesSuffix}`
      : existing.notes ?? null;

    const cancelledAt = new Date();
    const updated = await this.prisma.purchaseInvoice.update({
      where: { id },
      data: {
        status: PurchaseInvoiceStatus.CANCELLED,
        cancelledAt,
        cancelledById: actorUserId,
        notes: mergedNotes,
        updatedById: actorUserId,
      } as Prisma.PurchaseInvoiceUncheckedUpdateInput,
      select: INVOICE_WITH_LINES,
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'purchases.invoice.cancelled',
      entity: 'PurchaseInvoice',
      entityId: updated.id,
      metadata: {
        invoiceNumber: updated.invoiceNumber,
        status: updated.status,
        reason: dto.reason ?? null,
      },
    });

    await this.auditLogsService.logSuccess({
      companyId,
      actorUserId: actorUserId ?? null,
      category: AuditCategory.PURCHASES,
      event: 'PURCHASE_INVOICE_CANCELLED',
      action: 'CANCEL',
      severity: AuditSeverity.WARNING,
      entityType: 'PurchaseInvoice',
      entityId: updated.id,
      metadata: {
        invoiceNumber: updated.invoiceNumber,
        reason: dto.reason ?? null,
        cancelledAt: updated.cancelledAt
          ? (updated.cancelledAt instanceof Date
              ? updated.cancelledAt.toISOString()
              : String(updated.cancelledAt))
          : null,
      },
    });

    return updated;
  }
}
