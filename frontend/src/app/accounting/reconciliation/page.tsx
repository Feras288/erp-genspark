'use client';

// =====================================================
// Phase 18A-B-5: Bank Reconciliation Workspace UX Polish
// Route: /accounting/reconciliation
//
// - Modern Arabic / RTL-friendly SaaS interface.
// - Standardized PageHeader ("تسوية ومطابقة كشف البنك").
// - Top KPI cards using loaded summary and suggestion data.
// - Modern SectionCard containers for Bank Account Selector, CSV Import,
//   Smart Suggestions Engine, and Unmatched Transactions Report.
// - Preserves 100% of reconciliation business logic, matching engine,
//   CSV parser behavior, duplicate detection, and GL safety.
// - Preserves 100% of permissions (`reconciliation.read`, `reconciliation.write`,
//   `reconciliation.import`).
// - Monetary values are treated strictly as strings (no floating-point drift).
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  api,
  ApiError,
  ReconciliationBankAccount,
  ReconciliationStatementImportResult,
  ReconciliationSuggestionPair,
  ReconciliationSummaryReportResponse,
  ReconciliationUnmatchedReportResponse,
} from '@/lib/api';
import {
  PageHeader,
  KpiCard,
  SectionCard,
  StatusBadge,
  FilterSection,
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

export default function ReconciliationPage() {
  const router = useRouter();
  const { user, loading: authLoading, hasPermission } = useAuth();

  // ---- Permissions ----------------------------------------------
  const canRead = !!user && hasPermission('reconciliation.read');
  const canWrite = !!user && hasPermission('reconciliation.write');
  const canImport = !!user && hasPermission('reconciliation.import');

  // ---- Bank Accounts State ---------------------------------------
  const [bankAccounts, setBankAccounts] = useState<ReconciliationBankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsErr, setAccountsErr] = useState<string | null>(null);

  // ---- Summary KPI State ----------------------------------------
  const [summary, setSummary] = useState<ReconciliationSummaryReportResponse['data'] | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  // ---- Unmatched Report State -----------------------------------
  const [unmatchedData, setUnmatchedData] = useState<ReconciliationUnmatchedReportResponse['data'] | null>(null);
  const [loadingUnmatched, setLoadingUnmatched] = useState(false);
  const [unmatchedErr, setUnmatchedErr] = useState<string | null>(null);

  // ---- Suggestions State ----------------------------------------
  const [suggestions, setSuggestions] = useState<ReconciliationSuggestionPair[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsErr, setSuggestionsErr] = useState<string | null>(null);
  const [matchingPairId, setMatchingPairId] = useState<string | null>(null);

  // ---- CSV Import State -----------------------------------------
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [statementIdentifier, setStatementIdentifier] = useState('');
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<ReconciliationStatementImportResult | null>(null);

  // ---- Global Notifications -------------------------------------
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ---- Filters --------------------------------------------------
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // ---- Auth Guard -----------------------------------------------
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
    if (!authLoading && user && !canRead) router.replace('/dashboard');
  }, [authLoading, user, canRead, router]);

  // ---- 1. Fetch Bank Accounts -----------------------------------
  const loadBankAccounts = useCallback(async () => {
    if (!user || !canRead) return;
    setLoadingAccounts(true);
    setAccountsErr(null);
    try {
      const res = await api.getReconciliationBankAccounts();
      const accounts = res.data || [];
      setBankAccounts(accounts);
      if (accounts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accounts[0].id);
      }
    } catch (err) {
      setAccountsErr(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل تحميل الحسابات البنكية',
      );
    } finally {
      setLoadingAccounts(false);
    }
  }, [user, canRead, selectedAccountId]);

  useEffect(() => {
    loadBankAccounts();
  }, [loadBankAccounts]);

  // ---- 2. Fetch Summary Report ----------------------------------
  const loadSummary = useCallback(async (accountId?: string) => {
    if (!user || !canRead) return;
    setLoadingSummary(true);
    setSummaryErr(null);
    try {
      const res = await api.getReconciliationSummaryReport({
        bankAccountId: accountId || undefined,
        asOfDate: asOfDate || undefined,
      });
      setSummary(res.data);
    } catch (err) {
      setSummaryErr(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل تحميل تقرير الملخص',
      );
    } finally {
      setLoadingSummary(false);
    }
  }, [user, canRead, asOfDate]);

  // ---- 3. Fetch Unmatched Report --------------------------------
  const loadUnmatched = useCallback(async (accountId?: string) => {
    if (!user || !canRead) return;
    setLoadingUnmatched(true);
    setUnmatchedErr(null);
    try {
      const res = await api.getReconciliationUnmatchedReport({
        bankAccountId: accountId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 100,
      });
      setUnmatchedData(res.data);
    } catch (err) {
      setUnmatchedErr(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل تحميل العمليات غير المطابقة',
      );
    } finally {
      setLoadingUnmatched(false);
    }
  }, [user, canRead, fromDate, toDate]);

  // ---- 4. Fetch Suggestions -------------------------------------
  const loadSuggestions = useCallback(async (accountId?: string) => {
    if (!user || !canRead) return;
    setLoadingSuggestions(true);
    setSuggestionsErr(null);
    try {
      const res = await api.getReconciliationSuggestions({
        bankAccountId: accountId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        minScore: 80,
      });
      setSuggestions(res.data || []);
    } catch (err) {
      setSuggestionsErr(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل تحميل اقتراحات المطابقة',
      );
    } finally {
      setLoadingSuggestions(false);
    }
  }, [user, canRead, fromDate, toDate]);

  // Trigger data fetches whenever selected account or filters change
  const refreshWorkspace = useCallback(() => {
    loadSummary(selectedAccountId);
    loadUnmatched(selectedAccountId);
    loadSuggestions(selectedAccountId);
  }, [selectedAccountId, loadSummary, loadUnmatched, loadSuggestions]);

  useEffect(() => {
    if (selectedAccountId) {
      refreshWorkspace();
    }
  }, [selectedAccountId, refreshWorkspace]);

  // ---- Match Action ---------------------------------------------
  const handleMatch = async (bankTransactionId: string, paymentId: string) => {
    if (!canWrite) return;
    const pairKey = `${bankTransactionId}_${paymentId}`;
    setMatchingPairId(pairKey);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await api.createReconciliationMatch({
        bankTransactionId,
        paymentId,
        matchType: 'MANUAL',
      });
      setActionSuccess(`تمت المطابقة بنجاح (رقم المطابقة: ${res.data.matchId.slice(0, 8)}...)`);
      refreshWorkspace();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشلت عملية المطابقة',
      );
    } finally {
      setMatchingPairId(null);
    }
  };

  // ---- CSV Import Handler ---------------------------------------
  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canImport) return;
    if (!csvFile) {
      setImportErr('يرجى اختيار ملف CSV أولاً');
      return;
    }
    if (!selectedAccountId) {
      setImportErr('يرجى اختيار حساب بنكي للاستيراد');
      return;
    }

    setImporting(true);
    setImportErr(null);
    setImportSuccess(null);
    setActionError(null);
    setActionSuccess(null);

    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('bankAccountId', selectedAccountId);
    if (statementIdentifier.trim()) {
      formData.append('statementIdentifier', statementIdentifier.trim());
    }

    try {
      const res = await api.importBankStatementCsv(formData);
      setImportSuccess(res.data);
      setActionSuccess('تم استيراد كشف الحساب البنكي بنجاح');
      setCsvFile(null);
      setStatementIdentifier('');
      refreshWorkspace();
    } catch (err) {
      const errMsg =
        err instanceof ApiError
          ? err.status === 409
            ? `الملف مكرر: ${err.message}`
            : err.message
          : err instanceof Error
            ? err.message
            : 'فشل استيراد الملف';
      setImportErr(errMsg);
    } finally {
      setImporting(false);
    }
  };

  // ---- Selected Account Details ---------------------------------
  const activeAccount = bankAccounts.find((a) => a.id === selectedAccountId);

  // Derived KPI metrics
  const totalUnmatchedCount =
    (summary?.unmatchedCounts.bankTransactions ?? 0) + (summary?.unmatchedCounts.payments ?? 0);
  const isVarianceZero =
    summary?.variance === '0.0000' || summary?.variance === '0' || summary?.variance === '0.00';

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
          title="غير مصرح — Access Denied"
          description="تتطلب هذه الصفحة توفر صلاحية reconciliation.read. يرجى مراجعة مسؤول النظام."
          returnHref="/dashboard"
          returnLabel="العودة إلى لوحة التحكم"
          requiredPermission="reconciliation.read"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 md:p-8 bg-slate-50 text-slate-800" dir="rtl">
      {/* Standardized Header */}
      <PageHeader
        eyebrow="المطابقة البنكية"
        title="تسوية ومطابقة كشف البنك"
        subtitle="رفع كشوف CSV التجريبية، مراجعة الاقتراحات، ومطابقة الحركات دون إنشاء قيود محاسبية مباشرة."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={refreshWorkspace}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition shadow-xs"
            >
              <span>🔄</span>
              <span>تحديث البيانات</span>
            </button>
            <Link
              href="/accounting"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition shadow-xs"
            >
              <span>📖</span>
              <span>دليل الحسابات</span>
            </Link>
            <Link
              href="/accounting/reports"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition shadow-xs"
            >
              <span>📊</span>
              <span>القوائم المالية</span>
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

      {/* Global Alerts */}
      {actionSuccess && (
        <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold text-base px-1"
          >
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="mb-6">
          <ErrorBanner
            title="تنبيه بالعملية"
            message={actionError}
            onRetry={() => setActionError(null)}
          />
        </div>
      )}

      {/* KPI Cards Row */}
      <section className="mb-6">
        {summaryErr && (
          <div className="mb-4">
            <ErrorBanner title="خطأ في الملخص" message={summaryErr} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            label="رصيد كشف البنك"
            value={loadingSummary ? '...' : `${formatAmount(summary?.bankBalance)} SAR`}
            helperText="بناءً على آخر كشف حساب مستورد"
            icon={<span className="text-sky-600">🏦</span>}
          />
          <KpiCard
            label="رصيد الدفاتر (GL)"
            value={loadingSummary ? '...' : `${formatAmount(summary?.bookBalance)} SAR`}
            helperText="مجموع القيود المحاسبية المرحّلة"
            icon={<span className="text-indigo-600">📖</span>}
          />
          <KpiCard
            label="فارق المطابقة"
            value={loadingSummary ? '...' : `${formatAmount(summary?.variance)} SAR`}
            helperText={isVarianceZero ? 'الرصيدان متطابقان تماماً' : 'يوجد فارق يتطلب التسوية'}
            tone={isVarianceZero ? 'success' : 'danger'}
            icon={<span className={isVarianceZero ? 'text-emerald-600' : 'text-rose-600'}>⚖️</span>}
          />
          <KpiCard
            label="حركات غير مطابقة"
            value={loadingSummary ? '...' : totalUnmatchedCount}
            helperText={`بنك: ${summary?.unmatchedCounts.bankTransactions ?? 0} | دفعات: ${summary?.unmatchedCounts.payments ?? 0}`}
            tone={totalUnmatchedCount > 0 ? 'warning' : 'neutral'}
            icon={<span className="text-amber-600">⏳</span>}
          />
          <KpiCard
            label="اقتراحات متاحة"
            value={loadingSuggestions ? '...' : suggestions.length}
            helperText="حركات لها تطابق مقترح ≥ 80%"
            tone={suggestions.length > 0 ? 'info' : 'neutral'}
            icon={<span className="text-teal-600">✨</span>}
          />
          <KpiCard
            label="مكرر / متجاهل"
            value={importSuccess?.duplicateRows ?? 0}
            helperText="تم استبعاده كحركات مكررة"
            tone="neutral"
            icon={<span className="text-slate-600">🚫</span>}
          />
        </div>

        {/* Warnings from Summary */}
        {summary?.warnings && summary.warnings.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900 space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2 font-semibold">
              <span>⚠️</span>
              <span>تنبيهات المطابقة البنكية:</span>
            </div>
            {summary.warnings.map((w, idx) => (
              <p key={idx} className="pr-5">• {w}</p>
            ))}
          </div>
        )}
      </section>

      {/* Section 1: Bank Account Selector */}
      <div className="mb-6">
        <SectionCard
          title="الحساب البنكي النشط"
          description="اختر الحساب البنكي لتحميل كشوفه وعمليات المطابقة والتسوية"
          actions={
            <div className="flex flex-wrap items-center gap-3">
              {loadingAccounts ? (
                <span className="text-xs text-slate-400">جاري تحميل الحسابات...</span>
              ) : bankAccounts.length === 0 ? (
                <span className="text-xs text-rose-600 font-medium">لا توجد حسابات بنكية مسجلة</span>
              ) : (
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-800 font-medium focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-xs"
                >
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.bankName} - {acc.accountName} ({acc.currency})
                    </option>
                  ))}
                </select>
              )}

              {/* Optional Date Filter */}
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <label className="text-xs text-slate-600 font-medium">حتى تاريخ:</label>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                />
              </div>
            </div>
          }
        >
          {/* Selected Account Info Bar */}
          {activeAccount ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl bg-slate-50 p-4 border border-slate-200/80 text-xs">
              <div>
                <span className="text-slate-500 font-medium">رقم الحساب:</span>
                <p className="font-bold text-slate-800 font-mono mt-1" dir="ltr">
                  {activeAccount.accountNumber || '—'}
                </p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">الآيبان (IBAN):</span>
                <p className="font-bold text-slate-800 font-mono mt-1 truncate" dir="ltr">
                  {activeAccount.iban || '—'}
                </p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">الرصيد الافتتاحي:</span>
                <p className="font-bold text-slate-800 mt-1 font-mono">
                  {formatAmount(activeAccount.openingBalance)} {activeAccount.currency}
                </p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">حساب الأستاذ العام المرتبط:</span>
                <p className="font-bold text-slate-800 mt-1">
                  {activeAccount.glAccount
                    ? `${activeAccount.glAccount.code} - ${activeAccount.glAccount.name}`
                    : 'غير مرتبط بحساب أستاذ'}
                </p>
              </div>
            </div>
          ) : (
            <div className="py-3 text-xs text-slate-400 text-center">يرجى اختيار حساب بنكي لعرض تفاصيله</div>
          )}

          {accountsErr && (
            <div className="mt-3">
              <ErrorBanner title="خطأ في تحميل الحسابات" message={accountsErr} />
            </div>
          )}
        </SectionCard>
      </div>

      {/* Section 2: CSV Import Panel */}
      <div className="mb-6">
        <SectionCard
          title="استيراد كشف حساب بنكي (CSV)"
          description="رفع كشف حساب بنكي بصيغة CSV لمقارنته بالدفاتر وكشف الحركات المكررة تلقائياً"
          actions={
            !canImport ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 font-medium">
                يتطلب صلاحية reconciliation.import
              </span>
            ) : undefined
          }
        >
          {canImport ? (
            <form onSubmit={handleImportCsv} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    ملف كشف الحساب (.csv) *
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setCsvFile(f);
                      setImportErr(null);
                    }}
                    className="block w-full text-xs text-slate-500 file:mr-2 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer border border-slate-200 rounded-xl p-1 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    معرّف الكشف (اختياري)
                  </label>
                  <input
                    type="text"
                    value={statementIdentifier}
                    onChange={(e) => setStatementIdentifier(e.target.value)}
                    placeholder="مثال: STMT-2026-09"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                    dir="ltr"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={importing || !csvFile || !selectedAccountId}
                    className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition"
                  >
                    {importing ? 'جاري معالجة الكشف...' : 'رفع واستيراد الكشف'}
                  </button>
                </div>
              </div>

              {importErr && (
                <div className="mt-3">
                  <ErrorBanner title="فشل استيراد الكشف" message={importErr} />
                </div>
              )}

              {/* Import Result Box */}
              {importSuccess && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs space-y-3 shadow-xs">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold">
                    <span>✓</span>
                    <span>تم استيراد كشف الحساب البنكي بنجاح</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-700 pt-1">
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                      <span className="text-slate-500 block text-[11px]">السطور المستوردة:</span>
                      <span className="font-bold text-emerald-700 text-sm">{importSuccess.importedRows}</span>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                      <span className="text-slate-500 block text-[11px]">المتخطى (فارغ/عناوين):</span>
                      <span className="font-bold text-slate-600 text-sm">{importSuccess.skippedRows}</span>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                      <span className="text-slate-500 block text-[11px]">المكرر المتجاهل:</span>
                      <span className="font-bold text-amber-700 text-sm">{importSuccess.duplicateRows}</span>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                      <span className="text-slate-500 block text-[11px]">إجمالي الوارد:</span>
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {formatAmount(importSuccess.totalInflow)}
                      </span>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                      <span className="text-slate-500 block text-[11px]">إجمالي الصادر:</span>
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {formatAmount(importSuccess.totalOutflow)}
                      </span>
                    </div>
                    <div className="col-span-2 sm:col-span-3 bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                      <span className="text-slate-500 block text-[11px]">بصمة الملف (File Hash):</span>
                      <span className="font-mono text-[11px] text-slate-600 truncate block" dir="ltr">
                        {importSuccess.fileHash}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </form>
          ) : (
            <div className="rounded-xl bg-slate-50 p-6 text-xs text-slate-500 text-center border border-dashed border-slate-200">
              أنت في وضع القراءة فقط. لا تملك صلاحية استيراد كشوف الحسابات البنكية (تتطلب reconciliation.import).
            </div>
          )}
        </SectionCard>
      </div>

      {/* Section 3: Suggestions Engine */}
      <div className="mb-6">
        <SectionCard
          title="اقتراحات المطابقة الذكية (Suggestions Engine)"
          description="حركات بنكية تم العثور على تطابقات مرجعية ومبلغية لها في النظام بنسبة تطابق ≥ 80%"
          actions={
            <span className="rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
              {suggestions.length} حركة لها تطابقات مقترحة
            </span>
          }
        >
          {suggestionsErr && (
            <div className="mb-4">
              <ErrorBanner title="خطأ في اقتراحات المطابقة" message={suggestionsErr} />
            </div>
          )}

          {loadingSuggestions ? (
            <div className="py-8">
              <LoadingState message="جاري احتساب التطابقات المقترحة..." />
            </div>
          ) : suggestions.length === 0 ? (
            <EmptyState
              title="لا توجد اقتراحات مطابقة حالياً"
              description="لم يتم العثور على حركات بنكية تطابق مدفوعات النظام غير المقفلة للحساب المحدد."
              action={
                selectedAccountId ? (
                  <button
                    onClick={refreshWorkspace}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                  >
                    إعادة الفحص
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              {suggestions.map((item) => {
                const btx = item.bankTransaction;
                return (
                  <div
                    key={btx.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 hover:border-teal-200 transition shadow-xs"
                  >
                    {/* Bank Transaction header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3 mb-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-semibold text-slate-800">حركة البنك:</span>
                        <span className="font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {formatDate(btx.transactionDate)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            btx.type === 'INFLOW'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {btx.type === 'INFLOW' ? 'إيداع / وارد' : 'سحب / صادر'}
                        </span>
                        <span className="font-bold text-slate-900 font-mono text-sm" dir="ltr">
                          {formatAmount(btx.amount)} SAR
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-slate-500 text-[11px]">
                        {btx.reference && <span>المرجع: <strong className="text-slate-700">{btx.reference}</strong></span>}
                        {btx.description && <span>الوصف: <strong className="text-slate-700">{btx.description}</strong></span>}
                      </div>
                    </div>

                    {/* Candidate Payments */}
                    <div className="space-y-2.5">
                      {item.candidates.map((cand) => {
                        const isMatchingThis = matchingPairId === `${btx.id}_${cand.paymentId}`;
                        return (
                          <div
                            key={cand.paymentId}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3 border border-slate-200 text-xs shadow-xs hover:border-indigo-200 transition"
                          >
                            <div className="flex flex-wrap items-center gap-3">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                  cand.matchType === 'EXACT'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {cand.matchType === 'EXACT' ? 'تطابق تام (EXACT)' : 'تطابق مقترح (SUGGESTED)'}
                              </span>
                              <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                                درجة التطابق: {cand.score}%
                              </span>
                              <span className="text-slate-600">
                                نوع الدفعة: <strong>{cand.invoiceType === 'SALES' ? 'قبض عميل (AR)' : 'صرف مورد (AP)'}</strong>
                              </span>
                              <span className="font-mono text-slate-700">
                                التاريخ: {formatDate(cand.paidAt)}
                              </span>
                              <span className="font-mono font-bold text-slate-900" dir="ltr">
                                المبلغ: {formatAmount(cand.amount)} SAR
                              </span>
                              {cand.reference && (
                                <span className="text-slate-500">المرجع: {cand.reference}</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {cand.reasons && cand.reasons.length > 0 && (
                                <span className="text-[11px] text-slate-400">
                                  ({cand.reasons.join('، ')})
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleMatch(btx.id, cand.paymentId)}
                                disabled={!canWrite || isMatchingThis}
                                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition"
                              >
                                {isMatchingThis ? 'جاري المطابقة...' : 'مطابقة (Match)'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Section 4: Unmatched Report (Two Tables + Totals) */}
      <div className="mb-6">
        <SectionCard
          title="تقرير العمليات غير المطابقة"
          description="الحركات البنكية المستوردة ومدفوعات النظام المسجلة التي لم تتم تسويتها ومطابقتها بعد"
          actions={
            <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <label className="text-slate-600 font-medium">من تاريخ:</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 bg-white"
              />
              <label className="text-slate-600 font-medium">إلى تاريخ:</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 bg-white"
              />
            </div>
          }
        >
          {unmatchedErr && (
            <div className="mb-4">
              <ErrorBanner title="خطأ في تقرير العمليات المعلقة" message={unmatchedErr} />
            </div>
          )}

          {/* Totals Banner */}
          {unmatchedData?.totals && (
            <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-slate-50 p-4 border border-slate-200 text-xs shadow-xs">
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 block text-[11px]">إجمالي إيداعات معلقة:</span>
                <span className="font-mono font-bold text-emerald-700 text-sm" dir="ltr">
                  {formatAmount(unmatchedData.totals.unmatchedBankInflow)} SAR
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 block text-[11px]">إجمالي سحوبات معلقة:</span>
                <span className="font-mono font-bold text-rose-700 text-sm" dir="ltr">
                  {formatAmount(unmatchedData.totals.unmatchedBankOutflow)} SAR
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 block text-[11px]">مدفوعات عملاء معلقة (AR):</span>
                <span className="font-mono font-bold text-slate-800 text-sm" dir="ltr">
                  {formatAmount(unmatchedData.totals.unmatchedArPayments)} SAR
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 block text-[11px]">مدفوعات موردين معلقة (AP):</span>
                <span className="font-mono font-bold text-slate-800 text-sm" dir="ltr">
                  {formatAmount(unmatchedData.totals.unmatchedApPayments)} SAR
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Table 1: Unmatched Bank Transactions */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
              <div className="bg-slate-100/80 px-4 py-3 font-semibold text-xs text-slate-800 flex justify-between items-center border-b border-slate-200">
                <span className="flex items-center gap-1.5">
                  <span>🏦</span>
                  <span>حركات البنك غير المطابقة</span>
                </span>
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] text-slate-700 font-mono font-bold">
                  {unmatchedData?.bankTransactions?.length ?? 0}
                </span>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">النوع</th>
                      <th className="p-3">المبلغ</th>
                      <th className="p-3">المرجع</th>
                      <th className="p-3">الوصف</th>
                      <th className="p-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingUnmatched ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400">
                          جاري التحميل...
                        </td>
                      </tr>
                    ) : !unmatchedData?.bankTransactions || unmatchedData.bankTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400">
                          لا توجد حركات بنكية معلقة
                        </td>
                      </tr>
                    ) : (
                      unmatchedData.bankTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 font-mono text-slate-700">{formatDate(tx.transactionDate)}</td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                tx.type === 'INFLOW'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                  : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}
                            >
                              {tx.type === 'INFLOW' ? 'وارد' : 'صادر'}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900" dir="ltr">
                            {formatAmount(tx.amount)}
                          </td>
                          <td className="p-3 text-slate-600 truncate max-w-[120px]">
                            {tx.reference || '—'}
                          </td>
                          <td className="p-3 text-slate-500 truncate max-w-[140px]">
                            {tx.description || tx.payerPayee || '—'}
                          </td>
                          <td className="p-3">
                            <StatusBadge status={tx.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Unmatched ERP Payments */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
              <div className="bg-slate-100/80 px-4 py-3 font-semibold text-xs text-slate-800 flex justify-between items-center border-b border-slate-200">
                <span className="flex items-center gap-1.5">
                  <span>💳</span>
                  <span>مدفوعات النظام غير المطابقة</span>
                </span>
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] text-slate-700 font-mono font-bold">
                  {unmatchedData?.payments?.length ?? 0}
                </span>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="p-3">النوع</th>
                      <th className="p-3">المبلغ</th>
                      <th className="p-3">تاريخ الدفع</th>
                      <th className="p-3">المرجع</th>
                      <th className="p-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingUnmatched ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400">
                          جاري التحميل...
                        </td>
                      </tr>
                    ) : !unmatchedData?.payments || unmatchedData.payments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400">
                          لا توجد مدفوعات معلقة
                        </td>
                      </tr>
                    ) : (
                      unmatchedData.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                p.invoiceType === 'SALES'
                                  ? 'bg-sky-50 text-sky-700 border border-sky-100'
                                  : 'bg-purple-50 text-purple-700 border border-purple-100'
                              }`}
                            >
                              {p.invoiceType === 'SALES' ? 'قبض عميل' : 'صرف مورد'}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900" dir="ltr">
                            {formatAmount(p.amount)}
                          </td>
                          <td className="p-3 font-mono text-slate-700">{formatDate(p.paidAt)}</td>
                          <td className="p-3 text-slate-600 truncate max-w-[140px]">
                            {p.reference || '—'}
                          </td>
                          <td className="p-3">
                            <StatusBadge status={p.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
