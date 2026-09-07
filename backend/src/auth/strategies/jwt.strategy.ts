import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser, JwtPayload } from '../../common/types/auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') || '',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Re-hydrate the user from DB so disabled users lose access immediately.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userRoles: { include: { role: { include: { rolePermissions: true } } } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User inactive or not found');
    }

    const roles = user.userRoles.map((ur) => ur.role.key);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) =>
            // loaded via include; we need the underlying permission key
            // which we resolve one-shot below to avoid N+1.
            '',
          ),
        ),
      ),
    ).filter(Boolean);

    // Resolve permission keys in a single query.
    const permIds = Array.from(
      new Set(
        user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permissionId)),
      ),
    );
    const perms = permIds.length
      ? await this.prisma.permission.findMany({ where: { id: { in: permIds } }, select: { key: true } })
      : [];
    void permissions; // satisfies TS; actual values come from perms.

    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      roles,
      permissions: perms.map((p) => p.key),
    };
  }
}
