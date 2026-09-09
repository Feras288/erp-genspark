'use client';

// =====================================================
// Phase 14A-C: Period Close & Fiscal Year Close Workspace
// Route: /accounting/period-close
//
// Features:
// 1. Permission Gating:
//    - Requires auth and `period_close.read`
//    - `period_close.close` gates period & fiscal year close
//    - `period_close.reopen` gates period & fiscal year reopen
// 2. Status Inspector Panel (checks date status for period & fiscal year)
// 3. Period Close Validation & Workflow Panel
// 4. Period Closes History Table (with reopen modal)
// 5. Fiscal Year Close Validation & Workflow Panel (with retained earnings notice)
// 6. Fiscal Year Closes History Table (with reopen modal)
// 7. Period Close Audit Log Section
// 8. Financial Statements & Navigation links
//
// Monetary values are treated strictly as strings to prevent floating-point inaccuracies.
// Zero frontend Number() arithmetic.
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  api,
  ApiError,
  CloseFiscalYearResponse,
  ClosePeriodResponse,
  FiscalYearCloseRecord,
  FiscalYearValidationResponse,
  PeriodCloseAuditLogRecord,
  PeriodCloseCheckStatus,
  PeriodCloseRecord,
  PeriodCloseStatus,
  PeriodCloseStatusData,
  PeriodCloseValidationResponse,
} from '@/lib/api';

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

// ---------- Badges -----------------------------------------------

