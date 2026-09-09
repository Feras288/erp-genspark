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
