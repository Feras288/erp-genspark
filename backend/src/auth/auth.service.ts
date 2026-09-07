// =====================================================
// AuthService — login, refresh (with rotation), logout, me.
// Refresh tokens are stored ONLY as SHA-256 hashes.
// Raw tokens are returned to the client (cookie) and never logged.
// =====================================================
import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser, AuthResponseBody, JwtPayload, SafeUser } from '../common/types/auth.types';

function ttlStringToMs(ttl: string): number {
  // Minimal parser for "15m", "7d", "1h", "30s". Not for prod edge cases.
  const m = /^(\d+)(s|m|h|d)$/.exec(ttl.trim());
  if (!m) throw new BadRequestException('Invalid TTL format');
  const n = Number(m[1]);
  const unit = m[2];
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

function hashRefresh(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function genOpaqueToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private async loadSafeUser(userId: string): Promise<SafeUser> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
      },
    });
    if (!u) throw new UnauthorizedException();

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

    return {
      id: u.id,
      companyId: u.companyId,
      email: u.email,
      fullName: u.fullName,
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      roles: u.userRoles.map((ur) => ({ id: ur.role.id, key: ur.role.key, name: ur.role.name })),
      permissions: Array.from(new Set(perms.map((p) => p.key))),
    };
  }

  private signAccess(user: SafeUser): string {
    const payload: JwtPayload = {
      sub: user.id,
      companyId: user.companyId,
      email: user.email,
    };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') || '15m',
    });
  }

  private async issueRefresh(userId: string, companyId: string): Promise<{ token: string; ms: number }> {
    const raw = genOpaqueToken();
    const ttl = this.config.get<string>('JWT_REFRESH_TTL') || '7d';
    const ms = ttlStringToMs(ttl);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        // we store companyId via User.companyId in queries; explicit not needed on row
        tokenHash: hashRefresh(raw),
        expiresAt: new Date(Date.now() + ms),
      },
    });
    return { token: raw, ms };
  }

  async login(
    emailRaw: string,
    password: string,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<{ response: AuthResponseBody; refreshToken: string; refreshMaxAgeMs: number }> {
    const email = (emailRaw ?? '').toLowerCase().trim();
    // Always run bcrypt to avoid timing-based user enumeration.
    const userRow = await this.prisma.user.findFirst({ where: { email } });

    const fakeHash = '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
    const ok = userRow
      ? await bcrypt.compare(password, userRow.passwordHash)
      : await bcrypt.compare(password, fakeHash).catch(() => false);

    if (!userRow || !userRow.isActive || !ok) {
      await this.audit.record({
        companyId: userRow?.companyId ?? null,
        userId: userRow?.id ?? null,
        action: 'auth.login.failed',
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        metadata: { email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const safe = await this.loadSafeUser(userRow.id);
    const accessToken = this.signAccess(safe);
    const refresh = await this.issueRefresh(safe.id, safe.companyId);

    await this.audit.record({
      companyId: safe.companyId,
      userId: safe.id,
      action: 'auth.login.success',
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return {
      response: { accessToken, user: safe },
      refreshToken: refresh.token,
      refreshMaxAgeMs: refresh.ms,
    };
  }

  async refresh(
    refreshTokenRaw: string | undefined,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<{ response: AuthResponseBody; refreshToken: string; refreshMaxAgeMs: number }> {
    if (!refreshTokenRaw) {
      await this.audit.record({ companyId: null, action: 'auth.refresh.failed', ip: meta.ip ?? null });
      throw new UnauthorizedException();
    }
    const tokenHash = hashRefresh(refreshTokenRaw);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      await this.audit.record({
        companyId: row?.user?.companyId ?? null,
        userId: row?.user?.id ?? null,
        action: 'auth.refresh.failed',
        ip: meta.ip ?? null,
      });
      throw new UnauthorizedException();
    }

    // Rotation: revoke used token, issue a new one.
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    const safe = await this.loadSafeUser(row.userId);
    const accessToken = this.signAccess(safe);
    const refresh = await this.issueRefresh(safe.id, safe.companyId);

    await this.audit.record({
      companyId: safe.companyId,
      userId: safe.id,
      action: 'auth.refresh.success',
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return {
      response: { accessToken, user: safe },
      refreshToken: refresh.token,
      refreshMaxAgeMs: refresh.ms,
    };
  }

  async logout(
    refreshTokenRaw: string | undefined,
    meta: { ip?: string; userAgent?: string; userId?: string | null; companyId?: string | null } = {},
  ): Promise<void> {
    if (refreshTokenRaw) {
      const tokenHash = hashRefresh(refreshTokenRaw);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.record({
      companyId: meta.companyId ?? null,
      userId: meta.userId ?? null,
      action: 'auth.logout',
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
  }

  async me(userId: string): Promise<SafeUser> {
    return this.loadSafeUser(userId);
  }

  async getAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const safe = await this.loadSafeUser(userId);
    return {
      id: safe.id,
      companyId: safe.companyId,
      email: safe.email,
      fullName: safe.fullName,
      isActive: safe.isActive,
      roles: safe.roles.map((r) => r.key),
      permissions: safe.permissions,
    };
  }
}
