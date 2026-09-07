// =====================================================
// Audit log — append-only, synchronous write.
// Phase 1: best-effort. Never records passwords/tokens/JWT.
// =====================================================
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface AuditEventInput {
  companyId: string | null;
  userId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

const FORBIDDEN_KEYS = ['password', 'token', 'passwordHash', 'accessToken', 'refreshToken'];

function sanitize(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!metadata) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (FORBIDDEN_KEYS.some((fk) => k.toLowerCase().includes(fk.toLowerCase()))) continue;
    out[k] = v;
  }
  return out;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditEventInput): Promise<void> {
    try {
      const clean = sanitize(input.metadata ?? null);
      await this.prisma.auditLog.create({
        data: {
          companyId: input.companyId ?? 'system',
          userId: input.userId ?? null,
          action: input.action,
          entity: input.entity ?? null,
          entityId: input.entityId ?? null,
          metadata: clean === null ? Prisma.JsonNull : (clean as Prisma.InputJsonValue),
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (e) {
      // Never break the caller on audit failure (best-effort).
      this.logger.warn(`Failed to write audit log (${input.action}): ${(e as Error).message}`);
    }
  }
}
