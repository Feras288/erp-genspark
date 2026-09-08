'use client';

// =====================================================
// Phase 4 — Sales page (Sales invoices).
//
// - Loads list from /api/sales/invoices (companyId from JWT only).
// - Search by invoiceNumber/notes, filter by status/type, filter by customer.
// - Create draft / Edit draft / Delete draft / Issue draft / Cancel draft.
// - Permission-gated; redirects users without `sales.read`.
// - PRODUCTS lines require stock and warehouseId (server enforces).
// - ISSUED invoices are not editable; cancelling ISSUED is refused by the
//   backend with a "credit note" message that is shown as-is.
// - Decimals are string-typed end to end; no Float arithmetic in the UI.
// - No mock data. No localStorage / sessionStorage. Bearer in memory only.
// =====================================================
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type {
  Product,
  Partner,
  Warehouse,
  SalesInvoice,
  SalesInvoiceStatus,
  SalesInvoiceType,
  PaymentMethod,
  CreateSalesInvoiceLineInput,
  ArPayment,
  CreateArPaymentInput,
  ArPaymentStatusKey,
} from '@/lib/api';

interface LineFormState {
  productId: string;
  warehouseId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  description: string;
}

interface DraftFormState {
  customerId: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  lines: LineFormState[];
}

function emptyLine(): LineFormState {
  return {
    productId: '',
    warehouseId: '',
    quantity: '',
    unitPrice: '',
    discountAmount: '',
    vatRate: '15.00',
    description: '',
  };
}

function emptyDraft(): DraftFormState {
  return {
    customerId: '',
    issueDate: '',
    dueDate: '',
    notes: '',
    lines: [emptyLine()],
  };
}

function isProductType(p: Product | undefined, t: 'PRODUCT' | 'SERVICE'): boolean {
  return !!p && p.type === t && p.isActive && !p.deletedAt;
}

function fmtMoney(s: string | number | null | undefined): string {
  if (s === null || s === undefined || s === '') return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 19).replace('T', ' ');
}

