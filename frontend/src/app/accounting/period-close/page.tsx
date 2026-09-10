'use client';

// =====================================================
// Phase 18A-B-5: Period Close & Fiscal Year Close Workspace UX Polish
// Route: /accounting/period-close
//
// - Modern Arabic / RTL-friendly SaaS interface.
// - Standardized PageHeader ("إقفال الفترات والسنة المالية").
// - Top KPI summary cards for Open Periods, Closed Periods, Posting Readiness,
//   and Fiscal Year Status.
// - Modern SectionCard containers for Status Inspector, Period Validation & Close,
//   Fiscal Year Close, and Period Close Audit Trail.
// - Preserves 100% of period close validation rules, blocking checks, reopen
//   guards, and fiscal year logic.
// - Preserves 100% of permissions (`period_close.read`, `period_close.close`,
//   `period_close.reopen`).
// - Monetary values treated strictly as strings (no floating-point arithmetic).
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  api,
  ApiError,
  FiscalYearCloseRecord,
  FiscalYearValidationResponse,
  PeriodCloseAuditLogRecord,
  PeriodCloseCheckStatus,
  PeriodCloseRecord,
  PeriodCloseStatus,
  PeriodCloseStatusData,
  PeriodCloseValidationResponse,
} from '@/lib/api';
import {
  PageHeader,
  KpiCard,
  SectionCard,
  StatusBadge,
  EmptyState,
  LoadingState,
  ErrorBanner,
  AccessDeniedState,
} from '@/components/ui';

// ---------- Formatters -------------------------------------------

function formatAmount(val: string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  const parts = val.split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `${integerPart}.${parts[1]}` : integerPart;
}

function formatDate(val: string | null | undefined): string {
  if (!val) return '—';
  return val.slice(0, 10);
}

function formatDateTime(val: string | null | undefined): string {
  if (!val) return '—';
  return val.slice(0, 19).replace('T', ' ');
}

function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------- Specialized Badges -----------------------------------

function PeriodStatusBadge({ status }: { status: PeriodCloseStatus }) {
  switch (status) {
    case 'CLOSED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
          مقفل (CLOSED)
        </span>
      );
    case 'CLOSING':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
          جاري الإقفال (CLOSING)
        </span>
      );
    case 'REOPENED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />
          مُعاد فتحه (REOPENED)
        </span>
      );
    case 'OPEN':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          مفتوح (OPEN)
        </span>
      );
  }
}

function CheckStatusBadge({ status }: { status: PeriodCloseCheckStatus }) {
  switch (status) {
    case 'PASS':
      return (
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
          <span className="font-bold">✓</span>
          ناجح (PASS)
        </span>
      );
    case 'FAIL':
      return (
        <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 border border-rose-200">
          <span className="font-bold">✕</span>
          فشل (FAIL)
        </span>
      );
    case 'WARNING':
      return (
        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
          <span>⚠️</span>
          تنبيه (WARNING)
        </span>
      );
    case 'SKIPPED':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
          تخطي (SKIPPED)
        </span>
      );
  }
}

// ---------- Component --------------------------------------------

