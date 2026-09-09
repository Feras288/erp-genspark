'use client';

// =====================================================
// Phase 13A-C: Bank Reconciliation Workspace
// Route: /accounting/reconciliation
//
// Features:
// 1. Permission Gating:
//    - Requires auth and `reconciliation.read`
//    - `reconciliation.import` gates statement CSV upload
//    - `reconciliation.write` gates manual matching
// 2. Bank Account Selector (with balances, IBAN, currency)
// 3. Summary KPI Banner (bankBalance, bookBalance, variance, unmatched counts/amounts, warnings)
// 4. CSV Statement Import Panel (multipart upload, duplicate detection, result stats)
// 5. Unmatched Report Section (Bank Transactions & ERP Payments tables + totals)
// 6. Suggestions Engine Section (scores, EXACT/SUGGESTED, manual Match action)
//
// Monetary values are treated strictly as strings to prevent floating-point inaccuracies.
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
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
      // Refresh summary, unmatched report, and suggestions as required
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
      // Refresh workspace after successful import
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

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
        <p className="text-slate-500 text-sm">جاري التحقق من الصلاحيات...</p>
      </main>
    );
  }

  if (!user || !canRead) return null;

  return (
    <main className="min-h-screen p-6 md:p-8 bg-slate-50 text-slate-800" dir="rtl">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">المطابقة البنكية</h1>
            <span className="rounded-full bg-teal-100 px-3 py-0.5 text-xs font-medium text-teal-800">
              Bank Reconciliation
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            مطابقة كشوف الحسابات البنكية المستوردة مع مدفوعات النظام (AR / AP) وحسابات الأستاذ العام.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={refreshWorkspace}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition shadow-sm"
          >
            تحديث البيانات
          </button>
          <Link
            href="/accounting"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition shadow-sm"
          >
            دليل الحسابات
          </Link>
          <Link
            href="/accounting/reports"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition shadow-sm"
          >
            القوائم المالية
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 transition shadow-sm"
          >
            لوحة التحكم
          </Link>
        </div>
      </header>

      {/* Global Alerts */}
      {actionSuccess && (
        <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="mb-6 rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800 flex items-center justify-between">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-600 hover:text-rose-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Section 1: Bank Account Selector */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600 font-bold">
              🏦
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">الحساب البنكي النشط</h2>
              <p className="text-xs text-slate-500">اختر الحساب البنكي لمطابقة عملياته وحركاته</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {loadingAccounts ? (
              <span className="text-xs text-slate-400">جاري تحميل الحسابات...</span>
            ) : bankAccounts.length === 0 ? (
              <span className="text-xs text-rose-600 font-medium">لا توجد حسابات بنكية مسجلة</span>
            ) : (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 font-medium focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.bankName} - {acc.accountName} ({acc.currency})
                  </option>
                ))}
              </select>
            )}

            {/* Optional Date Filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600">حتى تاريخ:</label>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Selected Account Info Bar */}
        {activeAccount && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl bg-slate-50 p-4 border border-slate-100 text-xs">
            <div>
              <span className="text-slate-500">رقم الحساب:</span>
              <p className="font-semibold text-slate-800 font-mono mt-0.5" dir="ltr">
                {activeAccount.accountNumber || '—'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">الآيبان (IBAN):</span>
              <p className="font-semibold text-slate-800 font-mono mt-0.5 truncate" dir="ltr">
                {activeAccount.iban || '—'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">الرصيد الافتتاحي:</span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {formatAmount(activeAccount.openingBalance)} {activeAccount.currency}
              </p>
            </div>
            <div>
              <span className="text-slate-500">حساب الأستاذ العام المرتبط:</span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {activeAccount.glAccount
                  ? `${activeAccount.glAccount.code} - ${activeAccount.glAccount.name}`
                  : 'غير مرتبط بحساب أستاذ'}
              </p>
            </div>
          </div>
        )}

        {accountsErr && <p className="mt-2 text-xs text-rose-600">{accountsErr}</p>}
      </section>

      {/* Section 2: KPI & Summary Banner */}
      <section className="mb-6">
        {summaryErr && (
          <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {summaryErr}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Bank Balance */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>رصيد كشف البنك</span>
              <span className="rounded bg-sky-50 px-2 py-0.5 text-sky-700 font-semibold">Bank</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono" dir="ltr">
              {loadingSummary ? '...' : formatAmount(summary?.bankBalance)}
            </div>
            <p className="mt-1 text-xs text-slate-400">بناءً على آخر كشف حساب مستورد</p>
          </div>

          {/* Card 2: Book Balance */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>رصيد الدفاتر (GL)</span>
              <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700 font-semibold">Book</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono" dir="ltr">
              {loadingSummary ? '...' : formatAmount(summary?.bookBalance)}
            </div>
            <p className="mt-1 text-xs text-slate-400">مجموع القيود المحاسبية المرحّلة</p>
          </div>

          {/* Card 3: Variance */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>فارق المطابقة (Variance)</span>
              <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700 font-semibold">Delta</span>
            </div>
            <div
              className={`text-2xl font-bold font-mono ${
                summary?.variance && summary.variance !== '0.0000' && summary.variance !== '0'
                  ? 'text-rose-600'
                  : 'text-emerald-600'
              }`}
              dir="ltr"
            >
              {loadingSummary ? '...' : formatAmount(summary?.variance)}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {summary?.variance && summary.variance !== '0.0000' && summary.variance !== '0'
                ? 'يوجد فارق يتطلب التسوية'
                : 'الرصيدان متطابقان تماماً'}
            </p>
          </div>

          {/* Card 4: Unmatched Counts */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>العمليات غير المطابقة</span>
              <span className="rounded bg-rose-50 px-2 py-0.5 text-rose-700 font-semibold">Pending</span>
            </div>
            <div className="flex items-center gap-4 mt-1">
              <div>
                <span className="text-xs text-slate-400 block">البنك:</span>
                <span className="text-xl font-bold text-slate-800">
                  {loadingSummary ? '...' : summary?.unmatchedCounts.bankTransactions ?? 0}
                </span>
              </div>
              <div className="border-r border-slate-200 pr-4">
                <span className="text-xs text-slate-400 block">الدفعات:</span>
                <span className="text-xl font-bold text-slate-800">
                  {loadingSummary ? '...' : summary?.unmatchedCounts.payments ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Warnings from Summary */}
        {summary?.warnings && summary.warnings.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
            <p className="font-semibold">تنبيهات المطابقة:</p>
            {summary.warnings.map((w, idx) => (
              <p key={idx}>• {w}</p>
            ))}
          </div>
        )}
      </section>

      {/* Section 3: CSV Import Panel */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">📥</span>
            <h2 className="text-lg font-bold text-slate-900">استيراد كشف حساب بنكي (CSV)</h2>
          </div>
          {!canImport && (
            <span className="rounded bg-slate-100 px-3 py-1 text-xs text-slate-600 font-medium">
              يتطلب صلاحية reconciliation.import للاستيراد
            </span>
          )}
        </div>

        {canImport ? (
          <form onSubmit={handleImportCsv} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
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
                  className="block w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  معرّف الكشف (اختياري)
                </label>
                <input
                  type="text"
                  value={statementIdentifier}
                  onChange={(e) => setStatementIdentifier(e.target.value)}
                  placeholder="مثال: STMT-2026-09"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  dir="ltr"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={importing || !csvFile || !selectedAccountId}
                  className="w-full rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
                >
                  {importing ? 'جاري رفع ومعالجة الملف...' : 'رفع واستيراد الكشف'}
                </button>
              </div>
            </div>

            {importErr && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                {importErr}
              </div>
            )}

            {/* Import Result Box */}
            {importSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                  <span>✓</span>
                  <span>تم استيراد كشف الحساب بنجاح</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-700 mt-2">
                  <div>
                    <span className="text-slate-500 block">السطور المستوردة:</span>
                    <span className="font-bold text-emerald-700">{importSuccess.importedRows}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">المتخطى (فارغ/عناوين):</span>
                    <span className="font-bold text-slate-600">{importSuccess.skippedRows}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">المكرر المتجاهل:</span>
                    <span className="font-bold text-amber-700">{importSuccess.duplicateRows}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">إجمالي الوارد:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {formatAmount(importSuccess.totalInflow)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">إجمالي الصادر:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {formatAmount(importSuccess.totalOutflow)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 block">بصمة الملف (File Hash):</span>
                    <span className="font-mono text-[10px] text-slate-600 truncate block" dir="ltr">
                      {importSuccess.fileHash}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </form>
        ) : (
          <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500 text-center">
            أنت في وضع القراءة فقط. لا تملك صلاحية رفع كشوف الحسابات (تتطلب reconciliation.import).
          </div>
        )}
      </section>

      {/* Section 4: Suggestions Engine */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <h2 className="text-lg font-bold text-slate-900">
              اقتراحات المطابقة الذكية (Suggestions Engine)
            </h2>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              درجة تطابق ≥ 80%
            </span>
          </div>
          <span className="text-xs text-slate-500">
            {suggestions.length} حركة بنكية لها تطابقات مقترحة
          </span>
        </div>

        {suggestionsErr && (
          <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {suggestionsErr}
          </div>
        )}

        {loadingSuggestions ? (
          <div className="py-8 text-center text-xs text-slate-400">جاري احتساب التطابقات المقترحة...</div>
        ) : suggestions.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            لا توجد اقتراحات مطابقة حالياً بحساب البنك المحدد.
          </div>
        ) : (
          <div className="space-y-4">
            {suggestions.map((item) => {
              const btx = item.bankTransaction;
              return (
                <div
                  key={btx.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 hover:border-teal-200 transition"
                >
                  {/* Bank Transaction header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5 mb-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">حركة البنك:</span>
                      <span className="font-mono text-slate-600">{formatDate(btx.transactionDate)}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          btx.type === 'INFLOW'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {btx.type === 'INFLOW' ? 'إيداع / وارد' : 'سحب / صادر'}
                      </span>
                      <span className="font-bold text-slate-900 font-mono" dir="ltr">
                        {formatAmount(btx.amount)} SAR
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                      {btx.reference && <span>المرجع: {btx.reference}</span>}
                      {btx.description && <span>الوصف: {btx.description}</span>}
                    </div>
                  </div>

                  {/* Candidate Payments */}
                  <div className="space-y-2">
                    {item.candidates.map((cand) => {
                      const isMatchingThis = matchingPairId === `${btx.id}_${cand.paymentId}`;
                      return (
                        <div
                          key={cand.paymentId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 border border-slate-200 text-xs shadow-xs"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                cand.matchType === 'EXACT'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {cand.matchType === 'EXACT' ? 'تطابق تام (EXACT)' : 'تطابق مقترح (SUGGESTED)'}
                            </span>
                            <span className="font-bold text-indigo-700">
                              درجة التطابق: {cand.score}%
                            </span>
                            <span className="text-slate-600">
                              نوع الدفعة: {cand.invoiceType === 'SALES' ? 'قبض عميل (AR)' : 'صرف مورد (AP)'}
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
                              className="rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition"
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
      </section>

      {/* Section 5: Unmatched Report (Two Tables + Totals) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h2 className="text-lg font-bold text-slate-900">تقرير العمليات غير المطابقة</h2>
          </div>

          {/* Date range filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="text-slate-500">من تاريخ:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700"
            />
            <label className="text-slate-500">إلى تاريخ:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700"
            />
          </div>
        </div>

        {unmatchedErr && (
          <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {unmatchedErr}
          </div>
        )}

        {/* Totals Banner */}
        {unmatchedData?.totals && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-slate-50 p-3.5 border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">إجمالي إيداعات بنكية معلقة:</span>
              <span className="font-mono font-bold text-emerald-700 text-sm" dir="ltr">
                {formatAmount(unmatchedData.totals.unmatchedBankInflow)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">إجمالي سحوبات بنكية معلقة:</span>
              <span className="font-mono font-bold text-rose-700 text-sm" dir="ltr">
                {formatAmount(unmatchedData.totals.unmatchedBankOutflow)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">مدفوعات عملاء معلقة (AR):</span>
              <span className="font-mono font-bold text-slate-800 text-sm" dir="ltr">
                {formatAmount(unmatchedData.totals.unmatchedArPayments)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">مدفوعات موردين معلقة (AP):</span>
              <span className="font-mono font-bold text-slate-800 text-sm" dir="ltr">
                {formatAmount(unmatchedData.totals.unmatchedApPayments)}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Table 1: Unmatched Bank Transactions */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-100/75 px-4 py-2.5 font-semibold text-xs text-slate-800 flex justify-between items-center">
              <span>حركات البنك غير المطابقة</span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700 font-mono">
                {unmatchedData?.bankTransactions?.length ?? 0}
              </span>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="p-2.5">التاريخ</th>
                    <th className="p-2.5">النوع</th>
                    <th className="p-2.5">المبلغ</th>
                    <th className="p-2.5">المرجع</th>
                    <th className="p-2.5">الوصف</th>
                    <th className="p-2.5">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingUnmatched ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : !unmatchedData?.bankTransactions || unmatchedData.bankTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">
                        لا توجد حركات بنكية معلقة
                      </td>
                    </tr>
                  ) : (
                    unmatchedData.bankTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-mono">{formatDate(tx.transactionDate)}</td>
                        <td className="p-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              tx.type === 'INFLOW'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono font-bold" dir="ltr">
                          {formatAmount(tx.amount)}
                        </td>
                        <td className="p-2.5 text-slate-600 truncate max-w-[120px]">
                          {tx.reference || '—'}
                        </td>
                        <td className="p-2.5 text-slate-500 truncate max-w-[140px]">
                          {tx.description || tx.payerPayee || '—'}
                        </td>
                        <td className="p-2.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 font-semibold">
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Unmatched ERP Payments */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-100/75 px-4 py-2.5 font-semibold text-xs text-slate-800 flex justify-between items-center">
              <span>مدفوعات النظام غير المطابقة</span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700 font-mono">
                {unmatchedData?.payments?.length ?? 0}
              </span>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="p-2.5">النوع</th>
                    <th className="p-2.5">المبلغ</th>
                    <th className="p-2.5">تاريخ الدفع</th>
                    <th className="p-2.5">المرجع</th>
                    <th className="p-2.5">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingUnmatched ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : !unmatchedData?.payments || unmatchedData.payments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">
                        لا توجد مدفوعات معلقة
                      </td>
                    </tr>
                  ) : (
                    unmatchedData.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              p.invoiceType === 'SALES'
                                ? 'bg-sky-50 text-sky-700'
                                : 'bg-purple-50 text-purple-700'
                            }`}
                          >
                            {p.invoiceType === 'SALES' ? 'عميل (AR)' : 'مورد (AP)'}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono font-bold" dir="ltr">
                          {formatAmount(p.amount)}
                        </td>
                        <td className="p-2.5 font-mono">{formatDate(p.paidAt)}</td>
                        <td className="p-2.5 text-slate-600 truncate max-w-[140px]">
                          {p.reference || '—'}
                        </td>
                        <td className="p-2.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 font-semibold">
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
