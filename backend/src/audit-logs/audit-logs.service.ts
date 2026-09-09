// =====================================================
// Phase 15A-B-2: AuditLogsService
// Read-only querying for centralized AuditLog records
// Strict tenant isolation via companyId. No writes in this phase.
// =====================================================
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditActorType,
  AuditCategory,
  AuditSeverity,
  AuditStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogQueryDto, EntityTimelineQueryDto } from './dto/audit-log-query.dto';
import {
  AuditLogExportPreviewResponse,
  AuditLogItemResponse,
  AuditLogListResponse,
  AuditLogSingleResponse,
  CreateAuditLogInput,
} from './types/audit-log.types';
import { redactAuditPayload, truncateAuditJson } from './utils/redact-audit-payload';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  private prepareAuditData(input: CreateAuditLogInput): Prisma.AuditLogCreateInput {
    const cleanBefore = input.before != null
      ? (truncateAuditJson(redactAuditPayload(input.before)) as Prisma.InputJsonValue)
      : undefined;
    const cleanAfter = input.after != null
      ? (truncateAuditJson(redactAuditPayload(input.after)) as Prisma.InputJsonValue)
      : undefined;
    const cleanMetadata = input.metadata != null
      ? (truncateAuditJson(redactAuditPayload(input.metadata)) as Prisma.InputJsonValue)
      : undefined;

    const data: Prisma.AuditLogCreateInput = {
      actorType: input.actorType ?? AuditActorType.USER,
      category: input.category,
      event: input.event,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      action: input.action ?? null,
      severity: input.severity ?? AuditSeverity.INFO,
      status: input.status ?? AuditStatus.SUCCESS,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      route: input.route ?? null,
      method: input.method ?? null,
      before: cleanBefore ?? Prisma.JsonNull,
      after: cleanAfter ?? Prisma.JsonNull,
      metadata: cleanMetadata ?? Prisma.JsonNull,
      message: input.message ?? null,
    };

    if (input.companyId) {
      data.company = { connect: { id: input.companyId } };
    }
    if (input.actorUserId) {
      data.actorUser = { connect: { id: input.actorUserId } };
    }

    return data;
  }

  async createAuditLog(input: CreateAuditLogInput): Promise<AuditLogItemResponse> {
    const data = this.prepareAuditData(input);
    const row = await this.prisma.auditLog.create({
      data,
      include: {
        actorUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
    return this.mapLogItem(row);
  }

  async createAuditLogTx(
    tx: Prisma.TransactionClient,
    input: CreateAuditLogInput,
  ): Promise<AuditLogItemResponse> {
    const data = this.prepareAuditData(input);
    const row = await tx.auditLog.create({
      data,
      include: {
        actorUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
    return this.mapLogItem(row);
  }

  async logSuccess(
    input: Omit<CreateAuditLogInput, 'status'>,
    tx?: Prisma.TransactionClient,
  ): Promise<AuditLogItemResponse> {
    const payload: CreateAuditLogInput = {
      ...input,
      status: AuditStatus.SUCCESS,
      severity: input.severity ?? AuditSeverity.INFO,
    };
    return tx ? this.createAuditLogTx(tx, payload) : this.createAuditLog(payload);
  }

  async logFailure(
    input: Omit<CreateAuditLogInput, 'status'>,
    tx?: Prisma.TransactionClient,
  ): Promise<AuditLogItemResponse> {
    const payload: CreateAuditLogInput = {
      ...input,
      status: AuditStatus.FAILURE,
      severity: input.severity ?? AuditSeverity.ERROR,
    };
    return tx ? this.createAuditLogTx(tx, payload) : this.createAuditLog(payload);
  }

  async logBlocked(
    input: Omit<CreateAuditLogInput, 'status'>,
    tx?: Prisma.TransactionClient,
  ): Promise<AuditLogItemResponse> {
    const payload: CreateAuditLogInput = {
      ...input,
      status: AuditStatus.BLOCKED,
      severity: input.severity ?? AuditSeverity.WARNING,
    };
    return tx ? this.createAuditLogTx(tx, payload) : this.createAuditLog(payload);
  }

  private mapLogItem(log: any): AuditLogItemResponse {
    return {
      id: log.id,
      companyId: log.companyId,
      actorUserId: log.actorUserId ?? log.userId ?? null,
      actorUser: log.actorUser
        ? {
            id: log.actorUser.id,
            fullName: log.actorUser.fullName,
            email: log.actorUser.email,
          }
        : null,
      actorType: log.actorType,
      category: log.category,
      event: log.event,
      entityType: log.entityType ?? log.entity ?? null,
      entityId: log.entityId,
      action: log.action,
      severity: log.severity,
      status: log.status,
      requestId: log.requestId,
      ipAddress: log.ipAddress ?? log.ip ?? null,
      userAgent: log.userAgent,
      route: log.route,
      method: log.method,
      before: log.before,
      after: log.after,
      metadata: log.metadata,
      message: log.message,
      createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
    };
  }

  private buildWhereClause(companyId: string, query: AuditLogQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {
      companyId,
    };

    if (query.category) {
      where.category = query.category;
    }
    if (query.event) {
      where.event = { contains: query.event, mode: 'insensitive' };
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.actorUserId) {
      where.OR = [
        { actorUserId: query.actorUserId },
        { userId: query.actorUserId },
      ];
    }
    if (query.entityType) {
      where.OR = [
        { entityType: query.entityType },
        { entity: query.entityType },
      ];
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    if (query.requestId) {
      where.requestId = query.requestId;
    }
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) {
        where.createdAt.gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        where.createdAt.lte = new Date(query.toDate);
      }
    }

    return where;
  }

  async list(companyId: string, query: AuditLogQueryDto): Promise<AuditLogListResponse> {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
    const where = this.buildWhereClause(companyId, query);

    const findArgs: Prisma.AuditLogFindManyArgs = {
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        actorUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    };

    if (query.cursor) {
      findArgs.cursor = { id: query.cursor };
      findArgs.skip = 1;
    }

    const rows = await this.prisma.auditLog.findMany(findArgs);

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const extra = rows.pop();
      nextCursor = extra ? extra.id : null;
    }

    return {
      status: 'ok',
      companyId,
      filters: {
        fromDate: query.fromDate,
        toDate: query.toDate,
        category: query.category,
        event: query.event,
        severity: query.severity,
        status: query.status,
        actorUserId: query.actorUserId,
        entityType: query.entityType,
        entityId: query.entityId,
        requestId: query.requestId,
        limit,
      },
      data: {
        items: rows.map((r) => this.mapLogItem(r)),
        nextCursor,
      },
    };
  }

  async findOne(companyId: string, id: string): Promise<AuditLogSingleResponse> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        actorUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Audit log entry ${id} not found`);
    }

    return {
      status: 'ok',
      companyId,
      data: {
        item: this.mapLogItem(row),
      },
    };
  }

  async getEntityTimeline(
    companyId: string,
    entityType: string,
    entityId: string,
    query: EntityTimelineQueryDto,
  ): Promise<AuditLogListResponse> {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);

    const where: Prisma.AuditLogWhereInput = {
      companyId,
      OR: [
        { entityType, entityId },
        { entity: entityType, entityId },
      ],
    };

    const findArgs: Prisma.AuditLogFindManyArgs = {
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        actorUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    };

    if (query.cursor) {
      findArgs.cursor = { id: query.cursor };
      findArgs.skip = 1;
    }

    const rows = await this.prisma.auditLog.findMany(findArgs);

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const extra = rows.pop();
      nextCursor = extra ? extra.id : null;
    }

    return {
      status: 'ok',
      companyId,
      filters: {
        entityType,
        entityId,
        limit,
      },
      data: {
        items: rows.map((r) => this.mapLogItem(r)),
        nextCursor,
      },
    };
  }

  async getExportPreview(companyId: string, query: AuditLogQueryDto): Promise<AuditLogExportPreviewResponse> {
    const where = this.buildWhereClause(companyId, query);
    const count = await this.prisma.auditLog.count({ where });

    return {
      status: 'ok',
      companyId,
      filters: {
        fromDate: query.fromDate,
        toDate: query.toDate,
        category: query.category,
        event: query.event,
        severity: query.severity,
        status: query.status,
        actorUserId: query.actorUserId,
        entityType: query.entityType,
        entityId: query.entityId,
        requestId: query.requestId,
      },
      data: {
        count,
        exportImplemented: false,
        message: 'Audit log export is out of scope for Phase 15A-B-2.',
      },
    };
  }
}
