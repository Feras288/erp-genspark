// Phase 5: Purchases Core — endpoints mounted at /api/purchases/invoices.
// companyId sourced exclusively from JWT (currentUser.companyId).
// Real supplier lookup, DRAFT create/update, PURCHASE_IN stock movements, and
// service-line pass-through land in Phase 5B.
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
import { PurchasesService } from './purchases.service';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { UpdatePurchaseInvoiceDto } from './dto/update-purchase-invoice.dto';
import { PurchaseInvoiceQueryDto } from './dto/purchase-invoice-query.dto';
import { ReceivePurchaseInvoiceDto } from './dto/receive-purchase-invoice.dto';
import { CancelPurchaseInvoiceDto } from './dto/cancel-purchase-invoice.dto';

@ApiTags('Purchases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchases/invoices')
export class PurchasesController {
  constructor(private readonly svc: PurchasesService) {}

  @Get()
  @RequirePermissions('purchases.read')
  list(@CurrentUser() me: AuthenticatedUser, @Query() q: PurchaseInvoiceQueryDto) {
    return this.svc.list(me.companyId, q);
  }

  @Get(':id')
  @RequirePermissions('purchases.read')
  get(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.svc.get(me.companyId, id);
  }

  @Post()
  @RequirePermissions('purchases.create')
  @HttpCode(201)
  create(
    @CurrentUser() me: AuthenticatedUser,
    @Body() dto: CreatePurchaseInvoiceDto,
  ) {
    return this.svc.create(me.companyId, me.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('purchases.update')
  update(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseInvoiceDto,
  ) {
    return this.svc.update(me.companyId, id, me.id, dto);
  }

  @Delete(':id')
  @RequirePermissions('purchases.delete')
  remove(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.svc.remove(me.companyId, id, me.id);
  }

  @Post(':id/receive')
  @RequirePermissions('purchases.receive')
  receive(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseInvoiceDto,
  ) {
    return this.svc.receive(me.companyId, id, me.id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('purchases.cancel')
  cancel(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelPurchaseInvoiceDto,
  ) {
    return this.svc.cancel(me.companyId, id, me.id, dto);
  }
}
