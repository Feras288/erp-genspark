import {
  Body,
  Controller,
  Delete,
  Get,
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
import { UsersService } from './users.service';
import { QueryUsersDto } from '../auth/dto/query-users.dto';
import { CreateUserDto, UpdateUserDto } from '../auth/dto/create-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  list(@CurrentUser() me: AuthenticatedUser, @Query() q: QueryUsersDto) {
    return this.svc.list(me.companyId, q);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  get(@CurrentUser() me: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.get(me.companyId, id);
  }

  @Post()
  @RequirePermissions('users.create')
  create(@CurrentUser() me: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.svc.create(me.companyId, dto, me.id);
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  update(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.svc.update(me.companyId, id, dto, me.id);
  }

  @Delete(':id')
  @RequirePermissions('users.delete')
  remove(@CurrentUser() me: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(me.companyId, id, me.id);
  }
}
