// Phase 4B-1 skeleton: Sales endpoints mounted at /api/sales/invoices.
// companyId sourced exclusively from JWT (currentUser.companyId).
// Real stock deduction, SALE_OUT movement, and invoice numbering land in Phase 4B-2.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
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
import { SalesService } from './sales.service';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto';
import { SalesInvoiceQueryDto } from './dto/sales-invoice-query.dto';
import { IssueSalesInvoiceDto } from './dto/issue-sales-invoice.dto';
import { CancelSalesInvoiceDto } from './dto/cancel-sales-invoice.dto';

@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales/invoices')
export class SalesController {
  constructor(private readonly svc: SalesService) {}

  @Get()
  @RequirePermissions('sales.read')
  list(@CurrentUser() me: AuthenticatedUser, @Query() q: SalesInvoiceQueryDto) {
    return this.svc.list(me.companyId, q);
  }

  @Get(':id')
  @RequirePermissions('sales.read')
  get(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.svc.get(me.companyId, id);
  }

  @Post()
  @RequirePermissions('sales.create')
  @HttpCode(201)
  create(
    @CurrentUser() me: AuthenticatedUser,
    @Body() dto: CreateSalesInvoiceDto,
  ) {
    return this.svc.create(me.companyId, me.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('sales.update')
  update(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSalesInvoiceDto,
  ) {
    return this.svc.update(me.companyId, id, me.id, dto);
  }

  @Delete(':id')
  @RequirePermissions('sales.delete')
  remove(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.svc.remove(me.companyId, id, me.id);
  }

  @Post(':id/issue')
  @RequirePermissions('sales.issue')
  issue(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: IssueSalesInvoiceDto,
  ) {
    return this.svc.issue(me.companyId, id, me.id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales.cancel')
  cancel(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelSalesInvoiceDto,
  ) {
    return this.svc.cancel(me.companyId, id, me.id, dto);
  }
}
