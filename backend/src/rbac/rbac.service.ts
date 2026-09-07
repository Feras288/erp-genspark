// =====================================================
// RBAC service — roles + permissions + assignments.
// All operations scoped strictly by companyId from JWT.
// =====================================================
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

const SYSTEM_ROLES = new Set(['company_admin']);

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listRoles(companyId: string) {
    return this.prisma.role.findMany({
      where: { companyId },
      include: { rolePermissions: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createRole(companyId: string, name: string, key: string, description: string | undefined, actorUserId: string) {
    const trimmedKey = key.trim().toLowerCase();
    const exists = await this.prisma.role.findFirst({ where: { companyId, key: trimmedKey } });
    if (exists) throw new ConflictException('Role key already exists in this company');

    const created = await this.prisma.role.create({
      data: { companyId, key: trimmedKey, name, description, isSystem: false },
    });
    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'roles.created',
      entity: 'Role',
      entityId: created.id,
      metadata: { key: trimmedKey },
    });
    return created;
  }

  async updateRole(
    companyId: string,
    roleId: string,
    patches: { name?: string; description?: string },
    actorUserId: string,
  ) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, companyId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem && patches.name !== undefined && patches.name !== role.name) {
      throw new ForbiddenException('Cannot rename a system role');
    }
    const updated = await this.prisma.role.update({ where: { id: roleId }, data: patches });
    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'roles.updated',
      entity: 'Role',
      entityId: roleId,
    });
    return updated;
  }

  async deleteRole(companyId: string, roleId: string, actorUserId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, companyId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('Cannot delete a system role');

    const usedBy = await this.prisma.userRole.count({ where: { roleId } });
    if (usedBy > 0) {
      throw new ConflictException('Role is still assigned to one or more users');
    }
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'roles.deleted',
      entity: 'Role',
      entityId: roleId,
    });
    return { ok: true };
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  }

  async assignPermissionsToRole(companyId: string, roleId: string, permissionKeys: string[], actorUserId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, companyId } });
    if (!role) throw new NotFoundException('Role not found');

    const perms = await this.prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
      select: { id: true, key: true },
    });
    if (perms.length !== permissionKeys.length) {
      const found = new Set(perms.map((p) => p.key));
      const missing = permissionKeys.filter((k) => !found.has(k));
      throw new BadRequestException(`Unknown permission(s): ${missing.join(', ')}`);
    }

    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    if (perms.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId, permissionId: p.id })),
      });
    }
    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'roles.permissions_updated',
      entity: 'Role',
      entityId: roleId,
      metadata: { count: perms.length },
    });
    return { ok: true, count: perms.length };
  }

  async assignRolesToUser(companyId: string, userId: string, roleKeys: string[], actorUserId: string) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!target) throw new NotFoundException('User not found');

    const roles = await this.prisma.role.findMany({
      where: { companyId, key: { in: roleKeys } },
      select: { id: true },
    });
    if (roles.length !== roleKeys.length) {
      throw new BadRequestException('One or more roleKeys are invalid for this company');
    }

    await this.prisma.userRole.deleteMany({ where: { userId } });
    if (roles.length > 0) {
      await this.prisma.userRole.createMany({
        data: roles.map((r) => ({ userId, roleId: r.id })),
      });
    }
    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'users.roles_updated',
      entity: 'User',
      entityId: userId,
      metadata: { roleCount: roles.length },
    });
    return { ok: true, count: roles.length, roles: roles.map((r) => r.id) };
  }
}
