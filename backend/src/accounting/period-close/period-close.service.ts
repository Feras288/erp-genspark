// =====================================================
// Phase 14A-B-2: PeriodCloseService
// Read-only inspection for period and fiscal year close states.
// Tenant-scoped by companyId (extracted from JWT).
// Zero mutations, zero GL posting, zero Number() money arithmetic.
// =====================================================
import { Injectable } from '@nestjs/common';
import { PeriodCloseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  GetFiscalYearClosesQueryDto,
  GetPeriodCloseAuditLogsQueryDto,
  GetPeriodClosesQueryDto,
  GetPeriodCloseStatusQueryDto,
} from './dto/period-close-query.dto';
import {
  FiscalYearCloseListResponse,
  PeriodCloseAuditLogListResponse,
  PeriodCloseListResponse,
  PeriodCloseStatusResponse,
} from './types/period-close.types';

function parseDateStartUtc(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  if (dateStr.length === 10) {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
  return d;
}

function parseDateEndUtc(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  if (dateStr.length === 10) {
    return new Date(`${dateStr}T23:59:59.999Z`);
  }
  return d;
}

@Injectable()
export class PeriodCloseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1. GET status for a specific date (defaults to current date UTC).
   * If no period close record exists, treats it as OPEN in response without creating records.
   */
  async getStatus(
    companyId: string,
    query: GetPeriodCloseStatusQueryDto,
  ): Promise<PeriodCloseStatusResponse> {
    let targetDate: Date;
    if (query.date) {
      const parsed = new Date(query.date);
      targetDate = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      targetDate = new Date();
    }

    const [period, fiscalYear] = await Promise.all([
      this.prisma.periodClose.findFirst({
        where: {
          companyId,
          periodStart: { lte: targetDate },
          periodEnd: { gte: targetDate },
        },
        orderBy: { periodStart: 'desc' },
      }),
      this.prisma.fiscalYearClose.findFirst({
        where: {
          companyId,
          fiscalYearStart: { lte: targetDate },
          fiscalYearEnd: { gte: targetDate },
        },
        orderBy: { fiscalYearStart: 'desc' },
      }),
    ]);

    return {
      status: 'ok',
      companyId,
      data: {
        date: targetDate.toISOString(),
        period: {
          id: period?.id ?? null,
          periodStart: period ? period.periodStart.toISOString() : null,
          periodEnd: period ? period.periodEnd.toISOString() : null,
          status: period?.status ?? PeriodCloseStatus.OPEN,
          isClosed: period?.status === PeriodCloseStatus.CLOSED,
        },
        fiscalYear: {
          id: fiscalYear?.id ?? null,
          fiscalYear: fiscalYear?.fiscalYear ?? null,
          fiscalYearStart: fiscalYear ? fiscalYear.fiscalYearStart.toISOString() : null,
          fiscalYearEnd: fiscalYear ? fiscalYear.fiscalYearEnd.toISOString() : null,
          status: fiscalYear?.status ?? PeriodCloseStatus.OPEN,
          isClosed: fiscalYear?.status === PeriodCloseStatus.CLOSED,
        },
      },
    };
  }

  /**
   * 2. GET periods list for companyId.
   */
  async listPeriods(
    companyId: string,
    query: GetPeriodClosesQueryDto,
  ): Promise<PeriodCloseListResponse> {
    const limit = Math.min(query.limit ?? 100, 200);

    const fromDateParsed = parseDateStartUtc(query.fromDate);
    const toDateParsed = parseDateEndUtc(query.toDate);

    const where: Prisma.PeriodCloseWhereInput = {
      companyId,
      ...(query.fiscalYear !== undefined && { fiscalYear: query.fiscalYear }),
      ...(query.status && { status: query.status }),
      ...((fromDateParsed || toDateParsed) && {
        ...(fromDateParsed && { periodStart: { gte: fromDateParsed } }),
        ...(toDateParsed && { periodEnd: { lte: toDateParsed } }),
      }),
    };

    const periods = await this.prisma.periodClose.findMany({
      where,
      orderBy: { periodStart: 'desc' },
      take: limit,
      include: {
        closedBy: { select: { id: true, fullName: true, email: true } },
        reopenedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    return {
      status: 'ok',
      companyId,
      filters: {
        fiscalYear: query.fiscalYear ?? null,
        status: query.status ?? null,
        fromDate: query.fromDate ?? null,
        toDate: query.toDate ?? null,
        limit,
      },
      data: {
        periods: periods.map((p) => ({
          id: p.id,
          companyId: p.companyId,
          fiscalYear: p.fiscalYear,
          periodNumber: p.periodNumber,
          periodStart: p.periodStart.toISOString(),
          periodEnd: p.periodEnd.toISOString(),
          status: p.status,
          closedAt: p.closedAt ? p.closedAt.toISOString() : null,
          closedById: p.closedById,
          reopenedAt: p.reopenedAt ? p.reopenedAt.toISOString() : null,
          reopenedById: p.reopenedById,
          reopenReason: p.reopenReason,
          notes: p.notes,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          closedBy: p.closedBy,
          reopenedBy: p.reopenedBy,
        })),
      },
    };
  }

  /**
   * 3. GET fiscal years list for companyId.
   */
  async listFiscalYears(
    companyId: string,
    query: GetFiscalYearClosesQueryDto,
  ): Promise<FiscalYearCloseListResponse> {
    const limit = Math.min(query.limit ?? 50, 100);

    const where: Prisma.FiscalYearCloseWhereInput = {
      companyId,
      ...(query.fiscalYear !== undefined && { fiscalYear: query.fiscalYear }),
      ...(query.status && { status: query.status }),
    };

    const fiscalYears = await this.prisma.fiscalYearClose.findMany({
      where,
      orderBy: { fiscalYearStart: 'desc' },
      take: limit,
      include: {
        closedBy: { select: { id: true, fullName: true, email: true } },
        reopenedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    return {
      status: 'ok',
      companyId,
      filters: {
        fiscalYear: query.fiscalYear ?? null,
        status: query.status ?? null,
        limit,
      },
      data: {
        fiscalYears: fiscalYears.map((fy) => ({
          id: fy.id,
          companyId: fy.companyId,
          fiscalYear: fy.fiscalYear,
          fiscalYearStart: fy.fiscalYearStart.toISOString(),
          fiscalYearEnd: fy.fiscalYearEnd.toISOString(),
          status: fy.status,
          retainedEarningsJournalEntryId: fy.retainedEarningsJournalEntryId,
          closedAt: fy.closedAt ? fy.closedAt.toISOString() : null,
          closedById: fy.closedById,
          reopenedAt: fy.reopenedAt ? fy.reopenedAt.toISOString() : null,
          reopenedById: fy.reopenedById,
          reopenReason: fy.reopenReason,
          notes: fy.notes,
          createdAt: fy.createdAt.toISOString(),
          updatedAt: fy.updatedAt.toISOString(),
          closedBy: fy.closedBy,
          reopenedBy: fy.reopenedBy,
        })),
      },
    };
  }

  /**
   * 4. GET audit logs for period and fiscal year close actions.
   */
  async listAuditLogs(
    companyId: string,
    query: GetPeriodCloseAuditLogsQueryDto,
  ): Promise<PeriodCloseAuditLogListResponse> {
    const limit = Math.min(query.limit ?? 100, 200);

    const where: Prisma.PeriodCloseAuditLogWhereInput = {
      companyId,
      ...(query.periodCloseId && { periodCloseId: query.periodCloseId }),
      ...(query.fiscalYearCloseId && { fiscalYearCloseId: query.fiscalYearCloseId }),
      ...(query.action && { action: query.action }),
    };

    const logs = await this.prisma.periodCloseAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actorUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    return {
      status: 'ok',
      companyId,
      filters: {
        periodCloseId: query.periodCloseId ?? null,
        fiscalYearCloseId: query.fiscalYearCloseId ?? null,
        action: query.action ?? null,
        limit,
      },
      data: {
        auditLogs: logs.map((log) => ({
          id: log.id,
          companyId: log.companyId,
          periodCloseId: log.periodCloseId,
          fiscalYearCloseId: log.fiscalYearCloseId,
          action: log.action,
          actorUserId: log.actorUserId,
          reason: log.reason,
          metadata: log.metadata,
          createdAt: log.createdAt.toISOString(),
          actorUser: log.actorUser,
        })),
      },
    };
  }
}
