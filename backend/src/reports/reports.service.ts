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
//   Phase 8B-2 (this commit — AR/AP calculations):
//     * `arSummary` and `apSummary` converted to READY.
//       AR uses SalesInvoice (all types) with the same
//       `HEADLINE_STATUS_EXCLUSION` and date range rule as
//       `salesSummary` (issueDate-based). AP uses
//       PurchaseInvoice with the same pattern as
//       `purchasesSummary` (receivedAt-based, no
//       paidAmount). Both expose:
//         - invoiceCount + subtotal/vatTotal/discountTotal/
//           total aggregates (Decimal-as-string)
//         - byStatus breakdown via `groupBy`
//         - recentInvoices: top 20 newest rows with
//           partner labels (customer / supplier codes//
//           + names)
//     * NOT in scope (still PLANNED/future):
//         - aging buckets (0–30 / 31–60 / 61–90 / 90+)
//         - payments / receipts / settlements
//         - bank reconciliation
//         - AR/AP ledger sub-accounts
//         - per-customer / per-supplier balance breakdown
//
//   Phase 9B-1 (this commit — AR aging skeleton):
//     * `arAging` added as PLANNED skeleton only.
//       No Prisma calls. The method body returns
//       `status: 'PLANNED'`, `data: null`. Real
//       bucket math (current / 1-30 / 31-60 / 61-90 / +90)
//       and per-customer breakdown land in Phase 9B-2
//       inside the same method body. Response shape
//       `ArAgingResponse` (READY leg) and union
//       `ArAgingResponseOrPlanned` are already locked.
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
import { Injectable, BadRequestException } from '@nestjs/common';
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
  | 'ap-summary'
  | 'ar-aging'
  | 'ap-aging';

export interface PlannedReportResponse {
  report: ReportName;
  status: 'PLANNED';
  companyId: string;
  filters: ReportQueryDto | null;
  generatedAt: string;
  data: null;
}

// ---- AR / AP summary response types (Phase 8B-1/8B-2) ---------------
//
//   Phase 8B-1 added the PLANNED skeletons. Phase 8B-2
//   converts them to READY responses with the data shapes
//   below. Filters are projected from the loose
//   `ReportQueryDto` without any Prisma access and are
//   emitted as `{ fromDate, toDate, ...Id, status }` with
//   explicit `null` for unset keys (matches the response
//   contract requested by the caller). Tenant isolation:
//   `companyId` comes from the JWT parameter of each
//   service method, never from the query / body.

export interface ArSummaryFilters {
  fromDate: string | null;
  toDate: string | null;
  customerId: string | null;
  status: string | null;
}

export interface ApSummaryFilters {
  fromDate: string | null;
  toDate: string | null;
  supplierId: string | null;
  status: string | null;
}

// ---- AR Aging response types (Phase 9B-1) -------------------------
//
//   Bucket key ring matches the 9B-2 calculation:
//     'current' = daysPastDue <= 0
//     '1-30'    = 1 <= daysPastDue <= 30
//     '31-60'   = 31 <= daysPastDue <= 60
//     '61-90'   = 61 <= daysPastDue <= 90
//     '+90'     = 91 <= daysPastDue (treated as +infinity)
//   per-customer breakdown lands in 9B-2.
// --------------------------------------------------------------------
export type ArAgingBucketKey =
  | 'current'
  | '1-30'
  | '31-60'
  | '61-90'
  | '+90';

export interface ArAgingFilters {
  fromDate: string | null;
  toDate: string | null;
  customerId: string | null;
  status: string | null;
  asOfDate: string;
}

export interface ArAgingBucketCounts {
  invoiceCount: number;
}

export interface ArAgingBucketOutstanding {
  outstanding: string;
}

export interface ArAgingBucket
  extends ArAgingBucketCounts,
    ArAgingBucketOutstanding {}

export interface ArAgingCustomerRow {
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  total: string;
  paid: string;
  outstanding: string;
  buckets: Record<ArAgingBucketKey, ArAgingBucket>;
}

export interface ArAgingByCustomer {
  rows: ArAgingCustomerRow[];
}

export interface ArAgingData {
  currency: 'SAR';
  dateField: 'dueDate';
  statusFilter: 'ISSUED';
  buckets: Record<ArAgingBucketKey, ArAgingBucket>;
  totals: Omit<ArAgingBucket, 'invoiceCount'> & {
    invoiceCount: number;
  };
  byCustomer: ArAgingByCustomer;
}

export type ArAgingResponse = Omit<ReadyResponse<ArAgingData>, 'filters'> & {
  filters: ArAgingFilters;
};

// 'PLANNED' leg for the 9B-1 skeleton. 9B-2 replaces the
// branch entry by re-typing this as
//   ArAgingResponse | ArAgingPlannedResponse
// once the buckets are filled.
export interface ArAgingPlannedResponse {
  report: 'ar-aging';
  status: 'PLANNED';
  companyId: string;
  filters: ArAgingFilters;
  generatedAt: string;
  data: null;
}

export type ArAgingResponseOrPlanned =
  | ArAgingResponse
  | ArAgingPlannedResponse;

