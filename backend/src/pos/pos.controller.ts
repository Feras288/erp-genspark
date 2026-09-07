// =====================================================
// PosController — Phase 4B-4.
//
//   GET  /api/pos/sales   pos.read
//   POST /api/pos/sales   pos.create
//
// companyId sourced exclusively from currentUser.companyId (JWT).
// POS sale = invoice of type POS that is created AND issued in one call.
// =====================================================
import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { PosService } from './pos.service';
import {
  CreatePosSaleDto,
  PosSalesQueryDto,
} from './dto/create-pos-sale.dto';

@ApiTags('POS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pos/sales')
export class PosController {
  constructor(private readonly svc: PosService) {}

  @Get()
  @RequirePermissions('pos.read')
  list(
    @CurrentUser() me: AuthenticatedUser,
    @Query() q: PosSalesQueryDto,
  ) {
    return this.svc.list(me.companyId, q);
  }

  @Post()
  @RequirePermissions('pos.create')
  @HttpCode(201)
  create(
    @CurrentUser() me: AuthenticatedUser,
    @Body() dto: CreatePosSaleDto,
  ) {
    return this.svc.create(me.companyId, me.id, dto);
  }
}
