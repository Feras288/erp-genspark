// =====================================================
// WarehousesController — endpoints for warehouses master data.
// companyId sourced exclusively from currentUser (JWT).
// =====================================================
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
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';

@ApiTags('Warehouses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly svc: WarehousesService) {}

  @Get()
  @RequirePermissions('warehouses.read')
  list(@CurrentUser() me: AuthenticatedUser, @Query() q: WarehouseQueryDto) {
    return this.svc.list(me.companyId, q);
  }

  @Get(':id')
  @RequirePermissions('warehouses.read')
  get(@CurrentUser() me: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.get(me.companyId, id);
  }

  @Post()
  @RequirePermissions('warehouses.create')
  create(@CurrentUser() me: AuthenticatedUser, @Body() dto: CreateWarehouseDto) {
    return this.svc.create(me.companyId, dto, me.id);
  }

  @Patch(':id')
  @RequirePermissions('warehouses.update')
  update(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.svc.update(me.companyId, id, dto, me.id);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('warehouses.delete')
  remove(@CurrentUser() me: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(me.companyId, id, me.id);
  }
}
