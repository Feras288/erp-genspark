// =====================================================
// Phase 10A: AR Payments + Settlement Tracking.
//
// Phase 10A-B-1: PaymentsController — skeleton endpoints.
//
//   Mounted under /api/sales-invoices/:invoiceId/payments via the
//   global /api prefix set in main.ts.
//
//   Routes:
//     GET /api/sales-invoices/:invoiceId/payments
//        - Permission: ar_payments.read
//        - Response:   [] skeleton (Phase 10A-B-1 contract).
//                      Real listing lands in Phase 10A-B-2.
//     POST /api/sales-invoices/:invoiceId/payments
//        - Permission: ar_payments.write
//        - Body:       CreatePaymentDto (full DTO validation enforces
//                      field shape even though logic is not yet wired).
//        - Response:   501 NotImplementedException in Phase 10A-B-1.
//
// RBAC:
//   * JwtAuthGuard + PermissionsGuard at controller level.
//   * PermissionsGuard reads @RequirePermissions metadata per route.
//
// Tenancy:
//   * companyId is sourced exclusively from JWT via
//     @CurrentUser(). DTOs do not expose companyId.
//   * invoiceId comes from URL path; tenant isolation is enforced at
//     the DB layer in 10A-B-2 (SalesInvoice.companyId must equal
//     JTW.companyId). 10A-B-1 returns [] so the cross-tenant test
//     is owned by Phase 10A-B-3 smoke + 10A-B-2 logic.
//
// Strict (Phase 10A-B-1):
//   * No settlement calculations.
//   * No PAID / PARTIALLY_PAID enum (deferred — T-2 lock).
//   * No AR-Aging source change.
//   * No AP payments (Phase 10B).
//   * No GL / bank reconciliation / drill-down.
//   * No frontend.
// =====================================================
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotImplementedException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/auth.types';

import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsQueryDto } from './dto/payments-query.dto';

@ApiTags('AR Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales-invoices/:invoiceId/payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Get()
  @RequirePermissions('ar_payments.read')
  list(
    @CurrentUser() _me: AuthenticatedUser,
    @Param('invoiceId') _invoiceId: string,
    @Query() _q: PaymentsQueryDto,
  ): Promise<unknown[]> {
    // Phase 10A-B-1 contract: returns [] skeleton. Real listing
    // (with companyId / deletedAt / invoiceId filters) lands in
    // Phase 10A-B-2 settlement calculations, mirroring the
    // Phase 9 (`reports.service.ts` arAging) shape discipline.
    return this.svc.list();
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('ar_payments.write')
  register(
    @CurrentUser() _me: AuthenticatedUser,
    @Param('invoiceId') _invoiceId: string,
    @Body() _body: CreatePaymentDto,
  ): Promise<never> {
    // Phase 10A-B-1 contract: DTO validated (class-validator runs
    // before reaching this handler), then 501 NotImplemented so
    // the route is closed but the surface is wired.
    // 10A-B-2 will implement: idempotency-key short-circuit,
    // companyId/JWT scope, SalesInvoice lookup + total/paidAmount
    // re-read inside a Prisma transaction, two-null-FK CHECK
    // enforced by DB, register + writeback paidAmount on
    // SalesInvoice, append-only AuditLog row.
    return this.svc.register();
  }
}
