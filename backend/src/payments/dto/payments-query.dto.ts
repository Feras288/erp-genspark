// =====================================================
// Phase 10A: AR Payments + Settlement Tracking.
//
// Phase 10A-B-1: PaymentsQueryDto — query-string shape for
// GET /api/sales-invoices/:invoiceId/payments.
//
//   In Phase 10A-B-1 the GET endpoint returns [] regardless of
//   query parameters; in Phase 10A-B-2 the same DTO becomes the
//   filter for the real `list()` query, mirroring the Phase 7
//   `ReportQueryDto` discipline (no companyId, JWT-only).
//
// Strict (Phase 10A-B-1):
//   * No settlement calculations.
//   * No PAID / PARTIALLY_PAID status enum (deferred — T-2 lock).
//   * No AR-Aging source change.
//   * No AP payments (10B).
//   * No GL / bank reconciliation / drill-down.
// =====================================================
import { IsIn, IsISO4217CurrencyCode, IsOptional, IsString } from 'class-validator';

export class PaymentsQueryDto {
  // Phase 10A-B-2 effective filter; 10A-B-1 accepted but unused.
  @IsOptional()
  @IsString()
  fromDate?: string; // ISO date YYYY-MM-DD

  @IsOptional()
  @IsString()
  toDate?: string;   // ISO date YYYY-MM-DD

  // Currently only POSTED is meaningful; CANCELLED is reserved for 10A-B-2
  // soft-cancel. 10A-B-1 accepts the param but the service ignores it.
  @IsOptional()
  @IsIn(['POSTED', 'CANCELLED'])
  status?: 'POSTED' | 'CANCELLED';

  // Currently unused; 10A-B-2 will lie on this if it converges to
  // multi-currency. 10A-B-1 keeps the validator strict so the build
  // matches Phase 7 `ReportQueryDto` shape discipline.
  @IsOptional()
  @IsString()
  currency?: string;
}
