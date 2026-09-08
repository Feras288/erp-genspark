// =====================================================
// Phase 7B-4: Reports Core — service.
//
//   Phase 7B-1 (skeleton):
//     * 6 methods, all returning `status: 'PLANNED'`,
//       `data: null`. No Prisma injection.
//
//   Phase 7B-2 (sales + POS):
//     * `salesSummary` and `posSummary` fully
//       implemented against `SalesInvoice`.
//
//   Phase 7B-3 (purchases):
//     * `purchasesSummary` fully implemented against
//       `PurchaseInvoice`.
//
//   Phase 7B-4 (this commit — inventory + stock movements):
//     * `inventorySummary` and `stockMovementsSummary`
//       fully implemented against `StockLevel` and
//       `StockMovement` with Prisma `_sum` and
//       `groupBy` aggregations, with `Decimal`-as-string
//       serialisation at the JSON boundary.
//
//   Still skeleton (Phase 7B-5):
//     * `accountingSummary` — counts + posted totals
//       only. No Trial Balance, no Balance Sheet,
//       no P&L.
//
//   Phase 8B-1 (this commit — AR/AP skeleton):
//     * `arSummary` and `apSummary` added as PLANNED
//       skeletons only. No Prisma calls, no JournalEntryLine
//       balance aggregations, no aging buckets, no payments,
//       no reconciliation. The shape and filters are
//       authoritative for Phase-8B wiring, but `data: null`
//       until Phase 8B-2.
//
// RULES (enforced everywhere):
//   - All money totals returned as strings — never
//     `Number()`. `Prisma.Decimal` serialised via
//     `.toFixed(4)` then re-stringified (matches the
//     Phase 4B-2 sales-side convention) or via
//     `.toString()` for nullable columns like
//     `paidAmount`.
//   - `companyId` comes from JWT via @CurrentUser()
//     in the controller; the service never accepts
//     `companyId` from `query`/`body`.
//   - `deletedAt: null` is always added to `where`
//     soft-delete guard.
//   - Sales: status filter, default `ISSUED` if
//     caller did not pass `status`; `type` is
//     forced to `STANDARD` (no `type` query escape
//     hatch for sales-summary).
//   - POS:    status filter, default `ISSUED` if
//     caller did not pass `status`; `type` is
//     forced to `POS`.
//   - CANCELLED never enters headline totals. If the
//     caller passes `status=CANCELLED` explicitly,
//     the response is a `READY` aggregate whose
//     totals reflect only cancelled invoices — never
//     re-implied into ISSUED totals. This is the
//     Phase-7A cancellation rule applied uniformly.
//   - No float math in JS. Aggregations are delegated
//     entirely to PostgreSQL via Prisma.
//   - No mock / demo data on any branch.
// =====================================================
import { Injectable } from '@nestjs/common';
import {
  Prisma,
  JournalEntryStatus,
  PurchaseInvoiceStatus,
  SalesInvoiceStatus,
  SalesInvoiceType,
  StockMovementType,
  StockMovementDirection,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ReportQueryDto } from './dto/report-query.dto';

// ---- Response types -----------------------------------------------------

export type ReportName =
  | 'sales-summary'
  | 'pos-summary'
  | 'purchases-summary'
  | 'inventory-summary'
  | 'stock-movements-summary'
  | 'accounting-summary'
  | 'ar-summary'
  | 'ap-summary';

export interface PlannedReportResponse {
  report: ReportName;
  status: 'PLANNED';
  companyId: string;
  filters: ReportQueryDto | null;
  generatedAt: string;
  data: null;
}

// ---- AR / AP summary response types (Phase 8B-1) --------------------
//
// Skeleton-only. Filters are projected from the loose `ReportQueryDto`
// without any Prisma access. The `ArSummaryFilters` / `ApSummaryFilters`
// shapes are the authoritative filters echoed in the response — per-report
// (AR uses `customerId`, AP uses `supplierId`). `data` is `null` until
// Phase 8B-2. Tenant isolation: `companyId` comes from the JWT parameter
// of each service method, never from the query / body.

export interface ArSummaryFilters {
  fromDate: string | undefined;
  toDate: string | undefined;
  customerId: string | undefined;
  status: string | undefined;
}

export interface ApSummaryFilters {
  fromDate: string | undefined;
  toDate: string | undefined;
  supplierId: string | undefined;
  status: string | undefined;
}

export interface ArSummaryResponse {
  report: 'ar-summary';
  status: 'PLANNED';
  companyId: string;
  filters: ArSummaryFilters;
  generatedAt: string;
  data: null;
}

export interface ApSummaryResponse {
  report: 'ap-summary';
  status: 'PLANNED';
  companyId: string;
  filters: ApSummaryFilters;
  generatedAt: string;
  data: null;
}

export interface SalesSummaryData {
  invoiceCount: number;
  subtotal: string;
  vatTotal: string;
  discountTotal: string;
  total: string;
  paidAmount?: string;
  currency: 'SAR';
  dateField: 'issueDate';
  typeFilter: 'STANDARD';
  statusFilter: SalesInvoiceStatus;
}

