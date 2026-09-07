// =====================================================
// PartnersController — endpoints for master-data partners
// (customers, suppliers, both). companyId sourced from JWT only.
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
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { PartnerQueryDto } from './dto/partner-query.dto';

@ApiTags('Partners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('partners')
export class PartnersController {
  constructor(private readonly svc: PartnersService) {}

  @Get()
  @RequirePermissions('partners.read')
  list(@CurrentUser() me: AuthenticatedUser, @Query() q: PartnerQueryDto) {
    return this.svc.list(me.companyId, q);
  }

  @Get(':id')
  @RequirePermissions('partners.read')
  get(@CurrentUser() me: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.get(me.companyId, id);
  }

  @Post()
  @RequirePermissions('partners.create')
  create(@CurrentUser() me: AuthenticatedUser, @Body() dto: CreatePartnerDto) {
    return this.svc.create(me.companyId, dto, me.id);
  }

  @Patch(':id')
  @RequirePermissions('partners.update')
  update(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.svc.update(me.companyId, id, dto, me.id);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('partners.delete')
  remove(@CurrentUser() me: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(me.companyId, id, me.id);
  }
}
