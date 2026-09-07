// =====================================================
// ProductsController — endpoints for products master data.
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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  @RequirePermissions('products.read')
  list(@CurrentUser() me: AuthenticatedUser, @Query() q: ProductQueryDto) {
    return this.svc.list(me.companyId, q);
  }

  @Get(':id')
  @RequirePermissions('products.read')
  get(@CurrentUser() me: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.get(me.companyId, id);
  }

  @Post()
  @RequirePermissions('products.create')
  create(@CurrentUser() me: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.svc.create(me.companyId, dto, me.id);
  }

  @Patch(':id')
  @RequirePermissions('products.update')
  update(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.svc.update(me.companyId, id, dto, me.id);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('products.delete')
  remove(@CurrentUser() me: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(me.companyId, id, me.id);
  }
}