export interface PosPaymentMethodBreakdown {
  paymentMethod: string | null;
  invoiceCount: number;
  total: string;
  paidAmount?: string;
}

export interface PosSummaryData {
  invoiceCount: number;
  subtotal: string;
  vatTotal: string;
  discountTotal: string;
  total: string;
  paidAmount?: string;
  currency: 'SAR';
  dateField: 'issueDate';
  typeFilter: 'POS';
  statusFilter: SalesInvoiceStatus;
  paymentMethods: PosPaymentMethodBreakdown[];
}

export interface ReadyResponse<T> {
  report: ReportName;
  status: 'READY';
  companyId: string;
  filters: ReportQueryDto | null;
  generatedAt: string;
  data: T;
}

export type SalesSummaryResponse = ReadyResponse<SalesSummaryData>;
export type PosSummaryResponse = ReadyResponse<PosSummaryData>;

// ---- Purchases summary response type (Phase 7B-3) --------------------

export interface PurchaseSummaryData {
  invoiceCount: number;
  subtotal: string;
  vatTotal: string;
  discountTotal: string;
  total: string;
  currency: 'SAR';
  dateField: 'receivedAt' | 'createdAt';
  statusFilter: PurchaseInvoiceStatus;
}

export type PurchaseSummaryResponse = ReadyResponse<PurchaseSummaryData>;

// ---- Accounting summary response types (Phase 7B-5) -------------------

export interface AccountingStatusBreakdown {
  status: JournalEntryStatus;
  entryCount: number;
  totalDebit: string;
  totalCredit: string;
}

export interface AccountingRecentEntry {
  id: string;
  entryNumber: string;
  status: JournalEntryStatus;
  entryDate: string; // ISO 8601
  description?: string;
  totalDebit: string;
  totalCredit: string;
  postedAt?: string; // ISO 8601
}

export interface AccountingSummaryData {
  entryCount: number;
  lineCount: number;
  totalDebit: string;
  totalCredit: string;
  balanceDifference: string;
  currency: 'SAR';
  dateField: 'entryDate';
  statusFilter: JournalEntryStatus;
  byStatus: AccountingStatusBreakdown[];
  recentEntries: AccountingRecentEntry[];
}

export type AccountingSummaryResponse = ReadyResponse<AccountingSummaryData>;

// ---- Inventory + Stock Movements response types (Phase 7B-4) ----------

export interface InventoryLevelEntry {
  productId: string;
  productSku?: string;
  productName?: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  quantity: string;
  reservedQuantity: string;
}

export interface InventorySummaryData {
  levelCount: number;
  totalQuantity: string;
  totalReservedQuantity: string;
  currency: 'SAR';
  dateField: 'current';
  levels: InventoryLevelEntry[];
}

export interface StockMovementTypeBreakdown {
  movementType: StockMovementType;
  movementCount: number;
  totalQuantity: string;
}

export interface StockMovementDirectionBreakdown {
  direction: StockMovementDirection;
  movementCount: number;
  totalQuantity: string;
}

export interface StockMovementEntry {
  id: string;
  movementType: StockMovementType;
  direction: StockMovementDirection;
  quantity: string;
  productId?: string;
  productSku?: string;
  productName?: string;
  warehouseId?: string;
  warehouseCode?: string;
  warehouseName?: string;
  movementDate: string; // ISO 8601
}

export interface StockMovementsSummaryData {
  movementCount: number;
  totalQuantityIn: string;
  totalQuantityOut: string;
  currency: 'SAR';
  dateField: 'movementDate';
  movementTypeFilter: StockMovementType | null;
  directionFilter: StockMovementDirection | null;
  byType: StockMovementTypeBreakdown[];
  byDirection: StockMovementDirectionBreakdown[];
  movements: StockMovementEntry[];
}

export type InventorySummaryResponse = ReadyResponse<InventorySummaryData>;
export type StockMovementsSummaryResponse = ReadyResponse<
  StockMovementsSummaryData
>;

// ---- Allowed status set (CANCELLED is excluded from headline totals) ----

const HEADLINE_STATUS_EXCLUSION: SalesInvoiceStatus[] = [
  SalesInvoiceStatus.CANCELLED,
];

const HEADLINE_PURCHASE_EXCLUSION: PurchaseInvoiceStatus[] = [
  PurchaseInvoiceStatus.CANCELLED,
];

