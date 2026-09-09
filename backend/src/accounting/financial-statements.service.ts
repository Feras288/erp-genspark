// =====================================================
// Phase 12A: Financial statements.
//
// 12A-B-2: real Trial Balance from POSTED JournalEntryLine.
// 12A-B-1 leftover: Income Statement + Balance Sheet still
// empty/zero skeletons (no aggregation yet).
//
// No posting / reverse / close. JWT companyId only.
// Monetary math is Prisma.Decimal — never Number().
// =====================================================
import { BadRequestException, Injectable } from '@nestjs/common';
import { JournalEntryStatus, NormalBalance, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DECIMAL_ZERO, toDecimal } from './posting-events/decimal';
import {
  TrialBalanceQueryDto,
  IncomeStatementQueryDto,
  BalanceSheetQueryDto,
} from './dto/financial-statements-query.dto';
import type {
  AccountTypeKey,
  BalanceSheetResponse,
  DecimalString,
  IncomeStatementResponse,
  NormalBalanceKey,
  TrialBalanceAccountRow,
  TrialBalanceResponse,
} from './types/financial-statements.types';

type Bucket = {
  openingDebit: Prisma.Decimal;
  openingCredit: Prisma.Decimal;
  periodDebit: Prisma.Decimal;
  periodCredit: Prisma.Decimal;
};

function decimalZeroString(): DecimalString {
  return DECIMAL_ZERO.toFixed(4);
}

function formatDecimal4(value: Prisma.Decimal): DecimalString {
  return value.toFixed(4);
}

function addDecimal(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.add(b);
}

function computeSignedBalance(
  debit: Prisma.Decimal,
  credit: Prisma.Decimal,
  normalBalance: NormalBalance,
): Prisma.Decimal {
  return normalBalance === NormalBalance.DEBIT
    ? debit.minus(credit)
    : credit.minus(debit);
}

function parseDateStartUtc(raw: string | undefined, field: string): Date | null {
  if (raw == null || raw === '') return null;
  const day = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be a valid UTC date`);
  }
  return parsed;
}

function parseDateEndUtc(raw: string | undefined, field: string): Date | null {
  if (raw == null || raw === '') return null;
  const day = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${day}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be a valid UTC date`);
  }
  return parsed;
}

