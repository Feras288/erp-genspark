// =====================================================
// Phase 7B-1: Reports Core — service (skeleton only).
//
//   * Six method stubs, no Prisma import, no aggregations.
//   * Each method returns a typed "PLANNED" skeleton
//     response so the controller wiring + RBAC + JWT
//     pipeline can be exercised end-to-end today.
//   * Real queries / Decimal aggregations / pagination
//     materialise in Phase 7B-2+ in single-purpose commits.
//
// RULES (enforced in Phase 7B-2+):
//   - All amounts returned as strings (Prisma Decimal +
//     JsonBoundary.toString()).
//   - companyId is the only filter applied; no body or
//     query-string companyId will ever be accepted.
//   - Drafts + CANCELLED excluded by default unless
//     caller explicitly includes them.
// =====================================================
import { Injectable } from '@nestjs/common';
import { ReportQueryDto } from './dto/report-query.dto';

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
  generatedAt: string; // ISO 8601
  data: null; // skeleton — real payload lands in Phase 7B-2+
}

@Injectable()
export class ReportsService {
  // No PrismaService injection in Phase 7B-1 — service is
  // fully structural. Phase 7B-2+ will add PrismaService
  // via constructor injection and replace each method body.

  private skeleton(
    report: ReportName,
    companyId: string,
    filters: ReportQueryDto | null,
  ): PlannedReportResponse {
    return {
      report,
      status: 'PLANNED',
      companyId,
      filters,
      generatedAt: new Date().toISOString(),
      data: null,
    };
  }

  async salesSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PlannedReportResponse> {
    return this.skeleton('sales-summary', companyId, query);
  }

  async posSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PlannedReportResponse> {
    return this.skeleton('pos-summary', companyId, query);
  }

  async purchasesSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PlannedReportResponse> {
    return this.skeleton('purchases-summary', companyId, query);
  }

  async inventorySummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PlannedReportResponse> {
    return this.skeleton('inventory-summary', companyId, query);
  }

  async stockMovementsSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PlannedReportResponse> {
    return this.skeleton('stock-movements-summary', companyId, query);
  }

  async accountingSummary(
    companyId: string,
    query: ReportQueryDto,
  ): Promise<PlannedReportResponse> {
    return this.skeleton('accounting-summary', companyId, query);
  }
}
