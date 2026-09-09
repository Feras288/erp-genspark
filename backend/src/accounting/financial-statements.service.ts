// =====================================================
// Phase 12A-B-1: Financial statements service — skeleton only.
//
// Returns empty/zero envelopes for Trial Balance, Income
// Statement, and Balance Sheet. No JournalEntryLine query,
// no aggregation, no posting/reversal/close.
//
// Monetary zeros are Prisma.Decimal formatted as strings.
// Real calculations land in 12A-B-2 / 12A-B-3 / 12A-B-4.
// =====================================================
import { Injectable } from '@nestjs/common';
import { DECIMAL_ZERO } from './posting-events/decimal';
import {
  TrialBalanceQueryDto,
  IncomeStatementQueryDto,
  BalanceSheetQueryDto,
} from './dto/financial-statements-query.dto';
import type {
  BalanceSheetResponse,
  DecimalString,
  IncomeStatementResponse,
  TrialBalanceResponse,
} from './types/financial-statements.types';

function decimalZeroString(): DecimalString {
  return DECIMAL_ZERO.toFixed(4);
}

@Injectable()
export class FinancialStatementsService {
  trialBalance(
    companyId: string,
    q: TrialBalanceQueryDto,
  ): TrialBalanceResponse {
    const zero = decimalZeroString();
    return {
      status: 'ok',
      report: 'trial-balance',
      companyId,
      filters: {
        fromDate: q.fromDate ?? null,
        toDate: q.toDate ?? null,
        includeZero: q.includeZero === true,
      },
      generatedAt: new Date().toISOString(),
      data: {
        accounts: [],
        totals: {
          openingDebit: zero,
          openingCredit: zero,
          periodDebit: zero,
          periodCredit: zero,
          closingDebit: zero,
          closingCredit: zero,
          balanced: true,
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
