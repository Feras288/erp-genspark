// =====================================================
// Phase 7B-1: Reports Core — controller (skeleton only).
//
//   Mounted under /api/reports/* via the global /api prefix
//   set in main.ts. Six read-only, GET-only endpoints.
//
// RBAC:
//   * JwtAuthGuard + PermissionsGuard at controller level.
//   * Every endpoint requires `reports.read` (already
//     seeded; no seed change in Phase 7B-1).
//
// Tenancy:
//   * companyId is sourced exclusively from JWT via
//     @CurrentUser(). The DTO does not expose companyId;
//     any companyId in body / query is dropped because
//     @Query() is the only request input wired here.
//
// No calculations: each handler delegates to a ReportsService
// method that returns a `status: 'PLANNED'` skeleton. Real
// aggregations land in Phase 7B-2+ (one report family per
// micro-commit).
// =====================================================
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/auth.types';

import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  // ===== Sales =====

  @Get('sales-summary')
  @RequirePermissions('reports.read')
  salesSummary(
    @CurrentUser() me: AuthenticatedUser,
    @Query() q: ReportQueryDto,
  ) {
    return this.svc.salesSummary(me.companyId, q);
  }

  // ===== POS =====

  @Get('pos-summary')
  @RequirePermissions('reports.read')
  posSummary(
    @CurrentUser() me: AuthenticatedUser,
    @Query() q: ReportQueryDto,
  ) {
    return this.svc.posSummary(me.companyId, q);
  }

  // ===== Purchases =====

  @Get('purchases-summary')
  @RequirePermissions('reports.read')
  purchasesSummary(
    @CurrentUser() me: AuthenticatedUser,
    @Query() q: ReportQueryDto,
  ) {
    return this.svc.purchasesSummary(me.companyId, q);
  }

  // ===== Inventory =====

  @Get('inventory-summary')
  @RequirePermissions('reports.read')
  inventorySummary(
    @CurrentUser() me: AuthenticatedUser,
    @Query() q: ReportQueryDto,
  ) {
    return this.svc.inventorySummary(me.companyId, q);
  }

  // ===== Stock Movements =====

  @Get('stock-movements-summary')
  @RequirePermissions('reports.read')
  stockMovementsSummary(
    @CurrentUser() me: AuthenticatedUser,
    @Query() q: ReportQueryDto,
  ) {
    return this.svc.stockMovementsSummary(me.companyId, q);
  }

  // ===== Accounting (summary only — no TB/BS/P&L) =====

  @Get('accounting-summary')
  @RequirePermissions('reports.read')
  accountingSummary(
    @CurrentUser() me: AuthenticatedUser,
    @Query() q: ReportQueryDto,
  ) {
    return this.svc.accountingSummary(me.companyId, q);
  }
}
