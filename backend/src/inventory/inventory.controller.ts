// =====================================================
// InventoryController — Phase 3 endpoints.
//
//   GET  /api/inventory/levels       (inventory.read)
//   GET  /api/inventory/movements    (stockMovements.read)
//   POST /api/inventory/adjustments  (inventory.adjust)
//   POST /api/inventory/transfers    (inventory.transfer)
//
// companyId sourced exclusively from currentUser (JWT).
// =====================================================
import {
  Body,
  Controller,
  Get,
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
import { InventoryService } from './inventory.service';
import { StockLevelQueryDto } from './dto/stock-level-query.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockTransferDto } from './dto/stock-transfer.dto';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  @Get('levels')
  @RequirePermissions('inventory.read')
  listLevels(@CurrentUser() me: AuthenticatedUser, @Query() q: StockLevelQueryDto) {
    return this.svc.listLevels(me.companyId, q);
  }

  @Get('movements')
  @RequirePermissions('stockMovements.read')
  listMovements(@CurrentUser() me: AuthenticatedUser, @Query() q: StockMovementQueryDto) {
    return this.svc.listMovements(me.companyId, q);
  }

  @Post('adjustments')
  @RequirePermissions('inventory.adjust')
  adjust(
    @CurrentUser() me: AuthenticatedUser,
    @Body() dto: StockAdjustmentDto,
  ) {
    return this.svc.adjust(me.companyId, dto, me.id);
  }

  @Post('transfers')
  @RequirePermissions('inventory.transfer')
  transfer(
    @CurrentUser() me: AuthenticatedUser,
    @Body() dto: StockTransferDto,
  ) {
    return this.svc.transfer(me.companyId, dto, me.id);
  }
}
