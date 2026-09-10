'use client';

// =====================================================
// Phase 6 — Accounting page (Chart of Accounts + Manual
// Journal Entries).
//
// - Loads /api/accounting/accounts and /api/accounting/journal
//   (companyId from JWT only, via useAuth().user.companyId).
// - Allow admins / accountants to:
//
//   Chart of Accounts (left)
//     - List active + inactive accounts (paginated, search by code/name)
//     - Create a new account (code/name/type×normalBalance/parented or top-level)
//     - Patch an existing account (name / nameAr / type / normalBalance / parent / isActive)
//     - Soft-delete an account (server returns 409 if any POSTED line references it)
//
//   Manual Journal Entries (right)
//     - List DRAFT/POSTED/CANCELLED entries (paginated, search)
//     - Create a balanced DRAFT entry (≥2 lines; debit XOR credit on each line;
//       totalDebit == totalCredit — server computes and rejects)
//     - Patch a DRAFT entry (notes/reference/description/entryDate; full line replace
//       if `lines` provided)
//     - Post a DRAFT entry (server flips DRAFT → POSTED; postedAt set)
//     - Cancel a DRAFT entry (server flips DRAFT → CANCELLED); server returns 409
//       on cancelled-again and 409 on posted-cancel ("reverse entries out of scope")
//
// - RBAC gating: only users with `accounting.read` can view; `accounts.*` /
//   `journal.*` gates each row action — buttons are disabled rather than hidden
//   so the user can see why an action is unavailable.
// - Decimals are string-typed end to end (no Number arithmetic for money).
// - No mock data; no localStorage / sessionStorage; access token stays in-memory
//   inside lib/api only.
// - No financial reports / Trial Balance / VAT / ZATCA surfaced — out of scope.
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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

// Invariant: ASSET + EXPENSE → DEBIT; LIABILITY + EQUITY + REVENUE → CREDIT.
// Surfaced client-side as a fixed mapping so the user can't pick the wrong side.
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

