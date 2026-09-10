'use client';

// =====================================================
// Phase 18A-B-4: Financial Reports Workspace UX Polish
//
// Read-only presentation of the three core GL statements:
//   1. Trial Balance (ميزان المراجعة)
//   2. Income Statement (قائمة الدخل / الأرباح والخسائر)
//   3. Balance Sheet (الميزانية العمومية)
//
// Strictly read-only:
//   - Gated by `gl_journal.read`.
//   - No journal creation, modification, posting, or reversal.
//   - Monetary amounts are displayed directly from decimal strings.
//   - Arabic/RTL first, modern SaaS card layout.
//   - Zero formula or business logic modifications.
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type {
  BalanceSheetReport,
  IncomeStatementReport,
  TrialBalanceReport,
} from '@/lib/api';
import {
  PageHeader,
  KpiCard,
  StatusBadge,
  EmptyState,
  LoadingState,
  ErrorBanner,
  AccessDeniedState,
  SectionCard,
  FilterSection,
} from '@/components/ui';

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
  }, [loading, user, router]);

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
      <main className="min-h-screen p-8 flex items-center justify-center">
        <LoadingState message="جاري التحقق من الصلاحيات وتحميل القوائم المالية..." />
      </main>
    );
  }

  if (!user || !canRead) {
    return (
      <main className="min-h-screen p-8">
        <AccessDeniedState
          title="صلاحية غير كافية"
          description="لا تملك صلاحية قراءة القيود ودفتر الأستاذ العام (gl_journal.read) المطلوبة لعرض القوائم المالية."
          requiredPermission="gl_journal.read"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Standardized Modern Page Header */}
      <PageHeader
        title="القوائم المالية الختامية"
        subtitle="عرض ميزان المراجعة، قائمة الدخل، والميزانية العمومية من واقع القيود المحاسبية المرحّلة (POSTED) فقط في دفتر الأستاذ العام."
        eyebrow="المحاسبة والتقارير"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/accounting"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium transition-colors shadow-xs"
            >
              ← مركز المحاسبة
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium transition-colors shadow-xs"
            >
              لوحة التحكم
            </Link>
          </div>
        }
      />

      {/* 2. Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          نظرة شاملة (جميع القوائم)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('trial-balance')}
          className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'trial-balance'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          ميزان المراجعة (Trial Balance)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('income-statement')}
          className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'income-statement'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          قائمة الدخل (Income Statement)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('balance-sheet')}
          className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'balance-sheet'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          الميزانية العمومية (Balance Sheet)
        </button>
      </div>

      {/* 3. Filter Bar */}
      <form
        onSubmit={handleApplyFilters}
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <span>📅</span> فلاتر الفترة المحاسبية
          </h3>
          <span className="text-[11px] text-slate-400">
            تاريخ القيد (entryDate) هو الأساس الزمني لإدراج الحركات
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              من تاريخ (بداية الفترة)
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs font-mono text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors"
              dir="ltr"
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs font-mono text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors"
              dir="ltr"
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs font-mono text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors"
              dir="ltr"
            />
          </div>

          <div className="flex items-center pt-5">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={includeZero}
                onChange={(e) => setIncludeZero(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span>إظهار الحسابات الصفرية في ميزان المراجعة</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            إعادة تعيين
          </button>
          <button
            type="submit"
            disabled={loadingData}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {loadingData && (
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            )}
            <span>تحديث التقارير</span>
          </button>
        </div>
      </form>

      {/* 4. Executive Financial Highlights KPI Strip */}
      {(activeTab === 'all' || activeTab === 'balance-sheet') && bs?.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="إجمالي الأصول (Assets)"
            value={`${formatAmount(bs.data.totals.assets)} ر.س`}
            helperText="طبيعة مدينة • متداولة وغير متداولة"
            tone="info"
          />
          <KpiCard
            label="إجمالي الالتزامات (Liabilities)"
            value={`${formatAmount(bs.data.totals.liabilities)} ر.س`}
            helperText="طبيعة دائنة • التزامات قائمة"
            tone="warning"
          />
          <KpiCard
            label="صافي دخل الفترة (Net Income)"
            value={`${formatAmount(bs.data.syntheticEquity.currentPeriodNetIncome)} ر.س`}
            helperText="مطابق لنتيجة قائمة الدخل للفترة"
            tone="success"
          />
          <KpiCard
            label="الالتزامات وحقوق الملكية"
            value={`${formatAmount(bs.data.totals.liabilitiesAndEquity)} ر.س`}
            helperText={
              bs.data.totals.balanced
                ? 'المعادلة متوازنة محققة ✓'
                : 'يوجد عدم توازن ⚠'
            }
            tone={bs.data.totals.balanced ? 'success' : 'danger'}
          />
        </div>
      )}

      {/* ====== 5. TRIAL BALANCE SECTION ====== */}
      {(activeTab === 'all' || activeTab === 'trial-balance') && (
        <SectionCard
          title="ميزان المراجعة (Trial Balance)"
          description="حركة وأرصدة الحسابات: الافتتاحي، حركة الفترة، والرصيد الختامي."
          actions={
            tb?.data?.totals && (
              <StatusBadge
                status={tb.data.totals.balanced ? 'success' : 'danger'}
                label={tb.data.totals.balanced ? '✓ متوازن' : '⚠ غير متوازن'}
              />
            )
          }
        >
          {tbErr && <ErrorBanner message={tbErr} tone="danger" />}

          {loadingData && !tb ? (
            <div className="py-10 text-center">
              <LoadingState message="جاري تحميل ميزان المراجعة..." />
            </div>
          ) : !tb?.data?.accounts?.length ? (
            <EmptyState
              title="لا توجد بيانات لميزان المراجعة"
              description="لم يتم العثور على حسابات بحركات مرحّلة خلال هذه الفترة."
            />
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-xs text-slate-700">
                <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200/80 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3 text-start">الرمز</th>
                    <th className="py-2.5 px-3 text-start">اسم الحساب</th>
                    <th className="py-2.5 px-2 text-start">النوع</th>
                    <th className="py-2.5 px-2 text-start">الطبيعة</th>
                    <th className="py-2.5 px-3 text-end">افتتاحي مدين</th>
                    <th className="py-2.5 px-3 text-end">افتتاحي دائن</th>
                    <th className="py-2.5 px-3 text-end">فترة مدين</th>
                    <th className="py-2.5 px-3 text-end">فترة دائن</th>
                    <th className="py-2.5 px-3 text-end">ختامي مدين</th>
                    <th className="py-2.5 px-3 text-end">ختامي دائن</th>
                    <th className="py-2.5 px-3 text-end bg-blue-50/40 font-bold text-slate-900">
                      الرصيد الختامي
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {tb.data.accounts.map((row) => (
                    <tr key={row.accountId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2 px-3 font-semibold text-slate-900 font-sans">
                        {row.code}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-800">
                        <div>{row.name}</div>
                        {row.nameAr && (
                          <div className="text-[10px] text-slate-400">{row.nameAr}</div>
                        )}
                      </td>
                      <td className="py-2 px-2 font-sans">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                          {arAccountType(row.type)}
                        </span>
                      </td>
                      <td className="py-2 px-2 font-sans text-slate-500">
                        {arNormalBalance(row.normalBalance)}
                      </td>
                      <td className="py-2 px-3 text-end">{formatAmount(row.openingDebit)}</td>
                      <td className="py-2 px-3 text-end">{formatAmount(row.openingCredit)}</td>
                      <td className="py-2 px-3 text-end text-blue-700 font-medium">
                        {formatAmount(row.periodDebit)}
                      </td>
                      <td className="py-2 px-3 text-end text-blue-700 font-medium">
                        {formatAmount(row.periodCredit)}
                      </td>
                      <td className="py-2 px-3 text-end font-semibold text-slate-900">
                        {formatAmount(row.closingDebit)}
                      </td>
                      <td className="py-2 px-3 text-end font-semibold text-slate-900">
                        {formatAmount(row.closingCredit)}
                      </td>
                      <td className="py-2 px-3 text-end bg-blue-50/20 font-bold text-blue-950">
                        {formatAmount(row.closingBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300 text-xs">
                    <td colSpan={4} className="py-3 px-3 font-sans text-start">
                      الإجماليات الكلية
                    </td>
                    <td className="py-3 px-3 text-end font-mono">
                      {formatAmount(tb.data.totals.openingDebit)}
                    </td>
                    <td className="py-3 px-3 text-end font-mono">
                      {formatAmount(tb.data.totals.openingCredit)}
                    </td>
                    <td className="py-3 px-3 text-end font-mono text-blue-800">
                      {formatAmount(tb.data.totals.periodDebit)}
                    </td>
                    <td className="py-3 px-3 text-end font-mono text-blue-800">
                      {formatAmount(tb.data.totals.periodCredit)}
                    </td>
                    <td className="py-3 px-3 text-end font-mono text-slate-950">
                      {formatAmount(tb.data.totals.closingDebit)}
                    </td>
                    <td className="py-3 px-3 text-end font-mono text-slate-950">
                      {formatAmount(tb.data.totals.closingCredit)}
                    </td>
                    <td className="py-3 px-3 text-end font-mono bg-blue-100/60 text-blue-950">
                      {tb.data.totals.balanced ? 'متوازن ✓' : 'غير متوازن ⚠'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ====== 6. INCOME STATEMENT SECTION ====== */}
      {(activeTab === 'all' || activeTab === 'income-statement') && (
        <SectionCard
          title="قائمة الدخل (الأرباح والخسائر)"
          description="حسابات الإيرادات والمصروفات خلال الفترة وصافي النتيجة الختامية."
          actions={
            is?.filters && (
              <span className="text-xs text-slate-500 font-mono bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                الفترة: {is.filters.fromDate ?? '—'} إلى {is.filters.toDate ?? '—'}
              </span>
            )
          }
        >
          {isErr && <ErrorBanner message={isErr} tone="danger" />}

          {loadingData && !is ? (
            <div className="py-10 text-center">
              <LoadingState message="جاري تحميل قائمة الدخل..." />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Revenue Sub-table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>الإيرادات (Revenue)</span>
                  </h4>
                  <span className="text-xs font-bold text-emerald-800 font-mono" dir="ltr">
                    المجموع: {formatAmount(is?.data?.totals?.revenue)} ر.س
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200/80 font-semibold">
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
                            <td className="py-2 px-3 font-semibold text-slate-900 font-sans">
                              {r.code}
                            </td>
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

              {/* Expenses Sub-table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>المصروفات (Expenses)</span>
                  </h4>
                  <span className="text-xs font-bold text-rose-800 font-mono" dir="ltr">
                    المجموع: {formatAmount(is?.data?.totals?.expenses)} ر.س
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200/80 font-semibold">
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
                            <td className="py-2 px-3 font-semibold text-slate-900 font-sans">
                              {exp.code}
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-800">{exp.name}</td>
                            <td className="py-2 px-2 font-sans text-slate-500">
                              {arNormalBalance(exp.normalBalance)}
                            </td>
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

              {/* Net Income Summary Card */}
              {is?.data?.totals && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-blue-950 flex items-center gap-2">
                      <span>صافي الدخل للفترة (Net Income)</span>
                      <StatusBadge
                        status={
                          Number(is.data.totals.netIncome) >= 0 ? 'success' : 'danger'
                        }
                        label={
                          Number(is.data.totals.netIncome) >= 0
                            ? 'صافي ربح'
                            : 'صافي خسارة'
                        }
                      />
                    </div>
                    <div className="text-xs text-blue-800 mt-1">
                      صافي الدخل = إجمالي الإيرادات ({formatAmount(is.data.totals.revenue)}) −
                      إجمالي المصروفات ({formatAmount(is.data.totals.expenses)})
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-blue-950 font-mono" dir="ltr">
                    {formatAmount(is.data.totals.netIncome)} ر.س
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* ====== 7. BALANCE SHEET SECTION ====== */}
      {(activeTab === 'all' || activeTab === 'balance-sheet') && (
        <SectionCard
          title="الميزانية العمومية (Balance Sheet)"
          description="المركز المالي التراكمي: الأصول = الالتزامات + حقوق الملكية."
          actions={
            bs?.data?.totals && (
              <StatusBadge
                status={bs.data.totals.balanced ? 'success' : 'danger'}
                label={bs.data.totals.balanced ? '✓ الميزانية متوازنة' : '⚠ غير متوازنة'}
              />
            )
          }
        >
          {bsErr && <ErrorBanner message={bsErr} tone="danger" />}

          {loadingData && !bs ? (
            <div className="py-10 text-center">
              <LoadingState message="جاري تحميل الميزانية العمومية..." />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Assets Sub-table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>الأصول (Assets)</span>
                  </h4>
                  <span className="text-xs font-bold text-blue-900 font-mono" dir="ltr">
                    المجموع: {formatAmount(bs?.data?.totals?.assets)} ر.س
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200/80 font-semibold">
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
                            <td className="py-2 px-3 font-semibold text-slate-900 font-sans">
                              {asset.code}
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-800">{asset.name}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(asset.debitTotal)}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(asset.creditTotal)}</td>
                            <td className="py-2 px-3 text-end font-bold text-blue-800">
                              {formatAmount(asset.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Liabilities Sub-table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>الالتزامات (Liabilities)</span>
                  </h4>
                  <span className="text-xs font-bold text-amber-900 font-mono" dir="ltr">
                    المجموع: {formatAmount(bs?.data?.totals?.liabilities)} ر.س
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200/80 font-semibold">
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
                            <td className="py-2 px-3 font-semibold text-slate-900 font-sans">
                              {liab.code}
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-800">{liab.name}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(liab.debitTotal)}</td>
                            <td className="py-2 px-3 text-end">{formatAmount(liab.creditTotal)}</td>
                            <td className="py-2 px-3 text-end font-bold text-amber-800">
                              {formatAmount(liab.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Equity Sub-table (including Synthetic items) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    <span>حقوق الملكية والأرباح المحتسبة (Equity & Retained Earnings)</span>
                  </h4>
                  <span className="text-xs font-bold text-purple-900 font-mono" dir="ltr">
                    رأس المال المسجل: {formatAmount(bs?.data?.totals?.equity)} ر.س
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200/80 font-semibold">
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
                          <td className="py-2 px-3 font-semibold text-slate-900 font-sans">
                            {eq.code}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-800">{eq.name}</td>
                          <td className="py-2 px-3 text-end">{formatAmount(eq.debitTotal)}</td>
                          <td className="py-2 px-3 text-end">{formatAmount(eq.creditTotal)}</td>
                          <td className="py-2 px-3 text-end font-bold text-purple-800">
                            {formatAmount(eq.amount)}
                          </td>
                        </tr>
                      ))}

                      {/* Synthetic Equity 1: Retained Earnings Computed */}
                      <tr className="bg-purple-50/30">
                        <td className="py-2.5 px-3 font-semibold text-purple-900 font-sans">
                          SYNTH-RE
                        </td>
                        <td className="py-2.5 px-3 font-sans text-purple-950 font-medium">
                          الأرباح المبقاة المحتسبة (السنوات المالية السابقة)
                        </td>
                        <td className="py-2.5 px-3 text-end text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-end text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-end font-bold text-purple-900">
                          {formatAmount(bs?.data?.syntheticEquity?.retainedEarningsComputed)}
                        </td>
                      </tr>

                      {/* Synthetic Equity 2: Current Period Net Income */}
                      <tr className="bg-emerald-50/30">
                        <td className="py-2.5 px-3 font-semibold text-emerald-900 font-sans">
                          SYNTH-NI
                        </td>
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

              {/* Accounting Equation Verification Box */}
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
                      الأصول ({formatAmount(bs.data.totals.assets)}) = الالتزامات (
                      {formatAmount(bs.data.totals.liabilities)}) + حقوق الملكية المحتسبة (
                      {formatAmount(bs.data.totals.liabilitiesAndEquity)})
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-center">
                      <div className="text-slate-500 text-[10px] font-sans">إجمالي الأصول</div>
                      <div className="font-bold text-slate-900">
                        {formatAmount(bs.data.totals.assets)}
                      </div>
                    </div>
                    <div className="text-slate-400 text-lg font-bold">=</div>
                    <div className="text-center">
                      <div className="text-slate-500 text-[10px] font-sans">
                        الالتزامات + حقوق الملكية
                      </div>
                      <div className="font-bold text-slate-900">
                        {formatAmount(bs.data.totals.liabilitiesAndEquity)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}
    </main>
  );
}
