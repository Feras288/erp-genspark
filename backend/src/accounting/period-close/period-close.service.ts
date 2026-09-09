// =====================================================
// Phase 14A-B-2: PeriodCloseService
// Read-only inspection for period and fiscal year close states.
// Tenant-scoped by companyId (extracted from JWT).
// Zero mutations, zero GL posting, zero Number() money arithmetic.
// =====================================================
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JournalEntryStatus,
  PeriodCloseAuditAction,
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
import { ClosePeriodDto } from './dto/close-period.dto';
import { ReopenPeriodDto } from './dto/reopen-period.dto';
import { ValidateFiscalYearCloseDto } from './dto/validate-fiscal-year-close.dto';
import { CloseFiscalYearDto } from './dto/close-fiscal-year.dto';
import { ReopenFiscalYearDto } from './dto/reopen-fiscal-year.dto';
import {
  CloseFiscalYearResponse,
  ClosePeriodResponse,
  FiscalYearCloseListResponse,
  FiscalYearCloseValidationCheck,
  FiscalYearValidationResponse,
  PeriodCloseAuditLogListResponse,
  PeriodCloseListResponse,
  PeriodCloseStatusResponse,
  PeriodCloseValidationCheck,
  PeriodCloseValidationResponse,
  ReopenFiscalYearResponse,
  ReopenPeriodResponse,
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

/**
 * Period & Fiscal Year Close Guard:
 * Asserts that entryDate does not fall within any PeriodClose row with status CLOSED or CLOSING,
 * or any FiscalYearClose row with status CLOSED or CLOSING.
 * Throws ConflictException (HTTP 409) if closed/closing.
 * Read-only, zero database mutations.
 */
export async function assertPeriodIsOpen(
  prisma: {
    periodClose: {
      findFirst: (args: {
        where: {
          companyId: string;
          status: { in: PeriodCloseStatus[] };
          periodStart: { lte: Date };
          periodEnd: { gte: Date };
        };
        select: {
          id: true;
          periodStart: true;
          periodEnd: true;
          status: true;
          fiscalYear: true;
          periodNumber: true;
        };
      }) => Promise<{
        id: string;
        periodStart: Date;
        periodEnd: Date;
        status: PeriodCloseStatus;
        fiscalYear: number;
        periodNumber: number | null;
      } | null>;
    };
    fiscalYearClose?: {
      findFirst: (args: {
        where: {
          companyId: string;
          status: { in: PeriodCloseStatus[] };
          fiscalYearStart: { lte: Date };
          fiscalYearEnd: { gte: Date };
        };
        select: {
          id: true;
          fiscalYear: true;
          fiscalYearStart: true;
          fiscalYearEnd: true;
          status: true;
        };
      }) => Promise<{
        id: string;
        fiscalYear: number;
        fiscalYearStart: Date;
        fiscalYearEnd: Date;
        status: PeriodCloseStatus;
      } | null>;
    };
  },
  companyId: string,
  entryDate: Date | string,
  context?: string,
): Promise<void> {
  let targetDate: Date;
  if (typeof entryDate === 'string') {
    targetDate = new Date(entryDate);
  } else {
    targetDate = entryDate;
  }

  if (!targetDate || isNaN(targetDate.getTime())) {
    throw new BadRequestException(
      'Invalid entry date provided for period close check',
    );
  }

  const closedPeriod = await prisma.periodClose.findFirst({
    where: {
      companyId,
      status: { in: [PeriodCloseStatus.CLOSED, PeriodCloseStatus.CLOSING] },
      periodStart: { lte: targetDate },
      periodEnd: { gte: targetDate },
    },
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      fiscalYear: true,
      periodNumber: true,
    },
  });

  const contextMsg = context ? ` (${context})` : '';

  if (closedPeriod) {
    const startStr = closedPeriod.periodStart.toISOString().slice(0, 10);
    const endStr = closedPeriod.periodEnd.toISOString().slice(0, 10);
    throw new ConflictException(
      `Cannot post or modify accounting records${contextMsg}: Date ${targetDate
        .toISOString()
        .slice(0, 10)} falls within a ${closedPeriod.status} period (${startStr} to ${endStr}).`,
    );
  }

  if (prisma.fiscalYearClose) {
    const closedFiscalYear = await prisma.fiscalYearClose.findFirst({
      where: {
        companyId,
        status: { in: [PeriodCloseStatus.CLOSED, PeriodCloseStatus.CLOSING] },
        fiscalYearStart: { lte: targetDate },
        fiscalYearEnd: { gte: targetDate },
      },
      select: {
        id: true,
        fiscalYear: true,
        fiscalYearStart: true,
        fiscalYearEnd: true,
        status: true,
      },
    });

    if (closedFiscalYear) {
      const fyStartStr = closedFiscalYear.fiscalYearStart.toISOString().slice(0, 10);
      const fyEndStr = closedFiscalYear.fiscalYearEnd.toISOString().slice(0, 10);
      throw new ConflictException(
        `Cannot post or modify accounting records${contextMsg}: Date ${targetDate
          .toISOString()
          .slice(0, 10)} falls within a ${closedFiscalYear.status} fiscal year (${closedFiscalYear.fiscalYear}: ${fyStartStr} to ${fyEndStr}).`,
      );
    }
  }
}