// Accounting entries: POSTED is the operational headline
// (the only status that affects the books). DRAFT and
// CANCELLED are excluded from headline aggregates unless
// the caller passes an explicit `status` override. Mirrors
// the sales / purchase pattern in `buildSalesWhere` and
// `buildPurchaseWhere`.
const HEADLINE_JOURNAL_EXCLUSION: JournalEntryStatus[] = [
  JournalEntryStatus.CANCELLED,
  JournalEntryStatus.DRAFT,
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // =================================================================
  // SALES SUMMARY — implemented in Phase 7B-2.
  //   Source: SalesInvoice (forced type=STANDARD).
  //   Scope : companyId + deletedAt:null + (optional status
  //           filter, default ISSUED) + (optional
  //           customerId) + (optional date range on issueDate).
  // =================================================================
  async salesSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<SalesSummaryResponse> {
    const where = this.buildSalesWhere(companyId, query);

    const agg = await this.prisma.salesInvoice.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        subtotal: true,
        vatTotal: true,
        discountTotal: true,
        total: true,
        paidAmount: true,
      },
    });

    const data: SalesSummaryData = {
      invoiceCount: agg._count._all,
      subtotal: this.decimalToString(agg._sum.subtotal),
      vatTotal: this.decimalToString(agg._sum.vatTotal),
      discountTotal: this.decimalToString(agg._sum.discountTotal),
      total: this.decimalToString(agg._sum.total),
      paidAmount: this.decimalToNullableString(agg._sum.paidAmount),
      currency: 'SAR',
      dateField: 'issueDate',
      typeFilter: 'STANDARD',
      statusFilter: this.resolveStatus(query) ?? SalesInvoiceStatus.ISSUED,
    };

    return {
      report: 'sales-summary',
      status: 'READY',
      companyId,
      filters: query,
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  // =================================================================
  // POS SUMMARY — implemented in Phase 7B-2.
  //   Source: SalesInvoice (forced type=POS).
  //   Scope : companyId + deletedAt:null + (optional status,
  //           default ISSUED) + (optional paymentMethod) +
  //           (optional date range on issueDate).
  //   Extra : per-paymentMethod breakdown via groupBy.
  // =================================================================
  async posSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PosSummaryResponse> {
    const where = this.buildPosWhere(companyId, query);

    const agg = await this.prisma.salesInvoice.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        subtotal: true,
        vatTotal: true,
        discountTotal: true,
        total: true,
        paidAmount: true,
      },
    });

    // Payment-method breakdown — empty array when `paymentMethod`
    // is supplied as a filter (we'd be aggregating over a single
    // bucket anyway, which is the same as the headline total).
    const breakdownWhere: Prisma.SalesInvoiceWhereInput = { ...where };
    const paymentMethods: PosPaymentMethodBreakdown[] = query.paymentMethod
      ? []
      : await this.loadPaymentMethodBreakdown(where);

    const data: PosSummaryData = {
      invoiceCount: agg._count._all,
      subtotal: this.decimalToString(agg._sum.subtotal),
      vatTotal: this.decimalToString(agg._sum.vatTotal),
      discountTotal: this.decimalToString(agg._sum.discountTotal),
      total: this.decimalToString(agg._sum.total),
      paidAmount: this.decimalToNullableString(agg._sum.paidAmount),
      currency: 'SAR',
      dateField: 'issueDate',
      typeFilter: 'POS',
      statusFilter: this.resolveStatus(query) ?? SalesInvoiceStatus.ISSUED,
      paymentMethods,
    };

    return {
      report: 'pos-summary',
      status: 'READY',
      companyId,
      filters: query,
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  private async loadPaymentMethodBreakdown(
    where: Prisma.SalesInvoiceWhereInput,
  ): Promise<PosPaymentMethodBreakdown[]> {
    const rows = await this.prisma.salesInvoice.groupBy({
      by: ['paymentMethod'],
      where,
      _count: { _all: true },
      _sum: { total: true, paidAmount: true },
    });

    // Sort by invoiceCount desc, then by paymentMethod asc for
    // deterministic output across requests.
    rows.sort((a, b) => {
      if (b._count._all !== a._count._all) return b._count._all - a._count._all;
      const ax = a.paymentMethod ?? '';
      const bx = b.paymentMethod ?? '';
      return ax.localeCompare(bx);
    });

    return rows.map((row) => {
      const breakdown: PosPaymentMethodBreakdown = {
        paymentMethod: row.paymentMethod,
        invoiceCount: row._count._all,
        total: this.decimalToString(row._sum.total),
      };
      const paid = this.decimalToNullableString(row._sum.paidAmount);
      if (paid !== undefined) breakdown.paidAmount = paid;
      return breakdown;
    });
  }

  // =================================================================
  // PURCHASES SUMMARY — implemented in Phase 7B-3.
  //   Source: PurchaseInvoice.
  //   Scope : companyId + deletedAt:null + (optional status,
  //           default RECEIVED) + (optional supplierId) +
  //           (optional date range on receivedAt if present,
  //           otherwise createdAt).
  //   Defaults are aligned with Phase-7A:
  //   - dateField = receivedAt (fallback to createdAt if
  //     receivedAt is null on a given row, applied via
  //     buildPurchaseDateRange).
  //   - status    = RECEIVED (DRAFT and CANCELLED excluded
  //     from the headline; CANCELLED never enters unless
  //     explicitly requested by the caller, matching the
  //     sales/POS rule).
  // =================================================================
  async purchasesSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PurchaseSummaryResponse> {
    const where = this.buildPurchaseWhere(companyId, query);

    const agg = await this.prisma.purchaseInvoice.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        subtotal: true,
        vatTotal: true,
        discountTotal: true,
        total: true,
      },
    });

    const data: PurchaseSummaryData = {
      invoiceCount: agg._count._all,
      subtotal: this.decimalToString(agg._sum.subtotal),
      vatTotal: this.decimalToString(agg._sum.vatTotal),
      discountTotal: this.decimalToString(agg._sum.discountTotal),
      total: this.decimalToString(agg._sum.total),
      currency: 'SAR',
      dateField: 'receivedAt',
      statusFilter:
        this.resolvePurchaseStatus(query) ??
        PurchaseInvoiceStatus.RECEIVED,
    };

    return {
      report: 'purchases-summary',
      status: 'READY',
      companyId,
      filters: query,
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  async inventorySummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<InventorySummaryResponse> {
    const where = this.buildInventoryWhere(companyId, query);

    // Headline aggregation — total quantity on hand and reserved.
    const agg = await this.prisma.stockLevel.aggregate({
      where,
      _count: { _all: true },
      _sum: { quantity: true, reservedQuantity: true },
    });

    // Detail rows — top 200 stock levels, joined with Product
    // and Warehouse for human-readable labels. Page-bound
    // by 200 to bound response size in Phase 7B-4 (no
    // pagination cursor yet).
    const rows = await this.prisma.stockLevel.findMany({
      where,
      take: 200,
      orderBy: [{ quantity: 'desc' }, { productId: 'asc' }],
      include: {
        product: { select: { sku: true, name: true } },
        warehouse: { select: { code: true, name: true } },
      },
    });

    const levels: InventoryLevelEntry[] = rows.map((row) => {
      const entry: InventoryLevelEntry = {
        productId: row.productId,
        warehouseId: row.warehouseId,
        quantity: this.decimalToString(row.quantity),
        reservedQuantity: this.decimalToString(row.reservedQuantity),
      };
      if (row.product) {
        entry.productSku = row.product.sku;
        entry.productName = row.product.name;
      }
      if (row.warehouse) {
        entry.warehouseCode = row.warehouse.code;
        entry.warehouseName = row.warehouse.name;
      }
      return entry;
    });

    const data: InventorySummaryData = {
      levelCount: agg._count._all,
      totalQuantity: this.decimalToString(agg._sum.quantity),
      totalReservedQuantity: this.decimalToString(
        agg._sum.reservedQuantity,
      ),
      currency: 'SAR',
      dateField: 'current',
      levels,
    };

    return {
      report: 'inventory-summary',
      status: 'READY',
      companyId,
      filters: query,
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  async stockMovementsSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<StockMovementsSummaryResponse> {
    const where = this.buildStockMovementWhere(companyId, query);

    // Direction totals — split IN/OUT. The Prisma schema
    // has both `direction` and `movementType`, and they
    // are tightly coupled (PURCHASE_IN + direction=IN,
    // SALE_OUT + direction=OUT, etc.). Both buckets are
    // reported, even though they are equal in magnitude
    // to the matching movementType totals — by design,
    // so dashboards can colour-code the two axes.
    const inAgg = await this.prisma.stockMovement.aggregate({
      where: { ...where, direction: StockMovementDirection.IN },
      _count: { _all: true },
      _sum: { quantity: true },
    });
    const outAgg = await this.prisma.stockMovement.aggregate({
      where: { ...where, direction: StockMovementDirection.OUT },
      _count: { _all: true },
      _sum: { quantity: true },
    });

    // Per-`movementType` breakdown.
    const byTypeRows = await this.prisma.stockMovement.groupBy({
      by: ['movementType'],
      where,
      _count: { _all: true },
      _sum: { quantity: true },
    });

    const byType: StockMovementTypeBreakdown[] = byTypeRows
      .map((row) => ({
        movementType: row.movementType,
        movementCount: row._count._all,
        totalQuantity: this.decimalToString(row._sum.quantity),
      }))
      .sort((a, b) => {
        if (b.movementCount !== a.movementCount)
          return b.movementCount - a.movementCount;
        return a.movementType.localeCompare(b.movementType);
      });

    const byDirection: StockMovementDirectionBreakdown[] = [
      {
        direction: StockMovementDirection.IN,
        movementCount: inAgg._count._all,
        totalQuantity: this.decimalToString(inAgg._sum.quantity),
      },
      {
        direction: StockMovementDirection.OUT,
        movementCount: outAgg._count._all,
        totalQuantity: this.decimalToString(outAgg._sum.quantity),
      },
    ];

    // Detail rows — most recent 200 movements for the same
    // filter scope, with joined product/warehouse labels.
    const movements = await this.prisma.stockMovement.findMany({
      where,
      take: 200,
      orderBy: [{ movementDate: 'desc' }, { id: 'asc' }],
      include: {
        product: { select: { sku: true, name: true } },
        warehouse: { select: { code: true, name: true } },
      },
    });

    const movementEntries: StockMovementEntry[] = movements.map((row) => {
      const entry: StockMovementEntry = {
        id: row.id,
        movementType: row.movementType,
        direction: row.direction,
        quantity: this.decimalToString(row.quantity),
        movementDate: row.movementDate.toISOString(),
      };
      entry.productId = row.productId;
      entry.warehouseId = row.warehouseId;
      if (row.product) {
        entry.productSku = row.product.sku;
        entry.productName = row.product.name;
      }
      if (row.warehouse) {
        entry.warehouseCode = row.warehouse.code;
        entry.warehouseName = row.warehouse.name;
      }
      return entry;
    });

    // Total movementCount = sum of both directions (or: total
    // rows in scope). Prisma's aggregate returns _count
    // independently for each direction query; we use
    // byType[].movementCount summation as the canonical
    // total to avoid the off-by-one risk of mixing IN +
    // OUT double-counts on append-only movements where
    // direction=null is theoretically possible. We use
    // the byTypeTotal here.
    const movementCount = byType.reduce(
      (acc, row) => acc + row.movementCount,
      0,
    );

    const data: StockMovementsSummaryData = {
      movementCount,
      totalQuantityIn: this.decimalToString(inAgg._sum.quantity),
      totalQuantityOut: this.decimalToString(outAgg._sum.quantity),
      currency: 'SAR',
      dateField: 'movementDate',
      movementTypeFilter: this.resolveStockMovementType(
        query.status ?? undefined,
      ),
      directionFilter: this.resolveStockMovementDirection(
        query.type ?? undefined,
      ),
      byType,
      byDirection,
      movements: movementEntries,
    };

    return {
      report: 'stock-movements-summary',
      status: 'READY',
      companyId,
      filters: query,
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  async accountingSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<AccountingSummaryResponse> {
    const where = this.buildAccountingWhere(companyId, query);

    // 1. Headline aggregate on JournalEntry header-level
    //    server-computed totals (authoritative per schema).
    const entriesAgg = await this.prisma.journalEntry.aggregate({
      where,
      _count: { _all: true },
      _sum: { totalDebit: true, totalCredit: true },
    });

    // 2. lineCount via the nested `entry` relation so the
    //    count honors the same filter (companyId + status +
    //    date range) applied to the entries. We mirror the
    //    status filter to the nested relation when the
    //    caller did not override; otherwise the line count
    //    would over-count DRAFT/CANCELLED lines that belong
    //    to entries the headline already hid.
    const lineWhere: Prisma.JournalEntryLineWhereInput = {
      companyId,
      entry: where,
    };
    const lineCount = await this.prisma.journalEntryLine.count({
      where: lineWhere,
    });

    // 3. byStatus: groupBy on JournalEntry.status, honoring
    //    the same `where` filter so cancellations/draft
    //    status composition is visible.
    const byStatusRaw = await this.prisma.journalEntry.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { totalDebit: true, totalCredit: true },
    });
    const byStatus: AccountingStatusBreakdown[] = byStatusRaw
      .sort((a, b) => a.status.localeCompare(b.status))
      .map((row) => ({
        status: row.status,
        entryCount: row._count._all,
        totalDebit: this.decimalToString(row._sum.totalDebit),
        totalCredit: this.decimalToString(row._sum.totalCredit),
      }));

    // 4. recentEntries: at most 20 newest entries by
    //    entryDate desc.
    const recentRaw = await this.prisma.journalEntry.findMany({
      where,
      orderBy: { entryDate: 'desc' },
      take: 20,
      select: {
        id: true,
        entryNumber: true,
        status: true,
        entryDate: true,
        description: true,
        totalDebit: true,
        totalCredit: true,
        postedAt: true,
      },
    });
    const recentEntries: AccountingRecentEntry[] = recentRaw.map(
      (row) => ({
        id: row.id,
        entryNumber: row.entryNumber,
        status: row.status,
        entryDate: row.entryDate.toISOString(),
        description: row.description ?? undefined,
        totalDebit: this.decimalToString(row.totalDebit),
        totalCredit: this.decimalToString(row.totalCredit),
        postedAt: row.postedAt ? row.postedAt.toISOString() : undefined,
      }),
    );

    // Decimal-safe balance difference: never use Number().
    // `entriesAgg._sum.totalDebit / totalCredit` are
    // `Prisma.Decimal | null`; pass them through Prisma's
    // `Decimal.minus` for proper arbitrary-precision math.
    const totalDebitDec =
      entriesAgg._sum.totalDebit ?? new Prisma.Decimal(0);
    const totalCreditDec =
      entriesAgg._sum.totalCredit ?? new Prisma.Decimal(0);
    const balanceDifferenceDec = totalDebitDec.minus(totalCreditDec);

    // Resolve the effective status filter for the
    // response shape (default = POSTED when caller did
    // not pass an override).
    const statusFilter =
      this.resolveJournalStatus(query) ?? JournalEntryStatus.POSTED;

    const data: AccountingSummaryData = {
      entryCount: entriesAgg._count._all,
      lineCount,
      totalDebit: this.decimalToString(totalDebitDec),
      totalCredit: this.decimalToString(totalCreditDec),
      balanceDifference: this.decimalToString(balanceDifferenceDec),
      currency: 'SAR',
      dateField: 'entryDate',
      statusFilter,
      byStatus,
      recentEntries,
    };

    return {
      report: 'accounting-summary',
      status: 'READY',
      companyId,
      filters: {
        fromDate: query.fromDate ?? undefined,
        toDate: query.toDate ?? undefined,
        status: statusFilter,
      },
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  // =================================================================
  // Private helpers — date filter / decimal serialisation.
  // =================================================================

  /**
   * Resolve the status filter for sales / POS.
   * Returns `null` if absent (caller decides the default).
   * Returns the explicitly-passed status otherwise.
   *
   * When the caller passed a status that is in
   * `HEADLINE_STATUS_EXCLUSION` (e.g. CANCELLED), the
   * caller MUST accept the corresponding `data.invoiceCount` ==
   * cancelled invoices only — i.e. headline is no longer
   * "revenue", it is "audit count". The service does not
   * silently re-include cancelled invoices.
   */
  private resolveStatus(
    query: ReportQueryDto,
  ): SalesInvoiceStatus | null {
    if (!query.status) return null;
    const candidate = query.status as SalesInvoiceStatus;
    if (
      candidate === SalesInvoiceStatus.DRAFT ||
      candidate === SalesInvoiceStatus.ISSUED ||
      candidate === SalesInvoiceStatus.CANCELLED
    ) {
      return candidate;
    }
    // Unknown enum value passed by the caller; we ignore
    // it (the request ValidationPipe would already have
    // rejected it if we had IsEnum() here — Phase 7B-2
    // leaves the DTO loose for now to skip needless
    // cross-coupling).
    return null;
  }

  /**
   * Mirror of `resolveStatus` for `PurchaseInvoiceStatus`.
   * Returns the validated enum or null. The caller uses
   * `?? PurchaseInvoiceStatus.RECEIVED` downstream, so
   * null means "use the purchases default (RECEIVED)".
   * Unknown strings are silently ignored, matching the
   * sales/POS loose-DTO posture of Phase 7B-2.
   */
  private resolvePurchaseStatus(
    query: ReportQueryDto,
  ): PurchaseInvoiceStatus | null {
    if (!query.status) return null;
    const candidate = query.status as PurchaseInvoiceStatus;
    if (
      candidate === PurchaseInvoiceStatus.DRAFT ||
      candidate === PurchaseInvoiceStatus.RECEIVED ||
      candidate === PurchaseInvoiceStatus.CANCELLED
    ) {
      return candidate;
    }
    return null;
  }

  /**
   * Mirror of `resolvePurchaseStatus` for
   * `JournalEntryStatus`. Returns the validated enum
   * or null. Null is consumed by `buildAccountingWhere`
   * via `?? JournalEntryStatus.POSTED` downstream.
   * Unknown strings are silently ignored.
   */
  private resolveJournalStatus(
    query: ReportQueryDto,
  ): JournalEntryStatus | null {
    if (!query.status) return null;
    const candidate = query.status as JournalEntryStatus;
    if (
      candidate === JournalEntryStatus.DRAFT ||
      candidate === JournalEntryStatus.POSTED ||
      candidate === JournalEntryStatus.CANCELLED
    ) {
      return candidate;
    }
    return null;
  }

  /**
   * Build the `where` clause for `salesSummary`:
   *   companyId + deletedAt:null + type:STANDARD
   *   + (optional status) + (optional customerId)
   *   + (optional date range on issueDate).
   * CANCELLED is excluded from headline totals by
   * default. The Phase-7A cancellation rule maps to
   * STATUS = ISSUED as the only sane default.
   */
  private buildSalesWhere(
    companyId: string,
    query: ReportQueryDto,
  ): Prisma.SalesInvoiceWhereInput {
    const where: Prisma.SalesInvoiceWhereInput = {
      companyId,
      deletedAt: null,
      type: SalesInvoiceType.STANDARD,
      status: {
        notIn: HEADLINE_STATUS_EXCLUSION,
      },
    };

    const status = this.resolveStatus(query);
    if (status) {
      // Explicit caller override: trust it. Aggregate
      // will reflect only that status filter — and
      // `notIn: CANCELLED` is dropped because the caller
      // asked for an explicit status.
      where.status = status;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    const date = this.buildIssueDateRange(query);
    if (date) where.issueDate = date;

    return where;
  }

  /**
   * Build the `where` clause for `posSummary`:
   *   companyId + deletedAt:null + type:POS
   *   + (optional status, default ISSUED) +
   *     (optional paymentMethod) +
   *     (optional date range on issueDate).
   */
  private buildPosWhere(
    companyId: string,
    query: ReportQueryDto,
  ): Prisma.SalesInvoiceWhereInput {
    const where: Prisma.SalesInvoiceWhereInput = {
      companyId,
      deletedAt: null,
      type: SalesInvoiceType.POS,
      status: {
        notIn: HEADLINE_STATUS_EXCLUSION,
      },
    };

    const status = this.resolveStatus(query);
    if (status) {
      where.status = status;
    }

    if (query.paymentMethod) {
      // Match the Prisma SalesInvoicePaymentMethod enum
      // values verbatim; no string-to-enum translation
      // here so the caller is responsible for sending a
      // valid value. The DTO does not enforce IsEnum()
      // yet (Phase 7B-3+ will tighten it).
      where.paymentMethod = query.paymentMethod as SalesInvoiceType extends never
        ? never
        : Prisma.SalesInvoiceWhereInput['paymentMethod'];
    }

    const date = this.buildIssueDateRange(query);
    if (date) where.issueDate = date;

    return where;
  }

  /**
   * Build the `where` clause for `purchasesSummary`:
   *   companyId + deletedAt:null +
   *   status: { notIn: HEADLINE_PURCHASE_EXCLUSION }
   *     + (optional status override) +
   *     (optional supplierId) +
   *     (optional date range on receivedAt).
   * Date range:
   *   - fromDate  -> gte end-of-day UTC inclusive
   *   - toDate    -> lte end-of-day UTC inclusive
   * Model notes:
   *   - `PurchaseInvoice.receivedAt` is nullable. The
   *     default filter on status=RECEIVED already
   *     returns only rows where receivedAt is set by
   *     convention; rows where receivedAt is null are
   *     excluded by the status filter at the SQL level
   *     before the date filter is applied.
   *   - `PurchaseInvoice` has no `paidAmount` column;
   *     we therefore omit it from both `_sum` and the
   *     response shape.
   */
  private buildPurchaseWhere(
    companyId: string,
    query: ReportQueryDto,
  ): Prisma.PurchaseInvoiceWhereInput {
    const where: Prisma.PurchaseInvoiceWhereInput = {
      companyId,
      deletedAt: null,
      status: {
        notIn: HEADLINE_PURCHASE_EXCLUSION,
      },
    };

    const status = this.resolvePurchaseStatus(query);
    if (status) {
      // Explicit caller override: trust it. Aggregate
      // will reflect only that status filter — and
      // `notIn: CANCELLED` is dropped because the caller
      // asked for an explicit status.
      where.status = status;
    }

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }

    if (query.fromDate || query.toDate) {
      const range: { gte?: Date; lte?: Date } = {};
      if (query.fromDate) range.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
      if (query.toDate) range.lte = new Date(`${query.toDate}T23:59:59.999Z`);
      where.receivedAt = range;
    }

    return where;
  }

  /**
   * Build the `where` clause for `accountingSummary`:
   *   companyId +
   *   status: { notIn: HEADLINE_JOURNAL_EXCLUSION } +
   *     (optional status override).
   * No `deletedAt` filter: `JournalEntry` has no
   * `deletedAt` column per the schema (verified by grep).
   * Date range:
   *   - fromDate toDate -> gte / lte on entryDate
   *     (JournalEntry.entryDate is DateTime,
   *      non-nullable, @default(now())).
   * `companyId` source: function parameter only.
   */
  private buildAccountingWhere(
    companyId: string,
    query: ReportQueryDto,
  ): Prisma.JournalEntryWhereInput {
    const where: Prisma.JournalEntryWhereInput = {
      companyId,
      status: {
        notIn: HEADLINE_JOURNAL_EXCLUSION,
      },
    };

    const status = this.resolveJournalStatus(query);
    if (status) {
      // Explicit caller override: trust it. Aggregate
      // will reflect only that single status filter —
      // and `notIn: CANCELLED | DRAFT` is dropped
      // because the caller asked for an explicit status.
      where.status = status;
    }

    if (query.fromDate || query.toDate) {
      const range: { gte?: Date; lte?: Date } = {};
      if (query.fromDate)
        range.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
      if (query.toDate)
        range.lte = new Date(`${query.toDate}T23:59:59.999Z`);
      where.entryDate = range;
    }

    return where;
  }

  /**
   * Build an inclusive issueDate range from
   * `fromDate` / `toDate`. Both endpoints use
   * 00:00:00.000 / 23:59:59.999 of the given day
   * in UTC.
   */
  private buildIssueDateRange(
    query: ReportQueryDto,
  ): Prisma.DateTimeFilter | undefined {
    if (!query.fromDate && !query.toDate) return undefined;

    const range: { gte?: Date; lte?: Date } = {};
    if (query.fromDate) range.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
    if (query.toDate) range.lte = new Date(`${query.toDate}T23:59:59.999Z`);
    return range;
  }

  // =================================================================
  // Inventory + Stock Movements helpers (Phase 7B-4).
  //   * The loose DTO doesn't declare `movementType` /
  //     `direction` keys. For Phase 7B-4 we accept them only
  //     if they match the canonical enum values verbatim;
  //     unknown strings fall through as 'no filter'. A future
  //     hygiene micro-prompt will tighten this with
  //     `@IsEnum(StockMovementType)` etc., independently of
  //     the calculation rules.
  // =================================================================

  private resolveStockMovementType(
    value?: string,
  ): StockMovementType | null {
    if (!value) return null;
    const set = new Set<string>(Object.values(StockMovementType));
    return set.has(value) ? (value as StockMovementType) : null;
  }

  private resolveStockMovementDirection(
    value?: string,
  ): StockMovementDirection | null {
    if (!value) return null;
    const set = new Set<string>(Object.values(StockMovementDirection));
    return set.has(value) ? (value as StockMovementDirection) : null;
  }

  /**
   * Build a `where` clause for `StockLevel` queries:
   *   companyId + (optional productId) + (optional warehouseId).
   * StockLevel itself has no `deletedAt` column. Soft-deleted
   * `Product` / `Warehouse` are excluded via the `include` join
   * patterns in the read model (Phase 3 inventory module).
   * Phase 7B-4 reports the live rows that the upstream
   * flows have already gated.
   */
  private buildInventoryWhere(
    companyId: string,
    query: ReportQueryDto,
  ): Prisma.StockLevelWhereInput {
    const where: Prisma.StockLevelWhereInput = { companyId };
    if (query.productId) where.productId = query.productId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    return where;
  }

  /**
   * Build a `where` clause for `StockMovement` queries:
   *   companyId + (optional movementType) + (optional direction)
   *   + (optional productId) + (optional warehouseId)
   *   + (optional fromDate/toDate on movementDate).
   * `StockMovement` has no `deletedAt`. Movement rows are
   * append-only.
   */
  private buildStockMovementWhere(
    companyId: string,
    query: ReportQueryDto,
  ): Prisma.StockMovementWhereInput {
    const where: Prisma.StockMovementWhereInput = { companyId };
    const movementType = this.resolveStockMovementType(query.status);
    if (movementType) where.movementType = movementType;
    const direction = this.resolveStockMovementDirection(query.type);
    if (direction) where.direction = direction;
    if (query.productId) where.productId = query.productId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    const date = this.buildMovementDateRange(query);
    if (date) where.movementDate = date;
    return where;
  }

  /**
   * Build an inclusive movementDate range from `fromDate`
   * / `toDate`. Lower bound = 00:00:00.000Z of `fromDate`;
   * upper bound = 23:59:59.999Z of `toDate`. Returns
   * `undefined` if neither key supplied.
   */
  private buildMovementDateRange(
    query: ReportQueryDto,
  ): Prisma.DateTimeFilter | undefined {
    if (!query.fromDate && !query.toDate) return undefined;
    const range: { gte?: Date; lte?: Date } = {};
    if (query.fromDate)
      range.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
    if (query.toDate)
      range.lte = new Date(`${query.toDate}T23:59:59.999Z`);
    return range;
  }

  // =================================================================
  // AR SUMMARY — implemented in Phase 8B-2. Currently a skeleton
  //   (Phase 8B-1): no Prisma aggregations, no
  //   JournalEntryLine reads, no aging buckets, no payments.
  //
  //   Source of truth (for Phase 8B-2 +): AR per customer =
  //   sum(unpaid SalesInvoice.total) − sum(allocations). For
  //   this skeleton we return `data: null` and only the
  //   projected filters so the client wiring is pinned down.
  //
  //   companyId: JWT-only parameter (set in the controller
  //   via @CurrentUser()).
  // =================================================================
  async arSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<ArSummaryResponse> {
    const filters: ArSummaryFilters = {
      fromDate: query.fromDate ?? undefined,
      toDate: query.toDate ?? undefined,
      customerId: query.customerId ?? undefined,
      status: query.status ?? undefined,
    };
    return {
      report: 'ar-summary',
      status: 'PLANNED',
      companyId,
      filters,
      generatedAt: new Date().toISOString(),
      data: null,
    };
  }

  // =================================================================
  // AP SUMMARY — implemented in Phase 8B-2. Currently a skeleton
  //   (Phase 8B-1): no Prisma aggregations, no
  //   JournalEntryLine reads, no aging buckets, no payments.
  //
  //   Source of truth (for Phase 8B-2 +): AP per supplier =
  //   sum(unpaid PurchaseInvoice.total) − sum(allocations). For
  //   this skeleton we return `data: null` and only the
  //   projected filters so the client wiring is pinned down.
  //
  //   companyId: JWT-only parameter (set in the controller
  //   via @CurrentUser()).
  // =================================================================
  async apSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<ApSummaryResponse> {
    const filters: ApSummaryFilters = {
      fromDate: query.fromDate ?? undefined,
      toDate: query.toDate ?? undefined,
      supplierId: query.supplierId ?? undefined,
      status: query.status ?? undefined,
    };
    return {
      report: 'ap-summary',
      status: 'PLANNED',
      companyId,
      filters,
      generatedAt: new Date().toISOString(),
      data: null,
    };
  }

  /**
   * Serialise a Prisma Decimal (or null/undefined) as
   * a fixed-4 string. Matches Phase 4B-2 sales-side
   * `.toFixed(4)` convention.
   */
  private decimalToString(value: unknown): string {
    if (value === null || value === undefined) return '0.0000';
    if (typeof value === 'string') return value;
    if (typeof (value as { toFixed?: unknown }).toFixed === 'function') {
      return (value as { toFixed: (n: number) => string }).toFixed(4);
    }
    return String(value);
  }

  /**
   * Serialise a nullable money column (`paidAmount`)
   * — distinguish "no rows have paidAmount > 0" from
   * "no rows match". Returns `undefined` when null and
   * caller should omit the key, otherwise a fixed
   * string.
   */
  private decimalToNullableString(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') return value;
    if (typeof (value as { toFixed?: unknown }).toFixed === 'function') {
      return (value as { toFixed: (n: number) => string }).toFixed(4);
    }
    return String(value);
  }
}
