import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/auth.types';
import { RbacService } from './rbac.service';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

class CreateRoleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  key!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class AssignPermissionsDto {
  @IsArray()
  permissionKeys!: string[];
}

class AssignRolesDto {
  @IsArray()
  roleKeys!: string[];
}

@ApiTags('rbac')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rbac')
export class RbacController {
  constructor(private readonly svc: RbacService) {}

  // Roles
  @Get('roles')
  @RequirePermissions('roles.read')
  listRoles(@CurrentUser() me: AuthenticatedUser) {
    return this.svc.listRoles(me.companyId);
  }

  @Post('roles')
  @RequirePermissions('roles.create')
  createRole(@CurrentUser() me: AuthenticatedUser, @Body() dto: CreateRoleDto) {
    return this.svc.createRole(me.companyId, dto.name, dto.key, dto.description, me.id);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.update')
  updateRole(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.svc.updateRole(me.companyId, id, dto, me.id);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.delete')
  deleteRole(@CurrentUser() me: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.deleteRole(me.companyId, id, me.id);
  }

  // Permissions catalog (read-only)
  @Get('permissions')
  @RequirePermissions('permissions.read')
  listPermissions() {
    return this.svc.listPermissions();
  }

  @Post('roles/:id/permissions')
  @RequirePermissions('roles.permissions.update')
  assignPermissions(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    return this.svc.assignPermissionsToRole(me.companyId, id, dto.permissionKeys, me.id);
  }

  @Post('users/:id/roles')
  @RequirePermissions('users.roles.update')
  assignRoles(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignRolesDto,
  ) {
    return this.svc.assignRolesToUser(me.companyId, id, dto.roleKeys, me.id);
  }
}
