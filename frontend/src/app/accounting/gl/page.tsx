'use client';

// =====================================================
// Phase 11A-C-code: GL minimal read-only view.
//
// Goal:
//   * Display the Chart of Accounts and Manual Journal Entries
//     already exposed in Phase 6 — read-only — using the new
//     Phase 11A-B-4 `gl_*` permission keys on the client side.
//   * Allow viewer roles (e.g. an auditor, a controller with
//     read-only access) to browse GL state without ever being
//     able to mutate it.
//
// Strict non-scope (everything is FORBIDDEN HERE):
//   * No create / update / delete / post / cancel buttons.
//   * No forms, no live-form helpers, no input fields.
//   * No posting logic, no balance editor, no line drafting.
//   * No financial statements (Trial Balance / Balance Sheet / P&L).
//   * No bank reconciliation, no AR/AP ledgers, no payment surface.
//   * No vendor or seed writes — purely GET against the two
//     read endpoints already RBAC-gated server-side.
//
// RBAC contract (server-side, enforced by NestJS PermissionsGuard):
//   * GET /api/accounting/accounts  → `gl_accounts.read` (Phase 11A-B-4)
//   * GET /api/accounting/journal   → `gl_journal.read`  (Phase 11A-B-4)
// The client-side gating below mirrors those exact keys so a user
// without either permission lands on the existing-style empty/forbidden
// state instead of crashing on 403. Server still rejects if forged.
//
// companyId always comes from the JWT — never from a URL or query.
// Money values are Prisma.Decimal serialised to strings (mirrors
// `Account.totalDebit` / `JournalEntry.*` typing in api.ts).
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type {
  AccountTypeKey,
  GlJournalEntry,
  GlAccount,
  JournalEntryStatusKey,
  NormalBalanceKey,
} from '@/lib/api';

// ---------- Formatters -------------------------------------------

function fmtMoney(s: string | number | null | undefined): string {
  if (s === null || s === undefined || s === '') return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 19).replace('T', ' ');
}

function arAccountType(t: AccountTypeKey): string {
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
  }
}

function arNormalBalance(b: NormalBalanceKey): string {
  return b === 'DEBIT' ? 'مدين' : 'دائن';
}

function arStatus(s: JournalEntryStatusKey): string {
  switch (s) {
    case 'DRAFT':
      return 'مسودة';
    case 'POSTED':
      return 'مرحّل';
    case 'CANCELLED':
      return 'ملغى';
  }
}

// ---------- Component --------------------------------------------

