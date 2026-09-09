// =====================================================
// Phase 14A-B-2: PeriodCloseController
// Endpoints mounted under /api/accounting/period-close
// Guarded with JwtAuthGuard, PermissionsGuard, and @RequirePermissions('period_close.read')
// Tenant isolation via JWT companyId only.
// =====================================================
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import { PeriodCloseService } from './period-close.service';
import {
  GetFiscalYearClosesQueryDto,
  GetPeriodCloseAuditLogsQueryDto,
  GetPeriodClosesQueryDto,
  GetPeriodCloseStatusQueryDto,
} from './dto/period-close-query.dto';

@ApiTags('Accounting - Period Close')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('accounting/period-close')
export class PeriodCloseController {
  constructor(private readonly svc: PeriodCloseService) {}

  @Get('status')
  @RequirePermissions('period_close.read')
  getStatus(
    @CurrentUser() me: AuthenticatedUser,
    @Query() query: GetPeriodCloseStatusQueryDto,
  ) {
    return this.svc.getStatus(me.companyId, query);
  }

  @Get('periods')
  @RequirePermissions('period_close.read')
  listPeriods(
    @CurrentUser() me: AuthenticatedUser,
    @Query() query: GetPeriodClosesQueryDto,
  ) {
    return this.svc.listPeriods(me.companyId, query);
  }

  @Get('fiscal-years')
  @RequirePermissions('period_close.read')
  listFiscalYears(
    @CurrentUser() me: AuthenticatedUser,
    @Query() query: GetFiscalYearClosesQueryDto,
  ) {
    return this.svc.listFiscalYears(me.companyId, query);
  }

  @Get('audit-log')
  @RequirePermissions('period_close.read')
  listAuditLogs(
    @CurrentUser() me: AuthenticatedUser,
    @Query() query: GetPeriodCloseAuditLogsQueryDto,
  ) {
    return this.svc.listAuditLogs(me.companyId, query);
  }
}
