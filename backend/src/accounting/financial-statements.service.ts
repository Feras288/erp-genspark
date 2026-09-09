// =====================================================
// Phase 12A: Financial statements.
//
// 12A-B-2: real Trial Balance from POSTED JournalEntryLine.
// 12A-B-3: real Income Statement (period-only P&L).
// 12A-B-4: real Balance Sheet (as-of + synthetic RE / current NI).
//
// No posting / reverse / close. JWT companyId only.
// Monetary math is Prisma.Decimal — never Number().
// =====================================================
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AccountType,
  JournalEntryStatus,
  NormalBalance,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { toDecimal } from './posting-events/decimal';
import {
  TrialBalanceQueryDto,
  IncomeStatementQueryDto,
  BalanceSheetQueryDto,
} from './dto/financial-statements-query.dto';
import type {
  AccountTypeKey,
  BalanceSheetLine,
  BalanceSheetResponse,
  DecimalString,
  IncomeStatementLine,
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

function utcDayString(date: Date): string {
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDefaultFiscalYearStartDate(
  fiscalYearStartMonth: number | null | undefined,
  asOf: Date,
): Date {
  return resolveFiscalYearStartForDate(fiscalYearStartMonth, asOf);
}

function resolveFiscalYearStartForDate(
  fiscalYearStartMonth: number | null | undefined,
  asOf: Date,
): Date {
  const month =
    fiscalYearStartMonth != null &&
    fiscalYearStartMonth >= 1 &&
    fiscalYearStartMonth <= 12
      ? fiscalYearStartMonth
      : 1;
  const asOfMonth = asOf.getUTCMonth() + 1;
  const year =
    asOfMonth < month ? asOf.getUTCFullYear() - 1 : asOf.getUTCFullYear();
  const mm = String(month).padStart(2, '0');
  return new Date(`${year}-${mm}-01T00:00:00.000Z`);
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

  async incomeStatement(
    companyId: string,
    q: IncomeStatementQueryDto,
  ): Promise<IncomeStatementResponse> {
    const toEnd = parseDateEndUtc(q.toDate, 'toDate') ?? endOfTodayUtc();
    let fromStart = parseDateStartUtc(q.fromDate, 'fromDate');
    if (fromStart == null) {
      const company = await this.prisma.company.findFirst({
        where: { id: companyId },
        select: { fiscalYearStartMonth: true },
      });
      fromStart = getDefaultFiscalYearStartDate(
        company?.fiscalYearStartMonth,
        toEnd,
      );
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        companyId,
        type: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
      },
      select: {
        id: true,
        code: true,
        name: true,
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
          entryDate: { gte: fromStart, lte: toEnd },
        },
      },
      select: {
        debit: true,
        credit: true,
        debitAccountId: true,
        creditAccountId: true,
      },
    });

    type PeriodBucket = {
      debitTotal: Prisma.Decimal;
      creditTotal: Prisma.Decimal;
    };
    const buckets = new Map<string, PeriodBucket>();
    for (const account of accounts) {
      buckets.set(account.id, {
        debitTotal: new Prisma.Decimal('0'),
        creditTotal: new Prisma.Decimal('0'),
      });
    }

    const accountIds = new Set(accounts.map((a) => a.id));
    for (const line of lines) {
      const debit = toDecimal(line.debit);
      const credit = toDecimal(line.credit);
      if (line.debitAccountId && accountIds.has(line.debitAccountId)) {
        const bucket = buckets.get(line.debitAccountId)!;
        bucket.debitTotal = addDecimal(bucket.debitTotal, debit);
      }
      if (line.creditAccountId && accountIds.has(line.creditAccountId)) {
        const bucket = buckets.get(line.creditAccountId)!;
        bucket.creditTotal = addDecimal(bucket.creditTotal, credit);
      }
    }

    const revenue: IncomeStatementLine[] = [];
    const expenses: IncomeStatementLine[] = [];
    let revenueTotal = new Prisma.Decimal('0');
    let expenseTotal = new Prisma.Decimal('0');

    for (const account of accounts) {
      const bucket = buckets.get(account.id)!;
      if (bucket.debitTotal.isZero() && bucket.creditTotal.isZero()) continue;

      const amount = computeSignedBalance(
        bucket.debitTotal,
        bucket.creditTotal,
        account.normalBalance,
      );
      // P&L contribution: credit − debit. CREDIT-normal revenue is
      // positive; DEBIT-normal contra-revenue (SALES_DISCOUNTS) is
      // negative and reduces totals.revenue.
      const pnl = bucket.creditTotal.minus(bucket.debitTotal);
      const row: IncomeStatementLine = {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type as AccountTypeKey,
        normalBalance: account.normalBalance as NormalBalanceKey,
        debitTotal: formatDecimal4(bucket.debitTotal),
        creditTotal: formatDecimal4(bucket.creditTotal),
        amount: formatDecimal4(amount),
      };

      if (account.type === AccountType.REVENUE) {
        revenue.push(row);
        revenueTotal = addDecimal(revenueTotal, pnl);
      } else {
        expenses.push(row);
        expenseTotal = addDecimal(expenseTotal, amount);
      }
    }

    const netIncome = revenueTotal.minus(expenseTotal);

    return {
      status: 'ok',
      report: 'income-statement',
      companyId,
      filters: {
        fromDate: utcDayString(fromStart),
        toDate: utcDayString(toEnd),
      },
      generatedAt: new Date().toISOString(),
      data: {
        revenue,
        expenses,
        totals: {
          revenue: formatDecimal4(revenueTotal),
          expenses: formatDecimal4(expenseTotal),
          netIncome: formatDecimal4(netIncome),
        },
      },
    };
  }

  async balanceSheet(
    companyId: string,
    q: BalanceSheetQueryDto,
  ): Promise<BalanceSheetResponse> {
    const asOfEnd =
      parseDateEndUtc(q.asOfDate, 'asOfDate') ?? endOfTodayUtc();
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
      select: { fiscalYearStartMonth: true },
    });
    const fiscalYearStart = resolveFiscalYearStartForDate(
      company?.fiscalYearStartMonth,
      asOfEnd,
    );

    const [priorNi, currentNi, bsAccounts, lines] = await Promise.all([
      this.computeIncomeStatementTotalsForWindow(companyId, null, {
        lt: fiscalYearStart,
      }),
      this.computeIncomeStatementTotalsForWindow(companyId, fiscalYearStart, {
        lte: asOfEnd,
      }),
      this.prisma.account.findMany({
        where: {
          companyId,
          type: {
            in: [
              AccountType.ASSET,
              AccountType.LIABILITY,
              AccountType.EQUITY,
            ],
          },
        },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          normalBalance: true,
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.journalEntryLine.findMany({
        where: {
          companyId,
          entry: {
            companyId,
            status: JournalEntryStatus.POSTED,
            entryDate: { lte: asOfEnd },
          },
        },
        select: {
          debit: true,
          credit: true,
          debitAccountId: true,
          creditAccountId: true,
        },
      }),
    ]);

    type PeriodBucket = {
      debitTotal: Prisma.Decimal;
      creditTotal: Prisma.Decimal;
    };
    const buckets = new Map<string, PeriodBucket>();
    for (const account of bsAccounts) {
      buckets.set(account.id, {
        debitTotal: new Prisma.Decimal('0'),
        creditTotal: new Prisma.Decimal('0'),
      });
    }
    const accountIds = new Set(bsAccounts.map((a) => a.id));
    for (const line of lines) {
      const debit = toDecimal(line.debit);
      const credit = toDecimal(line.credit);
      if (line.debitAccountId && accountIds.has(line.debitAccountId)) {
        const bucket = buckets.get(line.debitAccountId)!;
        bucket.debitTotal = addDecimal(bucket.debitTotal, debit);
      }
      if (line.creditAccountId && accountIds.has(line.creditAccountId)) {
        const bucket = buckets.get(line.creditAccountId)!;
        bucket.creditTotal = addDecimal(bucket.creditTotal, credit);
      }
    }

    const assets: BalanceSheetLine[] = [];
    const liabilities: BalanceSheetLine[] = [];
    const equity: BalanceSheetLine[] = [];
    let assetsTotal = new Prisma.Decimal('0');
    let liabilitiesTotal = new Prisma.Decimal('0');
    let equityTotal = new Prisma.Decimal('0');

    for (const account of bsAccounts) {
      const bucket = buckets.get(account.id)!;
      if (bucket.debitTotal.isZero() && bucket.creditTotal.isZero()) continue;

      const amount = computeSignedBalance(
        bucket.debitTotal,
        bucket.creditTotal,
        account.normalBalance,
      );
      const row: BalanceSheetLine = {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type as AccountTypeKey,
        normalBalance: account.normalBalance as NormalBalanceKey,
        debitTotal: formatDecimal4(bucket.debitTotal),
        creditTotal: formatDecimal4(bucket.creditTotal),
        amount: formatDecimal4(amount),
      };

      if (account.type === AccountType.ASSET) {
        assets.push(row);
        assetsTotal = addDecimal(assetsTotal, amount);
      } else if (account.type === AccountType.LIABILITY) {
        liabilities.push(row);
        liabilitiesTotal = addDecimal(liabilitiesTotal, amount);
      } else {
        equity.push(row);
        equityTotal = addDecimal(equityTotal, amount);
      }
    }

    const retainedEarningsComputed = priorNi.netIncome;
    const currentPeriodNetIncome = currentNi.netIncome;
    const liabilitiesAndEquity = liabilitiesTotal
      .add(equityTotal)
      .add(retainedEarningsComputed)
      .add(currentPeriodNetIncome);

    return {
      status: 'ok',
      report: 'balance-sheet',
      companyId,
      filters: {
        asOfDate: utcDayString(asOfEnd),
      },
      generatedAt: new Date().toISOString(),
      data: {
        assets,
        liabilities,
        equity,
        syntheticEquity: {
          retainedEarningsComputed: formatDecimal4(retainedEarningsComputed),
          currentPeriodNetIncome: formatDecimal4(currentPeriodNetIncome),
        },
        totals: {
          assets: formatDecimal4(assetsTotal),
          liabilities: formatDecimal4(liabilitiesTotal),
          equity: formatDecimal4(equityTotal),
          liabilitiesAndEquity: formatDecimal4(liabilitiesAndEquity),
          balanced: assetsTotal.equals(liabilitiesAndEquity),
        },
      },
    };
  }

  /**
   * Same P&L totals as Income Statement for a POSTED window:
   * revenue = sum(credit − debit) on REVENUE (contra-revenue reduces),
   * expenses = sum(signed DEBIT-normal amounts) on EXPENSE,
   * netIncome = revenue − expenses.
   */
  private async computeIncomeStatementTotalsForWindow(
    companyId: string,
    fromStart: Date | null,
    toBound: { lte: Date } | { lt: Date },
  ): Promise<{
    revenue: Prisma.Decimal;
    expenses: Prisma.Decimal;
    netIncome: Prisma.Decimal;
  }> {
    const accounts = await this.prisma.account.findMany({
      where: {
        companyId,
        type: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
      },
      select: {
        id: true,
        type: true,
        normalBalance: true,
      },
    });

    const entryDateFilter: Prisma.DateTimeFilter = {
      ...(fromStart ? { gte: fromStart } : {}),
      ...toBound,
    };

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        companyId,
        entry: {
          companyId,
          status: JournalEntryStatus.POSTED,
          entryDate: entryDateFilter,
        },
      },
      select: {
        debit: true,
        credit: true,
        debitAccountId: true,
        creditAccountId: true,
      },
    });

    type PeriodBucket = {
      debitTotal: Prisma.Decimal;
      creditTotal: Prisma.Decimal;
    };
    const buckets = new Map<string, PeriodBucket>();
    for (const account of accounts) {
      buckets.set(account.id, {
        debitTotal: new Prisma.Decimal('0'),
        creditTotal: new Prisma.Decimal('0'),
      });
    }
    const accountIds = new Set(accounts.map((a) => a.id));
    for (const line of lines) {
      const debit = toDecimal(line.debit);
      const credit = toDecimal(line.credit);
      if (line.debitAccountId && accountIds.has(line.debitAccountId)) {
        const bucket = buckets.get(line.debitAccountId)!;
        bucket.debitTotal = addDecimal(bucket.debitTotal, debit);
      }
      if (line.creditAccountId && accountIds.has(line.creditAccountId)) {
        const bucket = buckets.get(line.creditAccountId)!;
        bucket.creditTotal = addDecimal(bucket.creditTotal, credit);
      }
    }

    let revenueTotal = new Prisma.Decimal('0');
    let expenseTotal = new Prisma.Decimal('0');
    for (const account of accounts) {
      const bucket = buckets.get(account.id)!;
      if (bucket.debitTotal.isZero() && bucket.creditTotal.isZero()) continue;
      if (account.type === AccountType.REVENUE) {
        revenueTotal = addDecimal(
          revenueTotal,
          bucket.creditTotal.minus(bucket.debitTotal),
        );
      } else {
        expenseTotal = addDecimal(
          expenseTotal,
          computeSignedBalance(
            bucket.debitTotal,
            bucket.creditTotal,
            account.normalBalance,
          ),
        );
      }
    }

    return {
      revenue: revenueTotal,
      expenses: expenseTotal,
      netIncome: revenueTotal.minus(expenseTotal),
    };
  }
}