export default function GlReadOnlyPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  // ---- permissions (read-only gating) --------------------------
  const canReadAccounts = !!user && hasPermission('gl_accounts.read');
  const canReadJournal = !!user && hasPermission('gl_journal.read');
  const canReadAnything = canReadAccounts || canReadJournal;

  // ---- accounts list (read-only) -------------------------------
  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountPage, setAccountPage] = useState(1);
  const [accountsErr, setAccountsErr] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const accountsPageSize = 50;

  // ---- journal list (read-only) --------------------------------
  const [journal, setJournal] = useState<GlJournalEntry[]>([]);
  const [journalTotal, setJournalTotal] = useState(0);
  const [journalPage, setJournalPage] = useState(1);
  const [journalErr, setJournalErr] = useState<string | null>(null);
  const [loadingJournal, setLoadingJournal] = useState(true);
  const journalPageSize = 20;

  // ---- Routing guards -----------------------------------------
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    // No gl_*/accounting.read permission → send the user back to dashboard
    // (matches the existing empty/forbidden state pattern used by
    //  accounting/page.tsx for users without `accounting.read`).
    if (!loading && user && !canReadAnything) router.replace('/dashboard');
  }, [loading, user, canReadAnything, router]);

  // ---- Loaders ------------------------------------------------
  const reloadAccounts = () => {
    if (!user || !canReadAccounts) return undefined;
    let cancelled = false;
    setLoadingAccounts(true);
    api
      .listGlAccounts({
        page: accountPage,
        pageSize: accountsPageSize,
        includeInactive: true,
      })
      .then((res) => {
        if (cancelled) return;
        setAccounts(res.items);
        setAccountsTotal(res.total);
        setAccountsErr(null);
      })
      .catch((e) => !cancelled && setAccountsErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => !cancelled && setLoadingAccounts(false));
    return () => {
      cancelled = true;
    };
  };

  const reloadJournal = () => {
    if (!user || !canReadJournal) return undefined;
    let cancelled = false;
    setLoadingJournal(true);
    api
      .listGlJournalEntries({ page: journalPage, pageSize: journalPageSize })
      .then((res) => {
        if (cancelled) return;
        setJournal(res.items);
        setJournalTotal(res.total);
        setJournalErr(null);
      })
      .catch((e) => !cancelled && setJournalErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => !cancelled && setLoadingJournal(false));
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    const cleanup = reloadAccounts();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountPage, user, canReadAccounts]);

  useEffect(() => {
    const cleanup = reloadJournal();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalPage, user, canReadJournal]);

  // ---- Rendering guards (empty / forbidden state) -------------
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-slate-500">...جاري التحميل</p>
      </main>
    );
  }
  if (!user) return null;

  const totalAccountsPages = Math.max(1, Math.ceil(accountsTotal / accountsPageSize));
  const totalJournalPages = Math.max(1, Math.ceil(journalTotal / journalPageSize));

  return (
    <main className="min-h-screen p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            دفتر الأستاذ — قراءة فقط
          </h1>
          <p className="text-sm text-slate-500">
            دليل الحسابات والقيود اليومية داخل شركتك فقط ({user.companyId}).
            هذه صفحة عرض فقط — لا توجد أزرار إنشاء أو تعديل أو ترحيل أو إلغاء،
            ولا قوائم مالية (ميزان مراجعة / قائمة دخل / ZATCA).
          </p>
        </div>
        <div className="flex gap-2">
          {canReadAccounts || canReadJournal ? (
            <Link
              href="/accounting"
              className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm px-4 py-2"
            >
              المحاسبة (كاملة)
            </Link>
          ) : null}
          <Link
            href="/dashboard"
            className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm px-4 py-2"
          >
            لوحة المعلومات
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ====== Chart of Accounts (read-only) ====== */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-slate-800">دليل الحسابات</h2>
            <span className="text-xs text-slate-500">
              {accountsTotal} حساباً في شركتك
            </span>
          </div>

          {!canReadAccounts && (
            <p className="text-sm text-slate-500">
              لا تملك صلاحية <code className="font-mono">gl_accounts.read</code> —
              دليل الحسابات غير ظاهر. لا توجد أزرار هنا أصلاً.
            </p>
          )}

          {canReadAccounts && accountsErr && (
            <p className="text-xs text-rose-700 mb-2">{accountsErr}</p>
          )}

          {canReadAccounts && (
            <>
              {loadingAccounts ? (
                <p className="text-center text-slate-400 py-4 text-sm">
                  ...جاري التحميل
                </p>
              ) : accounts.length === 0 ? (
                <p className="text-center text-slate-400 py-4 text-sm">
                  لا توجد حسابات بعد.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="text-start py-2 px-2">الرمز</th>
                        <th className="text-start py-2 px-2">الاسم</th>
                        <th className="text-start py-2 px-2">النوع</th>
                        <th className="text-start py-2 px-2">طبيعة</th>
                        <th className="text-start py-2 px-2">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((a) => (
                        <tr key={a.id} className="border-b border-slate-100">
                          <td className="py-2 px-2 font-mono" dir="ltr">
                            {a.code}
                          </td>
                          <td className="py-2 px-2">
                            <div>{a.name}</div>
                            {a.nameAr && (
                              <div className="text-xs text-slate-500">
                                {a.nameAr}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2" dir="ltr">
                            {arAccountType(a.type)}
                          </td>
                          <td className="py-2 px-2">
                            {arNormalBalance(a.normalBalance)}
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {a.deletedAt ? (
                              <span className="text-rose-600">محذوف</span>
                            ) : a.isActive ? (
                              <span className="text-emerald-600">نشط</span>
                            ) : (
                              <span className="text-amber-600">موقوف</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  صفحة {accountPage} من {totalAccountsPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={accountPage <= 1}
                    onClick={() => setAccountPage((p) => Math.max(1, p - 1))}
                    className="rounded-md bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-800 px-2 py-1"
                  >
                    السابق
                  </button>
                  <button
                    type="button"
                    disabled={accountPage >= totalAccountsPages}
                    onClick={() => setAccountPage((p) => p + 1)}
                    className="rounded-md bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-800 px-2 py-1"
                  >
                    التالي
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ====== Manual Journal Entries (read-only) ====== */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-slate-800">القيود اليومية</h2>
            <span className="text-xs text-slate-500">
              {journalTotal} قيداً في شركتك
            </span>
          </div>

          {!canReadJournal && (
            <p className="text-sm text-slate-500">
              لا تملك صلاحية <code className="font-mono">gl_journal.read</code> —
              القيود اليومية غير ظاهرة. لا توجد أزرار هنا أصلاً.
            </p>
          )}

          {canReadJournal && journalErr && (
            <p className="text-xs text-rose-700 mb-2">{journalErr}</p>
          )}

          {canReadJournal && (
            <>
              {loadingJournal ? (
                <p className="text-center text-slate-400 py-4 text-sm">
                  ...جاري التحميل
                </p>
              ) : journal.length === 0 ? (
                <p className="text-center text-slate-400 py-4 text-sm">
                  لا توجد قيود بعد.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="text-start py-2 px-2">رقم القيد</th>
                        <th className="text-start py-2 px-2">التاريخ</th>
                        <th className="text-start py-2 px-2">الوصف</th>
                        <th className="text-start py-2 px-2">الحالة</th>
                        <th className="text-start py-2 px-2">إجمالي مدين</th>
                        <th className="text-start py-2 px-2">إجمالي دائن</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journal.map((e) => (
                        <tr key={e.id} className="border-b border-slate-100">
                          <td className="py-2 px-2 font-mono" dir="ltr">
                            {e.entryNumber}
                          </td>
                          <td className="py-2 px-2 text-xs" dir="ltr">
                            {fmtDate(e.entryDate)}
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {e.description ?? '—'}
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {e.status === 'DRAFT' && (
                              <span className="text-amber-700">{arStatus('DRAFT')}</span>
                            )}
                            {e.status === 'POSTED' && (
                              <span className="text-emerald-700">{arStatus('POSTED')}</span>
                            )}
                            {e.status === 'CANCELLED' && (
                              <span className="text-rose-700">{arStatus('CANCELLED')}</span>
                            )}
                          </td>
                          <td className="py-2 px-2" dir="ltr">
                            {fmtMoney(e.totalDebit)}
                          </td>
                          <td className="py-2 px-2" dir="ltr">
                            {fmtMoney(e.totalCredit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  صفحة {journalPage} من {totalJournalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={journalPage <= 1}
                    onClick={() => setJournalPage((p) => Math.max(1, p - 1))}
                    className="rounded-md bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-800 px-2 py-1"
                  >
                    السابق
                  </button>
                  <button
                    type="button"
                    disabled={journalPage >= totalJournalPages}
                    onClick={() => setJournalPage((p) => p + 1)}
                    className="rounded-md bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-800 px-2 py-1"
                  >
                    التالي
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Phase 11A-C-code — view-only. لا توجد قيود آلية من المبيعات أو المشتريات
        هنا (لا AR / AP / VAT / ZATCA)، ولا ميزانيات مراجعة أو قوائم مالية — هذه
        خارج النطاق الحالي.
      </p>
    </main>
  );
}
