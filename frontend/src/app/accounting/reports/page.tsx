'use client';

// =====================================================
// Phase 12A-C: Financial Statements Read-Only View.
//
// Read-only presentation of the three core GL statements:
//   1. Trial Balance (ميزان المراجعة)
//   2. Income Statement (قائمة الدخل / الأرباح والخسائر)
//   3. Balance Sheet (الميزانية العمومية)
//
// Strictly read-only:
//   - Gated server-side and client-side by `gl_journal.read`.
//   - No journal creation, modification, posting, or reversal.
//   - Monetary amounts are displayed directly from decimal strings.
//   - Arabic/RTL first, fully responsive layout with tabs and filters.
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type {
  BalanceSheetReport,
  IncomeStatementReport,
  TrialBalanceReport,
} from '@/lib/api';

// ---------- Helpers ----------------------------------------------

function formatAmount(val: string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  const parts = val.split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `${integerPart}.${parts[1]}` : integerPart;
}

function arAccountType(t: string): string {
  switch (t) {
    case 'ASSET':
      return 'أصل';
    case 'LIABILITY':
      return 'التزام';
    case 'EQUITY':
      return 'حقوق ملكية';
    case 'REVENUE':
      return 'إيراد';
    case 'EXPENSE':
      return 'مصروف';
    default:
      return t;
  }
}

function arNormalBalance(b: string): string {
  return b === 'DEBIT' ? 'مدين' : 'دائن';
}

type StatementTab = 'all' | 'trial-balance' | 'income-statement' | 'balance-sheet';

// ---------- Main Page Component ----------------------------------