// --------------------------------------------------------------------
// AP Aging (Phase 9E-B-1 skeleton only)
//
//   * Skeleton only in 9E-B-1: full implementation lands in 9E-B-2.
//   * Mirrors `ArAgingBucketKey` (same 5 buckets: current / 1-30 /
//     31-60 / 61-90 / +90).
//   * `bySupplier` not `byCustomer` — `PurchaseInvoice` is on the
//     `supplierId` axis.
//   * `PurchaseInvoice.paidAmount` does NOT exist (verified in
//     `backend/prisma/schema.prisma`, `model PurchaseInvoice`
//     lines 507-545: the column was intentionally OMITTED in
//     7B-3 / 8B-2 — AP has no payment/settlement table yet).
//     Therefore `outstanding = total` always on this side; the
//     `safeOutstanding` helper from AR is NOT imported here.
//     Computed in 9E-B-2.
//   * Hard-locked `status` is `'RECEIVED'` (mirrors AR's lock to
//     `'ISSUED'`); the DTO's `status` query param is accepted but
//     not surfaced in the response for 9E-B-1.
//   * `dateField` is `'receivedAt'`; fallback chain is
//     `receivedAt ?? dueDate ?? createdAt` — implemented in 9E-B-2.
// ----------------------------------------------------------------------

export type ApAgingBucketKey = 'current' | '1-30' | '31-60' | '61-90' | '+90';

export interface ApAgingFilters {
  fromDate: string | null;
  toDate: string | null;
  supplierId: string | null;
  status: string | null;
  asOfDate: string;
}

export interface ApAgingBucket {
  invoiceCount: number;
  outstanding: string;
}

export interface ApAgingSupplierRow {
  supplierId: string;
  supplierCode: string | null;
  supplierName: string | null;
  total: string;
  outstanding: string;
  buckets: Record<ApAgingBucketKey, ApAgingBucket>;
}

export interface ApAgingBySupplier {
  rows: ApAgingSupplierRow[];
}

export interface ApAgingData {
  currency: 'SAR';
  dateField: 'receivedAt';
  statusFilter: 'RECEIVED';
  buckets: Record<ApAgingBucketKey, ApAgingBucket>;
  totals: { invoiceCount: number; outstanding: string };
  bySupplier: ApAgingBySupplier;
}

export type ApAgingResponse = Omit<ReadyResponse<ApAgingData>, 'filters'> & {
  filters: ApAgingFilters;
};

export interface ApAgingPlannedResponse {
  report: 'ap-aging';
  status: 'PLANNED';
  companyId: string;
  filters: ApAgingFilters;
  generatedAt: string;
  data: null;
}

export type ApAgingResponseOrPlanned =
  | ApAgingResponse
  | ApAgingPlannedResponse;

// ---- AR data shapes (Phase 8B-2) ----------------------------------
//   Backed by SalesInvoice — invoice-level aggregates + status
//   groupBy + 20 most recent invoices with customer labels.
//   DOES NOT compute outstanding / aging / payments: this is
//   invoiced receivables only. `paidAmount` is included as an
//   optional field because `SalesInvoice.paidAmount` exists
//   (`Decimal? @db.Decimal(18,4)`); for aggregates with no
//   paid invoices, the key is omitted via `decimalToNullableString`.

export interface ArStatusBreakdown {
  status: SalesInvoiceStatus;
  invoiceCount: number;
  subtotal: string;
  vatTotal: string;
  discountTotal: string;
  total: string;
  paidAmount?: string;
}

export interface ArRecentInvoice {
  id: string;
  invoiceNumber: string;
  status: SalesInvoiceStatus;
  issueDate: string; // ISO 8601
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  subtotal: string;
  vatTotal: string;
  discountTotal: string;
  total: string;
  paidAmount?: string;
}

export interface ArSummaryData {
  invoiceCount: number;
  subtotal: string;
  vatTotal: string;
  discountTotal: string;
  total: string;
  paidAmount?: string;
  currency: 'SAR';
  dateField: 'issueDate';
  statusFilter: SalesInvoiceStatus;
  byStatus: ArStatusBreakdown[];
  recentInvoices: ArRecentInvoice[];
}

// ---- AP data shapes (Phase 8B-2) ----------------------------------
//   Backed by PurchaseInvoice — same pattern as AR, with
//   supplier-side labels and `receivedAt` as the canonical
//   date. `paidAmount` is intentionally OMITTED: the
//   `PurchaseInvoice` schema has no `paidAmount` column
//   (verified in `schema.prisma`, model PurchaseInvoice,
//   line 507–545). The Phase 7B-3 purchasesSummary already
//   documented this as a hard constraint.

export interface ApStatusBreakdown {
  status: PurchaseInvoiceStatus;
  invoiceCount: number;
  subtotal: string;
  vatTotal: string;
  discountTotal: string;
  total: string;
}

export interface ApRecentInvoice {
  id: string;
  invoiceNumber: string;
  status: PurchaseInvoiceStatus;
  receivedAt: string; // ISO 8601 — may be a createdAt fallback
  supplierId: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  subtotal: string;
  vatTotal: string;
  discountTotal: string;
  total: string;
}