export default function PeriodClosePage() {
  const router = useRouter();
  const { user, loading: authLoading, hasPermission } = useAuth();

  // ---- Permissions ----------------------------------------------
  const canRead = !!user && hasPermission('period_close.read');
  const canClose = !!user && hasPermission('period_close.close');
  const canReopen = !!user && hasPermission('period_close.reopen');

  // ---- Navigation tab state -------------------------------------
  const [activeTab, setActiveTab] = useState<'periods' | 'fiscal_years' | 'audit_log'>('periods');

  // ---- Global Notifications -------------------------------------
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ---- Status Inspector State -----------------------------------
  const [statusDate, setStatusDate] = useState<string>(todayDateString());
  const [statusData, setStatusData] = useState<PeriodCloseStatusData | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // ---- Periods List State ---------------------------------------
  const [periods, setPeriods] = useState<PeriodCloseRecord[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [periodStatusFilter, setPeriodStatusFilter] = useState<string>('');
  const [periodYearFilter, setPeriodYearFilter] = useState<string>('');

  // ---- Period Validation & Close State --------------------------
  const [periodForm, setPeriodForm] = useState({
    periodStart: '',
    periodEnd: '',
    fiscalYear: '',
    periodNumber: '',
    notes: '',
  });
  const [validatingPeriod, setValidatingPeriod] = useState(false);
  const [closingPeriod, setClosingPeriod] = useState(false);
  const [periodValidationResult, setPeriodValidationResult] = useState<PeriodCloseValidationResponse['data'] | null>(null);
  const [periodFormError, setPeriodFormError] = useState<string | null>(null);

  // ---- Fiscal Years List State ----------------------------------
  const [fiscalYears, setFiscalYears] = useState<FiscalYearCloseRecord[]>([]);
  const [loadingFiscalYears, setLoadingFiscalYears] = useState(false);
  const [fiscalYearsError, setFiscalYearsError] = useState<string | null>(null);
  const [fyStatusFilter, setFyStatusFilter] = useState<string>('');

  // ---- Fiscal Year Validation & Close State ---------------------
  const currentYearNum = new Date().getFullYear();
  const [fyForm, setFyForm] = useState({
    fiscalYear: String(currentYearNum),
    fiscalYearStart: `${currentYearNum}-01-01`,
    fiscalYearEnd: `${currentYearNum}-12-31`,
    notes: '',
  });
  const [validatingFy, setValidatingFy] = useState(false);
  const [closingFy, setClosingFy] = useState(false);
  const [fyValidationResult, setFyValidationResult] = useState<FiscalYearValidationResponse['data'] | null>(null);
  const [fyFormError, setFyFormError] = useState<string | null>(null);

  // ---- Audit Log State ------------------------------------------
  const [auditLogs, setAuditLogs] = useState<PeriodCloseAuditLogRecord[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditLogsError, setAuditLogsError] = useState<string | null>(null);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('');

  // ---- Reopen Modals State --------------------------------------
  const [reopeningPeriod, setReopeningPeriod] = useState<PeriodCloseRecord | null>(null);
  const [periodReopenReason, setPeriodReopenReason] = useState('');
  const [submittingPeriodReopen, setSubmittingPeriodReopen] = useState(false);

  const [reopeningFy, setReopeningFy] = useState<FiscalYearCloseRecord | null>(null);
  const [fyReopenReason, setFyReopenReason] = useState('');
  const [submittingFyReopen, setSubmittingFyReopen] = useState(false);

  // ---- Auth Guard -----------------------------------------------
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
    if (!authLoading && user && !canRead) router.replace('/dashboard');
  }, [authLoading, user, canRead, router]);

  // ---- 1. Fetch Status for Date ---------------------------------
  const loadStatus = useCallback(async (dateToInspect: string) => {
    if (!user || !canRead) return;
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const res = await api.getPeriodCloseStatus(dateToInspect);
      setStatusData(res.data);
    } catch (err) {
      setStatusError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل فحص حالة التاريخ',
      );
    } finally {
      setLoadingStatus(false);
    }
  }, [user, canRead]);

  useEffect(() => {
    loadStatus(statusDate);
  }, [loadStatus, statusDate]);

  // ---- 2. Fetch Periods List ------------------------------------
  const loadPeriods = useCallback(async () => {
    if (!user || !canRead) return;
    setLoadingPeriods(true);
    setPeriodsError(null);
    try {
      const res = await api.getPeriodClosePeriods({
        status: periodStatusFilter || undefined,
        fiscalYear: periodYearFilter ? Number(periodYearFilter) : undefined,
      });
      setPeriods(res.data.periods || []);
    } catch (err) {
      setPeriodsError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل تحميل قائمة الفترات',
      );
    } finally {
      setLoadingPeriods(false);
    }
  }, [user, canRead, periodStatusFilter, periodYearFilter]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  // ---- 3. Fetch Fiscal Years List -------------------------------
  const loadFiscalYears = useCallback(async () => {
    if (!user || !canRead) return;
    setLoadingFiscalYears(true);
    setFiscalYearsError(null);
    try {
      const res = await api.getFiscalYearCloses({
        status: fyStatusFilter || undefined,
      });
      setFiscalYears(res.data.fiscalYears || []);
    } catch (err) {
      setFiscalYearsError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل تحميل قائمة السنوات المالية',
      );
    } finally {
      setLoadingFiscalYears(false);
    }
  }, [user, canRead, fyStatusFilter]);

  useEffect(() => {
    loadFiscalYears();
  }, [loadFiscalYears]);

  // ---- 4. Fetch Audit Logs --------------------------------------
  const loadAuditLogs = useCallback(async () => {
    if (!user || !canRead) return;
    setLoadingAuditLogs(true);
    setAuditLogsError(null);
    try {
      const res = await api.getPeriodCloseAuditLog({
        action: auditActionFilter || undefined,
      });
      setAuditLogs(res.data.auditLogs || []);
    } catch (err) {
      setAuditLogsError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل تحميل سجل التدقيق',
      );
    } finally {
      setLoadingAuditLogs(false);
    }
  }, [user, canRead, auditActionFilter]);

  useEffect(() => {
    if (activeTab === 'audit_log') {
      loadAuditLogs();
    }
  }, [loadAuditLogs, activeTab]);

  // ---- Refresh All Data -----------------------------------------
  const refreshAll = useCallback(() => {
    loadStatus(statusDate);
    loadPeriods();
    loadFiscalYears();
    loadAuditLogs();
  }, [loadStatus, statusDate, loadPeriods, loadFiscalYears, loadAuditLogs]);

  // ---- Validate Period Handler ----------------------------------
  const handleValidatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setPeriodFormError(null);
    setActionError(null);
    setActionSuccess(null);

    if (!periodForm.periodStart || !periodForm.periodEnd) {
      setPeriodFormError('تاريخ بداية ونهاية الفترة مطلوبان.');
      return;
    }

    setValidatingPeriod(true);
    try {
      const res = await api.validatePeriodClose({
        periodStart: periodForm.periodStart,
        periodEnd: periodForm.periodEnd,
        fiscalYear: periodForm.fiscalYear ? Number(periodForm.fiscalYear) : undefined,
        periodNumber: periodForm.periodNumber ? Number(periodForm.periodNumber) : undefined,
      });
      setPeriodValidationResult(res.data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل فحص صلاحية إقفال الفترة';
      setPeriodFormError(msg);
      setPeriodValidationResult(null);
    } finally {
      setValidatingPeriod(false);
    }
  };

  // ---- Close Period Handler -------------------------------------
  const handleClosePeriod = async () => {
    if (!canClose) return;
    setPeriodFormError(null);
    setActionError(null);
    setActionSuccess(null);

    if (!periodForm.periodStart || !periodForm.periodEnd) {
      setPeriodFormError('يرجى تحديد تواريخ الفترة أولاً.');
      return;
    }

    if (
      !window.confirm(
        `تأكيد إقفال الفترة:\nمن: ${periodForm.periodStart}\nإلى: ${periodForm.periodEnd}\n\nتحذير: سيتم منع أي عمليات ترحيل محاسبية داخل هذا النطاق الزمني. هل تريد المتابعة؟`,
      )
    ) {
      return;
    }

    setClosingPeriod(true);
    try {
      const res = await api.closePeriod({
        periodStart: periodForm.periodStart,
        periodEnd: periodForm.periodEnd,
        fiscalYear: periodForm.fiscalYear ? Number(periodForm.fiscalYear) : undefined,
        periodNumber: periodForm.periodNumber ? Number(periodForm.periodNumber) : undefined,
        notes: periodForm.notes.trim() || undefined,
      });
      setActionSuccess(`تم إقفال الفترة المحاسبية بنجاح (${res.data.periodClose.periodStart.slice(0, 10)} إلى ${res.data.periodClose.periodEnd.slice(0, 10)}).`);
      setPeriodValidationResult(null);
      refreshAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل تنفيذ إقفال الفترة';
      setActionError(msg);
    } finally {
      setClosingPeriod(false);
    }
  };

  // ---- Reopen Period Handler ------------------------------------
  const handleConfirmPeriodReopen = async () => {
    if (!reopeningPeriod || !canReopen) return;
    if (!periodReopenReason.trim() || periodReopenReason.trim().length < 3) {
      setActionError('سبب إعادة فتح الفترة مطلوب (3 أحرف على الأقل).');
      return;
    }

    setSubmittingPeriodReopen(true);
    try {
      await api.reopenPeriod(reopeningPeriod.id, {
        reason: periodReopenReason.trim(),
      });
      setActionSuccess(`تمت إعادة فتح الفترة بنجاح (${reopeningPeriod.periodStart.slice(0, 10)} إلى ${reopeningPeriod.periodEnd.slice(0, 10)}).`);
      setReopeningPeriod(null);
      setPeriodReopenReason('');
      refreshAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل إعادة فتح الفترة';
      setActionError(msg);
    } finally {
      setSubmittingPeriodReopen(false);
    }
  };

  // ---- Validate Fiscal Year Handler -----------------------------
  const handleValidateFy = async (e: React.FormEvent) => {
    e.preventDefault();
    setFyFormError(null);
    setActionError(null);
    setActionSuccess(null);

    const yearNum = Number(fyForm.fiscalYear);
    if (!yearNum || !fyForm.fiscalYearStart || !fyForm.fiscalYearEnd) {
      setFyFormError('السنة المالية وتواريخ البداية والنهاية مطلوبة.');
      return;
    }

    setValidatingFy(true);
    try {
      const res = await api.validateFiscalYearClose({
        fiscalYear: yearNum,
        fiscalYearStart: fyForm.fiscalYearStart,
        fiscalYearEnd: fyForm.fiscalYearEnd,
      });
      setFyValidationResult(res.data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل فحص صلاحية إقفال السنة المالية';
      setFyFormError(msg);
      setFyValidationResult(null);
    } finally {
      setValidatingFy(false);
    }
  };

  // ---- Close Fiscal Year Handler --------------------------------
  const handleCloseFy = async () => {
    if (!canClose) return;
    setFyFormError(null);
    setActionError(null);
    setActionSuccess(null);

    const yearNum = Number(fyForm.fiscalYear);
    if (!yearNum || !fyForm.fiscalYearStart || !fyForm.fiscalYearEnd) {
      setFyFormError('يرجى ملء بيانات السنة المالية أولاً.');
      return;
    }

    if (
      !window.confirm(
        `تأكيد إقفال السنة المالية ${yearNum}:\nمن: ${fyForm.fiscalYearStart}\nإلى: ${fyForm.fiscalYearEnd}\n\nملاحظة: سيتم منع أي عمليات ترحيل محاسبية داخل السنة المالية المقفلة.\nتنبيه: قيد الأرباح المبقاة (Retained Earnings) غير مُنشأ آلياً في هذه المرحلة.\n\nهل ترغب في تأكيد الإقفال؟`,
      )
    ) {
      return;
    }

    setClosingFy(true);
    try {
      const res = await api.closeFiscalYear({
        fiscalYear: yearNum,
        fiscalYearStart: fyForm.fiscalYearStart,
        fiscalYearEnd: fyForm.fiscalYearEnd,
        notes: fyForm.notes.trim() || undefined,
      });
      setActionSuccess(`تم إقفال السنة المالية ${res.data.fiscalYearClose.fiscalYear} بنجاح.`);
      setFyValidationResult(null);
      refreshAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل تنفيذ إقفال السنة المالية';
      setActionError(msg);
    } finally {
      setClosingFy(false);
    }
  };

  // ---- Reopen Fiscal Year Handler -------------------------------
  const handleConfirmFyReopen = async () => {
    if (!reopeningFy || !canReopen) return;
    if (!fyReopenReason.trim() || fyReopenReason.trim().length < 3) {
      setActionError('سبب إعادة فتح السنة المالية مطلوب (3 أحرف على الأقل).');
      return;
    }

    setSubmittingFyReopen(true);
    try {
      await api.reopenFiscalYear(reopeningFy.id, {
        reason: fyReopenReason.trim(),
      });
      setActionSuccess(`تمت إعادة فتح السنة المالية ${reopeningFy.fiscalYear} بنجاح.`);
      setReopeningFy(null);
      setFyReopenReason('');
      refreshAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل إعادة فتح السنة المالية';
      setActionError(msg);
    } finally {
      setSubmittingFyReopen(false);
    }
  };

  // ---- Derived KPI Metrics --------------------------------------
  const openPeriodsCount = periods.filter((p) => p.status === 'OPEN' || p.status === 'REOPENED').length;
  const closedPeriodsCount = periods.filter((p) => p.status === 'CLOSED').length;
  const activeFiscalYear = statusData?.fiscalYear.fiscalYear ?? currentYearNum;
  const fyIsClosed = statusData?.fiscalYear.isClosed ?? (fiscalYears[0]?.status === 'CLOSED');

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-slate-50" dir="rtl">
        <LoadingState message="جاري التحقق من الصلاحيات والبيانات..." />
      </main>
    );
  }

  if (!user) return null;

  if (!canRead) {
    return (
      <main className="min-h-screen p-8 bg-slate-50 flex items-center justify-center" dir="rtl">
        <AccessDeniedState
          title="غير مصرح بالوصول"
          description="تتطلب شاشة إقفال الفترات المحاسبية توفر صلاحية period_close.read. يرجى مراجعة مسؤول النظام."
          returnHref="/dashboard"
          returnLabel="العودة إلى لوحة التحكم"
          requiredPermission="period_close.read"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8 text-slate-800" dir="rtl">
      {/* Standardized Header */}
      <PageHeader
        eyebrow="الإقفال المالي"
        title="إقفال الفترات والسنة المالية"
        subtitle="مراجعة حالة الفترات، القيود غير المرحّلة، والحواجز المحاسبية قبل الإقفال."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={refreshAll}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition shadow-xs"
            >
              <span>🔄</span>
              <span>تحديث البيانات</span>
            </button>
            {hasPermission('gl_journal.read') && (
              <Link
                href="/accounting/reports"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition shadow-xs"
              >
                <span>📊</span>
                <span>القوائم المالية</span>
              </Link>
            )}
            <Link
              href="/accounting"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition shadow-xs"
            >
              <span>📖</span>
              <span>دليل الحسابات</span>
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 transition shadow-xs"
            >
              لوحة التحكم
            </Link>
          </div>
        }
      />

      {/* Notifications */}
      {actionSuccess && (
        <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2 font-medium">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900 text-base font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="mb-6">
          <ErrorBanner
            title="تنبيه بالإجراء"
            message={actionError}
            onRetry={() => setActionError(null)}
          />
        </div>
      )}

      {/* Top KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="الفترات المفتوحة"
          value={loadingPeriods ? '...' : openPeriodsCount}
          helperText="فترات تتيح ترحيل الحركات والقيود"
          tone={openPeriodsCount > 0 ? 'info' : 'neutral'}
          icon={<span className="text-emerald-600">🔓</span>}
        />
        <KpiCard
          label="الفترات المغلقة"
          value={loadingPeriods ? '...' : closedPeriodsCount}
          helperText="فترات مقفلة تمنع الترحيل بحالة 409"
          tone="neutral"
          icon={<span className="text-rose-600">🔒</span>}
        />
        <KpiCard
          label="حالة التاريخ المفحوص"
          value={
            statusData
              ? statusData.period.isClosed || statusData.fiscalYear.isClosed
                ? 'ممنوع الترحيل'
                : 'الترحيل متاح'
              : '—'
          }
          helperText={`التاريخ: ${statusDate}`}
          tone={
            statusData
              ? statusData.period.isClosed || statusData.fiscalYear.isClosed
                ? 'danger'
                : 'success'
              : 'neutral'
          }
          icon={
            statusData?.period.isClosed || statusData?.fiscalYear.isClosed ? (
              <span className="text-rose-600">🚫</span>
            ) : (
              <span className="text-emerald-600">✅</span>
            )
          }
        />
        <KpiCard
          label="حالة السنة المالية"
          value={fyIsClosed ? `سنة ${activeFiscalYear} (مقفلة)` : `سنة ${activeFiscalYear} (مفتوحة)`}
          helperText={fyIsClosed ? 'السنة المالية مقفلة بالكامل' : 'السنة المالية قيد النشاط والتسجيل'}
          tone={fyIsClosed ? 'danger' : 'success'}
          icon={<span className={fyIsClosed ? 'text-rose-600' : 'text-indigo-600'}>🏛️</span>}
        />
      </div>

      {/* Global Safety Notices Banner */}
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="text-lg">⚠️</span>
          <div className="space-y-1">
            <p className="font-bold text-amber-950 text-sm">ضوابط الأمان المحاسبي وحواجز الإقفال:</p>
            <ul className="list-disc list-inside text-amber-900/90 space-y-1 leading-relaxed">
              <li>
                <strong>منع الترحيل التلقائي:</strong> إقفال أي فترة محاسبية أو سنة مالية يمنع تلقائياً إنشاء أو تعديل أو ترحيل أي قيود يومية، فواتير مبيعات، فواتير مشتريات، أو سندات دفع وقبض واقعة ضمن التواريخ المقفلة ويرفضها النظام بحالة 409 Conflict.
              </li>
              <li>
                <strong>قيد الأرباح المبقاة (Retained Earnings):</strong> إقفال السنة المالية يوثق حاجز الإقفال السنوي دون إنشاء قيد ترحيل الأرباح المبقاة تلقائياً، حفاظاً على دقة التسويات الختامية المعتمدة.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Status Inspector Section */}
      <div className="mb-6">
        <SectionCard
          title="فحص حالة الإقفال لتاريخ محدد (Status Inspector)"
          description="تحقق فورياً مما إذا كان تاريخ عملية معين خاضعاً لحاجز إقفال يمنع الترحيل المحاسبي"
          actions={
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <label className="text-xs font-semibold text-slate-700">التاريخ المستهدف:</label>
              <input
                type="date"
                value={statusDate}
                onChange={(e) => setStatusDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <button
                onClick={() => loadStatus(statusDate)}
                disabled={loadingStatus}
                className="rounded-lg bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-800 disabled:bg-slate-300 font-medium transition"
              >
                {loadingStatus ? 'جاري الفحص...' : 'فحص'}
              </button>
            </div>
          }
        >
          {statusError && (
            <div className="mb-4">
              <ErrorBanner title="خطأ في فحص التاريخ" message={statusError} />
            </div>
          )}

          {statusData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Period Status Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-600">الفترة المحاسبية (Accounting Period)</span>
                  <PeriodStatusBadge status={statusData.period.status} />
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">نطاق الفترة:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {statusData.period.periodStart ? `${formatDate(statusData.period.periodStart)} إلى ${formatDate(statusData.period.periodEnd)}` : 'لا توجد فترة محددة'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">حالة الترحيل:</span>
                    <span className={`font-bold px-2 py-0.5 rounded ${statusData.period.isClosed ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                      {statusData.period.isClosed ? '🚫 الترحيل مغلق وممنوع' : '✅ الترحيل متاح ومسموح'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fiscal Year Status Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-600">السنة المالية (Fiscal Year)</span>
                  <PeriodStatusBadge status={statusData.fiscalYear.status} />
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">السنة المالية:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {statusData.fiscalYear.fiscalYear ?? 'غير محددة'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">نطاق السنة:</span>
                    <span className="font-mono font-medium text-slate-800">
                      {statusData.fiscalYear.fiscalYearStart ? `${formatDate(statusData.fiscalYear.fiscalYearStart)} إلى ${formatDate(statusData.fiscalYear.fiscalYearEnd)}` : 'لا توجد سنة مالية مسجلة'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">حالة الترحيل:</span>
                    <span className={`font-bold px-2 py-0.5 rounded ${statusData.fiscalYear.isClosed ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                      {statusData.fiscalYear.isClosed ? '🚫 السنة مقفلة ويمنع الترحيل' : '✅ السنة مفتوحة ومسموحة'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Tabs Navigation */}
      <div className="mb-6 flex border-b border-slate-200 gap-3">
        <button
          onClick={() => setActiveTab('periods')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'periods'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          الفترات المحاسبية (Accounting Periods)
        </button>
        <button
          onClick={() => setActiveTab('fiscal_years')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'fiscal_years'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          السنوات المالية (Fiscal Years)
        </button>
        <button
          onClick={() => setActiveTab('audit_log')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'audit_log'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          سجل التدقيق والعمليات (Audit Trail)
        </button>
      </div>

      {/* =====================================================
          TAB 1: ACCOUNTING PERIODS
         ===================================================== */}
      {activeTab === 'periods' && (
        <div className="space-y-6">
          {/* Section C: Period Close Form & Validation */}
          <SectionCard
            title="إقفال فترة محاسبية جديدة"
            description="حدد نطاق الفترة ثم اضغط على التحقق لفحص القيود وتوازن الحسابات قبل تنفيذ الإقفال"
          >
            <form onSubmit={handleValidatePeriod} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    تاريخ بداية الفترة <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={periodForm.periodStart}
                    onChange={(e) => {
                      setPeriodForm({ ...periodForm, periodStart: e.target.value });
                      setPeriodValidationResult(null);
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    تاريخ نهاية الفترة <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={periodForm.periodEnd}
                    onChange={(e) => {
                      setPeriodForm({ ...periodForm, periodEnd: e.target.value });
                      setPeriodValidationResult(null);
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    السنة المالية (اختياري)
                  </label>
                  <input
                    type="number"
                    placeholder="مثال: 2026"
                    value={periodForm.fiscalYear}
                    onChange={(e) => setPeriodForm({ ...periodForm, fiscalYear: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    رقم الفترة (اختياري 1-12)
                  </label>
                  <input
                    type="number"
                    placeholder="مثال: 1"
                    value={periodForm.periodNumber}
                    onChange={(e) => setPeriodForm({ ...periodForm, periodNumber: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ملاحظات الإقفال (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="مثال: إقفال حسابات شهر يناير 2026 بعد مراجعة التسويات"
                  value={periodForm.notes}
                  onChange={(e) => setPeriodForm({ ...periodForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                />
              </div>

              {periodFormError && (
                <div className="mt-2">
                  <ErrorBanner title="تنبيه بالتحقق" message={periodFormError} />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={validatingPeriod || closingPeriod}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300 transition shadow-xs"
                >
                  {validatingPeriod ? 'جاري التحقق...' : 'التحقق من الفترة (Validate)'}
                </button>

                <button
                  type="button"
                  onClick={handleClosePeriod}
                  disabled={
                    !canClose ||
                    closingPeriod ||
                    validatingPeriod ||
                    !periodValidationResult ||
                    !periodValidationResult.canClose
                  }
                  title={!canClose ? 'يتطلب صلاحية period_close.close' : ''}
                  className={`rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition shadow-xs ${
                    periodValidationResult?.canClose && canClose
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-slate-300 cursor-not-allowed text-slate-500'
                  }`}
                >
                  {closingPeriod ? 'جاري الإقفال...' : 'إقفال الفترة (Close Period)'}
                </button>

                {!canClose && (
                  <span className="text-xs text-amber-700">
                    * زر الإقفال يتطلب توفر صلاحية <code>period_close.close</code>
                  </span>
                )}
              </div>
            </form>

            {/* Validation Results Panel */}
            {periodValidationResult && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                        periodValidationResult.canClose
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {periodValidationResult.canClose ? 'جاهز للإقفال (Ready to Close)' : 'فشل التحقق - لا يمكن الإقفال'}
                    </span>
                    <span className="text-xs text-slate-500">
                      عدد الموانع الرقابية: <strong className="text-slate-800">{periodValidationResult.blockingFailures}</strong>
                    </span>
                  </div>

                  {/* Totals strictly as strings */}
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-slate-600">
                      إجمالي المدين: <strong className="text-slate-900">{formatAmount(periodValidationResult.totals.postedDebitTotal)}</strong>
                    </span>
                    <span className="text-slate-600">
                      إجمالي الدائن: <strong className="text-slate-900">{formatAmount(periodValidationResult.totals.postedCreditTotal)}</strong>
                    </span>
                  </div>
                </div>

                {periodValidationResult.warnings.length > 0 && (
                  <div className="rounded-xl bg-amber-50 p-3 border border-amber-200 text-xs text-amber-900 space-y-1">
                    <p className="font-bold">تنبيهات التحقق:</p>
                    <ul className="list-disc list-inside">
                      {periodValidationResult.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Detailed Checks Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100/80 text-slate-700">
                      <tr>
                        <th className="p-3">رمز الفحص (Check Code)</th>
                        <th className="p-3">الحالة</th>
                        <th className="p-3">مانع للإقفال</th>
                        <th className="p-3">التفاصيل والرسالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {periodValidationResult.checks.map((check, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-bold text-slate-800">{check.code}</td>
                          <td className="p-3"><CheckStatusBadge status={check.status} /></td>
                          <td className="p-3 font-semibold">
                            {check.blocking ? (
                              <span className="text-rose-600">نعم (مانع)</span>
                            ) : (
                              <span className="text-slate-400">لا</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600">{check.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Section D: Period List */}
          <SectionCard
            title="سجل الفترات المحاسبية"
            description="استعراض الفترات المسجلة وحالاتها، مع إمكانية إعادة الفتح بموجب مبرر رقابي"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={periodStatusFilter}
                  onChange={(e) => setPeriodStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                >
                  <option value="">كل الحالات</option>
                  <option value="OPEN">مفتوح (OPEN)</option>
                  <option value="CLOSED">مقفل (CLOSED)</option>
                  <option value="CLOSING">جاري الإقفال (CLOSING)</option>
                  <option value="REOPENED">مُعاد فتحه (REOPENED)</option>
                </select>

                <input
                  type="number"
                  placeholder="تصفية بالسنة"
                  value={periodYearFilter}
                  onChange={(e) => setPeriodYearFilter(e.target.value)}
                  className="w-28 rounded-xl border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                />

                <button
                  onClick={loadPeriods}
                  disabled={loadingPeriods}
                  className="rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs text-slate-700 font-medium transition"
                >
                  {loadingPeriods ? 'تحديث...' : 'تحديث'}
                </button>
              </div>
            }
          >
            {periodsError && (
              <div className="mb-4">
                <ErrorBanner title="خطأ في تحميل الفترات" message={periodsError} />
              </div>
            )}

            {periods.length === 0 ? (
              <EmptyState
                title="لا توجد فترات محاسبية مطابقة"
                description="لم يتم العثور على فترات محاسبية مسجلة أو مطابقة لشروط التصفية الحالية."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">نطاق الفترة</th>
                      <th className="p-3">السنة / الرقم</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">تاريخ الإقفال / المستخدم</th>
                      <th className="p-3">تاريخ إعادة الفتح / السبب</th>
                      <th className="p-3">ملاحظات</th>
                      <th className="p-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {periods.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-900">
                          {formatDate(p.periodStart)} إلى {formatDate(p.periodEnd)}
                        </td>
                        <td className="p-3 font-mono text-slate-700">
                          {p.fiscalYear} {p.periodNumber ? `(P${p.periodNumber})` : ''}
                        </td>
                        <td className="p-3">
                          <PeriodStatusBadge status={p.status} />
                        </td>
                        <td className="p-3 text-slate-600">
                          {p.closedAt ? (
                            <div>
                              <div className="font-mono text-[11px]">{formatDateTime(p.closedAt)}</div>
                              <span className="text-[10px] text-slate-400">
                                {p.closedBy?.fullName ?? p.closedById ?? '—'}
                              </span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-3 text-slate-600">
                          {p.reopenedAt ? (
                            <div>
                              <div className="font-mono text-[11px]">{formatDateTime(p.reopenedAt)}</div>
                              <div className="text-[10px] text-amber-700 font-medium">السبب: {p.reopenReason}</div>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-3 text-slate-600 max-w-[200px] truncate" title={p.notes ?? ''}>
                          {p.notes || '—'}
                        </td>
                        <td className="p-3 text-center">
                          {p.status === 'CLOSED' ? (
                            <button
                              onClick={() => {
                                setReopeningPeriod(p);
                                setPeriodReopenReason('');
                              }}
                              disabled={!canReopen}
                              title={!canReopen ? 'يتطلب صلاحية period_close.reopen' : 'إعادة فتح الفترة للتعديل'}
                              className="rounded-xl bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:bg-slate-100 disabled:text-slate-400 px-3 py-1 text-xs font-semibold transition"
                            >
                              إعادة فتح
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* =====================================================
          TAB 2: FISCAL YEARS
         ===================================================== */}
      {activeTab === 'fiscal_years' && (
        <div className="space-y-6">
          {/* Section E: Fiscal Year Close Form & Validation */}
          <SectionCard
            title="إقفال سنة مالية"
            description="يشترط لإقفال السنة المالية أن تكون جميع الفترات المحاسبية داخلها مقفلة بالكامل ومتوازنة"
          >
            <form onSubmit={handleValidateFy} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    السنة المالية <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={fyForm.fiscalYear}
                    onChange={(e) => {
                      setFyForm({ ...fyForm, fiscalYear: e.target.value });
                      setFyValidationResult(null);
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    تاريخ بداية السنة المالية <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={fyForm.fiscalYearStart}
                    onChange={(e) => {
                      setFyForm({ ...fyForm, fiscalYearStart: e.target.value });
                      setFyValidationResult(null);
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    تاريخ نهاية السنة المالية <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={fyForm.fiscalYearEnd}
                    onChange={(e) => {
                      setFyForm({ ...fyForm, fiscalYearEnd: e.target.value });
                      setFyValidationResult(null);
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ملاحظات الإقفال السنوي (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="مثال: إقفال السنة المالية 2026 واعتماد الحسابات الختامية"
                  value={fyForm.notes}
                  onChange={(e) => setFyForm({ ...fyForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                />
              </div>

              {/* Retained earnings scope notice */}
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                ℹ️ <strong>ملاحظة الأرباح المبقاة:</strong> إقفال السنة المالية في هذا الإصدار لا يُنشئ قيد ترحيل الأرباح المبقاة (Retained Earnings) آلياً.
              </div>

              {fyFormError && (
                <div className="mt-2">
                  <ErrorBanner title="تنبيه بالتحقق" message={fyFormError} />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={validatingFy || closingFy}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300 transition shadow-xs"
                >
                  {validatingFy ? 'جاري التحقق...' : 'التحقق من السنة المالية (Validate)'}
                </button>

                <button
                  type="button"
                  onClick={handleCloseFy}
                  disabled={
                    !canClose ||
                    closingFy ||
                    validatingFy ||
                    !fyValidationResult ||
                    !fyValidationResult.canClose
                  }
                  title={!canClose ? 'يتطلب صلاحية period_close.close' : ''}
                  className={`rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition shadow-xs ${
                    fyValidationResult?.canClose && canClose
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-slate-300 cursor-not-allowed text-slate-500'
                  }`}
                >
                  {closingFy ? 'جاري الإقفال السنوي...' : 'إقفال السنة المالية (Close Fiscal Year)'}
                </button>

                {!canClose && (
                  <span className="text-xs text-amber-700">
                    * زر الإقفال يتطلب صلاحية <code>period_close.close</code>
                  </span>
                )}
              </div>
            </form>

            {/* FY Validation Results Panel */}
            {fyValidationResult && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                        fyValidationResult.canClose
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {fyValidationResult.canClose ? 'جاهز للإقفال السنوي' : 'فشل التحقق - لا يمكن إقفال السنة المالية'}
                    </span>
                    <span className="text-xs text-slate-500">
                      عدد الموانع الرقابية: <strong className="text-slate-800">{fyValidationResult.blockingFailures}</strong>
                    </span>
                  </div>

                  {/* Totals strictly as strings */}
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-slate-600">
                      إجمالي مدين السنة: <strong className="text-slate-900">{formatAmount(fyValidationResult.totals.postedDebitTotal)}</strong>
                    </span>
                    <span className="text-slate-600">
                      إجمالي دائن السنة: <strong className="text-slate-900">{formatAmount(fyValidationResult.totals.postedCreditTotal)}</strong>
                    </span>
                  </div>
                </div>

                {/* Retained Earnings notice in validation */}
                <div className="rounded-xl bg-white p-3 border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                  <span>حالة قيد الأرباح المبقاة: <strong>{fyValidationResult.retainedEarnings.postingCreated ? 'تم الإنشاء' : 'لم يتم الإنشاء (مستثنى)'}</strong></span>
                  <span className="text-[11px] text-slate-500">{fyValidationResult.retainedEarnings.reason}</span>
                </div>

                {fyValidationResult.warnings.length > 0 && (
                  <div className="rounded-xl bg-amber-50 p-3 border border-amber-200 text-xs text-amber-900 space-y-1">
                    <p className="font-bold">تنبيهات:</p>
                    <ul className="list-disc list-inside">
                      {fyValidationResult.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Detailed Checks Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100/80 text-slate-700">
                      <tr>
                        <th className="p-3">رمز الفحص (Check Code)</th>
                        <th className="p-3">الحالة</th>
                        <th className="p-3">مانع للإقفال</th>
                        <th className="p-3">التفاصيل والرسالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fyValidationResult.checks.map((check, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-bold text-slate-800">{check.code}</td>
                          <td className="p-3"><CheckStatusBadge status={check.status} /></td>
                          <td className="p-3 font-semibold">
                            {check.blocking ? (
                              <span className="text-rose-600">نعم (مانع)</span>
                            ) : (
                              <span className="text-slate-400">لا</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600">{check.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Section F: Fiscal Year List */}
          <SectionCard
            title="سجل السنوات المالية"
            description="استعراض السنوات المالية المقفلة والمفتوحة مع إمكانية إعادة الفتح"
            actions={
              <div className="flex items-center gap-2">
                <select
                  value={fyStatusFilter}
                  onChange={(e) => setFyStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                >
                  <option value="">كل الحالات</option>
                  <option value="OPEN">مفتوح (OPEN)</option>
                  <option value="CLOSED">مقفل (CLOSED)</option>
                  <option value="CLOSING">جاري الإقفال (CLOSING)</option>
                  <option value="REOPENED">مُعاد فتحه (REOPENED)</option>
                </select>

                <button
                  onClick={loadFiscalYears}
                  disabled={loadingFiscalYears}
                  className="rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs text-slate-700 font-medium transition"
                >
                  {loadingFiscalYears ? 'تحديث...' : 'تحديث'}
                </button>
              </div>
            }
          >
            {fiscalYearsError && (
              <div className="mb-4">
                <ErrorBanner title="خطأ في تحميل السنوات المالية" message={fiscalYearsError} />
              </div>
            )}

            {fiscalYears.length === 0 ? (
              <EmptyState
                title="لا توجد سجلات سنوات مالية مسجلة"
                description="لم يتم العثور على سجلات سنوات مالية سابقة في النظام."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">السنة المالية</th>
                      <th className="p-3">نطاق التواريخ</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">تاريخ الإقفال / المستخدم</th>
                      <th className="p-3">تاريخ إعادة الفتح / السبب</th>
                      <th className="p-3">قيد الأرباح المبقاة</th>
                      <th className="p-3">ملاحظات</th>
                      <th className="p-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fiscalYears.map((fy) => (
                      <tr key={fy.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-900">{fy.fiscalYear}</td>
                        <td className="p-3 font-mono text-slate-700">
                          {formatDate(fy.fiscalYearStart)} إلى {formatDate(fy.fiscalYearEnd)}
                        </td>
                        <td className="p-3">
                          <PeriodStatusBadge status={fy.status} />
                        </td>
                        <td className="p-3 text-slate-600">
                          {fy.closedAt ? (
                            <div>
                              <div className="font-mono text-[11px]">{formatDateTime(fy.closedAt)}</div>
                              <span className="text-[10px] text-slate-400">
                                {fy.closedBy?.fullName ?? fy.closedById ?? '—'}
                              </span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-3 text-slate-600">
                          {fy.reopenedAt ? (
                            <div>
                              <div className="font-mono text-[11px]">{formatDateTime(fy.reopenedAt)}</div>
                              <div className="text-[10px] text-amber-700 font-medium">السبب: {fy.reopenReason}</div>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">
                          {fy.retainedEarningsJournalEntryId ?? 'غير مُنشأ (خارج النطاق)'}
                        </td>
                        <td className="p-3 text-slate-600 max-w-[200px] truncate" title={fy.notes ?? ''}>
                          {fy.notes || '—'}
                        </td>
                        <td className="p-3 text-center">
                          {fy.status === 'CLOSED' ? (
                            <button
                              onClick={() => {
                                setReopeningFy(fy);
                                setFyReopenReason('');
                              }}
                              disabled={!canReopen}
                              title={!canReopen ? 'يتطلب صلاحية period_close.reopen' : 'إعادة فتح السنة المالية'}
                              className="rounded-xl bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:bg-slate-100 disabled:text-slate-400 px-3 py-1 text-xs font-semibold transition"
                            >
                              إعادة فتح
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* =====================================================
          TAB 3: AUDIT TRAIL
         ===================================================== */}
      {activeTab === 'audit_log' && (
        <SectionCard
          title="سجل التدقيق والعمليات (Period Close Audit Trail)"
          description="تسجيل رقابي غير قابل للتعديل لكافة عمليات الإقفال وإعادة الفتح مع المبررات والمستخدمين"
          actions={
            <div className="flex items-center gap-2">
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
              >
                <option value="">كل العمليات</option>
                <option value="CLOSED">إقفال (CLOSED)</option>
                <option value="REOPENED">إعادة فتح (REOPENED)</option>
                <option value="CLOSE_STARTED">بدء الإقفال (CLOSE_STARTED)</option>
                <option value="FAILED_VALIDATION">فشل التحقق (FAILED_VALIDATION)</option>
              </select>

              <button
                onClick={loadAuditLogs}
                disabled={loadingAuditLogs}
                className="rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs text-slate-700 font-medium transition"
              >
                {loadingAuditLogs ? 'تحديث...' : 'تحديث'}
              </button>
            </div>
          }
        >
          {auditLogsError && (
            <div className="mb-4">
              <ErrorBanner title="خطأ في تحميل سجل التدقيق" message={auditLogsError} />
            </div>
          )}

          {auditLogs.length === 0 ? (
            <EmptyState
              title="لا توجد سجلات تدقيق مسجلة"
              description="لم يتم تسجيل عمليات إقفال أو إعادة فتح للفترات بعد."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">التاريخ والوقت</th>
                    <th className="p-3">الإجراء (Action)</th>
                    <th className="p-3">المستخدم (Actor)</th>
                    <th className="p-3">الهدف (Target)</th>
                    <th className="p-3">السبب / الملاحظات</th>
                    <th className="p-3">بيانات إضافية (Metadata)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono text-slate-800">{formatDateTime(log.createdAt)}</td>
                      <td className="p-3 font-semibold text-slate-900">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] border border-slate-200">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 font-medium">
                        {log.actorUser?.fullName ?? log.actorUser?.email ?? log.actorUserId}
                      </td>
                      <td className="p-3 text-slate-600 font-mono text-[11px]">
                        {log.periodCloseId ? `فترة: ${log.periodCloseId.slice(0, 8)}...` : ''}
                        {log.fiscalYearCloseId ? `سنة مالية: ${log.fiscalYearCloseId.slice(0, 8)}...` : ''}
                        {!log.periodCloseId && !log.fiscalYearCloseId && '—'}
                      </td>
                      <td className="p-3 text-slate-600 max-w-[200px] truncate" title={log.reason ?? ''}>
                        {log.reason || '—'}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-slate-500 max-w-[250px] truncate" title={JSON.stringify(log.metadata)}>
                        {log.metadata ? JSON.stringify(log.metadata) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* =====================================================
          MODAL: REOPEN PERIOD
         ===================================================== */}
      {reopeningPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              إعادة فتح الفترة المحاسبية
            </h3>
            <p className="text-xs text-slate-600">
              الفترة: <strong>{formatDate(reopeningPeriod.periodStart)}</strong> إلى <strong>{formatDate(reopeningPeriod.periodEnd)}</strong>
            </p>
            <p className="text-xs text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200 leading-relaxed">
              ⚠️ <strong>تنبيه رقابي:</strong> إعادة فتح الفترة سيعيد السماح بترحيل وتعديل القيود والفواتير وسندات الدفع داخل هذا النطاق الزمني.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                سبب إعادة الفتح (إلزامي) <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="اذكر المبرر الرقابي لإعادة فتح الفترة..."
                value={periodReopenReason}
                onChange={(e) => setPeriodReopenReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReopeningPeriod(null)}
                disabled={submittingPeriodReopen}
                className="rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmPeriodReopen}
                disabled={submittingPeriodReopen || !periodReopenReason.trim() || periodReopenReason.trim().length < 3}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 px-4 py-2 text-xs font-semibold text-white transition shadow-xs"
              >
                {submittingPeriodReopen ? 'جاري إعادة الفتح...' : 'تأكيد إعادة الفتح'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          MODAL: REOPEN FISCAL YEAR
         ===================================================== */}
      {reopeningFy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              إعادة فتح السنة المالية {reopeningFy.fiscalYear}
            </h3>
            <p className="text-xs text-slate-600">
              النطاق: <strong>{formatDate(reopeningFy.fiscalYearStart)}</strong> إلى <strong>{formatDate(reopeningFy.fiscalYearEnd)}</strong>
            </p>
            <p className="text-xs text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200 leading-relaxed">
              ⚠️ <strong>تنبيه رقابي:</strong> إعادة فتح السنة المالية سيعيد السماح بإجراء القيود المحاسبية التعديلية داخل هذه السنة.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                سبب إعادة الفتح (إلزامي) <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="اذكر المبرر الرقابي لإعادة فتح السنة المالية..."
                value={fyReopenReason}
                onChange={(e) => setFyReopenReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReopeningFy(null)}
                disabled={submittingFyReopen}
                className="rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmFyReopen}
                disabled={submittingFyReopen || !fyReopenReason.trim() || fyReopenReason.trim().length < 3}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 px-4 py-2 text-xs font-semibold text-white transition shadow-xs"
              >
                {submittingFyReopen ? 'جاري إعادة الفتح...' : 'تأكيد إعادة الفتح'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