export default function FinancialStatementsPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  const canRead = !!user && hasPermission('gl_journal.read');

  // ---- Navigation Tabs ------------------------------------------
  const [activeTab, setActiveTab] = useState<StatementTab>('all');

  // ---- Filter States --------------------------------------------
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [asOfDate, setAsOfDate] = useState('');
  const [includeZero, setIncludeZero] = useState(false);

  // ---- Data States ----------------------------------------------
  const [tb, setTb] = useState<TrialBalanceReport | null>(null);
  const [is, setIs] = useState<IncomeStatementReport | null>(null);
  const [bs, setBs] = useState<BalanceSheetReport | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [tbErr, setTbErr] = useState<string | null>(null);
  const [isErr, setIsErr] = useState<string | null>(null);
  const [bsErr, setBsErr] = useState<string | null>(null);

  // ---- Auth Guard -----------------------------------------------
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !canRead) router.replace('/dashboard');
  }, [loading, user, canRead, router]);

  // ---- Fetch Handler --------------------------------------------
  const loadStatements = async () => {
    if (!user || !canRead) return;
    setLoadingData(true);
    setTbErr(null);
    setIsErr(null);
    setBsErr(null);

    const effectiveAsOf = asOfDate.trim() || toDate.trim() || undefined;

    await Promise.allSettled([
      api
        .getTrialBalance({
          fromDate: fromDate.trim() || undefined,
          toDate: toDate.trim() || undefined,
          includeZero,
        })
        .then((res) => setTb(res))
        .catch((err) =>
          setTbErr(
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'فشل تحميل ميزان المراجعة',
          ),
        ),

      api
        .getIncomeStatement({
          fromDate: fromDate.trim() || undefined,
          toDate: toDate.trim() || undefined,
        })
        .then((res) => setIs(res))
        .catch((err) =>
          setIsErr(
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'فشل تحميل قائمة الدخل',
          ),
        ),

      api
        .getBalanceSheet({
          asOfDate: effectiveAsOf,
        })
        .then((res) => setBs(res))
        .catch((err) =>
          setBsErr(
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'فشل تحميل الميزانية العمومية',
          ),
        ),
    ]);

    setLoadingData(false);
  };

  useEffect(() => {
    if (user && canRead) {
      loadStatements();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, canRead]);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    loadStatements();
  };

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setAsOfDate('');
    setIncludeZero(false);
  };

  // ---- Early Return States --------------------------------------
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 font-medium">جاري التحقق من الصلاحيات...</p>
        </div>
      </main>
    );
  }

  if (!user || !canRead) {
    return (
      <main className="min-h-screen p-8 bg-slate-50 flex items-center justify-center">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 max-w-md text-center shadow-md">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center mb-4 text-2xl font-bold">
            !
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">صلاحية غير كافية</h1>
          <p className="text-slate-600 text-sm mb-6 leading-relaxed">
            لا تملك صلاحية قراءة القيود ودفتر الأستاذ العام (<code className="bg-slate-100 px-1.5 py-0.5 rounded text-rose-600 text-xs">gl_journal.read</code>). يرجى مراجعة مسؤول النظام.
          </p>
          <Link
            href="/dashboard"
            className="inline-block rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-5 py-2.5 transition-colors shadow-sm"
          >
            العودة إلى لوحة المعلومات
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* ====== Header ====== */}
      <header className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-lg">
              §
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
              القوائم المالية الختامية
            </h1>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              قراءة فقط
            </span>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed max-w-3xl">
            عرض ميزان المراجعة، قائمة الدخل (الأرباح والخسائر)، والميزانية العمومية من واقع القيود المحاسبية المرحّلة (POSTED) فقط في دفتر الأستاذ العام.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          <Link
            href="/accounting"
            className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 transition-colors"
          >
            دليل الحسابات والقيود
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-4 py-2 transition-colors shadow-sm"
          >
            لوحة المعلومات
          </Link>
        </div>
      </header>

      {/* ====== Navigation Tabs ====== */}
      <nav className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'all'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          نظرة شاملة (جميع القوائم)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('trial-balance')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'trial-balance'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          ميزان المراجعة (Trial Balance)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('income-statement')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'income-statement'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          قائمة الدخل (Income Statement)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('balance-sheet')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'balance-sheet'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          الميزانية العمومية (Balance Sheet)
        </button>
      </nav>

      {/* ====== Filter Bar ====== */}
      <form
        onSubmit={handleApplyFilters}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <span>فلاتر الفترة المحاسبية</span>
          </h2>
          <span className="text-xs text-slate-400">
            تاريخ الإدخال (entryDate) هو المعيار الزمني للقوائم المالية
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              من تاريخ (بداية الفترة)
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              إلى تاريخ (نهاية الفترة)
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              حتى تاريخ (الميزانية العمومية)
            </label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              placeholder="افتراضياً نفس تاريخ النهاية"
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center pt-6">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700">
              <input
                type="checkbox"
                checked={includeZero}
                onChange={(e) => setIncludeZero(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
              />
              <span className="text-xs font-medium">إظهار الحسابات الصفرية في ميزان المراجعة</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            إعادة تعيين
          </button>
          <button
            type="submit"
            disabled={loadingData}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-medium px-5 py-2 transition-colors flex items-center gap-2 shadow-xs"
          >
            {loadingData && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            )}
            <span>تحديث البيانات</span>
          </button>
        </div>
      </form>

      {/* ====== Consolidation KPI Cards (Overview) ====== */}
      {(activeTab === 'all' || activeTab === 'balance-sheet') && bs?.data && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
              <span className="font-medium">إجمالي الأصول</span>
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight" dir="ltr">
              {formatAmount(bs.data.totals.assets)}
            </div>
            <p className="text-xs text-slate-400 mt-1">SAR • مدين</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
              <span className="font-medium">إجمالي الالتزامات</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight" dir="ltr">
              {formatAmount(bs.data.totals.liabilities)}
            </div>
            <p className="text-xs text-slate-400 mt-1">SAR • دائن</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
              <span className="font-medium">صافي دخل الفترة الحالية</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            </div>
            <div className="text-2xl font-bold text-emerald-700 tracking-tight" dir="ltr">
              {formatAmount(bs.data.syntheticEquity.currentPeriodNetIncome)}
            </div>
            <p className="text-xs text-slate-400 mt-1">يطابق صافي دخل قائمة الدخل</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
              <span className="font-medium">الالتزامات وحقوق الملكية</span>
              {bs.data.totals.balanced ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  متوازنة
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                  غير متوازنة
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight" dir="ltr">
              {formatAmount(bs.data.totals.liabilitiesAndEquity)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {bs.data.totals.balanced ? 'المعادلة المحاسبية محققة ✓' : 'تحقق من الفروقات ⚠'}
            </p>
          </div>
        </section>
      )}

      {/* ====== 1. TRIAL BALANCE SECTION ====== */}
      {(activeTab === 'all' || activeTab === 'trial-balance') && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">ميزان المراجعة (Trial Balance)</h2>
                {tb?.data?.totals && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      tb.data.totals.balanced
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {tb.data.totals.balanced ? '✓ متوازن' : '⚠ غير متوازن'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                حركة وأرصدة الحسابات: الافتتاحي، حركة الفترة، والرصيد الختامي
              </p>
            </div>

            {tb?.filters && (
              <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                الفترة: {tb.filters.fromDate ?? 'بداية النشاط'} إلى {tb.filters.toDate ?? 'اليوم'}
              </div>
            )}
          </div>

          {tbErr && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 p-3 text-sm">
              {tbErr}
            </div>
          )}

          {loadingData && !tb ? (
            <div className="py-12 text-center text-slate-400 text-sm">جاري تحميل ميزان المراجعة...</div>
          ) : !tb?.data?.accounts?.length ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              لا توجد حسابات بحركات مرحّلة في هذه الفترة.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-slate-700 border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-600 border-b border-slate-200 font-semibold">
                    <th className="py-2.5 px-3 text-start">الرمز</th>
                    <th className="py-2.5 px-3 text-start">اسم الحساب</th>
                    <th className="py-2.5 px-2 text-start">النوع</th>
                    <th className="py-2.5 px-2 text-start">طبيعة</th>
                    <th className="py-2.5 px-3 text-end">افتتاحي مدين</th>
                    <th className="py-2.5 px-3 text-end">افتتاحي دائن</th>
                    <th className="py-2.5 px-3 text-end">فترة مدين</th>
                    <th className="py-2.5 px-3 text-end">فترة دائن</th>
                    <th className="py-2.5 px-3 text-end">ختامي مدين</th>
                    <th className="py-2.5 px-3 text-end">ختامي دائن</th>
                    <th className="py-2.5 px-3 text-end bg-indigo-50/40 font-bold">الرصيد الختامي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {tb.data.accounts.map((row) => (
                    <tr key={row.accountId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2 px-3 font-semibold text-slate-900 font-sans">{row.code}</td>
                      <td className="py-2 px-3 font-sans text-slate-800">
                        <div>{row.name}</div>
                        {row.nameAr && <div className="text-[11px] text-slate-400">{row.nameAr}</div>}
                      </td>
                      <td className="py-2 px-2 font-sans">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                          {arAccountType(row.type)}
                        </span>
                      </td>
                      <td className="py-2 px-2 font-sans text-slate-500">{arNormalBalance(row.normalBalance)}</td>
                      <td className="py-2 px-3 text-end">{formatAmount(row.openingDebit)}</td>
                      <td className="py-2 px-3 text-end">{formatAmount(row.openingCredit)}</td>
                      <td className="py-2 px-3 text-end text-blue-700 font-medium">{formatAmount(row.periodDebit)}</td>
                      <td className="py-2 px-3 text-end text-blue-700 font-medium">{formatAmount(row.periodCredit)}</td>
                      <td className="py-2 px-3 text-end font-semibold text-slate-900">{formatAmount(row.closingDebit)}</td>
                      <td className="py-2 px-3 text-end font-semibold text-slate-900">{formatAmount(row.closingCredit)}</td>
                      <td className="py-2 px-3 text-end bg-indigo-50/30 font-bold text-indigo-900">
                        {formatAmount(row.closingBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={4} className="py-3 px-3 font-sans text-start">
                      الإجماليات الكلية
                    </td>
                    <td className="py-3 px-3 text-end font-mono">{formatAmount(tb.data.totals.openingDebit)}</td>
                    <td className="py-3 px-3 text-end font-mono">{formatAmount(tb.data.totals.openingCredit)}</td>
                    <td className="py-3 px-3 text-end font-mono text-blue-800">{formatAmount(tb.data.totals.periodDebit)}</td>
                    <td className="py-3 px-3 text-end font-mono text-blue-800">{formatAmount(tb.data.totals.periodCredit)}</td>
                    <td className="py-3 px-3 text-end font-mono text-slate-950">{formatAmount(tb.data.totals.closingDebit)}</td>
                    <td className="py-3 px-3 text-end font-mono text-slate-950">{formatAmount(tb.data.totals.closingCredit)}</td>
                    <td className="py-3 px-3 text-end font-mono bg-indigo-100/60 text-indigo-950">
                      {tb.data.totals.balanced ? 'متوازن ✓' : 'غير متوازن ⚠'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ====== 2. INCOME STATEMENT SECTION ====== */}
      {(activeTab === 'all' || activeTab === 'income-statement') && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">قائمة الدخل (الأرباح والخسائر)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                حسابات الإيرادات والمصروفات خلال الفترة وصافي الربح أو الخسارة
              </p>
            </div>

            {is?.filters && (
              <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                الفترة: {is.filters.fromDate ?? '—'} إلى {is.filters.toDate ?? '—'}
              </div>
            )}
          </div>

          {isErr && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 p-3 text-sm">
              {isErr}
            </div>
          )}

          {loadingData && !is ? (
            <div className="py-12 text-center text-slate-400 text-sm">جاري تحميل قائمة الدخل...</div>
          ) : (
            <div className="space-y-6">
              {/* Revenue Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>الإيرادات (Revenue)</span>
                  </h3>
                  <span className="text-xs font-semibold text-emerald-800" dir="ltr">
                    المجموع: {formatAmount(is?.data?.totals?.revenue)} SAR
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 text-start">الرمز</th>
                        <th className="py-2 px-3 text-start">الحساب</th>
                        <th className="py-2 px-2 text-start">طبيعة الحساب</th>
                        <th className="py-2 px-3 text-end">إجمالي المدين</th>
                        <th className="py-2 px-3 text-end">إجمالي الدائن</th>
                        <th className="py-2 px-3 text-end font-bold">مبلغ المساهمة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {!is?.data?.revenue?.length ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-slate-400 font-sans">
                            لا توجد إيرادات مرحّلة لهذه الفترة
                          </td>
                        </tr>
                      ) : (
                        is.data.revenue.map((r) => (
                          <tr key={r.accountId} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-semibold text-slate-900 font-sans">{r.code}</td>
                            <td className="py-2 px-3 font-sans text-slate-800">{r.name}</td>
                            <td className="py-2 px-2 font-sans text-slate-500">
                              {arNormalBalance(r.normalBalance)}
                              {r.normalBalance === 'DEBIT' && ' (خصم/مردود)'}
                            </td>
                            <td className="py-2 px-3 text-end">{formatAmount(r.debitTotal)}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(r.creditTotal)}</td>
                            <td className="py-2 px-3 text-end font-bold text-emerald-700">
                              {formatAmount(r.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Expenses Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-rose-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>المصروفات (Expenses)</span>
                  </h3>
                  <span className="text-xs font-semibold text-rose-800" dir="ltr">
                    المجموع: {formatAmount(is?.data?.totals?.expenses)} SAR
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 text-start">الرمز</th>
                        <th className="py-2 px-3 text-start">الحساب</th>
                        <th className="py-2 px-2 text-start">طبيعة الحساب</th>
                        <th className="py-2 px-3 text-end">إجمالي المدين</th>
                        <th className="py-2 px-3 text-end">إجمالي الدائن</th>
                        <th className="py-2 px-3 text-end font-bold">مبلغ المصروف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {!is?.data?.expenses?.length ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-slate-400 font-sans">
                            لا توجد مصروفات مرحّلة لهذه الفترة
                          </td>
                        </tr>
                      ) : (
                        is.data.expenses.map((exp) => (
                          <tr key={exp.accountId} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-semibold text-slate-900 font-sans">{exp.code}</td>
                            <td className="py-2 px-3 font-sans text-slate-800">{exp.name}</td>
                            <td className="py-2 px-2 font-sans text-slate-500">{arNormalBalance(exp.normalBalance)}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(exp.debitTotal)}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(exp.creditTotal)}</td>
                            <td className="py-2 px-3 text-end font-bold text-rose-700">
                              {formatAmount(exp.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Net Income Summary Banner */}
              {is?.data?.totals && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-indigo-950">
                      صافي الدخل للفترة (Net Income)
                    </div>
                    <div className="text-xs text-indigo-700 mt-0.5">
                      صافي الدخل = إجمالي الإيرادات ({formatAmount(is.data.totals.revenue)}) − إجمالي المصروفات ({formatAmount(is.data.totals.expenses)})
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-indigo-950 font-mono" dir="ltr">
                    {formatAmount(is.data.totals.netIncome)} SAR
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ====== 3. BALANCE SHEET SECTION ====== */}
      {(activeTab === 'all' || activeTab === 'balance-sheet') && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">الميزانية العمومية (Balance Sheet)</h2>
                {bs?.data?.totals && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      bs.data.totals.balanced
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {bs.data.totals.balanced ? '✓ الميزانية متوازنة' : '⚠ غير متوازنة'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                المركز المالي التراكمي: الأصول = الالتزامات + حقوق الملكية (شاملة الأرباح المبقاة وصافي الدخل)
              </p>
            </div>

            {bs?.filters && (
              <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                حتى تاريخ: {bs.filters.asOfDate ?? 'اليوم'}
              </div>
            )}
          </div>

          {bsErr && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 p-3 text-sm">
              {bsErr}
            </div>
          )}

          {loadingData && !bs ? (
            <div className="py-12 text-center text-slate-400 text-sm">جاري تحميل الميزانية العمومية...</div>
          ) : (
            <div className="space-y-6">
              {/* 3.1 Assets Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>الأصول (Assets)</span>
                  </h3>
                  <span className="text-xs font-semibold text-blue-900" dir="ltr">
                    المجموع: {formatAmount(bs?.data?.totals?.assets)} SAR
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 text-start">الرمز</th>
                        <th className="py-2 px-3 text-start">اسم الأصل</th>
                        <th className="py-2 px-3 text-end">إجمالي المدين</th>
                        <th className="py-2 px-3 text-end">إجمالي الدائن</th>
                        <th className="py-2 px-3 text-end font-bold">الرصيد الدفتري</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {!bs?.data?.assets?.length ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400 font-sans">
                            لا توجد أصول مسجلة بحركات مرحّلة
                          </td>
                        </tr>
                      ) : (
                        bs.data.assets.map((asset) => (
                          <tr key={asset.accountId} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-semibold text-slate-900 font-sans">{asset.code}</td>
                            <td className="py-2 px-3 font-sans text-slate-800">{asset.name}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(asset.debitTotal)}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(asset.creditTotal)}</td>
                            <td className="py-2 px-3 text-end font-bold text-blue-800">{formatAmount(asset.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3.2 Liabilities Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>الالتزامات (Liabilities)</span>
                  </h3>
                  <span className="text-xs font-semibold text-amber-900" dir="ltr">
                    المجموع: {formatAmount(bs?.data?.totals?.liabilities)} SAR
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 text-start">الرمز</th>
                        <th className="py-2 px-3 text-start">اسم الالتزام</th>
                        <th className="py-2 px-3 text-end">إجمالي المدين</th>
                        <th className="py-2 px-3 text-end">إجمالي الدائن</th>
                        <th className="py-2 px-3 text-end font-bold">الرصيد القائم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {!bs?.data?.liabilities?.length ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400 font-sans">
                            لا توجد التزامات مسجلة بحركات مرحّلة
                          </td>
                        </tr>
                      ) : (
                        bs.data.liabilities.map((liab) => (
                          <tr key={liab.accountId} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-semibold text-slate-900 font-sans">{liab.code}</td>
                            <td className="py-2 px-3 font-sans text-slate-800">{liab.name}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(liab.debitTotal)}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(liab.creditTotal)}</td>
                            <td className="py-2 px-3 text-end font-bold text-amber-800">{formatAmount(liab.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3.3 Equity Table (Chart Accounts + Synthetic Computed Equity) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-purple-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    <span>حقوق الملكية والأرباح المحتسبة (Equity & Retained Earnings)</span>
                  </h3>
                  <span className="text-xs font-semibold text-purple-900" dir="ltr">
                    رأس المال المسجل: {formatAmount(bs?.data?.totals?.equity)} SAR
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 text-start">الرمز</th>
                        <th className="py-2 px-3 text-start">البند / الحساب</th>
                        <th className="py-2 px-3 text-end">إجمالي المدين</th>
                        <th className="py-2 px-3 text-end">إجمالي الدائن</th>
                        <th className="py-2 px-3 text-end font-bold">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {bs?.data?.equity?.map((eq) => (
                        <tr key={eq.accountId} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-semibold text-slate-900 font-sans">{eq.code}</td>
                          <td className="py-2 px-3 font-sans text-slate-800">{eq.name}</td>
                          <td className="py-2 px-3 text-end">{formatAmount(eq.debitTotal)}</td>
                          <td className="py-2 px-3 text-end">{formatAmount(eq.creditTotal)}</td>
                          <td className="py-2 px-3 text-end font-bold text-purple-800">{formatAmount(eq.amount)}</td>
                        </tr>
                      ))}

                      {/* Synthetic Equity 1: Retained Earnings Computed (Prior fiscal years) */}
                      <tr className="bg-purple-50/30">
                        <td className="py-2.5 px-3 font-semibold text-purple-900 font-sans">SYNTH-RE</td>
                        <td className="py-2.5 px-3 font-sans text-purple-950 font-medium">
                          الأرباح المبقاة المحتسبة (السنوات المالية السابقة)
                        </td>
                        <td className="py-2.5 px-3 text-end text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-end text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-end font-bold text-purple-900">
                          {formatAmount(bs?.data?.syntheticEquity?.retainedEarningsComputed)}
                        </td>
                      </tr>

                      {/* Synthetic Equity 2: Current Period Net Income (Current fiscal YTD) */}
                      <tr className="bg-emerald-50/30">
                        <td className="py-2.5 px-3 font-semibold text-emerald-900 font-sans">SYNTH-NI</td>
                        <td className="py-2.5 px-3 font-sans text-emerald-950 font-medium">
                          صافي دخل الفترة المالية الحالية (المحتسب من قائمة الدخل)
                        </td>
                        <td className="py-2.5 px-3 text-end text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-end text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-end font-bold text-emerald-800">
                          {formatAmount(bs?.data?.syntheticEquity?.currentPeriodNetIncome)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3.4 Accounting Equation Balance Footer */}
              {bs?.data?.totals && (
                <div
                  className={`rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    bs.data.totals.balanced
                      ? 'border-emerald-200 bg-emerald-50/40 text-emerald-950'
                      : 'border-rose-200 bg-rose-50/40 text-rose-950'
                  }`}
                >
                  <div>
                    <div className="text-sm font-bold flex items-center gap-2">
                      <span>معادلة الميزانية العمومية (Accounting Equation)</span>
                      <span>{bs.data.totals.balanced ? '✓ متطابقة' : '⚠ غير متطابقة'}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      الأصول ({formatAmount(bs.data.totals.assets)}) = الالتزامات ({formatAmount(bs.data.totals.liabilities)}) + حقوق الملكية المحتسبة ({formatAmount(bs.data.totals.liabilitiesAndEquity)})
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-center">
                      <div className="text-slate-500 text-[10px] font-sans">إجمالي الأصول</div>
                      <div className="font-bold text-slate-900">{formatAmount(bs.data.totals.assets)}</div>
                    </div>
                    <div className="text-slate-400 text-lg font-bold">=</div>
                    <div className="text-center">
                      <div className="text-slate-500 text-[10px] font-sans">الالتزامات + حقوق الملكية</div>
                      <div className="font-bold text-slate-900">{formatAmount(bs.data.totals.liabilitiesAndEquity)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