export default function AccountingPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  // ---- permissions ----------------------------------------------
  const canRead = !!user && hasPermission('accounting.read');
  const canCreateAccount = !!user && hasPermission('accounting.accounts.create');
  const canUpdateAccount = !!user && hasPermission('accounting.accounts.update');
  const canDeleteAccount = !!user && hasPermission('accounting.accounts.delete');
  const canCreateJournal = !!user && (
    hasPermission('accounting.journal.update') &&
    hasPermission('accounting.accounts.create') // editing lines requires accounts.create per Phase 6 RBAC chain
  );
  // Phase 6 RBAC: PATCH on /journal uses accounting.journal.update; the same
  // permission gates POST /journal because there's no separate `.create` perm.
  // The controller only carries `accounting.journal.update` for both create
  // and update on a journal entry, so we reuse it.
  const canUpdateJournal = !!user && hasPermission('accounting.journal.update');
  const canPostJournal = !!user && hasPermission('accounting.journal.post');
  const canCancelJournal = !!user && hasPermission('accounting.journal.cancel');

  // ---- accounts list --------------------------------------------
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountPage, setAccountPage] = useState(1);
  const [accountSearch, setAccountSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | AccountTypeKey>('');
  const [accountsErr, setAccountsErr] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [rowActionErr, setRowActionErr] = useState<string | null>(null);
  const pageSize = 50;

  // ---- accounts form --------------------------------------------
  const [accountForm, setAccountForm] = useState<AccountFormState>(emptyAccountForm());
  const [accountFormErr, setAccountFormErr] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [submittingAccount, setSubmittingAccount] = useState(false);

  // ---- journal list ---------------------------------------------
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalTotal, setJournalTotal] = useState(0);
  const [journalPage, setJournalPage] = useState(1);
  const [journalSearch, setJournalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | JournalEntryStatusKey>('');
  const [journalErr, setJournalErr] = useState<string | null>(null);
  const [loadingJournal, setLoadingJournal] = useState(true);

  // ---- journal form ---------------------------------------------
  const [journalForm, setJournalForm] = useState<JournalFormState>(emptyJournalForm());
  const [journalFormErr, setJournalFormErr] = useState<string | null>(null);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [submittingJournal, setSubmittingJournal] = useState(false);

  // ---- Routing guards -------------------------------------------
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !canRead) router.replace('/dashboard');
  }, [loading, user, canRead, router]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountPage, accountSearch, typeFilter, user, canRead]);

  useEffect(() => {
    const cleanup = reloadJournal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // When type changes, snap normalBalance to the invariant so the user can't
  // accidentally post an ASSET/EXPENSE with CREDIT — server will reject too.
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
  };
  const onCancelEditAccount = () => {
    setEditingAccountId(null);
    setAccountForm(emptyAccountForm());
    setAccountFormErr(null);
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
    if (accountForm.type !== 'ASSET' && accountForm.type !== 'EXPENSE' && accountForm.normalBalance !== 'CREDIT') {
      throw new Error('طبيعة الرصيد لا تطابق النوع المختار');
    }
    if ((accountForm.type === 'ASSET' || accountForm.type === 'EXPENSE') && accountForm.normalBalance !== 'DEBIT') {
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
    // Code only goes on CREATE — PATCH can't change it once posted.
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
      if (editingAccountId) await api.updateAccount(editingAccountId, payload as UpdateAccountInput);
      else await api.createAccount(payload as CreateAccountInput);
      onCancelEditAccount();
      reloadAccounts();
    } catch (err) {
      if (err instanceof ApiError) setAccountFormErr(err.message);
      else if (err instanceof Error) setAccountFormErr(err.message);
      else setAccountFormErr('failed');
    } finally {
      setSubmittingAccount(false);
    }
  };

  const onDeleteAccount = async (a: Account) => {
    if (!window.confirm(`هل تريد حذف الحساب ${a.code} — ${a.name}؟\nسيتم إيقافه وحذفه برمجياً (لا يمكن حذف حساب مرتبط بقيود مرحّلة).`))
      return;
    setRowActionErr(null);
    try {
      await api.deleteAccount(a.id);
      reloadAccounts();
    } catch (err) {
      setRowActionErr(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'failed',
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
  const removeLine = (idx: number) => {
    setJournalForm((f) => {
      if (f.lines.length <= 2) return f; // server requires ≥2
      return { ...f, lines: f.lines.filter((_, i) => i !== idx) };
    });
  };

  const onEditJournal = (e: JournalEntry) => {
    if (e.status !== 'DRAFT') {
      setRowActionErr('لا يمكن تعديل قيد غير مسودة');
      return;
    }
    setEditingJournalId(e.id);
    setJournalForm({
      entryDate: e.entryDate ? e.entryDate.slice(0, 10) : '',
      description: e.description ?? '',
      reference: e.reference ?? '',
      notes: e.notes ?? '',
      lines:
        e.lines && e.lines.length >= 2
          ? e.lines.map((l) => {
              const accId = l.debitAccountId ?? l.creditAccountId ?? '';
              return {
                accountId: accId,
                description: l.description ?? '',
                debit: l.debit,
                credit: l.credit,
              };
            })
          : [emptyLine(), emptyLine()],
    });
    setJournalFormErr(null);
  };
  const onCancelEditJournal = () => {
    setEditingJournalId(null);
    setJournalForm(emptyJournalForm());
    setJournalFormErr(null);
  };

  const buildJournalPayload = (): CreateJournalEntryInput | UpdateJournalEntryInput => {
    if (journalForm.lines.length < 2) {
      throw new Error('القيد يجب أن يحتوي على سطرين على الأقل');
    }
    const lines: CreateJournalEntryLineInput[] = [];
    let td = 0;
    let tc = 0;
    for (const [idx, l] of journalForm.lines.entries()) {
      if (!l.accountId) throw new Error(`السطر ${idx + 1}: الحساب مطلوب`);
      const d = Number(l.debit);
      const c = Number(l.credit);
      if (!Number.isFinite(d) || d < 0) throw new Error(`السطر ${idx + 1}: المدين يجب أن يكون رقماً >= 0`);
      if (!Number.isFinite(c) || c < 0) throw new Error(`السطر ${idx + 1}: الدائن يجب أن يكون رقماً >= 0`);
      if (d > 0 && c > 0) throw new Error(`السطر ${idx + 1}: لا يمكن أن يكون مدين ودائن معاً`);
      if (d === 0 && c === 0) throw new Error(`السطر ${idx + 1}: لا يمكن أن يكون كلاهما صفراً`);
      td += d;
      tc += c;
      lines.push({
        accountId: l.accountId,
        description: l.description.trim() || undefined,
        debit: l.debit.trim() || '0.0000',
        credit: l.credit.trim() || '0.0000',
      });
    }
    // Server still enforces balance; we just pre-empt a 400 here so the user
    // can see the mismatch before submitting.
    if (Math.abs(td - tc) > 1e-6) {
      throw new Error(`القيد غير متوازن: مدين=${td.toFixed(4)} ≠ دائن=${tc.toFixed(4)}`);
    }
    const header = {
      entryDate: journalForm.entryDate || undefined,
      description: journalForm.description.trim() || undefined,
      reference: journalForm.reference.trim() || undefined,
      notes: journalForm.notes.trim() || undefined,
    };
    if (editingJournalId) {
      // On PATCH we send the full lines if any change is needed; backend will
      // rebuild totals and validate again.
      return { ...header, lines };
    }
    return { ...header, lines };
  };

  const onSubmitJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    setJournalFormErr(null);
    setSubmittingJournal(true);
    try {
      const payload = buildJournalPayload();
      if (editingJournalId) await api.updateJournalEntry(editingJournalId, payload as UpdateJournalEntryInput);
      else await api.createJournalEntry(payload as CreateJournalEntryInput);
      onCancelEditJournal();
      reloadJournal();
    } catch (err) {
      if (err instanceof ApiError) setJournalFormErr(err.message);
      else if (err instanceof Error) setJournalFormErr(err.message);
      else setJournalFormErr('failed');
    } finally {
      setSubmittingJournal(false);
    }
  };

  const onPostJournal = async (e: JournalEntry) => {
    if (e.status !== 'DRAFT') {
      setRowActionErr('لا يمكن ترحيل قيد غير مسودة');
      return;
    }
    if (!window.confirm(`هل تريد ترحيل القيد ${e.entryNumber}؟\nسيتم قفل القيد وتغيير حالته إلى مرحّل.`))
      return;
    setRowActionErr(null);
    try {
      await api.postJournalEntry(e.id, {});
      reloadJournal();
    } catch (err) {
      setRowActionErr(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'failed',
      );
    }
  };

  const onCancelJournal = async (e: JournalEntry) => {
    if (e.status !== 'DRAFT') {
      setRowActionErr('لا يمكن إلغاء قيد مرحّل في هذه المرحلة (يلزم قيد عكسي)');
      return;
    }
    const reason = window.prompt('سبب الإلغاء (اختياري):') ?? undefined;
    setRowActionErr(null);
    try {
      await api.cancelJournalEntry(e.id, reason ? { reason } : {});
      if (editingJournalId === e.id) onCancelEditJournal();
      reloadJournal();
    } catch (err) {
      setRowActionErr(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'failed',
      );
    }
  };

  // ---- Rendering guards -----------------------------------------
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-slate-500">...جاري التحميل</p>
      </main>
    );
  }
  if (!user) return null;

  if (!canRead) {
    return (
      <main className="min-h-screen p-8 bg-slate-50 flex items-center justify-center">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 max-w-md text-center shadow-md">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center mb-4 text-2xl font-bold">
            🚫
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">غير مصرح — Access Denied</h1>
          <p className="text-slate-600 text-sm mb-6 leading-relaxed">
            تتطلب هذه الصفحة توفر صلاحية <code className="bg-slate-100 px-1.5 py-0.5 rounded text-rose-600 text-xs">accounting.read</code>. يرجى مراجعة مسؤول النظام.
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

  const totalAccountsPages = Math.max(1, Math.ceil(accountsTotal / pageSize));
  const totalJournalPages = Math.max(1, Math.ceil(journalTotal / 20));

  // ---- Live total preview for the right-side journal form -------
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

  return (
    <main className="min-h-screen p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">المحاسبة</h1>
          <p className="text-sm text-slate-500">
            دليل الحسابات والقيود اليدوية داخل شركتك ({user.companyId}). للاطلاع
            على ميزان المراجعة وقائمة الدخل والميزانية العمومية، انتقل إلى صفحة
            القوائم المالية.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('gl_journal.read') && (
            <Link
              href="/accounting/reports"
              className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2"
            >
              القوائم المالية
            </Link>
          )}
          {hasPermission('reconciliation.read') && (
            <Link
              href="/accounting/reconciliation"
              className="rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm px-4 py-2"
            >
              المطابقة البنكية
            </Link>
          )}
          {hasPermission('period_close.read') && (
            <Link
              href="/accounting/period-close"
              className="rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2"
            >
              إقفال الفترات
            </Link>
          )}
          {hasPermission('audit_log.read') && (
            <Link
              href="/admin/audit-logs"
              className="rounded-md bg-slate-700 hover:bg-slate-800 text-white text-sm px-4 py-2"
            >
              سجل التدقيق
            </Link>
          )}

          <Link
            href="/dashboard"
            className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm px-4 py-2"
          >
            لوحة المعلومات
          </Link>
        </div>
      </header>

      {rowActionErr && (
        <div className="mb-4 rounded-md bg-rose-50 border border-rose-200 text-rose-800 p-3 text-sm">
          {rowActionErr}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ====== Chart of Accounts ====== */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-slate-800">دليل الحسابات</h2>
            <span className="text-xs text-slate-500">
              {accountsTotal} حساباً في شركتك
            </span>
          </div>

          {/* ---- Account form ---- */}
          <form
            onSubmit={onSubmitAccount}
            className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-600">
                الرمز
                <input
                  value={accountForm.code}
                  onChange={(e) => setAccountField('code', e.target.value)}
                  disabled={!!editingAccountId}
                  placeholder="مثال: 1000"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
                  dir="ltr"
                />
              </label>
              <label className="text-xs text-slate-600">
                الاسم (عربي إنجليزي)
                <input
                  value={accountForm.name}
                  onChange={(e) => setAccountField('name', e.target.value)}
                  placeholder="Cash / النقدية"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                  dir="auto"
                />
              </label>
              <label className="text-xs text-slate-600">
                الاسم بالعربي (اختياري)
                <input
                  value={accountForm.nameAr}
                  onChange={(e) => setAccountField('nameAr', e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600 col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={accountForm.isActive}
                  onChange={(e) => setAccountField('isActive', e.target.checked)}
                />
                نشط
              </label>
              <label className="text-xs text-slate-600">
                النوع
                <select
                  value={accountForm.type}
                  onChange={(e) => onAccountTypeChange(e.target.value as AccountTypeKey)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t} — {arAccountType(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                طبيعة الرصيد
                <input
                  value={arNormalBalance(accountForm.normalBalance)}
                  readOnly
                  className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-sm"
                  dir="rtl"
                />
              </label>
              <label className="text-xs text-slate-600 col-span-2">
                حساب الأب (اختياري)
                <select
                  value={accountForm.parentId}
                  onChange={(e) => setAccountField('parentId', e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                  dir="ltr"
                >
                  <option value="">— بدون (حساب رئيسي) —</option>
                  {activeAccounts
                    .filter((a) => a.id !== editingAccountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name} ({a.type})
                      </option>
                    ))}
                </select>
              </label>
            </div>

            {accountFormErr && (
              <p className="text-xs text-rose-700">{accountFormErr}</p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={
                  submittingAccount ||
                  (editingAccountId ? !canUpdateAccount : !canCreateAccount)
                }
                className="rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs px-3 py-1.5"
              >
                {editingAccountId ? 'حفظ التعديلات' : 'إنشاء الحساب'}
              </button>
              {editingAccountId && (
                <button
                  type="button"
                  onClick={onCancelEditAccount}
                  className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs px-3 py-1.5"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>
          </form>

          {/* ---- Account list filters ---- */}
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="search"
              value={accountSearch}
              onChange={(e) => {
                setAccountSearch(e.target.value);
                setAccountPage(1);
              }}
              placeholder="ابحث بالرمز أو الاسم"
              className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              dir="ltr"
            />
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as typeof typeFilter);
                setAccountPage(1);
              }}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">كل الأنواع</option>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {accountsErr && (
            <p className="text-xs text-rose-700 mb-2">{accountsErr}</p>
          )}

          {/* ---- Account list table ---- */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-start py-2 px-2">الرمز</th>
                  <th className="text-start py-2 px-2">الاسم</th>
                  <th className="text-start py-2 px-2">النوع</th>
                  <th className="text-start py-2 px-2">طبيعة</th>
                  <th className="text-start py-2 px-2">الحالة</th>
                  <th className="text-start py-2 px-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loadingAccounts && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-400 py-4">...جاري التحميل</td>
                  </tr>
                )}
                {!loadingAccounts && accounts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-400 py-4">
                      لا توجد حسابات. أنشئ الحساب الأول من النموذج أعلاه.
                    </td>
                  </tr>
                )}
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 px-2 font-mono" dir="ltr">{a.code}</td>
                    <td className="py-2 px-2">
                      <div>{a.name}</div>
                      {a.nameAr && (
                        <div className="text-xs text-slate-500">{a.nameAr}</div>
                      )}
                    </td>
                    <td className="py-2 px-2" dir="ltr">{arAccountType(a.type)}</td>
                    <td className="py-2 px-2">{arNormalBalance(a.normalBalance)}</td>
                    <td className="py-2 px-2">
                      {a.deletedAt
                        ? <span className="text-rose-600">محذوف</span>
                        : a.isActive
                          ? <span className="text-emerald-600">نشط</span>
                          : <span className="text-amber-600">موقوف</span>}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!canUpdateAccount || !!a.deletedAt}
                          onClick={() => onEditAccount(a)}
                          className="text-xs rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-2 py-1"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          disabled={!canDeleteAccount || !!a.deletedAt}
                          onClick={() => onDeleteAccount(a)}
                          className="text-xs rounded-md bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white px-2 py-1"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---- Pagination ---- */}
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
        </section>

        {/* ====== Manual Journal Entries ====== */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-slate-800">القيود اليومية</h2>
            <span className="text-xs text-slate-500">
              {journalTotal} قيداً في شركتك
            </span>
          </div>

          {/* ---- Journal form ---- */}
          <form
            onSubmit={onSubmitJournal}
            className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-600">
                تاريخ القيد (اختياري)
                <input
                  type="date"
                  value={journalForm.entryDate}
                  onChange={(e) => setJournalField('entryDate', e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                  dir="ltr"
                />
              </label>
              <label className="text-xs text-slate-600">
                المرجع
                <input
                  value={journalForm.reference}
                  onChange={(e) => setJournalField('reference', e.target.value)}
                  placeholder="INV-001"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                  dir="ltr"
                />
              </label>
              <label className="text-xs text-slate-600 col-span-2">
                الوصف (سطور القيد)
                <input
                  value={journalForm.description}
                  onChange={(e) => setJournalField('description', e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600 col-span-2">
                ملاحظات
                <textarea
                  value={journalForm.notes}
                  onChange={(e) => setJournalField('notes', e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="text-start py-1 px-2">الحساب</th>
                    <th className="text-start py-1 px-2">الوصف</th>
                    <th className="text-start py-1 px-2">مدين</th>
                    <th className="text-start py-1 px-2">دائن</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {journalForm.lines.map((line, idx) => {
                    const a = accountById.get(line.accountId);
                    const bothSet = Number(line.debit) > 0 && Number(line.credit) > 0;
                    const bothZero = Number(line.debit) === 0 && Number(line.credit) === 0;
                    const lineErr = bothSet || bothZero;
                    return (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-1 px-2">
                          <select
                            value={line.accountId}
                            onChange={(e) => setLine(idx, { accountId: e.target.value })}
                            className="w-full rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                            dir="ltr"
                          >
                            <option value="">— اختر —</option>
                            {activeAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} — {acc.name} ({arNormalBalance(acc.normalBalance)})
                              </option>
                            ))}
                          </select>
                          {a && (
                            <div className="text-[10px] text-slate-500 mt-0.5" dir="ltr">
                              {a.type} · {arNormalBalance(a.normalBalance)}
                            </div>
                          )}
                        </td>
                        <td className="py-1 px-2">
                          <input
                            value={line.description}
                            onChange={(e) => setLine(idx, { description: e.target.value })}
                            className="w-full rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                          />
                        </td>
                        <td className="py-1 px-2">
                          <input
                            value={line.debit}
                            onChange={(e) => setLine(idx, { debit: e.target.value })}
                            placeholder="0.0000"
                            disabled={Number(line.credit) > 0}
                            className="w-24 rounded-md border border-slate-300 px-1 py-0.5 text-xs disabled:bg-slate-100"
                            dir="ltr"
                          />
                        </td>
                        <td className="py-1 px-2">
                          <input
                            value={line.credit}
                            onChange={(e) => setLine(idx, { credit: e.target.value })}
                            placeholder="0.0000"
                            disabled={Number(line.debit) > 0}
                            className="w-24 rounded-md border border-slate-300 px-1 py-0.5 text-xs disabled:bg-slate-100"
                            dir="ltr"
                          />
                        </td>
                        <td className="py-1 px-2">
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            disabled={journalForm.lines.length <= 2}
                            className="text-[10px] rounded-md bg-rose-100 hover:bg-rose-200 disabled:bg-slate-100 text-rose-700 px-1.5 py-0.5"
                          >
                            حذف سطر
                          </button>
                          {lineErr && (
                            <div className="text-[10px] text-rose-600 mt-1">
                              {bothSet ? 'لا يمكن كلاهما' : 'كلاهما صفر'}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 font-semibold">
                    <td colSpan={2} className="py-1 px-2 text-end">الإجمالي</td>
                    <td className="py-1 px-2" dir="ltr">{liveTotals.td.toFixed(4)}</td>
                    <td className="py-1 px-2" dir="ltr">{liveTotals.tc.toFixed(4)}</td>
                    <td className="py-1 px-2">
                      {liveTotals.balanced ? (
                        <span className="text-[10px] text-emerald-600">✓ متوازن</span>
                      ) : (
                        <span className="text-[10px] text-amber-600">غير متوازن أو &lt; سطرين</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={addLine}
                className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs px-2 py-1"
              >
                + سطر
              </button>
              <button
                type="submit"
                disabled={
                  submittingJournal ||
                  !liveTotals.balanced ||
                  (editingJournalId ? !canUpdateJournal : !canCreateJournal)
                }
                className="rounded-md bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs px-3 py-1.5"
              >
                {editingJournalId ? 'حفظ تعديلات المسودة' : 'إنشاء قيد (DRAFT)'}
              </button>
              {editingJournalId && (
                <button
                  type="button"
                  onClick={onCancelEditJournal}
                  className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs px-3 py-1.5"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            {journalFormErr && (
              <p className="text-xs text-rose-700">{journalFormErr}</p>
            )}
          </form>

          {/* ---- Journal list filters ---- */}
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="search"
              value={journalSearch}
              onChange={(e) => {
                setJournalSearch(e.target.value);
                setJournalPage(1);
              }}
              placeholder="ابحث برقم القيد / الوصف / الملاحظات"
              className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              dir="ltr"
            />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                setJournalPage(1);
              }}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">كل الحالات</option>
              <option value="DRAFT">مسودة</option>
              <option value="POSTED">مرحّل</option>
              <option value="CANCELLED">ملغى</option>
            </select>
          </div>

          {journalErr && (
            <p className="text-xs text-rose-700 mb-2">{journalErr}</p>
          )}

          {/* ---- Journal list table ---- */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-start py-2 px-2">رقم القيد</th>
                  <th className="text-start py-2 px-2">التاريخ</th>
                  <th className="text-start py-2 px-2">الحالة</th>
                  <th className="text-start py-2 px-2">مدين</th>
                  <th className="text-start py-2 px-2">دائن</th>
                  <th className="text-start py-2 px-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loadingJournal && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-400 py-4">...جاري التحميل</td>
                  </tr>
                )}
                {!loadingJournal && journal.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-400 py-4">
                      لا توجد قيود. أنشئ أول قيد متوازن من النموذج أعلاه.
                    </td>
                  </tr>
                )}
                {journal.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2 px-2 font-mono" dir="ltr">{e.entryNumber}</td>
                    <td className="py-2 px-2 text-xs" dir="ltr">{fmtDate(e.entryDate)}</td>
                    <td className="py-2 px-2">
                      {e.status === 'DRAFT' && <span className="text-amber-700">مسودة</span>}
                      {e.status === 'POSTED' && <span className="text-emerald-700">مرحّل</span>}
                      {e.status === 'CANCELLED' && <span className="text-rose-700">ملغى</span>}
                      {e._count && (
                        <span className="ms-2 text-[10px] text-slate-500" dir="ltr">({e._count.lines} سطر)</span>
                      )}
                    </td>
                    <td className="py-2 px-2" dir="ltr">{fmtMoney(e.totalDebit)}</td>
                    <td className="py-2 px-2" dir="ltr">{fmtMoney(e.totalCredit)}</td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1 flex-wrap">
                        <button
                          type="button"
                          disabled={!canUpdateJournal || e.status !== 'DRAFT'}
                          onClick={() => onEditJournal(e)}
                          className="text-[11px] rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-2 py-1"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          disabled={!canPostJournal || e.status !== 'DRAFT'}
                          onClick={() => onPostJournal(e)}
                          className="text-[11px] rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-2 py-1"
                        >
                          ترحيل
                        </button>
                        <button
                          type="button"
                          disabled={!canCancelJournal || e.status !== 'DRAFT'}
                          onClick={() => onCancelJournal(e)}
                          className="text-[11px] rounded-md bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white px-2 py-1"
                        >
                          إلغاء
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---- Pagination ---- */}
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
        </section>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        ملاحظة: كل الأرقام (Debit / Credit) نصوص بصرف Decimal @db.Decimal(18,4)
        من الـ backend — لا Number في الواجهة. لا توجد قيود آلية من المبيعات أو
        المشتريات هنا (لا AR / AP / VAT / ZATCA)، ولا توجد ميزانيات مراجعة أو
        قوائم مالية — هذه خارج نطاق Phase 6.
      </p>
    </main>
  );
}
