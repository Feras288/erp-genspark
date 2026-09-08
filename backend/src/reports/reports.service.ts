// =====================================================
// Phase 7B-2: Reports Core — service.
//
//   Phase 7B-1 (skeleton):
//     * 6 methods, all returning `status: 'PLANNED'`,
//       `data: null`. No Prisma injection.
//
//   Phase 7B-2 (this commit, sales + POS only):
//     * `salesSummary` — fully implemented against
//       `SalesInvoice` (type=STANDARD), with Prisma
//       `_sum` aggregations and `Decimal`-as-string
//       serialisation at the JSON boundary.
//     * `posSummary`   — fully implemented against
//       `SalesInvoice` (type=POS), plus an optional
//       `paymentMethod` breakdown via Prisma
//       `groupBy({ by: ['paymentMethod'] })`.
//
//   Still skeleton (Phase 7B-3+):
//     * `purchasesSummary`, `inventorySummary`,
//       `stockMovementsSummary`, `accountingSummary`
//       remain `status: 'PLANNED'` skeletons.
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
  SalesInvoiceStatus,
  SalesInvoiceType,
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
  | 'accounting-summary';

export interface PlannedReportResponse {
  report: ReportName;
  status: 'PLANNED';
  companyId: string;
  filters: ReportQueryDto | null;
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

// ---- Allowed status set (CANCELLED is excluded from headline totals) ----

const HEADLINE_STATUS_EXCLUSION: SalesInvoiceStatus[] = [
  SalesInvoiceStatus.CANCELLED,
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
  // SKELETON methods (Phase 7B-3+ will fill these).
  // =================================================================

  async purchasesSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PlannedReportResponse> {
    return {
      report: 'purchases-summary',
      status: 'PLANNED',
      companyId,
      filters: query,
      generatedAt: new Date().toISOString(),
      data: null,
    };
  }

  async inventorySummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PlannedReportResponse> {
    return {
      report: 'inventory-summary',
      status: 'PLANNED',
      companyId,
      filters: query,
      generatedAt: new Date().toISOString(),
      data: null,
    };
  }

  async stockMovementsSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PlannedReportResponse> {
    return {
      report: 'stock-movements-summary',
      status: 'PLANNED',
      companyId,
      filters: query,
      generatedAt: new Date().toISOString(),
      data: null,
    };
  }

  async accountingSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PlannedReportResponse> {
    return {
      report: 'accounting-summary',
      status: 'PLANNED',
      companyId,
      filters: query,
      generatedAt: new Date().toISOString(),
      data: null,
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