export interface ApSummaryData {
  invoiceCount: number;
  subtotal: string;
  vatTotal: string;
  discountTotal: string;
  total: string;
  currency: 'SAR';
  dateField: 'receivedAt';
  statusFilter: PurchaseInvoiceStatus;
  byStatus: ApStatusBreakdown[];
  recentInvoices: ApRecentInvoice[];
}

export type ArSummaryResponse = Omit<ReadyResponse<ArSummaryData>, 'filters'> & {
  filters: ArSummaryFilters;
};
export type ApSummaryResponse = Omit<ReadyResponse<ApSummaryData>, 'filters'> & {
  filters: ApSummaryFilters;
};

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
   * Build the `where` clause for `arSummary` (Phase 8B-2):
   *   companyId + deletedAt:null +
   *   status: { notIn: HEADLINE_STATUS_EXCLUSION }
   *     + (optional status override) +
   *     (optional customerId) +
   *     (optional date range on issueDate).
   * Model notes:
   *   - AR covers EVERY `SalesInvoice.type` (STANDARD and
   *     POS alike), because both create receivables on
   *     the customer side. The `type` filter that
   *     `salesSummary` and `posSummary` enforce is
   *     intentionally OMITTED here.
   *   - Default status = ISSUED (matches salesSummary);
   *     CANCELLED never enters the headline unless the
   *     caller explicitly overrides `status`.
   *   - `deletedAt:null` is the standard Phase-7
   *     soft-delete guard.
   * Date range:
   *   - fromDate -> gte 00:00:00.000 UTC
   *   - toDate   -> lte 23:59:59.999 UTC
   * `companyId` source: function parameter only —
   * mirror of `buildSalesWhere`.
   */
  private buildArWhere(
    companyId: string,
    query: ReportQueryDto,
  ): Prisma.SalesInvoiceWhereInput {
    const where: Prisma.SalesInvoiceWhereInput = {
      companyId,
      deletedAt: null,
      status: {
        notIn: HEADLINE_STATUS_EXCLUSION,
      },
    };

    const status = this.resolveStatus(query);
    if (status) {
      // Explicit caller override: trust it. Aggregate
      // will reflect only that status filter — and
      // `notIn: CANCELLED` is dropped because the caller
      // asked for an explicit status, mirroring
      // `buildSalesWhere` line 894.
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
  // AR SUMMARY — implemented in Phase 8B-2.
  //   Source : SalesInvoice (every type — AR covers both
  //            STANDARD and POS invoices, since both create
  //            receivables from the same customer side).
  //   Scope  : companyId + deletedAt:null +
  //            status: { notIn: HEADLINE_STATUS_EXCLUSION }
  //            + (optional status override) +
  //            (optional customerId) +
  //            (optional date range on issueDate).
  //   Default status: ISSUED (caller override wins —
  //                     CANCELLED cancels the headline
  //                     exclusion just like sales/POS).
  //   Outputs:
  //     * invoiceCount + subtotal/vatTotal/discountTotal/
  //       total/paidAmount aggregates.
  //     * byStatus breakdown via groupBy.
  //     * recentInvoices: top 20 newest invoices with
  //       customer labels (code + name from Partner).
  //   Not implemented (still future):
  //     aging buckets, payments, receipts, allocations,
  //     outstanding = total - paidAmount per invoice.
  //     This endpoint reports *invoiced receivables*; it
  //     is not a collections or aging report.
  //   companyId: JWT-only parameter (controller-side
  //              @CurrentUser() with no companyId in body).
  // =================================================================
  async arSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<ArSummaryResponse> {
    const where = this.buildArWhere(companyId, query);

    // 1. Headline aggregates — sums over the filtered
    //    invoice set. paidAmount is included since the
    //    SalesInvoice schema has it as `Decimal?`; it is
    //    stringified via decimalToNullableString so the
    //    key is omitted when the aggregate is null
    //    (matches Phase 7B-2 salesSummary convention).
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

    // 2. byStatus breakdown. Same `where` filter so
    //    status composition is observable; CANCELLED
    //    is only present if caller explicitly overrode
    //    the status (matching the sales/POS pattern).
    const byStatusRaw = await this.prisma.salesInvoice.groupBy({
      by: ['status'],
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
    const byStatus: ArStatusBreakdown[] = byStatusRaw
      .sort((a, b) => a.status.localeCompare(b.status))
      .map((row) => {
        const entry: ArStatusBreakdown = {
          status: row.status,
          invoiceCount: row._count._all,
          subtotal: this.decimalToString(row._sum.subtotal),
          vatTotal: this.decimalToString(row._sum.vatTotal),
          discountTotal: this.decimalToString(row._sum.discountTotal),
          total: this.decimalToString(row._sum.total),
        };
        const paid = this.decimalToNullableString(row._sum.paidAmount);
        if (paid !== undefined) entry.paidAmount = paid;
        return entry;
      });

    // 3. recentInvoices — 20 most recent invoices for
    //    the same filter scope, joined with Partner
    //    (customer) for human-readable labels.
    const recentRaw = await this.prisma.salesInvoice.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      take: 20,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        issueDate: true,
        customerId: true,
        subtotal: true,
        vatTotal: true,
        discountTotal: true,
        total: true,
        paidAmount: true,
        customer: { select: { code: true, name: true } },
      },
    });
    const recentInvoices: ArRecentInvoice[] = recentRaw.map((row) => {
      const entry: ArRecentInvoice = {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        status: row.status,
        issueDate: (row.issueDate ?? row.customerId ?? new Date())
          ? (row.issueDate?.toISOString() ?? new Date(0).toISOString())
          : new Date(0).toISOString(),
        customerId: row.customerId,
        customerCode: row.customer?.code ?? null,
        customerName: row.customer?.name ?? null,
        subtotal: this.decimalToString(row.subtotal),
        vatTotal: this.decimalToString(row.vatTotal),
        discountTotal: this.decimalToString(row.discountTotal),
        total: this.decimalToString(row.total),
      };
      const paid = this.decimalToNullableString(row.paidAmount);
      if (paid !== undefined) entry.paidAmount = paid;
      return entry;
    });

    // 4. Effective status filter for the response shape
    //    (default = ISSUED when caller did not override).
    const statusFilter =
      this.resolveStatus(query) ?? SalesInvoiceStatus.ISSUED;

    const data: ArSummaryData = {
      invoiceCount: agg._count._all,
      subtotal: this.decimalToString(agg._sum.subtotal),
      vatTotal: this.decimalToString(agg._sum.vatTotal),
      discountTotal: this.decimalToString(agg._sum.discountTotal),
      total: this.decimalToString(agg._sum.total),
      currency: 'SAR',
      dateField: 'issueDate',
      statusFilter,
      byStatus,
      recentInvoices,
    };
    if (
      agg._sum.paidAmount !== null &&
      agg._sum.paidAmount !== undefined
    ) {
      data.paidAmount = this.decimalToString(agg._sum.paidAmount);
    }

    return {
      report: 'ar-summary',
      status: 'READY',
      companyId,
      filters: {
        fromDate: query.fromDate ?? null,
        toDate: query.toDate ?? null,
        customerId: query.customerId ?? null,
        status: query.status ?? null,
      },
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  // =================================================================
  // AP SUMMARY — implemented in Phase 8B-2.
  //   Source : PurchaseInvoice.
  //   Scope  : companyId + deletedAt:null +
  //            status: { notIn: HEADLINE_PURCHASE_EXCLUSION }
  //            + (optional status override) +
  //            (optional supplierId) +
  //            (optional date range on receivedAt, with
  //            receivedAt-null rows still considered for
  //            the headline via status default).
  //   Default status: RECEIVED (matches purchasesSummary).
  //   Outputs (parallel to AR):
  //     * invoiceCount + subtotal/vatTotal/discountTotal/
  //       total aggregates — NO paidAmount (PurchaseInvoice
  //       has no such column; this is the Phase 7B-3
  //       constraint).
  //     * byStatus breakdown via groupBy.
  //     * recentInvoices: top 20 newest invoices with
  //       supplier labels (code + name from Partner).
  //   Not implemented (still future):
  //     aging buckets, payments/vouchers, allocations,
  //     and reconciliation. This endpoint reports
  //     invoiced payables only.
  //   companyId: JWT-only parameter (controller-side
  //              @CurrentUser() with no companyId in body).
  // =================================================================
  async apSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<ApSummaryResponse> {
    const where = this.buildPurchaseWhere(companyId, query);

    // 1. Headline aggregates — sums over the filtered
    //    invoice set. paidAmount is intentionally omitted.
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

    // 2. byStatus breakdown.
    const byStatusRaw = await this.prisma.purchaseInvoice.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: {
        subtotal: true,
        vatTotal: true,
        discountTotal: true,
        total: true,
      },
    });
    const byStatus: ApStatusBreakdown[] = byStatusRaw
      .sort((a, b) => a.status.localeCompare(b.status))
      .map((row) => ({
        status: row.status,
        invoiceCount: row._count._all,
        subtotal: this.decimalToString(row._sum.subtotal),
        vatTotal: this.decimalToString(row._sum.vatTotal),
        discountTotal: this.decimalToString(row._sum.discountTotal),
        total: this.decimalToString(row._sum.total),
      }));

    // 3. recentInvoices — 20 most recent. Orderby
    //    `(receivedAt desc, createdAt desc)` so that
    //    invoices with receivedAt=null still get a
    //    deterministic ordering via createdAt. Prisma
    //    `orderBy` accepts an array.
    const recentRaw = await this.prisma.purchaseInvoice.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        receivedAt: true,
        createdAt: true,
        supplierId: true,
        subtotal: true,
        vatTotal: true,
        discountTotal: true,
        total: true,
        supplier: { select: { code: true, name: true } },
      },
    });
    const recentInvoices: ApRecentInvoice[] = recentRaw.map((row) => {
      const effectiveDate = row.receivedAt ?? row.createdAt;
      const entry: ApRecentInvoice = {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        status: row.status,
        receivedAt: effectiveDate.toISOString(),
        supplierId: row.supplierId,
        supplierCode: row.supplier?.code ?? null,
        supplierName: row.supplier?.name ?? null,
        subtotal: this.decimalToString(row.subtotal),
        vatTotal: this.decimalToString(row.vatTotal),
        discountTotal: this.decimalToString(row.discountTotal),
        total: this.decimalToString(row.total),
      };
      return entry;
    });

    // 4. Effective status filter (default = RECEIVED).
    const statusFilter =
      this.resolvePurchaseStatus(query) ??
      PurchaseInvoiceStatus.RECEIVED;

    const data: ApSummaryData = {
      invoiceCount: agg._count._all,
      subtotal: this.decimalToString(agg._sum.subtotal),
      vatTotal: this.decimalToString(agg._sum.vatTotal),
      discountTotal: this.decimalToString(agg._sum.discountTotal),
      total: this.decimalToString(agg._sum.total),
      currency: 'SAR',
      dateField: 'receivedAt',
      statusFilter,
      byStatus,
      recentInvoices,
    };

    return {
      report: 'ap-summary',
      status: 'READY',
      companyId,
      filters: {
        fromDate: query.fromDate ?? null,
        toDate: query.toDate ?? null,
        supplierId: query.supplierId ?? null,
        status: query.status ?? null,
      },
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  /**
   * AR Aging (Phase 9B-2 — implemented).
   *
   *   Source: SalesInvoice.
   *   Scope : companyId + deletedAt:null + status:'ISSUED'
   *           + (optional customerId) +
   *             (optional fromDate/toDate → dueDate range
   *              with per-row fallback to issueDate when
   *              dueDate IS NULL).
   *   Status: hard-locked to ISSUED. The caller cannot pass
   *           query.status to override it (the field is
   *           intentionally ignored here). Final
   *           filters.status is always 'ISSUED'. This locks
   *           D4 from Phase 9B-1.
   *   Math in JS/TS using Prisma.Decimal — no raw SQL and
   *     no Prisma `$queryRaw`. Decimal-as-string is preserved
   *     across the JSON boundary (`.toFixed(4)`, matches the
   *     Phase 4B-2 sales-side convention).
   *
   *   Buckets (5):
   *     'current' : daysPastDue <= 0
   *     '1-30'    : 1 <= daysPastDue <= 30
   *     '31-60'   : 31 <= daysPastDue <= 60
   *     '61-90'   : 61 <= daysPastDue <= 90
   *     '+90'     : 91 <= daysPastDue (covers +infinity)
   *
   *   Aging date: dueDate per row; falls back to issueDate
   *   when dueDate IS NULL. Both date columns are nullable
   *   on SalesInvoice per schema.prisma (verified Phase 9B-1).
   *   ROWS with BOTH dates NULL are excluded silently (no
   *   date → no bucket → not an open receivable).
   *
   *   Outstanding = max(0, total - paidAmount). paidAmount
   *   NULL is treated as 0. Rows with outstanding <= 0 are
   *   excluded from buckets / counts / totals so cancelled-
   *   paid and fully-settled invoices do not pollute the
   *   aging grid.
   *
   *   Safety: take = 5001 (limit + sentinel). If the
   *   underlying invoice set exceeds 5000 rows, this method
   *   throws BadRequestException with a clear message
   *   asking the caller to narrow the date/customer filter.
   *   No partial numbers are returned in that case.
   *
   *   Tenant isolation: companyId comes from the controller
   *   JWT parameter, never from the body or query. The DTO
   *   ReportQueryDto does not expose companyId (verified in
   *   Phase 7B-1); CurrentUser() is the single source of
   *   truth.
   *
   *   Out of scope (still future): AP aging, payments /
   *   receipts / settlements, bank reconciliation, AR/AP
   *   ledger sub-accounts, GL/VAT integration, frontend /
   *   UI / README / schema / e2e / RBAC changes (this
   *   commit touches only this method body + class
   *   imports).
   */
  private static readonly AR_AGING_TAKE_LIMIT = 5000;
  private static readonly AR_AGING_BUCKET_KEYS: ReadonlyArray<
    'current' | '1-30' | '31-60' | '61-90' | '+90'
  > = ['current', '1-30', '31-60', '61-90', '+90'];

  /**
   * Build the `where` clause for `arAging`. Mirrors the
   * Phase 8B-2 pattern but hard-locks `status: ISSUED` and
   * composes an OR-group on the date filter so that
   *   dueDate-in-range rows + dueDate-NULL rows where
   *   issueDate-in-range both pass.
   */
  private buildArAgingWhere(
    companyId: string,
    query: ReportQueryDto,
  ): Prisma.SalesInvoiceWhereInput {
    const where: Prisma.SalesInvoiceWhereInput = {
      companyId,
      deletedAt: null,
      status: SalesInvoiceStatus.ISSUED, // hard-locked (D4)
    };

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    const date = this.buildIssueDateRange(query);
    if (date) {
      // Two-leg date filter, no raw SQL:
      //   (a) dueDate ∈ [fromDate, toDate]
      //   (b) dueDate IS NULL AND issueDate ∈ [fromDate, toDate]
      // Anything still NULL on both columns after that is
      // excluded (no aging date → no bucket).
      where.OR = [
        { dueDate: date },
        { dueDate: null, issueDate: date },
      ];
    }

    return where;
  }

  /**
   * Resolve the per-row aging date (dueDate preferred;
   * issueDate fallback). Both nullable — returns null if
   * both are null and the caller is expected to skip.
   */
  private effectiveAgingDate(row: {
    dueDate: Date | null;
    issueDate: Date | null;
  }): Date | null {
    return row.dueDate ?? row.issueDate;
  }

  /**
   * Map a row's `daysPastDue` to one of the 5 bucket keys.
   * Returns null when the row is outside any bucket
   * (shouldn't happen on the condtion
   * `daysPastDue = Math.floor((asOf − agingDate)/86_400_000)`
   * but kept defensive).
   *
   *   daysPastDue <= 0                       → 'current'
   *   1  <= daysPastDue <= 30                → '1-30'
   *   31 <= daysPastDue <= 60                → '31-60'
   *   61 <= daysPastDue <= 90                → '61-90'
   *   91 <= daysPastDue                      → '+90'
   */
  private computeAgingBucket(daysPastDue: number): ArAgingBucketKey | null {
    if (daysPastDue <= 0) return 'current';
    if (daysPastDue <= 30) return '1-30';
    if (daysPastDue <= 60) return '31-60';
    if (daysPastDue <= 90) return '61-90';
    return '+90';
  }

  /**
   * Compute `outstanding = max(0, total - paidAmount)`.
   * paidAmount NULL is treated as 0. Both inputs are
   * Prisma.Decimal; the result is a Decimal whose
   * `.toFixed(4)` matches the JSON-boundary contract.
   */
  private safeOutstanding(
    total: Prisma.Decimal,
    paidAmount: Prisma.Decimal | null,
  ): Prisma.Decimal {
    const paid =
      paidAmount === null || paidAmount === undefined
        ? new Prisma.Decimal(0)
        : paidAmount;
    const diff = total.minus(paid);
    return diff.lessThan(new Prisma.Decimal(0))
      ? new Prisma.Decimal(0)
      : diff;
  }

  async arAging(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<ArAgingResponse> {
    // 1. asOfDate — server-computed (matches 9B-1 contract).
    const asOf = new Date();
    const asOfDate = asOf.toISOString();

    // 2. Compose the WHERE clause (status hard-locked,
    //    OR-grouped date filter on dueDate / issueDate).
    const where = this.buildArAgingWhere(companyId, query);

    // 3. Single findMany with a tight select + customer
    //    include (code + name). take = 5001 acts as a
    //    safety sentinel (see step 5 below).
    const rows = await this.prisma.salesInvoice.findMany({
      where,
      orderBy: [
        { issueDate: 'desc' },
        { createdAt: 'desc' },
      ],
      take: ReportsService.AR_AGING_TAKE_LIMIT + 1,
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        paidAmount: true,
        total: true,
        customerId: true,
        customer: { select: { code: true, name: true } },
      },
    });

    // 4. Safety sentinel. If we hit 5001, the underlying
    //    invoice set is too large for the in-process
    //    bucket accumulation (we already said no raw SQL).
    //    Fail loudly rather than return truncated numbers.
    if (rows.length > ReportsService.AR_AGING_TAKE_LIMIT) {
      throw new BadRequestException(
        `ar-aging invoice set exceeded ${ReportsService.AR_AGING_TAKE_LIMIT} rows; ` +
          'narrow the date range or supply a customerId filter. ' +
          'A raw-SQL/fact-table pass is left for Phase 9B-3+.',
      );
    }

    // 5. JS bucket accumulator. three layers:
    //    (a) per-bucket totals { outstanding Decimal, invoiceCount }
    //    (b) per-customer × per-bucket matrix
    //    (c) per-customer totals (total / paid / outstanding)
    //
    //    Decimal registry seeded at zero; arithmetic stays
    //    in Prisma.Decimal end-to-end (no float math).
    const ZERO = new Prisma.Decimal(0);
    const bucketSeeds = (): {
      outstanding: Prisma.Decimal;
      invoiceCount: number;
    } => ({ outstanding: ZERO, invoiceCount: 0 });

    const buckets: Record<
      ArAgingBucketKey,
      { outstanding: Prisma.Decimal; invoiceCount: number }
    > = {
      current: bucketSeeds(),
      '1-30': bucketSeeds(),
      '31-60': bucketSeeds(),
      '61-90': bucketSeeds(),
      '+90': bucketSeeds(),
    };

    type CustKey = string; // SalesInvoice.customerId
    type CustAcc = {
      customerId: CustKey;
      customerCode: string | null;
      customerName: string | null;
      total: Prisma.Decimal;
      paid: Prisma.Decimal;
      outstanding: Prisma.Decimal;
      invoiceCount: number;
      buckets: Record<ArAgingBucketKey, {
        outstanding: Prisma.Decimal;
        invoiceCount: number;
      }>;
    };
    const custAcc = new Map<CustKey, CustAcc>();
    const custSeeds = (
      cid: CustKey,
      code: string | null,
      name: string | null,
    ): CustAcc => ({
      customerId: cid,
      customerCode: code,
      customerName: name,
      total: ZERO,
      paid: ZERO,
      outstanding: ZERO,
      invoiceCount: 0,
      buckets: {
        current: bucketSeeds(),
        '1-30': bucketSeeds(),
        '31-60': bucketSeeds(),
        '61-90': bucketSeeds(),
        '+90': bucketSeeds(),
      },
    });

    let grandTotal = ZERO;
    let grandPaid = ZERO;
    let grandOutstanding = ZERO;
    let grandInvoiceCount = 0;

    for (const row of rows) {
      // 5a. Aging date (dueDate preferred; issueDate fallback).
      const agingDate = this.effectiveAgingDate(row);
      if (agingDate === null) {
        // Both date columns null → cannot bucket. Skip
        // silently (no aging date invented).
        continue;
      }

      // 5b. daysPastDue = floor((asOf − agingDate) / 86_400_000ms).
      //     floor collapses sub-day precision to whole days;
      //     milliseconds are exactly representable as Number
      //     here (safe across the 100k-year JS range we use).
      const daysPastDue = Math.floor(
        (asOf.getTime() - agingDate.getTime()) / 86_400_000,
      );

      const bucketKey = this.computeAgingBucket(daysPastDue);
      if (bucketKey === null) continue;

      // 5c. Outstanding calculus. total is non-null per the
      //     schema (`@default(0)`); paidAmount is nullable.
      const outstandingDecimal = this.safeOutstanding(
        row.total,
        row.paidAmount,
      );

      // Rows fully paid (outstanding <= 0) drop out of the
      // aging grid entirely.
      if (outstandingDecimal.lessThanOrEqualTo(ZERO)) {
        continue;
      }

      // 5d. Bucket-level accumulation (Decimal column-wise).
      buckets[bucketKey].outstanding = buckets[bucketKey].outstanding.plus(
        outstandingDecimal,
      );
      buckets[bucketKey].invoiceCount += 1;

      // 5e. Customer-level accumulation. Rows with
      //     customerId=null are grouped under a synthetic
      //     key '__no_customer__' so that the per-customer
      //     breakdown still surfaces them as one row.
      const custId = row.customerId ?? '__no_customer__';
      let acc = custAcc.get(custId);
      if (!acc) {
        acc = custSeeds(
          custId,
          row.customer?.code ?? null,
          row.customer?.name ?? null,
        );
        custAcc.set(custId, acc);
      }
      acc.total = acc.total.plus(row.total);
      const paid =
        row.paidAmount === null || row.paidAmount === undefined
          ? ZERO
          : row.paidAmount;
      acc.paid = acc.paid.plus(paid);
      acc.outstanding = acc.outstanding.plus(outstandingDecimal);
      acc.invoiceCount += 1;
      acc.buckets[bucketKey].outstanding = acc.buckets[
        bucketKey
      ].outstanding.plus(outstandingDecimal);
      acc.buckets[bucketKey].invoiceCount += 1;

      // 5f. Grand totals.
      grandTotal = grandTotal.plus(row.total);
      grandPaid = grandPaid.plus(paid);
      grandOutstanding = grandOutstanding.plus(outstandingDecimal);
      grandInvoiceCount += 1;
    }

    // 6. Materialize the byCustomer rows in stable order
    //    (sorted by outstanding desc, then by customerId).
    const byCustomerRows: ArAgingCustomerRow[] = Array.from(
      custAcc.values(),
    )
      .sort((a, b) => {
        const cmp = b.outstanding.comparedTo(a.outstanding);
        if (cmp !== 0) return cmp;
        return a.customerId.localeCompare(b.customerId);
      })
      .filter((acc) => acc.customerId !== '__no_customer__')
      .map((acc) => {
        // Serialise customer-level buckets via the
        // standard decimalToString helper, matching the
        // rest of the report tree.
        const serializedBuckets: Record<
          ArAgingBucketKey,
          ArAgingBucket
        > = {
          current: {
            invoiceCount: acc.buckets.current.invoiceCount,
            outstanding: this.decimalToString(
              acc.buckets.current.outstanding,
            ),
          },
          '1-30': {
            invoiceCount: acc.buckets['1-30'].invoiceCount,
            outstanding: this.decimalToString(
              acc.buckets['1-30'].outstanding,
            ),
          },
          '31-60': {
            invoiceCount: acc.buckets['31-60'].invoiceCount,
            outstanding: this.decimalToString(
              acc.buckets['31-60'].outstanding,
            ),
          },
          '61-90': {
            invoiceCount: acc.buckets['61-90'].invoiceCount,
            outstanding: this.decimalToString(
              acc.buckets['61-90'].outstanding,
            ),
          },
          '+90': {
            invoiceCount: acc.buckets['+90'].invoiceCount,
            outstanding: this.decimalToString(acc.buckets['+90'].outstanding),
          },
        };

        // After the filter above, every `acc.customerId` that
        // reaches this .map() block is a real customerId
        // (the synthetic '__no_customer__' key was excluded),
        // so we can pass it through verbatim. Rows whose
        // SalesInvoice.customerId was NULL contribute to the
        // grand totals only — they never surface in the
        // byCustomer breakdown, matching the Phase 8B-2
        // arSummary.recentInvoices convention where rows
        // with customerId=null are kept in aggregates and
        // dropped from the per-row list when no label is
        // available.
        return {
          customerId: acc.customerId,
          customerCode: acc.customerCode,
          customerName: acc.customerName,
          total: this.decimalToString(acc.total),
          paid: this.decimalToString(acc.paid),
          outstanding: this.decimalToString(acc.outstanding),
          buckets: serialisedBuckets,
        };
      });

    // 7. Bucket materialisation — same serialisation rules
    //    plus a conformant `totals` shape (extends the bucket
    //    shape with an overall invoiceCount).
    const serialisedBuckets: Record<ArAgingBucketKey, ArAgingBucket> = {
      current: {
        invoiceCount: buckets.current.invoiceCount,
        outstanding: this.decimalToString(buckets.current.outstanding),
      },
      '1-30': {
        invoiceCount: buckets['1-30'].invoiceCount,
        outstanding: this.decimalToString(buckets['1-30'].outstanding),
      },
      '31-60': {
        invoiceCount: buckets['31-60'].invoiceCount,
        outstanding: this.decimalToString(buckets['31-60'].outstanding),
      },
      '61-90': {
        invoiceCount: buckets['61-90'].invoiceCount,
        outstanding: this.decimalToString(buckets['61-90'].outstanding),
      },
      '+90': {
        invoiceCount: buckets['+90'].invoiceCount,
        outstanding: this.decimalToString(buckets['+90'].outstanding),
      },
    };

    const data: ArAgingData = {
      currency: 'SAR',
      dateField: 'dueDate',
      statusFilter: 'ISSUED',
      buckets: serialisedBuckets,
      totals: {
        invoiceCount: grandInvoiceCount,
        outstanding: this.decimalToString(grandOutstanding),
      },
      byCustomer: { rows: byCustomerRows },
    };

    return {
      report: 'ar-aging',
      status: 'READY',
      companyId,
      filters: {
        fromDate: query.fromDate ?? null,
        toDate: query.toDate ?? null,
        customerId: query.customerId ?? null,
        status: 'ISSUED', // echoed regardless of query.status
        asOfDate,
      },
      generatedAt: new Date().toISOString(),
      data,
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

  // ----------------------------------------------------------------
  // AP Aging — Phase 9E-B-1 skeleton
  //
  //   Status: PLANNED only.
  //
  //   * `status: 'RECEIVED'` is hard-locked (mirrors AR's
  //     ISSUED lock). The DTO's `status` query param is
  //     accepted but not surfaced in the response shape.
  //   * `dateField: 'receivedAt'` with fallback chain
  //     `receivedAt ?? dueDate ?? createdAt`. Fallback
  //     logic lands in 9E-B-2.
  //   * `bySupplier.rows[]` per-supplier breakdown — not
  //     `byCustomer` (PurchaseInvoice has no customerId
  //     column). Joins to `Partner.code` / `name` via
  //     `supplierId` in 9E-B-2.
  //   * `PurchaseInvoice.paidAmount` does NOT exist in the
  //     Prisma schema (confirmed in 9E-B-1 schema read;
  //     model lines 507-545, field intentionally OMITTED
  //     in 7B-3 / 8B-2). Therefore `outstanding = total`
  //     always on this side.
  //   * Tenant scope is JWT-only (no `query.companyId`).
  //   * `asOfDate` is server-computed UTC ISO timestamp
  //     (matches the Phase 9B-1 contract used by
  //     `arAging` at lines 2001-2003). NOT read from `q`
  //     because the DTO does not expose `asOfDate` in
  //     7B-1/7B-2 — this is the explicit fix for the
  //     build error raised immediately after 9E-B-1 Edit #3.
  //
  //   Full implementation lands in 9E-B-2.
  // ----------------------------------------------------------------
  async apAging(
    companyId: string,
    q: ReportQueryDto,
  ): Promise<ApAgingResponseOrPlanned> {
    // asOfDate — server-computed UTC ISO timestamp (matches
    // the Phase 9B-1 contract; mirrors `arAging` body at
    // lines 2001-2003). The DTO does not expose `asOfDate`.
    const asOf = new Date();
    const asOfDate = asOf.toISOString();

    const filters: ApAgingFilters = {
      fromDate: q.fromDate ?? null,
      toDate: q.toDate ?? null,
      supplierId: q.supplierId ?? null,
      status: q.status ?? null,
      asOfDate,
    };

    const planned: ApAgingPlannedResponse = {
      report: 'ap-aging',
      status: 'PLANNED',
      companyId,
      filters,
      generatedAt: new Date().toISOString(),
      data: null,
    };
    return planned;
  }
}