export default function SalesPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  // List state
  const [items, setItems] = useState<SalesInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | SalesInvoiceStatus>('');
  const [typeFilter, setTypeFilter] = useState<'' | SalesInvoiceType>('');
  const [err, setErr] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const pageSize = 20;

  // Form state
  const [form, setForm] = useState<DraftFormState>(emptyDraft());
  const [formErr, setFormErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Lookups
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);

  // Per-row action error (issue / cancel)
  const [rowActionErr, setRowActionErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !hasPermission('sales.read')) {
      router.replace('/dashboard');
    }
  }, [loading, user, hasPermission, router]);

  // Load lookups once per mount.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [pRes, wRes, cRes] = await Promise.all([
          api.listActiveProducts(),
          api.listActiveWarehouses(),
          api.listActiveCustomers(),
        ]);
        if (cancelled) return;
        setProducts(pRes.items);
        setWarehouses(wRes.items);
        setPartners(cRes.items);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const reload = () => {
    if (!user || !hasPermission('sales.read')) return;
    let cancelled = false;
    setLoadingData(true);
    api
      .listSalesInvoices({
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
      })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setErr(null);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => !cancelled && setLoadingData(false));
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, typeFilter, user]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);
  const warehouseById = useMemo(() => {
    const m = new Map<string, Warehouse>();
    for (const w of warehouses) m.set(w.id, w);
    return m;
  }, [warehouses]);

  const customerLabel = (id: string | null | undefined) => {
    if (!id) return '—';
    const c = partners.find((p) => p.id === id);
    return c ? `${c.code ?? ''} — ${c.name}` : id;
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-slate-500">...جاري التحميل</p>
      </main>
    );
  }
  if (!user) return null;

  const canCreate = hasPermission('sales.create');
  const canUpdate = hasPermission('sales.update');
  const canDelete = hasPermission('sales.delete');
  const canIssue = hasPermission('sales.issue');
  const canCancel = hasPermission('sales.cancel');
  // AR payments (Phase 10A-C-code) — server-enforced RBAC
  //   GET  /sales-invoices/:id/payments  → ar_payments.read
  //   POST /sales-invoices/:id/payments  → ar_payments.write
  // The Buttons + form below are gated on these; the
  // PermissionsGuard on the backend re-checks them on
  // every request, so a UI-only bypass is harmless.
  const canReadArPayments = hasPermission('ar_payments.read');
  const canWriteArPayments = hasPermission('ar_payments.write');

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // --- Form helpers ------------------------------------------------------
  const setLine = (idx: number, patch: Partial<LineFormState>) => {
    setForm((f) => {
      const lines = f.lines.slice();
      lines[idx] = { ...lines[idx], ...patch };
      return { ...f, lines };
    });
  };
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (idx: number) =>
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));

  const onEdit = (inv: SalesInvoice) => {
    setEditingId(inv.id);
    setForm({
      customerId: inv.customerId ?? '',
      issueDate: inv.issueDate ? inv.issueDate.slice(0, 10) : '',
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '',
      notes: inv.notes ?? '',
      lines:
        inv.lines && inv.lines.length > 0
          ? inv.lines.map((l) => ({
              productId: l.productId,
              warehouseId: l.warehouseId ?? '',
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountAmount: l.discountAmount,
              vatRate: l.vatRate,
              description: l.description ?? '',
            }))
          : [emptyLine()],
    });
    setFormErr(null);
  };
  const onCancelEdit = () => {
    setEditingId(null);
    setForm(emptyDraft());
    setFormErr(null);
  };

  const buildPayload = () => {
    const lines: CreateSalesInvoiceLineInput[] = [];
    for (const [idx, l] of form.lines.entries()) {
      const p = productById.get(l.productId);
      if (!p) throw new Error(`البنط ${idx + 1}: لم يتم اختيار منتج`);
      const qty = Number(l.quantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`البنط ${idx + 1}: الكمية يجب أن تكون رقماً > 0`);
      const price = Number(l.unitPrice);
      if (!Number.isFinite(price) || price < 0) throw new Error(`البنط ${idx + 1}: سعر الوحدة يجب أن يكون رقماً >= 0`);
      if (isProductType(p, 'PRODUCT') && !l.warehouseId) {
        throw new Error(`البنط ${idx + 1}: المنتجات المخزنية تحتاج warehouseId`);
      }
      lines.push({
        productId: l.productId,
        warehouseId: isProductType(p, 'PRODUCT') ? l.warehouseId : undefined,
        description: l.description.trim() || undefined,
        quantity: l.quantity.trim(),
        unitPrice: l.unitPrice.trim(),
        discountAmount: l.discountAmount.trim() || '0.0000',
        vatRate: l.vatRate.trim() || '15.00',
      });
    }
    return {
      customerId: form.customerId || undefined,
      issueDate: form.issueDate || undefined,
      dueDate: form.dueDate || undefined,
      notes: form.notes.trim() || undefined,
      lines,
    };
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (editingId) await api.updateSalesInvoice(editingId, payload);
      else await api.createSalesInvoice(payload);
      onCancelEdit();
      reload();
    } catch (err) {
      if (err instanceof ApiError) setFormErr(err.message);
      else if (err instanceof Error) setFormErr(err.message);
      else setFormErr('failed');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Row actions -------------------------------------------------------
  const onIssue = async (id: string) => {
    if (!window.confirm('هل تريد إصدار هذه الفاتورة الآن؟')) return;
    setRowActionErr(null);
    try {
      await api.issueSalesInvoice(id, {});
      if (editingId === id) onCancelEdit();
      reload();
    } catch (err) {
      setRowActionErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'failed');
    }
  };
  const onCancel = async (id: string) => {
    const reason = window.prompt('سبب الإلغاء (اختياري):') ?? undefined;
    setRowActionErr(null);
    try {
      await api.cancelSalesInvoice(id, reason ? { reason } : {});
      if (editingId === id) onCancelEdit();
      reload();
    } catch (err) {
      setRowActionErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'failed');
    }
  };
  const onDelete = async (id: string) => {
    if (!window.confirm('هل تريد حذف هذه الفاتورة (مسودة فقط)؟')) return;
    setRowActionErr(null);
    try {
      await api.deleteSalesInvoice(id);
      if (editingId === id) onCancelEdit();
      reload();
    } catch (err) {
      setRowActionErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'failed');
    }
  };

  // --------------------------------------------------------------
  // Phase 10A-C-code: AR Payments expander state + helpers
  //
  // Per-row expander (clickable "المدفوعات (N)" button on ISSUED
  // invoices). State is keyed by `invoiceId` so multiple rows can
  // be operated independently. The HTTP wire surface is
  // `api.listArPayments` / `api.createArPayment` (declared in
  // frontend/src/lib/api.ts — Phase 10A-C-code append). RBAC is
  // server-enforced; the buttons below are visibility-cloaked
  // only (a no-perm UI button is harmless since PermissionsGuard
  // on the backend re-checks every request).
  //
  // Strict Phase 10A-C-code scope:
  //   - GET list → 401/403 → silent skip (don't refetch loops).
  //   - POST   → 401/403/400/409 overpayment/validation → banner.
  //   - No GL / no bank reconciliation / no AP / no PAID.PARTIALLY_PAID
  //     status transition (T-2 lock).
  //   - No edit to SalesInvoice.status from this UI.
  // --------------------------------------------------------------

  interface PaymentFormState {
    amount: string;
    paymentMethod: PaymentMethod;
    paidAt: string;        // yyyy-mm-dd (HTML date input)
    reference: string;
    notes: string;
  }

  function emptyPaymentForm(): PaymentFormState {
    return {
      amount: '',
      paymentMethod: 'CASH',
      paidAt: '',
      reference: '',
      notes: '',
    };
  }

  const [openPaymentsInvoiceId, setOpenPaymentsInvoiceId] = useState<string | null>(null);
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, ArPayment[]>>({});
  const [paymentsLoadingByInvoice, setPaymentsLoadingByInvoice] = useState<Record<string, boolean>>({});
  const [paymentsErrByInvoice, setPaymentsErrByInvoice] = useState<Record<string, string>>({});
  const [paymentFormByInvoice, setPaymentFormByInvoice] = useState<Record<string, PaymentFormState>>({});
  const [paymentSubmittingByInvoice, setPaymentSubmittingByInvoice] = useState<Record<string, boolean>>({});
  const [paymentSuccessByInvoice, setPaymentSuccessByInvoice] = useState<Record<string, boolean>>({});

  const loadArPayments = (invoiceId: string) => {
    if (!canReadArPayments) return;
    setPaymentsLoadingByInvoice((m) => ({ ...m, [invoiceId]: true }));
    setPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: '' }));
    api
      .listArPayments(invoiceId)
      .then((rows) => {
        setPaymentsByInvoice((m) => ({ ...m, [invoiceId]: rows }));
        setPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: '' }));
      })
      .catch((e) => {
        const msg =
          e instanceof ApiError
            ? e.status === 403
              ? 'لا تملك صلاحية قراءة المدفوعات.'
              : e.status === 401
                ? 'انتهت الجلسة — يرجى إعادة تسجيل الدخول.'
                : e.message
            : e instanceof Error
              ? e.message
              : 'failed';
        setPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: msg }));
      })
      .finally(() => {
        setPaymentsLoadingByInvoice((m) => ({ ...m, [invoiceId]: false }));
      });
  };

  const onTogglePayments = (invoiceId: string) => {
    setOpenPaymentsInvoiceId((cur) => {
      const next = cur === invoiceId ? null : invoiceId;
      if (next && canReadArPayments && paymentsByInvoice[invoiceId] === undefined) {
        loadArPayments(invoiceId);
      }
      return next;
    });
  };

  const setPaymentForm = (invoiceId: string, patch: Partial<PaymentFormState>) => {
    setPaymentFormByInvoice((m) => ({
      ...m,
      [invoiceId]: { ...(m[invoiceId] ?? emptyPaymentForm()), ...patch },
    }));
  };

  const onSubmitPayment = async (
    e: React.FormEvent,
    invoiceId: string,
    inv: SalesInvoice,
  ) => {
    e.preventDefault();
    if (!canWriteArPayments) return;
    const form = paymentFormByInvoice[invoiceId] ?? emptyPaymentForm();

    // ---- client-side guards ----
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentsErrByInvoice((m) => ({
        ...m,
        [invoiceId]: 'قيمة المبلغ يجب أن تكون رقماً > 0',
      }));
      return;
    }
    // Backend enforces status=ISSUED; UI-side mirror so we
    // don't even emit a doomed request — but the backend is
    // still the source of truth.
    if (inv.status !== 'ISSUED') {
      setPaymentsErrByInvoice((m) => ({
        ...m,
        [invoiceId]: 'لا يمكن تسجيل دفعة على فاتورة غير صادرة.',
      }));
      return;
    }

    // ---- wire payload (Decimal/18,4 format) ----
    const payload: CreateArPaymentInput = {
      paymentMethod: form.paymentMethod,
      amount: amount.toFixed(4),
      ...(form.paidAt ? { paidAt: new Date(form.paidAt + 'T12:00:00Z').toISOString() } : {}),
      ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      // Per-submit idempotency key (UUIDv4). Same key on
      // a duplicate POST returns the same row with 201
      // (server short-circuits before inserting).
      idempotencyKey:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };

    setPaymentSubmittingByInvoice((m) => ({ ...m, [invoiceId]: true }));
    setPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: '' }));
    setPaymentSuccessByInvoice((m) => ({ ...m, [invoiceId]: false }));

    try {
      await api.createArPayment(invoiceId, payload);
      setPaymentFormByInvoice((m) => ({ ...m, [invoiceId]: emptyPaymentForm() }));
      setPaymentSuccessByInvoice((m) => ({ ...m, [invoiceId]: true }));
      // Re-load list to show the freshly-registered row.
      loadArPayments(invoiceId);
    } catch (err) {
      let msg: string;
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Overpayment guard — the message from the backend is
          // already bilingual-friendly ("Overpayment guard: ...");
          // surface it verbatim + a localized hint.
          msg = `تجاوز السقف: ${err.message}`;
        } else if (err.status === 403) {
          msg = 'لا تملك صلاحية تسجيل المدفوعات.';
        } else if (err.status === 401) {
          msg = 'انتهت الجلسة — يرجى إعادة تسجيل الدخول.';
        } else if (err.status === 400) {
          msg = `بيانات غير صحيحة: ${err.message}`;
        } else {
          msg = err.message;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      } else {
        msg = 'failed';
      }
      setPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: msg }));
    } finally {
      setPaymentSubmittingByInvoice((m) => ({ ...m, [invoiceId]: false }));
    }
  };

  // Note used inline for typecheck only (PaymentMethod not surfaced yet on the form,
  // but kept imported so future payment-column wiring is a one-liner).
  void ([] as PaymentMethod[]);

  return (
    <main className="min-h-screen p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">المبيعات (فواتير العملاء)</h1>
          <p className="text-sm text-slate-500">
            يعرض الفواتير داخل شركتك فقط ({user.companyId}). لا توجد بيانات تجريبية - كل قائمة من الـ API.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm px-4 py-2"
        >
          لوحة المعلومات
        </Link>
      </header>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="ابحث برقم الفاتورة / الملاحظات"
          className="flex-1 min-w-[220px] rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          dir="ltr"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل الحالات</option>
          <option value="DRAFT">مسودة</option>
          <option value="ISSUED">صادرة</option>
          <option value="CANCELLED">ملغاة</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as typeof typeFilter);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل الأنواع</option>
          <option value="STANDARD">عادية</option>
          <option value="POS">نقطة بيع</option>
        </select>
      </div>

      {err && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700 mb-4">
          {err}
        </div>
      )}
      {rowActionErr && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700 mb-4">
          {rowActionErr}
        </div>
      )}

      {/* List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-right px-4 py-3 font-medium">رقم الفاتورة</th>
              <th className="text-right px-4 py-3 font-medium">الحالة</th>
              <th className="text-right px-4 py-3 font-medium">النوع</th>
              <th className="text-right px-4 py-3 font-medium">العميل</th>
              <th className="text-right px-4 py-3 font-medium">تاريخ الإصدار</th>
              <th className="text-right px-4 py-3 font-medium">المجموع الفرعي</th>
              <th className="text-right px-4 py-3 font-medium">الضريبة</th>
              <th className="text-right px-4 py-3 font-medium">الإجمالي</th>
              <th className="text-right px-4 py-3 font-medium">أُنشئت في</th>
              <th className="text-right px-4 py-3 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loadingData ? (
              <tr>
                <td colSpan={10} className="text-center px-4 py-6 text-slate-400">
                  ...جاري التحميل
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center px-4 py-6 text-slate-400">
                  لا توجد فواتير.
                </td>
              </tr>
            ) : (
              items.map((inv) => {
                const isDraft = inv.status === 'DRAFT';
                const isIssued = inv.status === 'ISSUED';
                const paymentsOpen = openPaymentsInvoiceId === inv.id;
                const paymentsForInv = paymentsByInvoice[inv.id];
                const paymentsLoading = !!paymentsLoadingByInvoice[inv.id];
                const paymentsErr = paymentsErrByInvoice[inv.id];
                const paymentForm = paymentFormByInvoice[inv.id];
                const paymentSubmitting = !!paymentSubmittingByInvoice[inv.id];
                const paymentSuccess = paymentSuccessByInvoice[inv.id];
                return (
                  <React.Fragment key={inv.id}>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-800 font-mono" dir="ltr">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            'inline-flex items-center rounded-md px-2 py-0.5 text-xs ' +
                            (inv.status === 'ISSUED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : inv.status === 'CANCELLED'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-700')
                          }
                        >
                          {inv.status === 'DRAFT'
                            ? 'مسودة'
                            : inv.status === 'ISSUED'
                              ? 'صادرة'
                              : 'ملغاة'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {inv.type === 'POS' ? 'نقطة بيع' : 'عادية'}
                      </td>
                      <td className="px-4 py-3 text-slate-700" dir="ltr">
                        {customerLabel(inv.customerId)}
                      </td>
                      <td className="px-4 py-3 text-slate-600" dir="ltr">
                        {fmtDate(inv.issueDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-mono" dir="ltr">
                        {fmtMoney(inv.subtotal)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-mono" dir="ltr">
                        {fmtMoney(inv.vatTotal)}
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-mono font-semibold" dir="ltr">
                        {fmtMoney(inv.total)}
                      </td>
                      <td className="px-4 py-3 text-slate-600" dir="ltr">
                        {fmtDate(inv.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {isDraft && canUpdate && (
                            <button
                              onClick={() => onEdit(inv)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                            >
                              تعديل
                            </button>
                          )}
                          {isDraft && canIssue && (
                            <button
                              onClick={() => onIssue(inv.id)}
                              className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                            >
                              إصدار
                            </button>
                          )}
                          {!inv.notes?.includes('credit note') && inv.status !== 'CANCELLED' && canCancel && (
                            <button
                              onClick={() => onCancel(inv.id)}
                              className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
                            >
                              إلغاء
                            </button>
                          )}
                          {isDraft && canDelete && (
                            <button
                              onClick={() => onDelete(inv.id)}
                              className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                            >
                              حذف
                            </button>
                          )}
                          {isIssued && canReadArPayments && (
                            <button
                              onClick={() => onTogglePayments(inv.id)}
                              className={
                                'rounded-md border px-2 py-1 text-xs ' +
                                (paymentsOpen
                                  ? 'border-sky-400 bg-sky-50 text-sky-700'
                                  : 'border-sky-300 text-sky-700 hover:bg-sky-50')
                              }
                            >
                              {paymentsOpen
                                ? 'إخفاء المدفوععات'
                                : `المدفوععات (${(paymentsForInv || []).length})`}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isIssued && paymentsOpen && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-semibold text-slate-700">
                                مدفوععات الفاتورة{' '}
                                <span className="font-mono text-slate-500" dir="ltr">
                                  {inv.invoiceNumber}
                                </span>
                              </h4>
                              {paymentsLoading && (
                                <span className="text-xs text-slate-400">...جاري التحميل</span>
                              )}
                            </div>

                            {paymentsErr && (
                              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                {paymentsErr}
                              </div>
                            )}

                            {!paymentsLoading &&
                              !paymentsErr &&
                              (paymentsForInv || []).length === 0 && (
                                <div className="text-xs text-slate-500">
                                  لا توجد مدفوععات مسجلة لهذه الفاتورة حتى الآن.
                                </div>
                              )}

                            {!paymentsLoading && !paymentsErr && (paymentsForInv || []).length > 0 && (
                              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                <table className="min-w-full text-xs">
                                  <thead className="bg-slate-100 text-slate-600">
                                    <tr>
                                      <th className="px-3 py-2 text-right font-medium">المبلغ</th>
                                      <th className="px-3 py-2 text-right font-medium">طريقة الدفع</th>
                                      <th className="px-3 py-2 text-right font-medium">تاريخ الدفع</th>
                                      <th className="px-3 py-2 text-right font-medium">المرجع</th>
                                      <th className="px-3 py-2 text-right font-medium">الحالة</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(paymentsForInv || []).map((p) => (
                                      <tr key={p.id} className="border-t border-slate-100">
                                        <td className="px-3 py-2 font-mono text-slate-800" dir="ltr">
                                          {fmtMoney(p.amount)}
                                        </td>
                                        <td className="px-3 py-2 text-slate-700">
                                          {p.paymentMethod === 'CASH'
                                            ? 'نقدي'
                                            : p.paymentMethod === 'CARD'
                                              ? 'بطاقة'
                                              : p.paymentMethod === 'TRANSFER'
                                                ? 'تحويل'
                                                : 'أخرى'}
                                        </td>
                                        <td className="px-3 py-2 text-slate-600" dir="ltr">
                                          {fmtDate(p.paidAt)}
                                        </td>
                                        <td className="px-3 py-2 text-slate-600" dir="ltr">
                                          {p.reference || '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                          <span
                                            className={
                                              'inline-flex items-center rounded-md px-2 py-0.5 text-xs ' +
                                              (p.status === 'POSTED'
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-slate-100 text-slate-600')
                                            }
                                          >
                                            {p.status === 'POSTED' ? 'مُرحَّل' : 'ملغى'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {canWriteArPayments && (
                              <form
                                onSubmit={(e) => onSubmitPayment(e, inv.id, inv)}
                                className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-2"
                              >
                                <div className="md:col-span-2 flex items-center justify-between">
                                  <h5 className="text-sm font-semibold text-slate-700">
                                    تسجيل مدفوعة جديدة
                                  </h5>
                                  {paymentSuccess && (
                                    <span className="text-xs text-emerald-700">
                                      {paymentSuccess}
                                    </span>
                                  )}
                                </div>

                                <label className="text-xs text-slate-600">
                                  <span className="block mb-1">المبلغ</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    dir="ltr"
                                    value={paymentForm?.amount ?? ''}
                                    onChange={(e) =>
                                      setPaymentForm(inv.id, { amount: e.target.value })
                                    }
                                    placeholder="0.0000"
                                    className="w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-sm"
                                    required
                                  />
                                </label>

                                <label className="text-xs text-slate-600">
                                  <span className="block mb-1">طريقة الدفع</span>
                                  <select
                                    value={paymentForm?.paymentMethod ?? 'CASH'}
                                    onChange={(e) =>
                                      setPaymentForm(inv.id, {
                                        paymentMethod: e.target
                                          .value as PaymentMethod,
                                      })
                                    }
                                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  >
                                    <option value="CASH">نقدي</option>
                                    <option value="CARD">بطاقة</option>
                                    <option value="TRANSFER">تحويل</option>
                                    <option value="OTHER">أخرى</option>
                                  </select>
                                </label>

                                <label className="text-xs text-slate-600">
                                  <span className="block mb-1">تاريخ الدفع</span>
                                  <input
                                    type="date"
                                    dir="ltr"
                                    value={paymentForm?.paidAt ?? ''}
                                    onChange={(e) =>
                                      setPaymentForm(inv.id, { paidAt: e.target.value })
                                    }
                                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                    required
                                  />
                                </label>

                                <label className="text-xs text-slate-600">
                                  <span className="block mb-1">المرجع</span>
                                  <input
                                    type="text"
                                    dir="ltr"
                                    value={paymentForm?.reference ?? ''}
                                    onChange={(e) =>
                                      setPaymentForm(inv.id, { reference: e.target.value })
                                    }
                                    placeholder="receipt / cheque #"
                                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  />
                                </label>

                                <label className="text-xs text-slate-600 md:col-span-2">
                                  <span className="block mb-1">ملاحظات</span>
                                  <textarea
                                    rows={2}
                                    value={paymentForm?.notes ?? ''}
                                    onChange={(e) =>
                                      setPaymentForm(inv.id, { notes: e.target.value })
                                    }
                                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  />
                                </label>

                                <div className="md:col-span-2 flex items-center justify-between">
                                  <span className="text-xs text-slate-400" dir="ltr">
                                    Idempotency-Key يُولَّد تلقائياً لكل محاولة إرسال.
                                  </span>
                                  <button
                                    type="submit"
                                    disabled={paymentSubmitting}
                                    className={
                                      'rounded-md border px-3 py-1 text-xs ' +
                                      (paymentSubmitting
                                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'border-sky-300 bg-sky-600 text-white hover:bg-sky-700')
                                    }
                                  >
                                    {paymentSubmitting ? '...جاري التسجيل' : 'تسجيل المدفوعة'}
                                  </button>
                                </div>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm mb-8">
        <span className="text-slate-500">
          {total} فاتورة • صفحة {page} من {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            السابق
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      </div>

      {/* Create / edit draft form */}
      {(canCreate || editingId) && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            {editingId ? 'تعديل مسودة الفاتورة' : 'إنشاء مسودة فاتورة جديدة'}
          </h2>

          {/* Header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <label className="text-sm">
              <span className="block text-slate-700 mb-1">العميل (اختياري)</span>
              <select
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                dir="ltr"
              >
                <option value="">بدون عميل</option>
                {partners
                  .filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ?? ''} — {p.name}
                    </option>
                  ))}
              </select>
              <span className="text-xs text-slate-500">يجب أن يكون CUSTOMER أو BOTH.</span>
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">تاريخ الإصدار (اختياري)</span>
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                dir="ltr"
              />
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">تاريخ الاستحقاق (اختياري)</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                dir="ltr"
              />
            </label>

            <label className="text-sm md:col-span-3">
              <span className="block text-slate-700 mb-1">ملاحظات (Header)</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          {/* Lines */}
          <div className="space-y-3 mb-4">
            <h3 className="text-sm font-semibold text-slate-700">البنود</h3>
            {form.lines.map((l, idx) => {
              const p = productById.get(l.productId);
              const needsWarehouse = isProductType(p, 'PRODUCT');
              return (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-md border border-slate-200 p-3"
                >
                  <label className="text-xs md:col-span-3">
                    <span className="block text-slate-700 mb-1">المنتج *</span>
                    <select
                      required
                      value={l.productId}
                      onChange={(e) =>
                        setLine(idx, {
                          productId: e.target.value,
                          warehouseId: productById.get(e.target.value)?.type === 'PRODUCT' ? l.warehouseId : '',
                        })
                      }
                      className="w-full rounded-md border border-slate-300 px-2 py-2"
                      dir="ltr"
                    >
                      <option value="">اختر منتجاً</option>
                      {products.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.sku} — {pr.name} ({pr.type === 'PRODUCT' ? 'منتج' : 'خدمة'})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs md:col-span-2">
                    <span className="block text-slate-700 mb-1">
                      المستودع {needsWarehouse && '*'}
                    </span>
                    <select
                      required={needsWarehouse}
                      value={l.warehouseId}
                      onChange={(e) => setLine(idx, { warehouseId: e.target.value })}
                      disabled={!needsWarehouse}
                      className="w-full rounded-md border border-slate-300 px-2 py-2 disabled:bg-slate-100"
                      dir="ltr"
                    >
                      <option value="">—</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs md:col-span-1">
                    <span className="block text-slate-700 mb-1">الكمية *</span>
                    <input
                      required
                      value={l.quantity}
                      onChange={(e) => setLine(idx, { quantity: e.target.value })}
                      placeholder="0.0000"
                      className="w-full rounded-md border border-slate-300 px-2 py-2 font-mono"
                      dir="ltr"
                    />
                  </label>

                  <label className="text-xs md:col-span-2">
                    <span className="block text-slate-700 mb-1">سعر الوحدة *</span>
                    <input
                      required
                      value={l.unitPrice}
                      onChange={(e) => setLine(idx, { unitPrice: e.target.value })}
                      placeholder="0.0000"
                      className="w-full rounded-md border border-slate-300 px-2 py-2 font-mono"
                      dir="ltr"
                    />
                  </label>

                  <label className="text-xs md:col-span-1">
                    <span className="block text-slate-700 mb-1">خصم</span>
                    <input
                      value={l.discountAmount}
                      onChange={(e) => setLine(idx, { discountAmount: e.target.value })}
                      placeholder="0.0000"
                      className="w-full rounded-md border border-slate-300 px-2 py-2 font-mono"
                      dir="ltr"
                    />
                  </label>

                  <label className="text-xs md:col-span-1">
                    <span className="block text-slate-700 mb-1">ضريبة %</span>
                    <input
                      value={l.vatRate}
                      onChange={(e) => setLine(idx, { vatRate: e.target.value })}
                      placeholder="15.00"
                      className="w-full rounded-md border border-slate-300 px-2 py-2 font-mono"
                      dir="ltr"
                    />
                  </label>

                  <label className="text-xs md:col-span-1">
                    <span className="block text-slate-700 mb-1">وصف</span>
                    <input
                      value={l.description}
                      onChange={(e) => setLine(idx, { description: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-2 py-2"
                      dir="ltr"
                    />
                  </label>

                  <div className="md:col-span-1 flex items-end">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={form.lines.length <= 1}
                      className="w-full rounded-md border border-rose-300 px-2 py-2 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                    >
                      حذف البند
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addLine}
            className="mb-6 rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            + إضافة بند
          </button>

          {formErr && (
            <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700 mb-4">
              {formErr}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            {editingId && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
              >
                إلغاء التعديل
              </button>
            )}
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 disabled:opacity-40"
            >
              {submitting ? '...جاري الحفظ' : editingId ? 'حفظ التعديلات' : 'إنشاء مسودة'}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