function endOfTodayUtc(): Date {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear()).padStart(4, '0');
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T23:59:59.999Z`);
}

function emptyBucket(): Bucket {
  return {
    openingDebit: new Prisma.Decimal('0'),
    openingCredit: new Prisma.Decimal('0'),
    periodDebit: new Prisma.Decimal('0'),
    periodCredit: new Prisma.Decimal('0'),
  };
}

function isZeroMovement(bucket: Bucket): boolean {
  return (
    bucket.openingDebit.isZero() &&
    bucket.openingCredit.isZero() &&
    bucket.periodDebit.isZero() &&
    bucket.periodCredit.isZero()
  );
}

@Injectable()
export class FinancialStatementsService {
  constructor(private readonly prisma: PrismaService) {}

  async trialBalance(
    companyId: string,
    q: TrialBalanceQueryDto,
  ): Promise<TrialBalanceResponse> {
    const fromStart = parseDateStartUtc(q.fromDate, 'fromDate');
    const toEnd = parseDateEndUtc(q.toDate, 'toDate');
    const includeZero = q.includeZero === true;
    const periodUpper = toEnd ?? (fromStart ? endOfTodayUtc() : null);

    const accounts = await this.prisma.account.findMany({
      where: { companyId },
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        type: true,
        normalBalance: true,
      },
      orderBy: { code: 'asc' },
    });

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        companyId,
        entry: {
          companyId,
          status: JournalEntryStatus.POSTED,
        },
      },
      select: {
        debit: true,
        credit: true,
        debitAccountId: true,
        creditAccountId: true,
        entry: { select: { entryDate: true } },
      },
    });

    const buckets = new Map<string, Bucket>();
    for (const account of accounts) {
      buckets.set(account.id, emptyBucket());
    }

    for (const line of lines) {
      const entryDate = line.entry.entryDate;
      const isOpening = fromStart != null && entryDate < fromStart;
      const isAfterPeriod = periodUpper != null && entryDate > periodUpper;
      if (!isOpening && isAfterPeriod) continue;

      const side: 'opening' | 'period' = isOpening ? 'opening' : 'period';
      const debit = toDecimal(line.debit);
      const credit = toDecimal(line.credit);

      if (line.debitAccountId) {
        const bucket = buckets.get(line.debitAccountId) ?? emptyBucket();
        if (!buckets.has(line.debitAccountId)) {
          buckets.set(line.debitAccountId, bucket);
        }
        if (side === 'opening') {
          bucket.openingDebit = addDecimal(bucket.openingDebit, debit);
        } else {
          bucket.periodDebit = addDecimal(bucket.periodDebit, debit);
        }
      }
      if (line.creditAccountId) {
        const bucket = buckets.get(line.creditAccountId) ?? emptyBucket();
        if (!buckets.has(line.creditAccountId)) {
          buckets.set(line.creditAccountId, bucket);
        }
        if (side === 'opening') {
          bucket.openingCredit = addDecimal(bucket.openingCredit, credit);
        } else {
          bucket.periodCredit = addDecimal(bucket.periodCredit, credit);
        }
      }
    }

    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const missingIds = [...buckets.keys()].filter((id) => !accountById.has(id));
    if (missingIds.length > 0) {
      const extra = await this.prisma.account.findMany({
        where: { companyId, id: { in: missingIds } },
        select: {
          id: true,
          code: true,
          name: true,
          nameAr: true,
          type: true,
          normalBalance: true,
        },
      });
      for (const account of extra) {
        accountById.set(account.id, account);
      }
    }

    let openingDebitTotal = new Prisma.Decimal('0');
    let openingCreditTotal = new Prisma.Decimal('0');
    let periodDebitTotal = new Prisma.Decimal('0');
    let periodCreditTotal = new Prisma.Decimal('0');
    let closingDebitTotal = new Prisma.Decimal('0');
    let closingCreditTotal = new Prisma.Decimal('0');

    const rows: TrialBalanceAccountRow[] = [];
    const orderedAccounts = [...accountById.values()].sort((a, b) =>
      a.code.localeCompare(b.code),
    );

    for (const account of orderedAccounts) {
      const bucket = buckets.get(account.id) ?? emptyBucket();
      if (!includeZero && isZeroMovement(bucket)) continue;

      const closingDebit = addDecimal(bucket.openingDebit, bucket.periodDebit);
      const closingCredit = addDecimal(
        bucket.openingCredit,
        bucket.periodCredit,
      );

      openingDebitTotal = addDecimal(openingDebitTotal, bucket.openingDebit);
      openingCreditTotal = addDecimal(openingCreditTotal, bucket.openingCredit);
      periodDebitTotal = addDecimal(periodDebitTotal, bucket.periodDebit);
      periodCreditTotal = addDecimal(periodCreditTotal, bucket.periodCredit);
      closingDebitTotal = addDecimal(closingDebitTotal, closingDebit);
      closingCreditTotal = addDecimal(closingCreditTotal, closingCredit);

      rows.push({
        accountId: account.id,
        code: account.code,
        name: account.name,
        nameAr: account.nameAr,
        type: account.type as AccountTypeKey,
        normalBalance: account.normalBalance as NormalBalanceKey,
        openingDebit: formatDecimal4(bucket.openingDebit),
        openingCredit: formatDecimal4(bucket.openingCredit),
        openingBalance: formatDecimal4(
          computeSignedBalance(
            bucket.openingDebit,
            bucket.openingCredit,
            account.normalBalance,
          ),
        ),
        periodDebit: formatDecimal4(bucket.periodDebit),
        periodCredit: formatDecimal4(bucket.periodCredit),
        periodBalance: formatDecimal4(
          computeSignedBalance(
            bucket.periodDebit,
            bucket.periodCredit,
            account.normalBalance,
          ),
        ),
        closingDebit: formatDecimal4(closingDebit),
        closingCredit: formatDecimal4(closingCredit),
        closingBalance: formatDecimal4(
          computeSignedBalance(
            closingDebit,
            closingCredit,
            account.normalBalance,
          ),
        ),
      });
    }

    return {
      status: 'ok',
      report: 'trial-balance',
      companyId,
      filters: {
        fromDate: q.fromDate ?? null,
        toDate: q.toDate ?? null,
        includeZero,
      },
      generatedAt: new Date().toISOString(),
      data: {
        accounts: rows,
        totals: {
          openingDebit: formatDecimal4(openingDebitTotal),
          openingCredit: formatDecimal4(openingCreditTotal),
          periodDebit: formatDecimal4(periodDebitTotal),
          periodCredit: formatDecimal4(periodCreditTotal),
          closingDebit: formatDecimal4(closingDebitTotal),
          closingCredit: formatDecimal4(closingCreditTotal),
          balanced: closingDebitTotal.equals(closingCreditTotal),
        },
      },
    };
  }

  incomeStatement(
    companyId: string,
    q: IncomeStatementQueryDto,
  ): IncomeStatementResponse {
    const zero = decimalZeroString();
    return {
      status: 'ok',
      report: 'income-statement',
      companyId,
      filters: {
        fromDate: q.fromDate ?? null,
        toDate: q.toDate ?? null,
      },
      generatedAt: new Date().toISOString(),
      data: {
        revenue: [],
        expenses: [],
        totals: {
          revenue: zero,
          expenses: zero,
          netIncome: zero,
        },
      },
    };
  }

  balanceSheet(
    companyId: string,
    q: BalanceSheetQueryDto,
  ): BalanceSheetResponse {
    const zero = decimalZeroString();
    return {
      status: 'ok',
      report: 'balance-sheet',
      companyId,
      filters: {
        asOfDate: q.asOfDate ?? null,
      },
      generatedAt: new Date().toISOString(),
      data: {
        assets: [],
        liabilities: [],
        equity: [],
        syntheticEquity: {
          retainedEarningsComputed: zero,
          currentPeriodNetIncome: zero,
        },
        totals: {
          assets: zero,
          liabilities: zero,
          equity: zero,
          liabilitiesAndEquity: zero,
          balanced: true,
        },
      },
    };
  }
}