@Injectable()
export class PeriodCloseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Period Close Guard:
   * Asserts that entryDate does not fall within any PeriodClose row with status CLOSED or CLOSING.
   * Throws ConflictException (HTTP 409) if closed/closing.
   * Read-only, zero database mutations.
   */
  async assertPeriodIsOpen(
    companyId: string,
    entryDate: Date | string,
    context?: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<void> {
    return assertPeriodIsOpen(
      txClient ?? this.prisma,
      companyId,
      entryDate,
      context,
    );
  }

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

  /**
   * 6. POST close an accounting period.
   * Runs validation, verifies overlap, creates/updates PeriodClose as CLOSED,
   * writes PeriodCloseAuditLog, all inside a database transaction.
   */
  async closePeriod(
    companyId: string,
    userId: string,
    dto: ClosePeriodDto,
  ): Promise<ClosePeriodResponse> {
    const startUtc = parseDateStartUtc(dto.periodStart);
    const endUtc = parseDateEndUtc(dto.periodEnd);

    if (!startUtc || !endUtc || endUtc < startUtc) {
      throw new BadRequestException(
        'Invalid date range: periodEnd must be greater than or equal to periodStart',
      );
    }

    // Run existing validation logic
    const validation = await this.validatePeriod(companyId, {
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      fiscalYear: dto.fiscalYear,
      periodNumber: dto.periodNumber,
    });

    if (!validation.data.canClose) {
      throw new ConflictException({
        message:
          'Period close validation failed. Please resolve blocking checks before closing.',
        validation: validation.data,
      });
    }

    // Check if an exact PeriodClose row already exists
    const existing = await this.prisma.periodClose.findUnique({
      where: {
        companyId_periodStart_periodEnd: {
          companyId,
          periodStart: startUtc,
          periodEnd: endUtc,
        },
      },
    });

    if (
      existing &&
      (existing.status === PeriodCloseStatus.CLOSED ||
        existing.status === PeriodCloseStatus.CLOSING)
    ) {
      throw new ConflictException('Period is already closed or closing');
    }

    const closedAt = new Date();

    const periodClose = await this.prisma.$transaction(async (tx) => {
      let pc;
      if (existing) {
        pc = await tx.periodClose.update({
          where: { id: existing.id },
          data: {
            status: PeriodCloseStatus.CLOSED,
            closedAt,
            closedById: userId,
            fiscalYear: dto.fiscalYear ?? existing.fiscalYear,
            periodNumber: dto.periodNumber ?? existing.periodNumber,
            notes: dto.notes ?? existing.notes,
          },
        });
      } else {
        pc = await tx.periodClose.create({
          data: {
            companyId,
            fiscalYear: dto.fiscalYear ?? startUtc.getUTCFullYear(),
            periodNumber: dto.periodNumber ?? null,
            periodStart: startUtc,
            periodEnd: endUtc,
            status: PeriodCloseStatus.CLOSED,
            closedAt,
            closedById: userId,
            notes: dto.notes ?? null,
          },
        });
      }

      await tx.periodCloseAuditLog.create({
        data: {
          companyId,
          periodCloseId: pc.id,
          action: PeriodCloseAuditAction.CLOSED,
          actorUserId: userId,
          reason: dto.notes ?? null,
          metadata: {
            periodStart: startUtc.toISOString(),
            periodEnd: endUtc.toISOString(),
            fiscalYear: pc.fiscalYear,
            periodNumber: pc.periodNumber,
          },
        },
      });

      return pc;
    });

    return {
      status: 'ok',
      companyId,
      data: {
        periodClose: {
          id: periodClose.id,
          periodStart: periodClose.periodStart.toISOString(),
          periodEnd: periodClose.periodEnd.toISOString(),
          fiscalYear: periodClose.fiscalYear,
          periodNumber: periodClose.periodNumber,
          status: periodClose.status,
          closedAt: periodClose.closedAt
            ? periodClose.closedAt.toISOString()
            : null,
          closedById: periodClose.closedById,
          notes: periodClose.notes,
        },
        validation: {
          canClose: validation.data.canClose,
          blockingFailures: validation.data.blockingFailures,
        },
      },
    };
  }

  /**
   * 7. POST reopen a closed accounting period.
   * Reopens a CLOSED period back to OPEN status with audit logging.
   */
  async reopenPeriod(
    companyId: string,
    userId: string,
    id: string,
    dto: ReopenPeriodDto,
  ): Promise<ReopenPeriodResponse> {
    const existing = await this.prisma.periodClose.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new NotFoundException('Period close record not found');
    }

    if (existing.status !== PeriodCloseStatus.CLOSED) {
      throw new ConflictException(
        `Only CLOSED periods may be reopened (current status: ${existing.status})`,
      );
    }

    const reopenedAt = new Date();

    const reopenedPeriod = await this.prisma.$transaction(async (tx) => {
      const period = await tx.periodClose.update({
        where: { id: existing.id },
        data: {
          status: PeriodCloseStatus.OPEN,
          reopenedAt,
          reopenedById: userId,
          reopenReason: dto.reason,
        },
      });

      await tx.periodCloseAuditLog.create({
        data: {
          companyId,
          periodCloseId: period.id,
          action: PeriodCloseAuditAction.REOPENED,
          actorUserId: userId,
          reason: dto.reason,
          metadata: {
            periodStart: period.periodStart.toISOString(),
            periodEnd: period.periodEnd.toISOString(),
            reopenedAt: reopenedAt.toISOString(),
          },
        },
      });

      return period;
    });

    return {
      status: 'ok',
      companyId,
      data: {
        periodClose: {
          id: reopenedPeriod.id,
          periodStart: reopenedPeriod.periodStart.toISOString(),
          periodEnd: reopenedPeriod.periodEnd.toISOString(),
          status: reopenedPeriod.status,
          reopenedAt: reopenedPeriod.reopenedAt
            ? reopenedPeriod.reopenedAt.toISOString()
            : null,
          reopenedById: reopenedPeriod.reopenedById,
          reopenReason: reopenedPeriod.reopenReason,
        },
      },
    };
  }

  /**
   * 8. POST validate a proposed fiscal year close.
   * Read-only validation service that checks:
   * A. FISCAL_YEAR_RANGE_VALID
   * B. NO_EXISTING_CLOSED_FISCAL_YEAR_OVERLAP
   * C. ALL_PERIODS_CLOSED
   * D. NO_DRAFT_JOURNALS_IN_YEAR
   * E. POSTED_JOURNALS_BALANCED_IN_YEAR
   * F. YEAR_TRIAL_BALANCE_BALANCED
   * G. RETAINED_EARNINGS_POSTING_SKIPPED
   */
  async validateFiscalYear(
    companyId: string,
    dto: ValidateFiscalYearCloseDto,
  ): Promise<FiscalYearValidationResponse> {
    const startUtc = parseDateStartUtc(dto.fiscalYearStart);
    const endUtc = parseDateEndUtc(dto.fiscalYearEnd);

    if (!startUtc || !endUtc || endUtc < startUtc) {
      throw new BadRequestException(
        'Invalid date range: fiscalYearEnd must be greater than or equal to fiscalYearStart',
      );
    }

    const checks: FiscalYearCloseValidationCheck[] = [];
    const warnings: string[] = [];

    // A. FISCAL_YEAR_RANGE_VALID
    checks.push({
      code: 'FISCAL_YEAR_RANGE_VALID',
      status: 'PASS',
      blocking: true,
      message: `Fiscal year date range is valid (${startUtc.toISOString().slice(0, 10)} to ${endUtc.toISOString().slice(0, 10)}).`,
      metadata: {
        fiscalYearStart: startUtc.toISOString(),
        fiscalYearEnd: endUtc.toISOString(),
      },
    });

    // B. NO_EXISTING_CLOSED_FISCAL_YEAR_OVERLAP
    const overlappingClosedFYs = await this.prisma.fiscalYearClose.findMany({
      where: {
        companyId,
        status: { in: [PeriodCloseStatus.CLOSED, PeriodCloseStatus.CLOSING] },
        fiscalYearStart: { lte: endUtc },
        fiscalYearEnd: { gte: startUtc },
      },
      select: {
        id: true,
        fiscalYear: true,
        fiscalYearStart: true,
        fiscalYearEnd: true,
        status: true,
      },
    });

    if (overlappingClosedFYs.length === 0) {
      checks.push({
        code: 'NO_EXISTING_CLOSED_FISCAL_YEAR_OVERLAP',
        status: 'PASS',
        blocking: true,
        message: 'No overlapping closed or closing fiscal years found.',
        metadata: { count: 0 },
      });
    } else {
      checks.push({
        code: 'NO_EXISTING_CLOSED_FISCAL_YEAR_OVERLAP',
        status: 'FAIL',
        blocking: true,
        message: `Found ${overlappingClosedFYs.length} overlapping closed or closing fiscal year(s).`,
        metadata: {
          count: overlappingClosedFYs.length,
          overlappingFiscalYears: overlappingClosedFYs.map((fy) => ({
            id: fy.id,
            fiscalYear: fy.fiscalYear,
            fiscalYearStart: fy.fiscalYearStart.toISOString().slice(0, 10),
            fiscalYearEnd: fy.fiscalYearEnd.toISOString().slice(0, 10),
            status: fy.status,
          })),
        },
      });
    }

    // C. ALL_PERIODS_CLOSED
    const periodsInYear = await this.prisma.periodClose.findMany({
      where: {
        companyId,
        periodStart: { gte: startUtc },
        periodEnd: { lte: endUtc },
      },
      select: {
        id: true,
        fiscalYear: true,
        periodNumber: true,
        periodStart: true,
        periodEnd: true,
        status: true,
      },
    });

    const totalPeriods = periodsInYear.length;
    const closedPeriods = periodsInYear.filter(
      (p) => p.status === PeriodCloseStatus.CLOSED,
    ).length;
    const openPeriods = periodsInYear.filter(
      (p) => p.status !== PeriodCloseStatus.CLOSED,
    ).length;

    if (totalPeriods === 0) {
      checks.push({
        code: 'ALL_PERIODS_CLOSED',
        status: 'FAIL',
        blocking: true,
        message:
          'No accounting periods found within this fiscal year range. Accounting periods must be created and closed before closing the fiscal year.',
        metadata: {
          totalPeriods: 0,
          closedPeriods: 0,
          openPeriods: 0,
        },
      });
    } else if (openPeriods > 0) {
      checks.push({
        code: 'ALL_PERIODS_CLOSED',
        status: 'FAIL',
        blocking: true,
        message: `Found ${openPeriods} unclosed period(s) out of ${totalPeriods} in the fiscal year. All periods must be closed before closing the fiscal year.`,
        metadata: {
          totalPeriods,
          closedPeriods,
          openPeriods,
          unclosedPeriods: periodsInYear
            .filter((p) => p.status !== PeriodCloseStatus.CLOSED)
            .map((p) => ({
              id: p.id,
              periodNumber: p.periodNumber,
              periodStart: p.periodStart.toISOString().slice(0, 10),
              periodEnd: p.periodEnd.toISOString().slice(0, 10),
              status: p.status,
            })),
        },
      });
    } else {
      checks.push({
        code: 'ALL_PERIODS_CLOSED',
        status: 'PASS',
        blocking: true,
        message: `All ${totalPeriods} accounting period(s) in the fiscal year are closed.`,
        metadata: {
          totalPeriods,
          closedPeriods,
          openPeriods: 0,
        },
      });
    }

    // D. NO_DRAFT_JOURNALS_IN_YEAR
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
        code: 'NO_DRAFT_JOURNALS_IN_YEAR',
        status: 'PASS',
        blocking: true,
        message: 'No draft journals found in the fiscal year.',
        metadata: { count: 0 },
      });
    } else {
      checks.push({
        code: 'NO_DRAFT_JOURNALS_IN_YEAR',
        status: 'FAIL',
        blocking: true,
        message: `Found ${draftCount} draft journal(s) in the fiscal year. All journals must be posted or cancelled before closing.`,
        metadata: { count: draftCount },
      });
    }

    // E. POSTED_JOURNALS_BALANCED_IN_YEAR
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
        code: 'POSTED_JOURNALS_BALANCED_IN_YEAR',
        status: 'PASS',
        blocking: true,
        message: `All ${postedEntries.length} posted journal(s) in the fiscal year are balanced.`,
        metadata: {
          postedJournalsCount: postedEntries.length,
          unbalancedCount: 0,
        },
      });
    } else {
      checks.push({
        code: 'POSTED_JOURNALS_BALANCED_IN_YEAR',
        status: 'FAIL',
        blocking: true,
        message: `Found ${unbalancedJournals.length} unbalanced posted journal(s) in the fiscal year.`,
        metadata: {
          postedJournalsCount: postedEntries.length,
          unbalancedCount: unbalancedJournals.length,
          unbalancedJournals: unbalancedJournals.slice(0, 10),
        },
      });
    }

    // F. YEAR_TRIAL_BALANCE_BALANCED
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

    const postedDebitTotal = lineAgg._sum.debit ?? new Prisma.Decimal('0');
    const postedCreditTotal = lineAgg._sum.credit ?? new Prisma.Decimal('0');

    if (postedDebitTotal.equals(postedCreditTotal)) {
      checks.push({
        code: 'YEAR_TRIAL_BALANCE_BALANCED',
        status: 'PASS',
        blocking: true,
        message: `Fiscal year trial balance is balanced (debit: ${postedDebitTotal.toFixed(4)}, credit: ${postedCreditTotal.toFixed(4)}).`,
        metadata: {
          debitTotal: postedDebitTotal.toFixed(4),
          creditTotal: postedCreditTotal.toFixed(4),
        },
      });
    } else {
      checks.push({
        code: 'YEAR_TRIAL_BALANCE_BALANCED',
        status: 'FAIL',
        blocking: true,
        message: `Fiscal year trial balance is out of balance. Total debit: ${postedDebitTotal.toFixed(4)}, total credit: ${postedCreditTotal.toFixed(4)}.`,
        metadata: {
          debitTotal: postedDebitTotal.toFixed(4),
          creditTotal: postedCreditTotal.toFixed(4),
          difference: postedDebitTotal.minus(postedCreditTotal).abs().toFixed(4),
        },
      });
    }

    // G. RETAINED_EARNINGS_POSTING_SKIPPED
    checks.push({
      code: 'RETAINED_EARNINGS_POSTING_SKIPPED',
      status: 'SKIPPED',
      blocking: false,
      message:
        'Automated retained earnings journal posting is intentionally out of scope for Phase 14A-B-6.',
    });

    const blockingFailures = checks.filter(
      (c) => c.blocking && c.status === 'FAIL',
    ).length;
    const canClose = blockingFailures === 0;

    return {
      status: 'ok',
      companyId,
      data: {
        fiscalYear: dto.fiscalYear,
        fiscalYearStart: startUtc.toISOString(),
        fiscalYearEnd: endUtc.toISOString(),
        canClose,
        blockingFailures,
        warnings,
        checks,
        totals: {
          postedDebitTotal: postedDebitTotal.toFixed(4),
          postedCreditTotal: postedCreditTotal.toFixed(4),
        },
        retainedEarnings: {
          postingCreated: false,
          reason:
            'Automated retained earnings journal posting is intentionally out of scope for Phase 14A-B-6.',
        },
      },
    };
  }

  /**
   * 9. POST close a fiscal year.
   * Runs validation, verifies overlap, creates/updates FiscalYearClose as CLOSED,
   * writes PeriodCloseAuditLog, all inside a database transaction.
   * Retained earnings journal posting is intentionally omitted.
   */
  async closeFiscalYear(
    companyId: string,
    userId: string,
    dto: CloseFiscalYearDto,
  ): Promise<CloseFiscalYearResponse> {
    const startUtc = parseDateStartUtc(dto.fiscalYearStart);
    const endUtc = parseDateEndUtc(dto.fiscalYearEnd);

    if (!startUtc || !endUtc || endUtc < startUtc) {
      throw new BadRequestException(
        'Invalid date range: fiscalYearEnd must be greater than or equal to fiscalYearStart',
      );
    }

    // Run fiscal-year validation first
    const validation = await this.validateFiscalYear(companyId, {
      fiscalYear: dto.fiscalYear,
      fiscalYearStart: dto.fiscalYearStart,
      fiscalYearEnd: dto.fiscalYearEnd,
    });

    if (!validation.data.canClose) {
      throw new ConflictException({
        message:
          'Fiscal year close validation failed. Please resolve blocking checks before closing.',
        validation: validation.data,
      });
    }

    // Check if exact FiscalYearClose exists for companyId + fiscalYear
    const existing = await this.prisma.fiscalYearClose.findUnique({
      where: {
        companyId_fiscalYear: {
          companyId,
          fiscalYear: dto.fiscalYear,
        },
      },
    });

    if (
      existing &&
      (existing.status === PeriodCloseStatus.CLOSED ||
        existing.status === PeriodCloseStatus.CLOSING)
    ) {
      throw new ConflictException('Fiscal year is already closed or closing');
    }

    const closedAt = new Date();

    const fiscalYearClose = await this.prisma.$transaction(async (tx) => {
      let fyc;
      if (existing) {
        fyc = await tx.fiscalYearClose.update({
          where: { id: existing.id },
          data: {
            fiscalYearStart: startUtc,
            fiscalYearEnd: endUtc,
            status: PeriodCloseStatus.CLOSED,
            closedAt,
            closedById: userId,
            notes: dto.notes ?? existing.notes,
            retainedEarningsJournalEntryId: null,
          },
        });
      } else {
        fyc = await tx.fiscalYearClose.create({
          data: {
            companyId,
            fiscalYear: dto.fiscalYear,
            fiscalYearStart: startUtc,
            fiscalYearEnd: endUtc,
            status: PeriodCloseStatus.CLOSED,
            closedAt,
            closedById: userId,
            notes: dto.notes ?? null,
            retainedEarningsJournalEntryId: null,
          },
        });
      }

      await tx.periodCloseAuditLog.create({
        data: {
          companyId,
          fiscalYearCloseId: fyc.id,
          action: PeriodCloseAuditAction.CLOSED,
          actorUserId: userId,
          reason: dto.notes ?? null,
          metadata: {
            fiscalYear: fyc.fiscalYear,
            fiscalYearStart: startUtc.toISOString(),
            fiscalYearEnd: endUtc.toISOString(),
          },
        },
      });

      return fyc;
    });

    return {
      status: 'ok',
      companyId,
      data: {
        fiscalYearClose: {
          id: fiscalYearClose.id,
          fiscalYear: fiscalYearClose.fiscalYear,
          fiscalYearStart: fiscalYearClose.fiscalYearStart.toISOString(),
          fiscalYearEnd: fiscalYearClose.fiscalYearEnd.toISOString(),
          status: fiscalYearClose.status,
          closedAt: fiscalYearClose.closedAt
            ? fiscalYearClose.closedAt.toISOString()
            : null,
          closedById: fiscalYearClose.closedById,
          retainedEarningsJournalEntryId: null,
          notes: fiscalYearClose.notes,
        },
        validation: {
          canClose: validation.data.canClose,
          blockingFailures: validation.data.blockingFailures,
        },
        retainedEarnings: {
          postingCreated: false,
          reason:
            'Automated retained earnings journal posting is intentionally out of scope for Phase 14A-B-6.',
        },
      },
    };
  }

  /**
   * 10. POST reopen a closed fiscal year.
   * Reopens a CLOSED fiscal year back to OPEN status with audit logging.
   */
  async reopenFiscalYear(
    companyId: string,
    userId: string,
    id: string,
    dto: ReopenFiscalYearDto,
  ): Promise<ReopenFiscalYearResponse> {
    const existing = await this.prisma.fiscalYearClose.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new NotFoundException('Fiscal year close record not found');
    }

    if (existing.status !== PeriodCloseStatus.CLOSED) {
      throw new ConflictException(
        `Only CLOSED fiscal years may be reopened (current status: ${existing.status})`,
      );
    }

    const reopenedAt = new Date();

    const reopenedFY = await this.prisma.$transaction(async (tx) => {
      const fyc = await tx.fiscalYearClose.update({
        where: { id: existing.id },
        data: {
          status: PeriodCloseStatus.OPEN,
          reopenedAt,
          reopenedById: userId,
          reopenReason: dto.reason,
        },
      });

      await tx.periodCloseAuditLog.create({
        data: {
          companyId,
          fiscalYearCloseId: fyc.id,
          action: PeriodCloseAuditAction.REOPENED,
          actorUserId: userId,
          reason: dto.reason,
          metadata: {
            fiscalYear: fyc.fiscalYear,
            fiscalYearStart: fyc.fiscalYearStart.toISOString(),
            fiscalYearEnd: fyc.fiscalYearEnd.toISOString(),
            reopenedAt: reopenedAt.toISOString(),
          },
        },
      });

      return fyc;
    });

    return {
      status: 'ok',
      companyId,
      data: {
        fiscalYearClose: {
          id: reopenedFY.id,
          fiscalYear: reopenedFY.fiscalYear,
          fiscalYearStart: reopenedFY.fiscalYearStart.toISOString(),
          fiscalYearEnd: reopenedFY.fiscalYearEnd.toISOString(),
          status: reopenedFY.status,
          reopenedAt: reopenedFY.reopenedAt
            ? reopenedFY.reopenedAt.toISOString()
            : null,
          reopenedById: reopenedFY.reopenedById,
          reopenReason: reopenedFY.reopenReason,
        },
      },
    };
  }
}