function StatusBadge({ status }: { status: PeriodCloseStatus }) {
  switch (status) {
    case 'CLOSED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 border border-rose-200">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
          مقفل (CLOSED)
        </span>
      );
    case 'CLOSING':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
          جاري الإقفال (CLOSING)
        </span>
      );
    case 'REOPENED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 border border-sky-200">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />
          مُعاد فتحه (REOPENED)
        </span>
      );
    case 'OPEN':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
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
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
          <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          ناجح (PASS)
        </span>
      );
    case 'FAIL':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 border border-rose-200">
          <svg className="h-3.5 w-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
          فشل (FAIL)
        </span>
      );
    case 'WARNING':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
          <svg className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          تنبيه (WARNING)
        </span>
      );
    case 'SKIPPED':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
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

  // ---- Rendering Guards -----------------------------------------
  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
          <p className="text-sm text-slate-600">جاري التحقق من الصلاحيات والتحميل...</p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  if (!canRead) {
    return (
      <main className="min-h-screen p-8 bg-slate-50 flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-sm border border-slate-200 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800">غير مصرح بالوصول</h2>
          <p className="text-sm text-slate-600">
            يتطلب استعراض شاشة إقفال الفترات المحاسبية توفر صلاحية <code>period_close.read</code>. يرجى مراجعة مسؤول النظام.
          </p>
          <Link
            href="/dashboard"
            className="inline-block rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            العودة إلى لوحة المعلومات
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-bold">
              🔒
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">إقفال الفترات والسنوات المالية</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                التحكم في إقفال وإعادة فتح الفترات الشهرية والسنوات المالية ومنع الترحيل المحاسبي غير المصرح به
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('gl_journal.read') && (
            <Link
              href="/accounting/reports"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              📊 القوائم المالية
            </Link>
          )}
          <Link
            href="/accounting"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            📖 دليل الحسابات والقيود
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            لوحة المعلومات
          </Link>
        </div>
      </header>

      {/* Notifications */}
      {actionSuccess && (
        <div className="mb-6 flex items-start justify-between rounded-xl bg-emerald-50 p-4 border border-emerald-200 text-emerald-800">
          <div className="flex items-center gap-2 text-sm font-medium">
            <svg className="h-5 w-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900 text-sm font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="mb-6 flex items-start justify-between rounded-xl bg-rose-50 p-4 border border-rose-200 text-rose-800">
          <div className="flex items-center gap-2 text-sm font-medium">
            <svg className="h-5 w-5 text-rose-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-600 hover:text-rose-900 text-sm font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Safety Notices Banner */}
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div className="space-y-1">
            <p className="font-semibold text-amber-950">قواعد الأمان والإقفال المحاسبي:</p>
            <ul className="list-disc list-inside text-xs md:text-sm text-amber-900/90 space-y-0.5">
              <li>
                <strong>إقفال الفترة المحاسبية أو السنة المالية:</strong> يقوم تلقائياً بقفل عمليات الترحيل
                (القيود اليدوية، فواتير المبيعات، فواتير المشتريات، وسندات القبض والصرف) داخل التواريخ المقفلة ورفضها بحالة 409 Conflict.
              </li>
              <li>
                <strong>إقفال السنة المالية (Phase 14A):</strong> يتطلب إقفال جميع الفترات المحاسبية داخل السنة،
                ولا يتم إنشاء قيد ترحيل الأرباح المبقاة (Retained Earnings) آلياً في هذه المرحلة.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Section B: Current Status Panel */}
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span>📅</span> فحص حالة الإقفال لتاريخ محدد
            </h2>
            <p className="text-xs text-slate-500">
              تحقق فورياً مما إذا كان تاريخ معين مقفلاً ويمنع الترحيل المحاسبي
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-700">التاريخ المستهدف:</label>
            <input
              type="date"
              value={statusDate}
              onChange={(e) => setStatusDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <button
              onClick={() => loadStatus(statusDate)}
              disabled={loadingStatus}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:bg-slate-300"
            >
              {loadingStatus ? 'جاري الفحص...' : 'فحص'}
            </button>
          </div>
        </div>

        {statusError && (
          <p className="text-xs text-rose-600 mb-4">{statusError}</p>
        )}

        {statusData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Period Status Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  الفترة المحاسبية (Accounting Period)
                </span>
                <StatusBadge status={statusData.period.status} />
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">نطاق الفترة:</span>
                  <span className="font-mono font-medium text-slate-800">
                    {statusData.period.periodStart ? `${formatDate(statusData.period.periodStart)} إلى ${formatDate(statusData.period.periodEnd)}` : 'لا توجد فترة محددة'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">حالة الترحيل:</span>
                  <span className={`font-semibold ${statusData.period.isClosed ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {statusData.period.isClosed ? '🚫 الترحيل مغلق وممنوع' : '✅ الترحيل متاح ومسموح'}
                  </span>
                </div>
              </div>
            </div>

            {/* Fiscal Year Status Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  السنة المالية (Fiscal Year)
                </span>
                <StatusBadge status={statusData.fiscalYear.status} />
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">السنة المالية:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {statusData.fiscalYear.fiscalYear ?? 'غير محددة'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">نطاق السنة:</span>
                  <span className="font-mono font-medium text-slate-800">
                    {statusData.fiscalYear.fiscalYearStart ? `${formatDate(statusData.fiscalYear.fiscalYearStart)} إلى ${formatDate(statusData.fiscalYear.fiscalYearEnd)}` : 'لا توجد سنة مالية مسجلة'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">حالة الترحيل:</span>
                  <span className={`font-semibold ${statusData.fiscalYear.isClosed ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {statusData.fiscalYear.isClosed ? '🚫 السنة مقفلة ويمنع الترحيل' : '✅ السنة مفتوحة ومسموحة'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Tabs Navigation */}
      <div className="mb-6 flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('periods')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'periods'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          الفترات المحاسبية (Accounting Periods)
        </button>
        <button
          onClick={() => setActiveTab('fiscal_years')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'fiscal_years'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          السنوات المالية (Fiscal Years)
        </button>
        <button
          onClick={() => setActiveTab('audit_log')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
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
        <div className="space-y-8">
          {/* Section C: Period Close Form & Validation */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-1">إقفال فترة محاسبية جديدة</h2>
            <p className="text-xs text-slate-500 mb-4">
              قم بتحديد نطاق الفترة المحاسبية أولاً، ثم اضغط على &quot;التحقق من الفترة&quot; لفحص القيود وتوازن الحسابات قبل الإقفال
            </p>

            <form onSubmit={handleValidatePeriod} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    السنة المالية (اختياري)
                  </label>
                  <input
                    type="number"
                    placeholder="مثال: 2026"
                    value={periodForm.fiscalYear}
                    onChange={(e) => setPeriodForm({ ...periodForm, fiscalYear: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    رقم الفترة (اختياري 1-12)
                  </label>
                  <input
                    type="number"
                    placeholder="مثال: 1"
                    value={periodForm.periodNumber}
                    onChange={(e) => setPeriodForm({ ...periodForm, periodNumber: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ملاحظات الإقفال (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="مثال: إقفال حسابات شهر يناير 2026"
                  value={periodForm.notes}
                  onChange={(e) => setPeriodForm({ ...periodForm, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {periodFormError && (
                <p className="text-xs text-rose-600 font-medium">{periodFormError}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={validatingPeriod || closingPeriod}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
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
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
                    periodValidationResult?.canClose && canClose
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-slate-300 cursor-not-allowed text-slate-500'
                  }`}
                >
                  {closingPeriod ? 'جاري الإقفال...' : 'إقفال الفترة (Close Period)'}
                </button>

                {!canClose && (
                  <span className="text-xs text-amber-700">
                    * زر الإقفال يتطلب صلاحية <code>period_close.close</code>
                  </span>
                )}
              </div>
            </form>

            {/* Validation Results Panel */}
            {periodValidationResult && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
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
                      عدد الموانع: <strong>{periodValidationResult.blockingFailures}</strong>
                    </span>
                  </div>

                  {/* Totals display strictly without Number math */}
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-slate-600">
                      إجمالي المدين: <strong className="text-slate-800">{formatAmount(periodValidationResult.totals.postedDebitTotal)}</strong>
                    </span>
                    <span className="text-slate-600">
                      إجمالي الدائن: <strong className="text-slate-800">{formatAmount(periodValidationResult.totals.postedCreditTotal)}</strong>
                    </span>
                  </div>
                </div>

                {periodValidationResult.warnings.length > 0 && (
                  <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 text-xs text-amber-900 space-y-1">
                    <p className="font-bold">تنبيهات:</p>
                    <ul className="list-disc list-inside">
                      {periodValidationResult.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Detailed Checks Table */}
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="p-2.5">رمز الفحص (Check Code)</th>
                        <th className="p-2.5">الحالة</th>
                        <th className="p-2.5">مانع للإقفال</th>
                        <th className="p-2.5">التفاصيل والرسالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {periodValidationResult.checks.map((check, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-medium text-slate-800">{check.code}</td>
                          <td className="p-2.5"><CheckStatusBadge status={check.status} /></td>
                          <td className="p-2.5 font-semibold">
                            {check.blocking ? (
                              <span className="text-rose-600">نعم</span>
                            ) : (
                              <span className="text-slate-400">لا</span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-600">{check.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Section D: Period List */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">سجل الفترات المحاسبية</h2>
                <p className="text-xs text-slate-500">استعراض الفترات المسجلة وحالاتها، مع إمكانية إعادة الفتح</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={periodStatusFilter}
                  onChange={(e) => setPeriodStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                  className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                />

                <button
                  onClick={loadPeriods}
                  disabled={loadingPeriods}
                  className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs text-slate-700 font-medium"
                >
                  {loadingPeriods ? 'تحديث...' : 'تحديث'}
                </button>
              </div>
            </div>

            {periodsError && (
              <p className="text-xs text-rose-600 mb-3">{periodsError}</p>
            )}

            {periods.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-sm text-slate-500">لا توجد فترات محاسبية مطابقة للشروط الحالية.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold">
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
                  <tbody className="divide-y divide-slate-200">
                    {periods.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-medium text-slate-800">
                          {formatDate(p.periodStart)} إلى {formatDate(p.periodEnd)}
                        </td>
                        <td className="p-3 font-mono text-slate-700">
                          {p.fiscalYear} {p.periodNumber ? `(P${p.periodNumber})` : ''}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="p-3 text-slate-600">
                          {p.closedAt ? (
                            <div>
                              <div>{formatDateTime(p.closedAt)}</div>
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
                              <div>{formatDateTime(p.reopenedAt)}</div>
                              <div className="text-[10px] text-amber-700">السبب: {p.reopenReason}</div>
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
                              className="rounded-md bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 disabled:bg-slate-100 disabled:text-slate-400 px-2.5 py-1 text-xs font-semibold"
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
          </section>
        </div>
      )}

      {/* =====================================================
          TAB 2: FISCAL YEARS
         ===================================================== */}
      {activeTab === 'fiscal_years' && (
        <div className="space-y-8">
          {/* Section E: Fiscal Year Close Form & Validation */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-1">إقفال سنة مالية</h2>
            <p className="text-xs text-slate-500 mb-4">
              يشترط لإقفال السنة المالية أن تكون جميع الفترات المحاسبية داخلها مقفلة بالكامل ومتوازنة
            </p>

            <form onSubmit={handleValidateFy} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ملاحظات الإقفال السنوي (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="مثال: إقفال السنة المالية 2026 واعتماد الحسابات الختامية"
                  value={fyForm.notes}
                  onChange={(e) => setFyForm({ ...fyForm, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Retained earnings scope notice */}
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                ℹ️ <strong>ملاحظة الأرباح المبقاة:</strong> إقفال السنة المالية في هذا الإصدار لا يُنشئ قيد ترحيل الأرباح المبقاة (Retained Earnings Journal Entry).
              </div>

              {fyFormError && (
                <p className="text-xs text-rose-600 font-medium">{fyFormError}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={validatingFy || closingFy}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
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
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
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
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
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
                      عدد الموانع: <strong>{fyValidationResult.blockingFailures}</strong>
                    </span>
                  </div>

                  {/* Totals strictly as strings */}
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-slate-600">
                      إجمالي مدين السنة: <strong className="text-slate-800">{formatAmount(fyValidationResult.totals.postedDebitTotal)}</strong>
                    </span>
                    <span className="text-slate-600">
                      إجمالي دائن السنة: <strong className="text-slate-800">{formatAmount(fyValidationResult.totals.postedCreditTotal)}</strong>
                    </span>
                  </div>
                </div>

                {/* Retained Earnings notice in validation */}
                <div className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-700 flex items-center justify-between">
                  <span>حالة قيد الأرباح المبقاة: <strong>{fyValidationResult.retainedEarnings.postingCreated ? 'تم الإنشاء' : 'لم يتم الإنشاء (مستثنى)'}</strong></span>
                  <span className="text-[11px] text-slate-500">{fyValidationResult.retainedEarnings.reason}</span>
                </div>

                {fyValidationResult.warnings.length > 0 && (
                  <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 text-xs text-amber-900 space-y-1">
                    <p className="font-bold">تنبيهات:</p>
                    <ul className="list-disc list-inside">
                      {fyValidationResult.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Detailed Checks Table */}
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="p-2.5">رمز الفحص (Check Code)</th>
                        <th className="p-2.5">الحالة</th>
                        <th className="p-2.5">مانع للإقفال</th>
                        <th className="p-2.5">التفاصيل والرسالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {fyValidationResult.checks.map((check, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-medium text-slate-800">{check.code}</td>
                          <td className="p-2.5"><CheckStatusBadge status={check.status} /></td>
                          <td className="p-2.5 font-semibold">
                            {check.blocking ? (
                              <span className="text-rose-600">نعم</span>
                            ) : (
                              <span className="text-slate-400">لا</span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-600">{check.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Section F: Fiscal Year List */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">سجل السنوات المالية</h2>
                <p className="text-xs text-slate-500">استعراض السنوات المالية المقفلة والمفتوحة مع إمكانية إعادة الفتح</p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <select
                  value={fyStatusFilter}
                  onChange={(e) => setFyStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                  className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs text-slate-700 font-medium"
                >
                  {loadingFiscalYears ? 'تحديث...' : 'تحديث'}
                </button>
              </div>
            </div>

            {fiscalYearsError && (
              <p className="text-xs text-rose-600 mb-3">{fiscalYearsError}</p>
            )}

            {fiscalYears.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-sm text-slate-500">لا توجد سجلات سنوات مالية مسجلة حتى الآن.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold">
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
                  <tbody className="divide-y divide-slate-200">
                    {fiscalYears.map((fy) => (
                      <tr key={fy.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-slate-900">{fy.fiscalYear}</td>
                        <td className="p-3 font-mono text-slate-700">
                          {formatDate(fy.fiscalYearStart)} إلى {formatDate(fy.fiscalYearEnd)}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={fy.status} />
                        </td>
                        <td className="p-3 text-slate-600">
                          {fy.closedAt ? (
                            <div>
                              <div>{formatDateTime(fy.closedAt)}</div>
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
                              <div>{formatDateTime(fy.reopenedAt)}</div>
                              <div className="text-[10px] text-amber-700">السبب: {fy.reopenReason}</div>
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
                              className="rounded-md bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 disabled:bg-slate-100 disabled:text-slate-400 px-2.5 py-1 text-xs font-semibold"
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
          </section>
        </div>
      )}

      {/* =====================================================
          TAB 3: AUDIT TRAIL
         ===================================================== */}
      {activeTab === 'audit_log' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">سجل التدقيق والعمليات (Audit Trail)</h2>
              <p className="text-xs text-slate-500">
                تسجيل رقابي غير قابل للتعديل لجميع عمليات الإقفال وإعادة الفتح
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs text-slate-700 font-medium"
              >
                {loadingAuditLogs ? 'تحديث...' : 'تحديث'}
              </button>
            </div>
          </div>

          {auditLogsError && (
            <p className="text-xs text-rose-600 mb-3">{auditLogsError}</p>
          )}

          {auditLogs.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
              <p className="text-sm text-slate-500">لا توجد سجلات تدقيق مسجلة حتى الآن.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold">
                  <tr>
                    <th className="p-3">التاريخ والوقت</th>
                    <th className="p-3">الإجراء (Action)</th>
                    <th className="p-3">المستخدم (Actor)</th>
                    <th className="p-3">الهدف (Target)</th>
                    <th className="p-3">السبب / الملاحظات</th>
                    <th className="p-3">بيانات إضافية (Metadata)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-slate-800">{formatDateTime(log.createdAt)}</td>
                      <td className="p-3 font-semibold text-slate-900">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] border border-slate-200">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700">
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
        </section>
      )}

      {/* =====================================================
          MODAL: REOPEN PERIOD
         ===================================================== */}
      {reopeningPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              إعادة فتح الفترة المحاسبية
            </h3>
            <p className="text-xs text-slate-600">
              الفترة: <strong>{formatDate(reopeningPeriod.periodStart)}</strong> إلى <strong>{formatDate(reopeningPeriod.periodEnd)}</strong>
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              ⚠️ تنبيه: إعادة فتح الفترة سيعيد السماح بترحيل وتعديل القيود والفواتير داخل هذا النطاق الزمني.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                سبب إعادة الفتح (إلزامي) <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="اذكر المبرر الرقابي لإعادة فتح الفترة..."
                value={periodReopenReason}
                onChange={(e) => setPeriodReopenReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReopeningPeriod(null)}
                disabled={submittingPeriodReopen}
                className="rounded-lg bg-slate-100 hover:bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmPeriodReopen}
                disabled={submittingPeriodReopen || !periodReopenReason.trim() || periodReopenReason.trim().length < 3}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 px-4 py-2 text-sm font-semibold text-white"
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
            <h3 className="text-lg font-bold text-slate-900">
              إعادة فتح السنة المالية {reopeningFy.fiscalYear}
            </h3>
            <p className="text-xs text-slate-600">
              النطاق: <strong>{formatDate(reopeningFy.fiscalYearStart)}</strong> إلى <strong>{formatDate(reopeningFy.fiscalYearEnd)}</strong>
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              ⚠️ تنبيه: إعادة فتح السنة المالية سيعيد السماح بإجراء القيود المحاسبية التعديلية داخل هذه السنة.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                سبب إعادة الفتح (إلزامي) <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="اذكر المبرر الرقابي لإعادة فتح السنة المالية..."
                value={fyReopenReason}
                onChange={(e) => setFyReopenReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReopeningFy(null)}
                disabled={submittingFyReopen}
                className="rounded-lg bg-slate-100 hover:bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmFyReopen}
                disabled={submittingFyReopen || !fyReopenReason.trim() || fyReopenReason.trim().length < 3}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 px-4 py-2 text-sm font-semibold text-white"
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
