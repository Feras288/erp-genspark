// =====================================================
// UsersService — CRUD scoped strictly by companyId from JWT.
// Never accepts companyId from input. Soft-delete via isActive=false.
// Self-protection: cannot delete/deactivate self; cannot remove last admin (TODO noted).
// =====================================================
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { SafeUser } from '../common/types/auth.types';
import { QueryUsersDto } from '../auth/dto/query-users.dto';
import { CreateUserDto, UpdateUserDto } from '../auth/dto/create-user.dto';

function publicUser(u: any, roles: { id: string; key: string; name: string }[], permissions: string[]): SafeUser {
  return {
    id: u.id,
    companyId: u.companyId,
    email: u.email,
    fullName: u.fullName,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    roles,
    permissions,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async loadPublic(userId: string): Promise<SafeUser> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!u) throw new NotFoundException('User not found');

    const roleIds = u.userRoles.map((ur) => ur.roleId);
    const permIds = roleIds.length
      ? (
          await this.prisma.rolePermission.findMany({
            where: { roleId: { in: roleIds } },
            select: { permissionId: true },
          })
        ).map((rp) => rp.permissionId)
      : [];
    const perms = permIds.length
      ? await this.prisma.permission.findMany({ where: { id: { in: permIds } }, select: { key: true } })
      : [];

    return publicUser(
      u,
      u.userRoles.map((ur) => ({ id: ur.role.id, key: ur.role.key, name: ur.role.name })),
      Array.from(new Set(perms.map((p) => p.key))),
    );
  }

  async list(companyId: string, q: QueryUsersDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: any = { companyId };
    if (q.search) {
      where.OR = [
        { email: { contains: q.search, mode: 'insensitive' } },
        { fullName: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          companyId: true,
          email: true,
          fullName: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);
    // Avoid returning passwordHash by explicit select; role summary only if requested later.
    return { total, page, pageSize, items };
  }

  async get(companyId: string, id: string): Promise<SafeUser> {
    const u = await this.prisma.user.findFirst({ where: { id, companyId } });
    if (!u) throw new NotFoundException('User not found');
    return this.loadPublic(u.id);
  }

  async create(companyId: string, dto: CreateUserDto, actorUserId: string) {
    const email = dto.email.toLowerCase().trim();
    const exists = await this.prisma.user.findFirst({ where: { companyId, email } });
    if (exists) throw new ConflictException('Email already exists in this company');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const created = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { companyId, email, passwordHash, fullName: dto.fullName, isActive: true },
      });
      if (dto.roleKeys && dto.roleKeys.length > 0) {
        const roles = await tx.role.findMany({
          where: { companyId, key: { in: dto.roleKeys } },
          select: { id: true },
        });
        if (roles.length !== dto.roleKeys.length) {
          throw new BadRequestException('One or more roleKeys are invalid for this company');
        }
        await tx.userRole.createMany({
          data: roles.map((r) => ({ userId: u.id, roleId: r.id })),
        });
      }
      return u;
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'users.created',
      entity: 'User',
      entityId: created.id,
      metadata: { email: created.email },
    });

    return this.loadPublic(created.id);
  }

  async update(companyId: string, id: string, dto: UpdateUserDto, actorUserId: string) {
    // Self cannot deactivate self.
    if (id === actorUserId && dto.isActive === false) {
      throw new ForbiddenException('You cannot deactivate yourself');
    }
    const u = await this.prisma.user.findFirst({ where: { id, companyId } });
    if (!u) throw new NotFoundException('User not found');

    const data: any = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password) {
      if (dto.password.length < 6) throw new BadRequestException('Password too short');
      data.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const updated = await this.prisma.user.update({ where: { id }, data });
    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: dto.isActive === false ? 'users.deactivated' : 'users.updated',
      entity: 'User',
      entityId: id,
    });
    return this.loadPublic(updated.id);
  }

  async remove(companyId: string, id: string, actorUserId: string) {
    if (id === actorUserId) throw new ForbiddenException('You cannot delete yourself');
    const u = await this.prisma.user.findFirst({ where: { id, companyId } });
    if (!u) throw new NotFoundException('User not found');

    // TODO(last-admin-protection): add a check that at least one user with `company_admin`
    // remains active. This is intentionally simple in Phase 1 to avoid prematurely
    // designing role-protection rules that may change in Phase 1-b.

    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'users.deactivated',
      entity: 'User',
      entityId: id,
    });
    return { id, isActive: false };
  }
}
