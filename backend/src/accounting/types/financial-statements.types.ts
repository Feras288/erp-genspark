// =====================================================
// Phase 12A-B-1: Financial statements types (skeleton).
//
// Monetary fields are decimal strings (`toFixed(4)`). Internal
// math uses Prisma.Decimal only — never Number().
// Trial Balance row shape locked in 12A-B-2.
// Income Statement line shape locked in 12A-B-3.
// =====================================================

export type DecimalString = string;

export type FinancialStatementReportName =
  | 'trial-balance'
  | 'income-statement'
  | 'balance-sheet';

export type FinancialStatementStatus = 'ok';

export type AccountTypeKey =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE';

export type NormalBalanceKey = 'DEBIT' | 'CREDIT';

export type TrialBalanceFilters = {
  fromDate: string | null;
  toDate: string | null;
  includeZero: boolean;
};

export type IncomeStatementFilters = {
  fromDate: string | null;
  toDate: string | null;
};

export type BalanceSheetFilters = {
  asOfDate: string | null;
};

export type FinancialStatementEnvelope<
  TReport extends FinancialStatementReportName,
  TFilters,
  TData,
> = {
  status: FinancialStatementStatus;
  report: TReport;
  companyId: string;
  filters: TFilters;
  generatedAt: string;
  data: TData;
};

export type TrialBalanceAccountRow = {
  accountId: string;
  code: string;
  name: string;
  nameAr: string | null;
  type: AccountTypeKey;
  normalBalance: NormalBalanceKey;
  openingDebit: DecimalString;
  openingCredit: DecimalString;
  openingBalance: DecimalString;
  periodDebit: DecimalString;
  periodCredit: DecimalString;
  periodBalance: DecimalString;
  closingDebit: DecimalString;
  closingCredit: DecimalString;
  closingBalance: DecimalString;
};

export type TrialBalanceTotals = {
  openingDebit: DecimalString;
  openingCredit: DecimalString;
  periodDebit: DecimalString;
  periodCredit: DecimalString;
  closingDebit: DecimalString;
  closingCredit: DecimalString;
  balanced: boolean;
};

export type TrialBalanceData = {
  accounts: TrialBalanceAccountRow[];
  totals: TrialBalanceTotals;
};

export type TrialBalanceResponse = FinancialStatementEnvelope<
  'trial-balance',
  TrialBalanceFilters,
  TrialBalanceData
>;

export type IncomeStatementLine = {
  accountId: string;
  code: string;
  name: string;
  type: AccountTypeKey;
  normalBalance: NormalBalanceKey;
  debitTotal: DecimalString;
  creditTotal: DecimalString;
  amount: DecimalString;
};

export type IncomeStatementTotals = {
  revenue: DecimalString;
  expenses: DecimalString;
  netIncome: DecimalString;
};

export type IncomeStatementData = {
  revenue: IncomeStatementLine[];
  expenses: IncomeStatementLine[];
  totals: IncomeStatementTotals;
};

export type IncomeStatementResponse = FinancialStatementEnvelope<
  'income-statement',
  IncomeStatementFilters,
  IncomeStatementData
>;

export type BalanceSheetLine = {
  accountId: string;
  code: string;
  name: string;
  nameAr: string | null;
  amount: DecimalString;
};

export type BalanceSheetSyntheticEquity = {
  retainedEarningsComputed: DecimalString;
  currentPeriodNetIncome: DecimalString;
};

export type BalanceSheetTotals = {
  assets: DecimalString;
  liabilities: DecimalString;
  equity: DecimalString;
  liabilitiesAndEquity: DecimalString;
  balanced: boolean;
};

export type BalanceSheetData = {
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  syntheticEquity: BalanceSheetSyntheticEquity;
  totals: BalanceSheetTotals;
};

export type BalanceSheetResponse = FinancialStatementEnvelope<
  'balance-sheet',
  BalanceSheetFilters,
  BalanceSheetData
>;
