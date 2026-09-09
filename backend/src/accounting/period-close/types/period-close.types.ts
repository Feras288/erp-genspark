// =====================================================
// Phase 14A-B-2: Period Close Types
// Response interfaces for read-only period close endpoints
// =====================================================
import { PeriodCloseStatus } from '@prisma/client';

export interface PeriodStatusItem {
  id: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: PeriodCloseStatus;
  isClosed: boolean;
}

export interface FiscalYearStatusItem {
  id: string | null;
  fiscalYear: number | null;
  fiscalYearStart: string | null;
  fiscalYearEnd: string | null;
  status: PeriodCloseStatus;
  isClosed: boolean;
}

export interface PeriodCloseStatusData {
  date: string;
  period: PeriodStatusItem;
  fiscalYear: FiscalYearStatusItem;
}

export interface PeriodCloseStatusResponse {
  status: 'ok';
  companyId: string;
  data: PeriodCloseStatusData;
}

export interface PeriodCloseListResponse {
  status: 'ok';
  companyId: string;
  filters: Record<string, unknown>;
  data: {
    periods: Array<{
      id: string;
      companyId: string;
      fiscalYear: number;
      periodNumber: number | null;
      periodStart: string;
      periodEnd: string;
      status: PeriodCloseStatus;
      closedAt: string | null;
      closedById: string | null;
      reopenedAt: string | null;
      reopenedById: string | null;
      reopenReason: string | null;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
      closedBy?: { id: string; fullName: string; email: string } | null;
      reopenedBy?: { id: string; fullName: string; email: string } | null;
    }>;
  };
}

export interface FiscalYearCloseListResponse {
  status: 'ok';
  companyId: string;
  filters: Record<string, unknown>;
  data: {
    fiscalYears: Array<{
      id: string;
      companyId: string;
      fiscalYear: number;
      fiscalYearStart: string;
      fiscalYearEnd: string;
      status: PeriodCloseStatus;
      retainedEarningsJournalEntryId: string | null;
      closedAt: string | null;
      closedById: string | null;
      reopenedAt: string | null;
      reopenedById: string | null;
      reopenReason: string | null;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
      closedBy?: { id: string; fullName: string; email: string } | null;
      reopenedBy?: { id: string; fullName: string; email: string } | null;
    }>;
  };
}

export interface PeriodCloseAuditLogListResponse {
  status: 'ok';
  companyId: string;
  filters: Record<string, unknown>;
  data: {
    auditLogs: Array<{
      id: string;
      companyId: string;
      periodCloseId: string | null;
      fiscalYearCloseId: string | null;
      action: string;
      actorUserId: string;
      reason: string | null;
      metadata: unknown;
      createdAt: string;
      actorUser?: { id: string; fullName: string; email: string } | null;
    }>;
  };
}

export type PeriodCloseCheckStatus = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED';

export type PeriodCloseCheckCode =
  | 'DATE_RANGE_VALID'
  | 'NO_EXISTING_CLOSED_OVERLAP'
  | 'NO_DRAFT_JOURNALS'
  | 'POSTED_JOURNALS_BALANCED'
  | 'TRIAL_BALANCE_BALANCED'
  | 'NO_FAILED_POSTING_EVENTS'
  | 'RECONCILIATION_WARNINGS';

export interface PeriodCloseValidationCheck {
  code: PeriodCloseCheckCode;
  status: PeriodCloseCheckStatus;
  blocking: boolean;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface PeriodCloseValidationData {
  periodStart: string;
  periodEnd: string;
  fiscalYear: number | null;
  periodNumber: number | null;
  canClose: boolean;
  blockingFailures: number;
  warnings: string[];
  checks: PeriodCloseValidationCheck[];
  totals: {
    postedDebitTotal: string;
    postedCreditTotal: string;
  };
}

export interface PeriodCloseValidationResponse {
  status: 'ok';
  companyId: string;
  data: PeriodCloseValidationData;
}

export interface ClosePeriodResponse {
  status: 'ok';
  companyId: string;
  data: {
    periodClose: {
      id: string;
      periodStart: string;
      periodEnd: string;
      fiscalYear: number;
      periodNumber: number | null;
      status: PeriodCloseStatus;
      closedAt: string | null;
      closedById: string | null;
      notes: string | null;
    };
    validation: {
      canClose: boolean;
      blockingFailures: number;
    };
  };
}

export interface ReopenPeriodResponse {
  status: 'ok';
  companyId: string;
  data: {
    periodClose: {
      id: string;
      periodStart: string;
      periodEnd: string;
      status: PeriodCloseStatus;
      reopenedAt: string | null;
      reopenedById: string | null;
      reopenReason: string | null;
    };
  };
}

// =====================================================
// Phase 14A-B-6: Fiscal Year Close Types
// =====================================================

export type FiscalYearCloseCheckCode =
  | 'FISCAL_YEAR_RANGE_VALID'
  | 'NO_EXISTING_CLOSED_FISCAL_YEAR_OVERLAP'
  | 'ALL_PERIODS_CLOSED'
  | 'NO_DRAFT_JOURNALS_IN_YEAR'
  | 'POSTED_JOURNALS_BALANCED_IN_YEAR'
  | 'YEAR_TRIAL_BALANCE_BALANCED'
  | 'RETAINED_EARNINGS_POSTING_SKIPPED';

export interface FiscalYearCloseValidationCheck {
  code: FiscalYearCloseCheckCode;
  status: PeriodCloseCheckStatus;
  blocking: boolean;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface FiscalYearValidationData {
  fiscalYear: number;
  fiscalYearStart: string;
  fiscalYearEnd: string;
  canClose: boolean;
  blockingFailures: number;
  warnings: string[];
  checks: FiscalYearCloseValidationCheck[];
  totals: {
    postedDebitTotal: string;
    postedCreditTotal: string;
  };
  retainedEarnings: {
    postingCreated: boolean;
    reason: string;
  };
}

export interface FiscalYearValidationResponse {
  status: 'ok';
  companyId: string;
  data: FiscalYearValidationData;
}

export interface CloseFiscalYearResponse {
  status: 'ok';
  companyId: string;
  data: {
    fiscalYearClose: {
      id: string;
      fiscalYear: number;
      fiscalYearStart: string;
      fiscalYearEnd: string;
      status: PeriodCloseStatus;
      closedAt: string | null;
      closedById: string | null;
      retainedEarningsJournalEntryId: string | null;
      notes: string | null;
    };
    validation: {
      canClose: boolean;
      blockingFailures: number;
    };
    retainedEarnings: {
      postingCreated: boolean;
      reason: string;
    };
  };
}

export interface ReopenFiscalYearResponse {
  status: 'ok';
  companyId: string;
  data: {
    fiscalYearClose: {
      id: string;
      fiscalYear: number;
      fiscalYearStart: string;
      fiscalYearEnd: string;
      status: PeriodCloseStatus;
      reopenedAt: string | null;
      reopenedById: string | null;
      reopenReason: string | null;
    };
  };
}

