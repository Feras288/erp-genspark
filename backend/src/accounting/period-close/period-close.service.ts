// =====================================================
// Phase 14A-B-2: PeriodCloseService
// Read-only inspection for period and fiscal year close states.
// Tenant-scoped by companyId (extracted from JWT).
// Zero mutations, zero GL posting, zero Number() money arithmetic.
// =====================================================
import { Injectable } from '@nestjs/common';
import {
  JournalEntryStatus,
  PeriodCloseStatus,
  Prisma,
  ReconciliationStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  GetFiscalYearClosesQueryDto,
  GetPeriodCloseAuditLogsQueryDto,
  GetPeriodClosesQueryDto,
  GetPeriodCloseStatusQueryDto,
} from './dto/period-close-query.dto';
import { ValidatePeriodCloseDto } from './dto/validate-period-close.dto';
import {
  FiscalYearCloseListResponse,
  PeriodCloseAuditLogListResponse,
  PeriodCloseListResponse,
  PeriodCloseStatusResponse,
  PeriodCloseValidationCheck,
  PeriodCloseValidationResponse,
} from './types/period-close.types';

function parseDateStartUtc(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
}

function parseDateEndUtc(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T23:59:59.999Z`);
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

  /**
   * 5. POST validate proposed period close (read-only checks).
   */
  async validatePeriod(
    companyId: string,
    dto: ValidatePeriodCloseDto,
  ): Promise<PeriodCloseValidationResponse> {
    const startUtc = parseDateStartUtc(dto.periodStart);
    const endUtc = parseDateEndUtc(dto.periodEnd);

    const checks: PeriodCloseValidationCheck[] = [];
    const warnings: string[] = [];

    // 1. DATE_RANGE_VALID
    const isDateRangeValid = !!startUtc && !!endUtc && startUtc <= endUtc;
    if (isDateRangeValid) {
      checks.push({
        code: 'DATE_RANGE_VALID',
        status: 'PASS',
        blocking: true,
        message: 'Period date range is valid.',
        metadata: {
          periodStart: startUtc.toISOString(),
          periodEnd: endUtc.toISOString(),
        },
      });
    } else {
      checks.push({
        code: 'DATE_RANGE_VALID',
        status: 'FAIL',
        blocking: true,
        message:
          'Invalid date range: periodEnd must be greater than or equal to periodStart.',
        metadata: {
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
        },
      });
    }

    let postedDebitTotal = new Prisma.Decimal('0');
    let postedCreditTotal = new Prisma.Decimal('0');

    if (isDateRangeValid && startUtc && endUtc) {
      // 2. NO_EXISTING_CLOSED_OVERLAP
      const overlappingClosed = await this.prisma.periodClose.findMany({
        where: {
          companyId,
          status: { in: [PeriodCloseStatus.CLOSED, PeriodCloseStatus.CLOSING] },
          periodStart: { lte: endUtc },
          periodEnd: { gte: startUtc },
        },
        select: {
          id: true,
          fiscalYear: true,
          periodNumber: true,
          status: true,
          periodStart: true,
          periodEnd: true,
        },
      });

      if (overlappingClosed.length === 0) {
        checks.push({
          code: 'NO_EXISTING_CLOSED_OVERLAP',
          status: 'PASS',
          blocking: true,
          message:
            'No closed or closing period overlaps the requested date range.',
          metadata: { count: 0 },
        });
      } else {
        checks.push({
          code: 'NO_EXISTING_CLOSED_OVERLAP',
          status: 'FAIL',
          blocking: true,
          message: `Found ${overlappingClosed.length} closed or closing period(s) overlapping the requested range.`,
          metadata: {
            count: overlappingClosed.length,
            overlappingPeriods: overlappingClosed.map((p) => ({
              id: p.id,
              fiscalYear: p.fiscalYear,
              periodNumber: p.periodNumber,
              status: p.status,
              periodStart: p.periodStart.toISOString(),
              periodEnd: p.periodEnd.toISOString(),
            })),
          },
        });
      }

      // 3. NO_DRAFT_JOURNALS
      const draftCount = await this.prisma.journalEntry.count({
        where: {
          companyId,
          status: JournalEntryStatus.DRAFT,
          entryDate: {
            gte: startUtc,
            lte: endUtc,
          },
        },
      });

      if (draftCount === 0) {
        checks.push({
          code: 'NO_DRAFT_JOURNALS',
          status: 'PASS',
          blocking: true,
          message: 'No draft journals found in the period.',
          metadata: { count: 0 },
        });
      } else {
        checks.push({
          code: 'NO_DRAFT_JOURNALS',
          status: 'FAIL',
          blocking: true,
          message: `Found ${draftCount} draft journal(s) in the period. All journals must be posted or cancelled before closing.`,
          metadata: { count: draftCount },
        });
      }

      // 4. POSTED_JOURNALS_BALANCED
      const postedEntries = await this.prisma.journalEntry.findMany({
        where: {
          companyId,
          status: JournalEntryStatus.POSTED,
          entryDate: {
            gte: startUtc,
            lte: endUtc,
          },
        },
        select: {
          id: true,
          entryNumber: true,
          lines: {
            select: {
              debit: true,
              credit: true,
            },
          },
        },
      });

      const unbalancedJournals: Array<{
        id: string;
        entryNumber: string;
        debitTotal: string;
        creditTotal: string;
      }> = [];

      for (const entry of postedEntries) {
        let lineDebit = new Prisma.Decimal('0');
        let lineCredit = new Prisma.Decimal('0');
        for (const line of entry.lines) {
          lineDebit = lineDebit.add(line.debit);
          lineCredit = lineCredit.add(line.credit);
        }
        if (!lineDebit.equals(lineCredit)) {
          unbalancedJournals.push({
            id: entry.id,
            entryNumber: entry.entryNumber,
            debitTotal: lineDebit.toFixed(4),
            creditTotal: lineCredit.toFixed(4),
          });
        }
      }

      if (unbalancedJournals.length === 0) {
        checks.push({
          code: 'POSTED_JOURNALS_BALANCED',
          status: 'PASS',
          blocking: true,
          message: `All ${postedEntries.length} posted journal(s) in the period are balanced.`,
          metadata: {
            postedJournalsCount: postedEntries.length,
            unbalancedCount: 0,
          },
        });
      } else {
        checks.push({
          code: 'POSTED_JOURNALS_BALANCED',
          status: 'FAIL',
          blocking: true,
          message: `Found ${unbalancedJournals.length} unbalanced posted journal(s) in the period.`,
          metadata: {
            postedJournalsCount: postedEntries.length,
            unbalancedCount: unbalancedJournals.length,
            unbalancedJournals: unbalancedJournals.slice(0, 10),
          },
        });
      }

      // 5. TRIAL_BALANCE_BALANCED
      const lineAgg = await this.prisma.journalEntryLine.aggregate({
        where: {
          companyId,
          entry: {
            companyId,
            status: JournalEntryStatus.POSTED,
            entryDate: {
              gte: startUtc,
              lte: endUtc,
            },
          },
        },
        _sum: {
          debit: true,
          credit: true,
        },
      });

      postedDebitTotal = lineAgg._sum.debit
        ? new Prisma.Decimal(lineAgg._sum.debit)
        : new Prisma.Decimal('0');
      postedCreditTotal = lineAgg._sum.credit
        ? new Prisma.Decimal(lineAgg._sum.credit)
        : new Prisma.Decimal('0');

      const tbBalanced = postedDebitTotal.equals(postedCreditTotal);
      checks.push({
        code: 'TRIAL_BALANCE_BALANCED',
        status: tbBalanced ? 'PASS' : 'FAIL',
        blocking: true,
        message: tbBalanced
          ? 'Trial balance is balanced (total debit equals total credit).'
          : 'Trial balance is unbalanced: total debit does not equal total credit.',
        metadata: {
          debitTotal: postedDebitTotal.toFixed(4),
          creditTotal: postedCreditTotal.toFixed(4),
          difference: postedDebitTotal.minus(postedCreditTotal).toFixed(4),
        },
      });

      // 6. NO_FAILED_POSTING_EVENTS
      checks.push({
        code: 'NO_FAILED_POSTING_EVENTS',
        status: 'SKIPPED',
        blocking: false,
        message:
          'No posting-event failure model is available in the current schema.',
        metadata: {
          reason:
            'No posting-event failure model is available in the current schema.',
        },
      });

      // 7. RECONCILIATION_WARNINGS
      try {
        const unmatchedBankTxCount = await this.prisma.bankTransaction.count({
          where: {
            companyId,
            status: ReconciliationStatus.UNMATCHED,
            transactionDate: {
              gte: startUtc,
              lte: endUtc,
            },
          },
        });

        if (unmatchedBankTxCount > 0) {
          const warnMsg = `Found ${unmatchedBankTxCount} unmatched bank transaction(s) in the period.`;
          warnings.push(warnMsg);
          checks.push({
            code: 'RECONCILIATION_WARNINGS',
            status: 'WARNING',
            blocking: false,
            message: warnMsg,
            metadata: {
              unmatchedBankTransactions: unmatchedBankTxCount,
            },
          });
        } else {
          checks.push({
            code: 'RECONCILIATION_WARNINGS',
            status: 'PASS',
            blocking: false,
            message: 'No unmatched bank transactions found in the period.',
            metadata: {
              unmatchedBankTransactions: 0,
            },
          });
        }
      } catch {
        checks.push({
          code: 'RECONCILIATION_WARNINGS',
          status: 'SKIPPED',
          blocking: false,
          message: 'Reconciliation check skipped.',
        });
      }
    } else {
      // If date range is invalid, skip other checks
      checks.push(
        {
          code: 'NO_EXISTING_CLOSED_OVERLAP',
          status: 'SKIPPED',
          blocking: true,
          message: 'Skipped due to invalid date range.',
        },
        {
          code: 'NO_DRAFT_JOURNALS',
          status: 'SKIPPED',
          blocking: true,
          message: 'Skipped due to invalid date range.',
        },
        {
          code: 'POSTED_JOURNALS_BALANCED',
          status: 'SKIPPED',
          blocking: true,
          message: 'Skipped due to invalid date range.',
        },
        {
          code: 'TRIAL_BALANCE_BALANCED',
          status: 'SKIPPED',
          blocking: true,
          message: 'Skipped due to invalid date range.',
        },
        {
          code: 'NO_FAILED_POSTING_EVENTS',
          status: 'SKIPPED',
          blocking: false,
          message:
            'No posting-event failure model is available in the current schema.',
        },
        {
          code: 'RECONCILIATION_WARNINGS',
          status: 'SKIPPED',
          blocking: false,
          message: 'Skipped due to invalid date range.',
        },
      );
    }

    const blockingFailures = checks.filter(
      (c) => c.blocking && c.status === 'FAIL',
    ).length;
    const canClose = blockingFailures === 0;

    return {
      status: 'ok',
      companyId,
      data: {
        periodStart: startUtc ? startUtc.toISOString() : dto.periodStart,
        periodEnd: endUtc ? endUtc.toISOString() : dto.periodEnd,
        fiscalYear:
          dto.fiscalYear ?? (startUtc ? startUtc.getUTCFullYear() : null),
        periodNumber: dto.periodNumber ?? null,
        canClose,
        blockingFailures,
        warnings,
        checks,
        totals: {
          postedDebitTotal: postedDebitTotal.toFixed(4),
          postedCreditTotal: postedCreditTotal.toFixed(4),
        },
      },
    };
  }
}
