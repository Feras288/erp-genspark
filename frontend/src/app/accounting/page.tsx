'use client';

// =====================================================
// Phase 18A-B-4: Accounting Workspace UX Polish
//
// - Modern Arabic / RTL-friendly SaaS interface.
// - Standardized PageHeader ("مركز المحاسبة").
// - Executive navigation cards for Chart of Accounts, Journal,
//   Financial Reports, Reconciliation, Period Close, and Audit Logs.
// - Top KPI summary cards for accounts & journal entries.
// - Modern SectionCard containers for Chart of Accounts & Manual Journals.
// - Enhanced forms, status badges, and cleaner tables.
// - Preserves 100% of existing backend API endpoints, parameters, and responses.
// - Preserves 100% of permissions (`accounting.read`, `accounting.accounts.*`,
//   `accounting.journal.*`, `gl_journal.read`, `reconciliation.read`,
//   `period_close.read`, `audit_log.read`).
// - Decimal columns serialize as strings end to end (no Float coercion).
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type {
  Account,
  AccountTypeKey,
  CreateAccountInput,
  CreateJournalEntryInput,
  CreateJournalEntryLineInput,
  JournalEntry,
  JournalEntryStatusKey,
  NormalBalanceKey,
  UpdateAccountInput,
  UpdateJournalEntryInput,
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
import { fmtDisplayMoney } from '@/lib/ui';

// ---------- Local form state types ----------------------------

interface AccountFormState {
  code: string;
  name: string;
  nameAr: string;
  type: AccountTypeKey;
  normalBalance: NormalBalanceKey;
  parentId: string;
  isActive: boolean;
}

interface LineFormState {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

interface JournalFormState {
  entryDate: string;
  description: string;
  reference: string;
  notes: string;
  lines: LineFormState[];
}

// ---------- Constants --------------------------------------------

const ACCOUNT_TYPES: AccountTypeKey[] = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
];

const NORMAL_BALANCE_FOR_TYPE: Record<AccountTypeKey, NormalBalanceKey> = {
  ASSET: 'DEBIT',
  EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
};

// ---------- Form defaults ----------------------------------------

function emptyAccountForm(): AccountFormState {
  return {
    code: '',
    name: '',
    nameAr: '',
    type: 'ASSET',
    normalBalance: 'DEBIT',
    parentId: '',
    isActive: true,
  };
}

function emptyLine(): LineFormState {
  return { accountId: '', description: '', debit: '', credit: '' };
}

function emptyJournalForm(): JournalFormState {
  return {
    entryDate: '',
    description: '',
    reference: '',
    notes: '',
    lines: [emptyLine(), emptyLine()],
  };
}

// ---------- Formatters -------------------------------------------

function fmtMoney(s: string | number | null | undefined): string {
  if (s === null || s === undefined || s === '') return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 10);
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

// ---------- Component --------------------------------------------

export default function AccountingPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  // ---- Permissions ----------------------------------------------
  const canRead = !!user && hasPermission('accounting.read');
  const canCreateAccount = !!user && hasPermission('accounting.accounts.create');
  const canUpdateAccount = !!user && hasPermission('accounting.accounts.update');
  const canDeleteAccount = !!user && hasPermission('accounting.accounts.delete');
  const canCreateJournal =
    !!user &&
    hasPermission('accounting.journal.update') &&
    hasPermission('accounting.accounts.create');
  const canUpdateJournal = !!user && hasPermission('accounting.journal.update');
  const canPostJournal = !!user && hasPermission('accounting.journal.post');
  const canCancelJournal = !!user && hasPermission('accounting.journal.cancel');

  // Sub-modules permissions
  const canReadReports = !!user && hasPermission('gl_journal.read');
  const canReadRecon = !!user && hasPermission('reconciliation.read');
  const canReadPeriodClose = !!user && hasPermission('period_close.read');
  const canReadAuditLog = !!user && hasPermission('audit_log.read');

  // ---- Accounts list --------------------------------------------
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountPage, setAccountPage] = useState(1);
  const [accountSearch, setAccountSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | AccountTypeKey>('');
  const [accountsErr, setAccountsErr] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [rowActionErr, setRowActionErr] = useState<string | null>(null);
  const pageSize = 50;

  // ---- Accounts form --------------------------------------------
  const [isAccountFormOpen, setIsAccountFormOpen] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountFormState>(emptyAccountForm());
  const [accountFormErr, setAccountFormErr] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [submittingAccount, setSubmittingAccount] = useState(false);

  // ---- Journal list ---------------------------------------------
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalTotal, setJournalTotal] = useState(0);
  const [journalPage, setJournalPage] = useState(1);
  const [journalSearch, setJournalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | JournalEntryStatusKey>('');
  const [journalErr, setJournalErr] = useState<string | null>(null);
  const [loadingJournal, setLoadingJournal] = useState(true);

  // ---- Journal form ---------------------------------------------
  const [isJournalFormOpen, setIsJournalFormOpen] = useState(false);
  const [journalForm, setJournalForm] = useState<JournalFormState>(emptyJournalForm());
  const [journalFormErr, setJournalFormErr] = useState<string | null>(null);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [submittingJournal, setSubmittingJournal] = useState(false);

  // ---- Routing guards -------------------------------------------
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // ---- Loaders --------------------------------------------------
  const reloadAccounts = () => {
    if (!user || !canRead) return;
    let cancelled = false;
    setLoadingAccounts(true);
    api
      .listAccounts({
        page: accountPage,
        pageSize,
        search: accountSearch || undefined,
        type: typeFilter || undefined,
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
    if (!user || !canRead) return;
    let cancelled = false;
    setLoadingJournal(true);
    api
      .listJournalEntries({
        page: journalPage,
        pageSize: 20,
        search: journalSearch || undefined,
        status: statusFilter || undefined,
      })
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
  }, [accountPage, accountSearch, typeFilter, user, canRead]);

  useEffect(() => {
    const cleanup = reloadJournal();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalPage, journalSearch, statusFilter, user, canRead]);

  // ---- Lookups for forms ----------------------------------------
  const accountById = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of accounts) m.set(a.id, a);
    return m;
  }, [accounts]);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.isActive && !a.deletedAt),
    [accounts],
  );

  // ---- Account form helpers -------------------------------------
  const setAccountField = <K extends keyof AccountFormState>(
    key: K,
    value: AccountFormState[K],
  ) => setAccountForm((f) => ({ ...f, [key]: value }));

  const onAccountTypeChange = (t: AccountTypeKey) => {
    setAccountForm((f) => ({
      ...f,
      type: t,
      normalBalance: NORMAL_BALANCE_FOR_TYPE[t],
    }));
  };

  const onEditAccount = (a: Account) => {
    setEditingAccountId(a.id);
    setAccountForm({
      code: a.code,
      name: a.name,
      nameAr: a.nameAr ?? '',
      type: a.type,
      normalBalance: a.normalBalance,
      parentId: a.parentId ?? '',
      isActive: a.isActive,
    });
    setAccountFormErr(null);
    setIsAccountFormOpen(true);
  };

  const onCancelEditAccount = () => {
    setEditingAccountId(null);
    setAccountForm(emptyAccountForm());
    setAccountFormErr(null);
    setIsAccountFormOpen(false);
  };

  const buildAccountPayload = (): CreateAccountInput | UpdateAccountInput => {
    const code = accountForm.code.trim();
    const name = accountForm.name.trim();
    if (!code) throw new Error('الرمز مطلوب');
    if (code.length > 32) throw new Error('الرمز يجب ألا يتجاوز 32 حرفاً');
    if (!/^[A-Za-z0-9._-]+$/.test(code)) {
      throw new Error('الرمز يجب أن يكون من [A-Za-z0-9._-]');
    }
    if (!name) throw new Error('الاسم مطلوب');
    if (
      accountForm.type !== 'ASSET' &&
      accountForm.type !== 'EXPENSE' &&
      accountForm.normalBalance !== 'CREDIT'
    ) {
      throw new Error('طبيعة الرصيد لا تطابق النوع المختار');
    }
    if (
      (accountForm.type === 'ASSET' || accountForm.type === 'EXPENSE') &&
      accountForm.normalBalance !== 'DEBIT'
    ) {
      throw new Error('طبيعة الرصيد يجب أن تكون مدين للأصل/مصروف');
    }
    const base = {
      name,
      nameAr: accountForm.nameAr.trim() || undefined,
      type: accountForm.type,
      normalBalance: accountForm.normalBalance,
      parentId: accountForm.parentId || undefined,
      isActive: accountForm.isActive,
    };
    if (editingAccountId) {
      return { ...base, parentId: accountForm.parentId || null };
    }
    return { code, ...base };
  };

  const onSubmitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountFormErr(null);
    setSubmittingAccount(true);
    try {
      const payload = buildAccountPayload();
      if (editingAccountId)
        await api.updateAccount(editingAccountId, payload as UpdateAccountInput);
      else await api.createAccount(payload as CreateAccountInput);
      onCancelEditAccount();
      reloadAccounts();
    } catch (err) {
      if (err instanceof ApiError) setAccountFormErr(err.message);
      else if (err instanceof Error) setAccountFormErr(err.message);
      else setAccountFormErr('فشلت العملية');
    } finally {
      setSubmittingAccount(false);
    }
  };

  const onDeleteAccount = async (a: Account) => {
    if (
      !window.confirm(
        `هل تريد حذف الحساب ${a.code} — ${a.name}؟\nسيتم إيقافه وحذفه برمجياً (لا يمكن حذف حساب مرتبط بقيود مرحّلة).`,
      )
    )
      return;
    setRowActionErr(null);
    try {
      await api.deleteAccount(a.id);
      if (editingAccountId === a.id) onCancelEditAccount();
      reloadAccounts();
    } catch (err) {
      setRowActionErr(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل الحذف',
      );
    }
  };

  // ---- Journal form helpers -------------------------------------
  const setJournalField = <K extends keyof JournalFormState>(
    key: K,
    value: JournalFormState[K],
  ) => setJournalForm((f) => ({ ...f, [key]: value }));

  const setLine = (idx: number, patch: Partial<LineFormState>) => {
    setJournalForm((f) => {
      const lines = f.lines.slice();
      lines[idx] = { ...lines[idx], ...patch };
      return { ...f, lines };
    });
  };

  const addLine = () =>
    setJournalForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));

  const removeLine = (idx: number) =>
    setJournalForm((f) => ({
      ...f,
      lines: f.lines.filter((_, i) => i !== idx),
    }));

  const onEditJournal = (j: JournalEntry) => {
    setEditingJournalId(j.id);
    setJournalForm({
      entryDate: j.entryDate ? j.entryDate.slice(0, 10) : '',
      reference: j.reference ?? '',
      description: j.description ?? '',
      notes: j.notes ?? '',
      lines:
        j.lines && j.lines.length >= 2
          ? j.lines.map((l) => ({
              accountId: l.debitAccountId ?? l.creditAccountId ?? '',
              description: l.description ?? '',
              debit: l.debit || '',
              credit: l.credit || '',
            }))
          : [emptyLine(), emptyLine()],
    });
    setJournalFormErr(null);
    setIsJournalFormOpen(true);
  };

  const onCancelEditJournal = () => {
    setEditingJournalId(null);
    setJournalForm(emptyJournalForm());
    setJournalFormErr(null);
    setIsJournalFormOpen(false);
  };

  const buildJournalPayload = ():
    | CreateJournalEntryInput
    | UpdateJournalEntryInput => {
    if (journalForm.lines.length < 2) {
      throw new Error('القيد يجب أن يحتوي على سطرين على الأقل');
    }
    const lines: CreateJournalEntryLineInput[] = [];
    for (const [idx, l] of journalForm.lines.entries()) {
      if (!l.accountId) throw new Error(`السطر ${idx + 1}: لم يتم اختيار حساب`);
      const d = Number(l.debit || '0');
      const c = Number(l.credit || '0');
      if (!Number.isFinite(d) || !Number.isFinite(c)) {
        throw new Error(`السطر ${idx + 1}: مبالغ غير صحيحة`);
      }
      if (d <= 0 && c <= 0) {
        throw new Error(`السطر ${idx + 1}: يجب إدخال مدين أو دائن`);
      }
      if (d > 0 && c > 0) {
        throw new Error(`السطر ${idx + 1}: لا يمكن أن يكون السطر مدين ودائن معاً`);
      }
      lines.push({
        accountId: l.accountId,
        description: l.description.trim() || undefined,
        debit: l.debit.trim() || '0.0000',
        credit: l.credit.trim() || '0.0000',
      });
    }
    const base = {
      entryDate: journalForm.entryDate || undefined,
      reference: journalForm.reference.trim() || undefined,
      description: journalForm.description.trim() || undefined,
      notes: journalForm.notes.trim() || undefined,
    };
    if (editingJournalId) {
      return { ...base, lines };
    }
    return { ...base, lines };
  };

  const onSubmitJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    setJournalFormErr(null);
    setSubmittingJournal(true);
    try {
      const payload = buildJournalPayload();
      if (editingJournalId)
        await api.updateJournalEntry(
          editingJournalId,
          payload as UpdateJournalEntryInput,
        );
      else
        await api.createJournalEntry(payload as CreateJournalEntryInput);
      onCancelEditJournal();
      reloadJournal();
    } catch (err) {
      if (err instanceof ApiError) setJournalFormErr(err.message);
      else if (err instanceof Error) setJournalFormErr(err.message);
      else setJournalFormErr('فشلت العملية');
    } finally {
      setSubmittingJournal(false);
    }
  };

  const onPostJournal = async (j: JournalEntry) => {
    if (!window.confirm(`هل تريد ترحيل القيد ${j.entryNumber} الآن؟ لا يمكن التراجع عن الترحيل.`))
      return;
    setRowActionErr(null);
    try {
      await api.postJournalEntry(j.id, {});
      reloadJournal();
    } catch (err) {
      setRowActionErr(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل الترحيل',
      );
    }
  };

  const onCancelJournal = async (j: JournalEntry) => {
    const reason = window.prompt('سبب الإلغاء (اختياري):') ?? undefined;
    setRowActionErr(null);
    try {
      await api.cancelJournalEntry(j.id, reason ? { reason } : {});
      reloadJournal();
    } catch (err) {
      setRowActionErr(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل الإلغاء',
      );
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <LoadingState message="جاري تحميل مركز المحاسبة..." />
      </main>
    );
  }

  if (!user || !canRead) {
    return (
      <main className="min-h-screen p-8">
        <AccessDeniedState
          title="غير مصرح بعرض المحاسبة"
          description="لا يملك حسابك الحالي صلاحية accounting.read المطلوبة للوصول إلى مركز المحاسبة."
          requiredPermission="accounting.read"
        />
      </main>
    );
  }

  const totalAccountsPages = Math.max(1, Math.ceil(accountsTotal / pageSize));
  const totalJournalPages = Math.max(1, Math.ceil(journalTotal / 20));

  // Live balance calculation for journal form
  const liveTotals = (() => {
    let td = 0;
    let tc = 0;
    for (const l of journalForm.lines) {
      const d = Number(l.debit);
      const c = Number(l.credit);
      if (Number.isFinite(d)) td += d;
      if (Number.isFinite(c)) tc += c;
    }
    return {
      td,
      tc,
      balanced: Math.abs(td - tc) < 1e-6 && journalForm.lines.length >= 2,
    };
  })();

  const postedJournalsCount = journal.filter((j) => j.status === 'POSTED').length;
  const draftJournalsCount = journal.filter((j) => j.status === 'DRAFT').length;

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Standardized Modern Page Header */}
      <PageHeader
        title="مركز المحاسبة"
        subtitle="إدارة القيود، الحسابات، التقارير، الإقفال، والمراجعة من مكان واحد."
        eyebrow="المحاسبة"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium transition-colors shadow-xs"
            >
              ← لوحة التحكم
            </Link>
          </div>
        }
      />

      {/* 2. Executive Quick Navigation Strip (Permission-Gated) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {canReadReports && (
          <Link
            href="/accounting/reports"
            className="p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-200 transition-all flex items-center justify-between group shadow-2xs"
          >
            <div>
              <div className="text-xs font-bold text-indigo-950 group-hover:text-indigo-600 transition-colors">
                القوائم المالية الختامية
              </div>
              <div className="text-[11px] text-indigo-600/80 mt-0.5">
                ميزان المراجعة، الدخل، والميزانية
              </div>
            </div>
            <span className="text-indigo-600 font-bold text-sm">←</span>
          </Link>
        )}

        {canReadRecon && (
          <Link
            href="/accounting/reconciliation"
            className="p-3.5 rounded-xl border border-teal-100 bg-teal-50/40 hover:bg-teal-50 hover:border-teal-200 transition-all flex items-center justify-between group shadow-2xs"
          >
            <div>
              <div className="text-xs font-bold text-teal-950 group-hover:text-teal-600 transition-colors">
                المطابقة والتسوية البنكية
              </div>
              <div className="text-[11px] text-teal-600/80 mt-0.5">
                مطابقة كشوف الحساب بالمدفوعات
              </div>
            </div>
            <span className="text-teal-600 font-bold text-sm">←</span>
          </Link>
        )}

        {canReadPeriodClose && (
          <Link
            href="/accounting/period-close"
            className="p-3.5 rounded-xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50 hover:border-purple-200 transition-all flex items-center justify-between group shadow-2xs"
          >
            <div>
              <div className="text-xs font-bold text-purple-950 group-hover:text-purple-600 transition-colors">
                إقفال الفترات والسنوات
              </div>
              <div className="text-[11px] text-purple-600/80 mt-0.5">
                قفل الفترات المحاسبية والسنة
              </div>
            </div>
            <span className="text-purple-600 font-bold text-sm">←</span>
          </Link>
        )}

        {canReadAuditLog && (
          <Link
            href="/admin/audit-logs"
            className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300 transition-all flex items-center justify-between group shadow-2xs"
          >
            <div>
              <div className="text-xs font-bold text-slate-800 group-hover:text-slate-900 transition-colors">
                سجل التدقيق والمراجعة
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                تتبع العمليات والمستخدمين
              </div>
            </div>
            <span className="text-slate-600 font-bold text-sm">←</span>
          </Link>
        )}
      </div>

      {/* 3. Executive KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="إجمالي دليل الحسابات"
          value={accountsTotal}
          helperText="حسابات معرفة في النظام"
          tone="info"
        />
        <KpiCard
          label="الحسابات النشطة"
          value={activeAccounts.length}
          helperText="جاهزة للتسجيل والقيود"
          tone="success"
        />
        <KpiCard
          label="إجمالي القيود اليومية"
          value={journalTotal}
          helperText="إجمالي القيود المسجلة"
          tone="neutral"
        />
        <KpiCard
          label="قيود مرحّلة (POSTED)"
          value={postedJournalsCount}
          helperText="مؤكدة في دفتر الأستاذ"
          tone="success"
        />
      </div>

      {/* Error Banners */}
      {rowActionErr && (
        <ErrorBanner
          title="خطأ في تنفيذ الإجراء"
          message={rowActionErr}
          tone="danger"
        />
      )}

      {/* 4. Split Layout: Chart of Accounts & Journal Entries */}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* ====== Column 1: Chart of Accounts ====== */}
        <SectionCard
          title="دليل الحسابات (Chart of Accounts)"
          description={`إجمالي ${accountsTotal} حساباً معرفاً في شركتك.`}
          actions={
            canCreateAccount ? (
              <button
                type="button"
                onClick={() => {
                  if (isAccountFormOpen && !editingAccountId) {
                    onCancelEditAccount();
                  } else {
                    setEditingAccountId(null);
                    setAccountForm(emptyAccountForm());
                    setIsAccountFormOpen(true);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs"
              >
                {isAccountFormOpen && !editingAccountId ? 'إغلاق النموذج' : '+ حساب جديد'}
              </button>
            ) : undefined
          }
        >
          {/* Account Form */}
          {isAccountFormOpen && (
            <form
              onSubmit={onSubmitAccount}
              className="mb-4 rounded-xl border border-slate-200 bg-slate-50/75 p-4 space-y-3"
            >
              <div className="text-xs font-bold text-slate-800 border-b border-slate-200/80 pb-1.5">
                {editingAccountId ? 'تعديل بيانات الحساب' : 'إضافة حساب جديد إلى الدليل'}
              </div>

              {accountFormErr && <ErrorBanner message={accountFormErr} tone="danger" />}

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-700">
                  <span className="block mb-1">الرمز (Code) *</span>
                  <input
                    value={accountForm.code}
                    onChange={(e) => setAccountField('code', e.target.value)}
                    disabled={!!editingAccountId}
                    placeholder="1010"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono disabled:bg-slate-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    dir="ltr"
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  <span className="block mb-1">الاسم *</span>
                  <input
                    value={accountForm.name}
                    onChange={(e) => setAccountField('name', e.target.value)}
                    placeholder="النقدية وما في حكمها"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  <span className="block mb-1">الاسم بالعربي (اختياري)</span>
                  <input
                    value={accountForm.nameAr}
                    onChange={(e) => setAccountField('nameAr', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  <span className="block mb-1">نوع الحساب *</span>
                  <select
                    value={accountForm.type}
                    onChange={(e) =>
                      onAccountTypeChange(e.target.value as AccountTypeKey)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t} — {arAccountType(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-700">
                  <span className="block mb-1">طبيعة الرصيد</span>
                  <input
                    value={arNormalBalance(accountForm.normalBalance)}
                    readOnly
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600 font-semibold"
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  <span className="block mb-1">حساب الأب (رئيسي)</span>
                  <select
                    value={accountForm.parentId}
                    onChange={(e) => setAccountField('parentId', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    dir="ltr"
                  >
                    <option value="">— حساب رئيسي مستقل —</option>
                    {activeAccounts
                      .filter((a) => a.id !== editingAccountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="acc-is-active"
                    checked={accountForm.isActive}
                    onChange={(e) => setAccountField('isActive', e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="acc-is-active" className="text-xs text-slate-700 font-medium">
                    الحساب نشط ويقبل تسجيل العمليات
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={onCancelEditAccount}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={
                    submittingAccount ||
                    (editingAccountId ? !canUpdateAccount : !canCreateAccount)
                  }
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40 shadow-xs"
                >
                  {submittingAccount
                    ? 'جاري الحفظ...'
                    : editingAccountId
                      ? 'حفظ التعديلات'
                      : 'إنشاء الحساب'}
                </button>
              </div>
            </form>
          )}

          {/* Account Filter Bar */}
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="search"
              value={accountSearch}
              onChange={(e) => {
                setAccountSearch(e.target.value);
                setAccountPage(1);
              }}
              placeholder="ابحث بالرمز أو اسم الحساب..."
              className="flex-1 min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              dir="rtl"
            />
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as typeof typeFilter);
                setAccountPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">كل الأنواع</option>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t} — {arAccountType(t)}
                </option>
              ))}
            </select>
          </div>

          {accountsErr && <ErrorBanner message={accountsErr} tone="danger" />}

          {/* Accounts Table */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200/80 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">الرمز</th>
                  <th className="py-2.5 px-3">اسم الحساب</th>
                  <th className="py-2.5 px-2">النوع</th>
                  <th className="py-2.5 px-2">الطبيعة</th>
                  <th className="py-2.5 px-2">الحالة</th>
                  <th className="py-2.5 px-2 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingAccounts ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      <LoadingState message="جاري تحميل الحسابات..." />
                    </td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      لا توجد حسابات مطابقة للبحث.
                    </td>
                  </tr>
                ) : (
                  accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900" dir="ltr">
                        {a.code}
                      </td>
                      <td className="py-2 px-3 text-slate-800 font-medium">
                        <div>{a.name}</div>
                        {a.nameAr && (
                          <div className="text-[10px] text-slate-400">{a.nameAr}</div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-slate-600 font-sans">
                        {arAccountType(a.type)}
                      </td>
                      <td className="py-2 px-2 text-slate-500">
                        {arNormalBalance(a.normalBalance)}
                      </td>
                      <td className="py-2 px-2">
                        {a.deletedAt ? (
                          <StatusBadge status="neutral" label="محذوف" />
                        ) : a.isActive ? (
                          <StatusBadge status="success" label="نشط" />
                        ) : (
                          <StatusBadge status="warning" label="موقوف" />
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            disabled={!canUpdateAccount || !!a.deletedAt}
                            onClick={() => onEditAccount(a)}
                            className="px-2 py-0.5 rounded text-[11px] border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            disabled={!canDeleteAccount || !!a.deletedAt}
                            onClick={() => onDeleteAccount(a)}
                            className="px-2 py-0.5 rounded text-[11px] border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 disabled:opacity-40"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Accounts Pagination */}
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              صفحة {accountPage} من {totalAccountsPages}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={accountPage <= 1}
                onClick={() => setAccountPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                السابق
              </button>
              <button
                type="button"
                disabled={accountPage >= totalAccountsPages}
                onClick={() => setAccountPage((p) => p + 1)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        </SectionCard>

        {/* ====== Column 2: Manual Journal Entries ====== */}
        <SectionCard
          title="القيود اليومية (Manual Journal Entries)"
          description={`إجمالي ${journalTotal} قيداً مسجلاً في النظام.`}
          actions={
            canCreateJournal ? (
              <button
                type="button"
                onClick={() => {
                  if (isJournalFormOpen && !editingJournalId) {
                    onCancelEditJournal();
                  } else {
                    setEditingJournalId(null);
                    setJournalForm(emptyJournalForm());
                    setIsJournalFormOpen(true);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors shadow-xs"
              >
                {isJournalFormOpen && !editingJournalId ? 'إغلاق النموذج' : '+ قيد جديد'}
              </button>
            ) : undefined
          }
        >
          {/* Journal Form */}
          {isJournalFormOpen && (
            <form
              onSubmit={onSubmitJournal}
              className="mb-4 rounded-xl border border-slate-200 bg-slate-50/75 p-4 space-y-3"
            >
              <div className="text-xs font-bold text-slate-800 border-b border-slate-200/80 pb-1.5">
                {editingJournalId ? 'تعديل مسودة القيد اليومي' : 'إنشاء قيد يدوي متوازن (DRAFT)'}
              </div>

              {journalFormErr && <ErrorBanner message={journalFormErr} tone="danger" />}

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-700">
                  <span className="block mb-1">تاريخ القيد</span>
                  <input
                    type="date"
                    value={journalForm.entryDate}
                    onChange={(e) => setJournalField('entryDate', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    dir="ltr"
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  <span className="block mb-1">المرجع (Reference)</span>
                  <input
                    value={journalForm.reference}
                    onChange={(e) => setJournalField('reference', e.target.value)}
                    placeholder="JV-2026-001"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    dir="ltr"
                  />
                </label>
                <label className="text-xs font-medium text-slate-700 col-span-2">
                  <span className="block mb-1">الوصف العام للقيد *</span>
                  <input
                    value={journalForm.description}
                    onChange={(e) => setJournalField('description', e.target.value)}
                    placeholder="تسوية مصروفات أو قيد افتتاحي..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </label>
                <label className="text-xs font-medium text-slate-700 col-span-2">
                  <span className="block mb-1">ملاحظات داخلية</span>
                  <textarea
                    rows={1}
                    value={journalForm.notes}
                    onChange={(e) => setJournalField('notes', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </label>
              </div>

              {/* Journal Lines Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">الحساب *</th>
                      <th className="py-2 px-2.5">البيان</th>
                      <th className="py-2 px-2.5">مدين (Debit)</th>
                      <th className="py-2 px-2.5">دائن (Credit)</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {journalForm.lines.map((line, idx) => {
                      const a = accountById.get(line.accountId);
                      const bothSet = Number(line.debit) > 0 && Number(line.credit) > 0;
                      const bothZero = Number(line.debit) === 0 && Number(line.credit) === 0;
                      const lineErr = bothSet || bothZero;
                      return (
                        <tr key={idx}>
                          <td className="py-1.5 px-2">
                            <select
                              value={line.accountId}
                              onChange={(e) =>
                                setLine(idx, { accountId: e.target.value })
                              }
                              className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs"
                              dir="rtl"
                            >
                              <option value="">— اختر حساباً —</option>
                              {activeAccounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.code} — {acc.name}
                                </option>
                              ))}
                            </select>
                            {a && (
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5" dir="ltr">
                                {a.type} • {arNormalBalance(a.normalBalance)}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              value={line.description}
                              onChange={(e) =>
                                setLine(idx, { description: e.target.value })
                              }
                              placeholder="بيان السطر..."
                              className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              value={line.debit}
                              onChange={(e) => setLine(idx, { debit: e.target.value })}
                              placeholder="0.00"
                              disabled={Number(line.credit) > 0}
                              className="w-20 rounded border border-slate-200 px-1.5 py-1 text-xs font-mono disabled:bg-slate-100"
                              dir="ltr"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              value={line.credit}
                              onChange={(e) => setLine(idx, { credit: e.target.value })}
                              placeholder="0.00"
                              disabled={Number(line.debit) > 0}
                              className="w-20 rounded border border-slate-200 px-1.5 py-1 text-xs font-mono disabled:bg-slate-100"
                              dir="ltr"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              disabled={journalForm.lines.length <= 2}
                              className="text-rose-500 hover:text-rose-700 disabled:opacity-30 text-xs"
                              title="حذف السطر"
                            >
                              ✕
                            </button>
                            {lineErr && (
                              <div className="text-[9px] text-rose-500">
                                {bothSet ? 'خطأ' : 'صفر'}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-xs">
                      <td colSpan={2} className="py-2 px-2.5 text-end text-slate-700">
                        الإجمالي:
                      </td>
                      <td className="py-2 px-2.5 font-mono text-blue-700" dir="ltr">
                        {liveTotals.td.toFixed(2)}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-blue-700" dir="ltr">
                        {liveTotals.tc.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {liveTotals.balanced ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            ✓ متزن
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            غير متزن
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={addLine}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
                >
                  + سطر قيد جديد
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCancelEditJournal}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={
                      submittingJournal ||
                      !liveTotals.balanced ||
                      (editingJournalId ? !canUpdateJournal : !canCreateJournal)
                    }
                    className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-40 shadow-xs"
                  >
                    {submittingJournal
                      ? 'جاري الحفظ...'
                      : editingJournalId
                        ? 'حفظ تعديل المسودة'
                        : 'إنشاء مسودة القيد'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Journal Filter Bar */}
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="search"
              value={journalSearch}
              onChange={(e) => {
                setJournalSearch(e.target.value);
                setJournalPage(1);
              }}
              placeholder="ابحث برقم القيد / الوصف / المرجع..."
              className="flex-1 min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              dir="rtl"
            />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                setJournalPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">كل الحالات</option>
              <option value="DRAFT">مسودة (DRAFT)</option>
              <option value="POSTED">مرحّل (POSTED)</option>
              <option value="CANCELLED">ملغى (CANCELLED)</option>
            </select>
          </div>

          {journalErr && <ErrorBanner message={journalErr} tone="danger" />}

          {/* Journal Table */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200/80 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">رقم القيد</th>
                  <th className="py-2.5 px-2">التاريخ</th>
                  <th className="py-2.5 px-2">الحالة</th>
                  <th className="py-2.5 px-2">المدين</th>
                  <th className="py-2.5 px-2">الدائن</th>
                  <th className="py-2.5 px-2 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingJournal ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      <LoadingState message="جاري تحميل القيود..." />
                    </td>
                  </tr>
                ) : journal.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      لا توجد قيود يومية مسجلة.
                    </td>
                  </tr>
                ) : (
                  journal.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900" dir="ltr">
                        {j.entryNumber}
                      </td>
                      <td className="py-2 px-2 text-slate-500 font-mono" dir="ltr">
                        {fmtDate(j.entryDate)}
                      </td>
                      <td className="py-2 px-2">
                        {j.status === 'POSTED' ? (
                          <StatusBadge status="success" label="مرحّل" />
                        ) : j.status === 'DRAFT' ? (
                          <StatusBadge status="warning" label="مسودة" />
                        ) : (
                          <StatusBadge status="neutral" label="ملغى" />
                        )}
                        {j._count && (
                          <span className="ms-1 text-[10px] text-slate-400 font-mono">
                            ({j._count.lines})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono font-semibold text-slate-800" dir="ltr">
                        {fmtMoney(j.totalDebit)}
                      </td>
                      <td className="py-2 px-2 font-mono font-semibold text-slate-800" dir="ltr">
                        {fmtMoney(j.totalCredit)}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            disabled={!canUpdateJournal || j.status !== 'DRAFT'}
                            onClick={() => onEditJournal(j)}
                            className="px-2 py-0.5 rounded text-[11px] border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            disabled={!canPostJournal || j.status !== 'DRAFT'}
                            onClick={() => onPostJournal(j)}
                            className="px-2 py-0.5 rounded text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-40"
                          >
                            ترحيل
                          </button>
                          <button
                            type="button"
                            disabled={!canCancelJournal || j.status !== 'DRAFT'}
                            onClick={() => onCancelJournal(j)}
                            className="px-2 py-0.5 rounded text-[11px] border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 disabled:opacity-40"
                          >
                            إلغاء
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Journal Pagination */}
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              صفحة {journalPage} من {totalJournalPages}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={journalPage <= 1}
                onClick={() => setJournalPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                السابق
              </button>
              <button
                type="button"
                disabled={journalPage >= totalJournalPages}
                onClick={() => setJournalPage((p) => p + 1)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      <p className="text-xs text-slate-400 text-center leading-relaxed">
        القيم والأرصدة المحاسبية تتبع معيار القيود المزدوجة الدقيقة. الترحيل ينقل القيد نهائياً لدفتر الأستاذ العام والقوائم المالية.
      </p>
    </main>
  );
}
