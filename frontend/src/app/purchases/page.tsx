'use client';

// =====================================================
// Phase 5 — Purchases page (Purchase invoices).
//
// - Loads /api/purchases/invoices (companyId from JWT).
// - Search by invoiceNumber / notes, filter by status, filter by supplier.
// - Create draft / Edit draft / Delete draft (DRAFT only).
// - Receive draft (PRODUCT lines → StockLevel upsert + PURCHASE_IN movement;
//   SERVICE lines are pass-through — no stock, no movement).
// - Cancel draft only (RECEIVED refuses per backend message).
// - Permission-gated; users without `purchases.read` are redirected to /dashboard.
// - Decimals are string-typed end to end; no Float arithmetic in the UI.
// - No mock data; no localStorage / sessionStorage; in-memory token only.
// - No Accounting/GL/AP/payments/COGS surfaced: the backend rejects
//   RECEIVED-cancel with "returns/debit-note flow in a future phase."
//   and we show that server message verbatim.
// =====================================================
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState, Fragment } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type {
  Product,
  Partner,
  Warehouse,
  PurchaseInvoice,
  PurchaseInvoiceStatus,
  CreatePurchaseInvoiceLineInput,
} from '@/lib/api';
// Phase 10B-C-code: AP Payments (settlement) — mirror
// of AR `ArPayment` shape on the purchases side.
// Server-enforced RBAC:
//   GET  /purchase-invoices/:id/payments → ap_payments.read
//   POST /purchase-invoices/:id/payments → ap_payments.write
// Status gate (RECEIVED only; DRAFT/CANCELLED rejected by
// the backend with 409). Decimal columns serialize as
// strings end to end (no Number coercion in the UI).
import type {
  ApPayment,
  CreateApPaymentInput,
  ApPaymentListQuery,
  PaymentMethod,
} from '@/lib/api';

interface LineFormState {
  productId: string;
  warehouseId: string;
  quantity: string;
  unitCost: string;
  discountAmount: string;
  vatRate: string;
  description: string;
}

interface DraftFormState {
  supplierId: string;
  purchaseDate: string;
  dueDate: string;
  notes: string;
  lines: LineFormState[];
}

// Phase 10B-C-code: AP Payments form draft state.
// Mirror of AR `PaymentFormState` on the sales side; same
// `paymentMethod` enum + Decimal-as-string amount. Empty
// defaults match the AR counterpart so the two pages look
// consistent under the “Register Payment” header.
interface ApPaymentFormState {
  paymentMethod: PaymentMethod;
  amount: string;       // Decimal-as-string (e.g. "100.0000")
  paidAt: string;       // ISO date input (yyyy-mm-dd) or full ISO
  reference: string;
  notes: string;
}

function emptyApPaymentForm(): ApPaymentFormState {
  return {
    paymentMethod: 'CASH',
    amount: '',
    paidAt: '',
    reference: '',
    notes: '',
  };
}

function emptyLine(): LineFormState {
  return {
    productId: '',
    warehouseId: '',
    quantity: '',
    unitCost: '',
    discountAmount: '',
    vatRate: '15.00',
    description: '',
  };
}

function emptyDraft(): DraftFormState {
  return {
    supplierId: '',
    purchaseDate: '',
    dueDate: '',
    notes: '',
    lines: [emptyLine()],
  };
}

function isProductType(p: Product | undefined): boolean {
  return !!p && p.type === 'PRODUCT' && p.isActive && !p.deletedAt;
}

function fmtMoney(s: string | number | null | undefined): string {
  if (s === null || s === undefined || s === '') return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 19).replace('T', ' ');
}

export default function PurchasesPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  // List state
  const [items, setItems] = useState<PurchaseInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | PurchaseInvoiceStatus>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [rowActionErr, setRowActionErr] = useState<string | null>(null);
  const pageSize = 20;

  // Form state
  const [form, setForm] = useState<DraftFormState>(emptyDraft());
  const [formErr, setFormErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Phase 10B-C-code: AP Payments expander state.
  // Per-invoice maps — pattern mirrors Phase 10A-C-code on the
  // AR side. Each invoice gets its own lazy fetch on first toggle,
  // its own error/success banner, and its own form draft.
  const [openApPaymentsInvoiceId, setOpenApPaymentsInvoiceId] =
    useState<string | null>(null);
  const [apPaymentsByInvoice, setApPaymentsByInvoice] = useState<
    Record<string, ApPayment[]>
  >({});
  const [apPaymentsLoadingByInvoice, setApPaymentsLoadingByInvoice] =
    useState<Record<string, boolean>>({});
  const [apPaymentsErrByInvoice, setApPaymentsErrByInvoice] = useState<
    Record<string, string>
  >({});
  const [apPaymentFormByInvoice, setApPaymentFormByInvoice] = useState<
    Record<string, ApPaymentFormState>
  >({});
  const [apPaymentSubmittingByInvoice, setApPaymentSubmittingByInvoice] =
    useState<Record<string, boolean>>({});
  const [apPaymentSuccessByInvoice, setApPaymentSuccessByInvoice] = useState<
    Record<string, boolean>
  >({});


  // Lookups
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Partner[]>([]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !hasPermission('purchases.read')) {
      router.replace('/dashboard');
    }
  }, [loading, user, hasPermission, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [pRes, wRes, sRes] = await Promise.all([
          api.listActiveProducts(),
          api.listActiveWarehouses(),
          api.listActiveSuppliers(),
        ]);
        if (cancelled) return;
        setProducts(pRes.items);
        setWarehouses(wRes.items);
        setSuppliers(sRes.items);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const reload = () => {
    if (!user || !hasPermission('purchases.read')) return;
    let cancelled = false;
    setLoadingData(true);
    api
      .listPurchaseInvoices({
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
        supplierId: supplierFilter || undefined,
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
  }, [page, search, statusFilter, supplierFilter, user]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const supplierLabel = (id: string | null | undefined) => {
    if (!id) return '—';
    const s = suppliers.find((p) => p.id === id);
    return s ? `${s.code ?? ''} — ${s.name}` : id;
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-slate-500">...جاري التحميل</p>
      </main>
    );
  }
  if (!user) return null;

  const canCreate = hasPermission('purchases.create');
  const canUpdate = hasPermission('purchases.update');
  const canDelete = hasPermission('purchases.delete');
  const canReceive = hasPermission('purchases.receive');
  const canCancel = hasPermission('purchases.cancel');

  // Phase 10B-C-code: AP Payments RBAC mirror of the AR
  //   buyer page. Server-enforced; the UI simply hides
  //   the expander button + form when read/write are off.
  const canReadApPayments = hasPermission('ap_payments.read');
  const canWriteApPayments = hasPermission('ap_payments.write');


  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // --- Form helpers ------------------------------------------------------
  const setLine = (idx: number, patch: Partial<LineFormState>) => {
    setForm((f) => {
      const lines = f.lines.slice();
      lines[idx] = { ...lines[idx], ...patch };
      return { ...f, lines };
    });
  };
  const addLine = () =>
    setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (idx: number) =>
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));

  const onEdit = (inv: PurchaseInvoice) => {
    setEditingId(inv.id);
    setForm({
      supplierId: inv.supplierId ?? '',
      purchaseDate: inv.purchaseDate ? inv.purchaseDate.slice(0, 10) : '',
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '',
      notes: inv.notes ?? '',
      lines:
        inv.lines && inv.lines.length > 0
          ? inv.lines.map((l) => ({
              productId: l.productId,
              warehouseId: l.warehouseId ?? '',
              quantity: l.quantity,
              unitCost: l.unitCost,
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
    const lines: CreatePurchaseInvoiceLineInput[] = [];
    for (const [idx, l] of form.lines.entries()) {
      const p = productById.get(l.productId);
      if (!p) throw new Error(`البند ${idx + 1}: لم يتم اختيار منتج`);
      const qty = Number(l.quantity);
      if (!Number.isFinite(qty) || qty <= 0)
        throw new Error(`البند ${idx + 1}: الكمية يجب أن تكون رقماً > 0`);
      const cost = Number(l.unitCost);
      if (!Number.isFinite(cost) || cost < 0)
        throw new Error(`البند ${idx + 1}: سعر التكلفة يجب أن يكون رقماً >= 0`);
      // Server enforces warehouseId at receive for PRODUCT lines, but we
      // surface the requirement at create so the user fixes it before submit.
      lines.push({
        productId: l.productId,
        warehouseId: isProductType(p) ? l.warehouseId || undefined : undefined,
        description: l.description.trim() || undefined,
        quantity: l.quantity.trim(),
        unitCost: l.unitCost.trim(),
        discountAmount: l.discountAmount.trim() || '0.0000',
        vatRate: l.vatRate.trim() || '15.00',
      });
    }
    return {
      supplierId: form.supplierId || undefined,
      purchaseDate: form.purchaseDate || undefined,
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
      if (editingId) await api.updatePurchaseInvoice(editingId, payload);
      else await api.createPurchaseInvoice(payload);
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

  // ====  Phase 10B-C-code : AP Payments (settlement)  ====
  //  Mirrors the AR-side expander + payment form pattern.
  //  Server-enforced RBAC:
  //    GET  → ap_payments.read  (gates the expander toggle + list)
  //    POST → ap_payments.write (gates the submit button)
  //  Server-enforced status gate (RECEIVED only). The UI
  //  hides the trigger when status !== 'RECEIVED'; backend
  //  still rejects with 409 if a stale tab triggers it.
  //  Overpayment guard (S-2 mirror): backend returns 409 →
  //  surface the server message verbatim inside the per-row
  //  error banner.
  const loadApPayments = (invoiceId: string) => {
    if (!canReadApPayments) {
      setApPaymentsErrByInvoice((m) => ({
        ...m,
        [invoiceId]: 'لا تملك صلاحية قراءة المدفوعات.',
      }));
      return;
    }
    setApPaymentsLoadingByInvoice((m) => ({ ...m, [invoiceId]: true }));
    setApPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: '' }));
    api
      .listApPayments(invoiceId)
      .then((rows) => {
        setApPaymentsByInvoice((m) => ({ ...m, [invoiceId]: rows }));
        setApPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: '' }));
      })
      .catch((e) =>
        setApPaymentsErrByInvoice((m) => ({
          ...m,
          [invoiceId]:
            e instanceof ApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : 'failed',
        })),
      )
      .finally(() =>
        setApPaymentsLoadingByInvoice((m) => ({ ...m, [invoiceId]: false })),
      );
  };

  const onToggleApPayments = (invoiceId: string) => {
    setOpenApPaymentsInvoiceId((cur) => {
      const next = cur === invoiceId ? null : invoiceId;
      if (next && canReadApPayments && apPaymentsByInvoice[invoiceId] === undefined) {
        loadApPayments(invoiceId);
      }
      return next;
    });
  };

  const setApPaymentForm = (
    invoiceId: string,
    patch: Partial<ApPaymentFormState>,
  ) => {
    setApPaymentFormByInvoice((m) => ({
      ...m,
      [invoiceId]: { ...(m[invoiceId] ?? emptyApPaymentForm()), ...patch },
    }));
  };

  const onSubmitApPayment = async (
    e: React.FormEvent,
    invoiceId: string,
    inv: PurchaseInvoice,
  ) => {
    e.preventDefault();
    if (!canWriteApPayments) {
      setApPaymentsErrByInvoice((m) => ({
        ...m,
        [invoiceId]: 'لا تملك صلاحية تسجيل المدفوعات.',
      }));
      return;
    }
    const form = apPaymentFormByInvoice[invoiceId] ?? emptyApPaymentForm();

    // Decimal amount validation — strict 4-fractional-digit
    // string. The server has a regex /^\d{1,14}(\.\d{1,4})?$/
    // but we surface client-side numeric checks earlier.
    const amountStr = (form.amount || '').trim();
    if (!/^\d+(\.\d{1,4})?$/.test(amountStr)) {
      setApPaymentsErrByInvoice((m) => ({
        ...m,
        [invoiceId]: 'قيمة المبلغ يجب أن تكون رقمًا صحيحًا أو عشريًا (حتى 4 أرقام عشرية).',
      }));
      return;
    }
    const reqAmt = Number(amountStr);
    if (!Number.isFinite(reqAmt) || reqAmt <= 0) {
      setApPaymentsErrByInvoice((m) => ({
        ...m,
        [invoiceId]: 'قيمة المبلغ يجب أن تكون > 0.',
      }));
      return;
    }

    setApPaymentSubmittingByInvoice((m) => ({ ...m, [invoiceId]: true }));
    setApPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: '' }));
    setApPaymentSuccessByInvoice((m) => ({ ...m, [invoiceId]: false }));

    try {
      const payload: CreateApPaymentInput = {
        paymentMethod: form.paymentMethod,
        // Normalize to 4-fractional digits to match the
        // backend Decimal @db.Decimal(18,4) wire format.
        amount: Number.isInteger(reqAmt)
          ? `${reqAmt}.0000`
          : reqAmt.toFixed(4),
        paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : undefined,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        // Server short-circuits on duplicate (invoiceId +
        // idempotencyKey) → 201 with the existing row.
        // crypto.randomUUID() is widely available in modern
        // browsers + node 14.17+; the server treats the key
        // as opaque, so client choice does not matter.
        idempotencyKey:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `ap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      };
      await api.createApPayment(invoiceId, payload);
      // Force a refresh of the list after a successful POST.
      loadApPayments(invoiceId);
      // Reset the form draft + flash a success banner.
      setApPaymentFormByInvoice((m) => ({
        ...m,
        [invoiceId]: emptyApPaymentForm(),
      }));
      setApPaymentSuccessByInvoice((m) => ({ ...m, [invoiceId]: true }));
    } catch (err) {
      let msg: string | null = null;
      if (err instanceof ApiError) msg = err.message;
      else if (err instanceof Error) msg = err.message;
      // Common server messages — surface them verbatim if
      // recognised, otherwise pass through.
      if (!msg) msg = 'failed';
      // The backend rolls up its own 401/403/409 messages;
      // client-side we only normalize the "permission"
      // case in plain Arabic.
      if (
        (err instanceof ApiError && (err.status === 401 || err.status === 403)) ||
        /permission|forbidden|unauthor/i.test(msg)
      ) {
        msg = 'لا تملك صلاحية تسجيل المدفوعات.';
      }
      // Overpayment guard (S-2 mirror) — server returns 409
      // with "Overpayment guard: requested X > outstanding Y…".
      // Skip the message massage here; pass verbatim.
      setApPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: msg ?? 'failed' }));
    } finally {
      setApPaymentSubmittingByInvoice((m) => ({ ...m, [invoiceId]: false }));
    }
  };

  // Note used inline for typecheck only — mirrors AR page.
  const apPaymentFormMethods: PaymentMethod[] = [
    'CASH',
    'CARD',
    'TRANSFER',
    'OTHER',
  ];
  void apPaymentFormMethods;

  // --- Row actions -------------------------------------------------------
  const onReceive = async (id: string) => {
    if (
      !window.confirm(
        'هل تريد استلام هذه الفاتورة الآن؟ سيتم تحديث المخزون (PRODUCT فقط) وإنشاء حركة PURCHASE_IN.',
      )
    )
      return;
    setRowActionErr(null);
    try {
      await api.receivePurchaseInvoice(id, {});
      if (editingId === id) onCancelEdit();
      reload();
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
  const onCancel = async (id: string) => {
    const reason = window.prompt('سبب الإلغاء (اختياري):') ?? undefined;
    setRowActionErr(null);
    try {
      await api.cancelPurchaseInvoice(
        id,
        reason ? { reason } : {},
      );
      if (editingId === id) onCancelEdit();
      reload();
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
  const onDelete = async (id: string) => {
    if (!window.confirm('هل تريد حذف هذه الفاتورة (مسودة فقط)؟')) return;
    setRowActionErr(null);
    try {
      await api.deletePurchaseInvoice(id);
      if (editingId === id) onCancelEdit();
      reload();
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

  return (
    <main className="min-h-screen p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            المشتريات (فواتير الموردين)
          </h1>
          <p className="text-sm text-slate-500">
            يعرض الفواتير داخل شركتك فقط ({user.companyId}). الاستلام يزيد
            المخزون ويكتب حركة PURCHASE_IN — لا قيود محاسبية أو دفعات هنا.
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
          className="flex-1 min-w-[220px] rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          <option value="RECEIVED">مستلمة</option>
          <option value="CANCELLED">ملغاة</option>
        </select>
        <select
          value={supplierFilter}
          onChange={(e) => {
            setSupplierFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          dir="ltr"
        >
          <option value="">كل الموردين</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code ?? ''} — {s.name} ({s.type === 'BOTH' ? 'عميل/مورد' : 'مورد'})
            </option>
          ))}
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
              <th className="text-right px-4 py-3 font-medium">المورّد</th>
              <th className="text-right px-4 py-3 font-medium">تاريخ الشراء</th>
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
                <td colSpan={9} className="text-center px-4 py-6 text-slate-400">
                  ...جاري التحميل
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center px-4 py-6 text-slate-400">
                  لا توجد فواتير شراء.
                </td>
              </tr>
            ) : (
              items.map((inv) => {
                const isDraft = inv.status === 'DRAFT';
                const apOpen = openApPaymentsInvoiceId === inv.id;
                const apRows = apPaymentsByInvoice[inv.id] ?? [];
                const apLoading = !!apPaymentsLoadingByInvoice[inv.id];
                const apErr = apPaymentsErrByInvoice[inv.id] ?? '';
                const apForm = apPaymentFormByInvoice[inv.id] ?? emptyApPaymentForm();
                const apSubmitting = !!apPaymentSubmittingByInvoice[inv.id];
                const apSuccess = !!apPaymentSuccessByInvoice[inv.id];
                return (
                  <Fragment key={inv.id}>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-800 font-mono" dir="ltr">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            'inline-flex items-center rounded-md px-2 py-0.5 text-xs ' +
                            (inv.status === 'RECEIVED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : inv.status === 'CANCELLED'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-700')
                          }
                        >
                          {inv.status === 'DRAFT'
                            ? 'مسودة'
                            : inv.status === 'RECEIVED'
                              ? 'مستلمة'
                              : 'ملغاة'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700" dir="ltr">
                        {supplierLabel(inv.supplierId)}
                      </td>
                      <td className="px-4 py-3 text-slate-600" dir="ltr">
                        {fmtDate(inv.purchaseDate)}
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
                          {isDraft && canReceive && (
                            <button
                              onClick={() => onReceive(inv.id)}
                              className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                            >
                              استلام
                            </button>
                          )}
                          {isDraft && canCancel && (
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
                          {inv.status === 'RECEIVED' && canReadApPayments && (
                            <button
                              onClick={() => onToggleApPayments(inv.id)}
                              className={
                                'rounded-md border px-2 py-1 text-xs ' +
                                (apOpen
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                  : 'border-slate-300 hover:bg-slate-50')
                              }
                              title={
                                apRows.length
                                  ? `المدفوعات (${apRows.length})`
                                  : 'المدفوعات'
                              }
                            >
                              {apOpen
                                ? 'إخفاء المدفوعات'
                                : apRows.length
                                  ? `المدفوعات (${apRows.length})`
                                  : 'المدفوعات'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {apOpen && inv.status === 'RECEIVED' && (
                      <tr className="bg-slate-50">
                        <td
                          colSpan={9}
                          className="px-4 py-4 border-t border-slate-200"
                        >
                          {apErr && (
                            <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700 mb-3">
                              {apErr}
                            </div>
                          )}
                          {apSuccess && !apErr && (
                            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 mb-3">
                              تم تسجيل الدفعة بنجاح.
                            </div>
                          )}

                          {/* Existing payments list */}
                          <div className="rounded-md border border-slate-200 bg-white mb-4">
                            <div className="px-3 py-2 text-xs font-semibold text-slate-700 border-b border-slate-200">
                              قائمة المدفوعات
                            </div>
                            {apLoading ? (
                              <div className="px-3 py-3 text-sm text-slate-500">
                                ...جاري التحميل
                              </div>
                            ) : apRows.length === 0 ? (
                              <div className="px-3 py-3 text-sm text-slate-500">
                                لا توجد مدفوعات لهذه الفاتورة بعد.
                              </div>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-slate-500 text-xs">
                                    <th className="px-3 py-2 text-right font-medium">المبلغ</th>
                                    <th className="px-3 py-2 text-right font-medium">الطريقة</th>
                                    <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                                    <th className="px-3 py-2 text-right font-medium">المرجع</th>
                                    <th className="px-3 py-2 text-right font-medium">الحالة</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {apRows.map((p) => (
                                    <tr
                                      key={p.id}
                                      className="border-t border-slate-100"
                                    >
                                      <td className="px-3 py-2 font-mono" dir="ltr">
                                        {fmtMoney(p.amount)}
                                      </td>
                                      <td className="px-3 py-2">{p.paymentMethod}</td>
                                      <td className="px-3 py-2 text-slate-600" dir="ltr">
                                        {fmtDate(p.paidAt)}
                                      </td>
                                      <td className="px-3 py-2 text-slate-600" dir="ltr">
                                        {p.reference ?? '—'}
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
                                          {p.status === 'POSTED' ? 'مُرحّلة' : p.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>

                          {/* Register payment form */}
                          {canWriteApPayments && (
                            <form
                              onSubmit={(e) => onSubmitApPayment(e, inv.id, inv)}
                              className="rounded-md border border-slate-200 bg-white p-3"
                            >
                              <div className="text-xs font-semibold text-slate-700 mb-3">
                                تسجيل دفعة جديدة
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                <label className="text-xs">
                                  <span className="block text-slate-700 mb-1">
                                    المبلغ *
                                  </span>
                                  <input
                                    required
                                    value={apForm.amount}
                                    onChange={(e) =>
                                      setApPaymentForm(inv.id, {
                                        amount: e.target.value,
                                      })
                                    }
                                    placeholder="0.0000"
                                    className="w-full rounded-md border border-slate-300 px-2 py-2 font-mono"
                                    dir="ltr"
                                  />
                                </label>
                                <label className="text-xs">
                                  <span className="block text-slate-700 mb-1">
                                    طريقة الدفع *
                                  </span>
                                  <select
                                    value={apForm.paymentMethod}
                                    onChange={(e) =>
                                      setApPaymentForm(inv.id, {
                                        paymentMethod: e.target
                                          .value as PaymentMethod,
                                      })
                                    }
                                    className="w-full rounded-md border border-slate-300 px-2 py-2"
                                    dir="ltr"
                                  >
                                    {apPaymentFormMethods.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-xs">
                                  <span className="block text-slate-700 mb-1">
                                    التاريخ
                                  </span>
                                  <input
                                    type="date"
                                    value={apForm.paidAt}
                                    onChange={(e) =>
                                      setApPaymentForm(inv.id, {
                                        paidAt: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-md border border-slate-300 px-2 py-2"
                                    dir="ltr"
                                  />
                                </label>
                                <label className="text-xs">
                                  <span className="block text-slate-700 mb-1">
                                    المرجع
                                  </span>
                                  <input
                                    value={apForm.reference}
                                    onChange={(e) =>
                                      setApPaymentForm(inv.id, {
                                        reference: e.target.value,
                                      })
                                    }
                                    placeholder="INV-..."
                                    className="w-full rounded-md border border-slate-300 px-2 py-2"
                                    dir="ltr"
                                  />
                                </label>
                                <label className="text-xs">
                                  <span className="block text-slate-700 mb-1">
                                    ملاحظات
                                  </span>
                                  <input
                                    value={apForm.notes}
                                    onChange={(e) =>
                                      setApPaymentForm(inv.id, {
                                        notes: e.target.value,
                                      })
                                    }
                                    placeholder="اختياري"
                                    className="w-full rounded-md border border-slate-300 px-2 py-2"
                                    dir="ltr"
                                  />
                                </label>
                              </div>
                              <div className="flex justify-end mt-3">
                                <button
                                  type="submit"
                                  disabled={apSubmitting}
                                  className="rounded-md bg-indigo-700 hover:bg-indigo-800 text-white text-sm px-4 py-2 disabled:opacity-40"
                                >
                                  {apSubmitting ? '...جاري الحفظ' : 'تسجيل الدفعة'}
                                </button>
                              </div>
                            </form>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
            {editingId ? 'تعديل مسودة الفاتورة' : 'إنشاء مسودة فاتورة شراء جديدة'}
          </h2>

          {/* Header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <label className="text-sm">
              <span className="block text-slate-700 mb-1">المورّد (اختياري)</span>
              <select
                value={form.supplierId}
                onChange={(e) =>
                  setForm({ ...form, supplierId: e.target.value })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                dir="ltr"
              >
                <option value="">بدون مورّد</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code ?? ''} — {s.name} (
                    {s.type === 'BOTH' ? 'عميل/مورد' : 'مورد'})
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">
                يجب أن يكون SUPPLIER أو BOTH (الخادم يرفض غير ذلك).
              </span>
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">
                تاريخ الشراء (اختياري)
              </span>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) =>
                  setForm({ ...form, purchaseDate: e.target.value })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                dir="ltr"
              />
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">
                تاريخ الاستحقاق (اختياري)
              </span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) =>
                  setForm({ ...form, dueDate: e.target.value })
                }
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
              const needsWarehouse = isProductType(p);
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
                          warehouseId:
                            productById.get(e.target.value)?.type === 'PRODUCT'
                              ? l.warehouseId
                              : '',
                        })
                      }
                      className="w-full rounded-md border border-slate-300 px-2 py-2"
                      dir="ltr"
                    >
                      <option value="">اختر منتجاً</option>
                      {products.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.sku} — {pr.name} (
                          {pr.type === 'PRODUCT' ? 'منتج' : 'خدمة'})
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
                      onChange={(e) =>
                        setLine(idx, { warehouseId: e.target.value })
                      }
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
                      onChange={(e) =>
                        setLine(idx, { quantity: e.target.value })
                      }
                      placeholder="0.0000"
                      className="w-full rounded-md border border-slate-300 px-2 py-2 font-mono"
                      dir="ltr"
                    />
                  </label>

                  <label className="text-xs md:col-span-2">
                    <span className="block text-slate-700 mb-1">
                      سعر التكلفة *
                    </span>
                    <input
                      required
                      value={l.unitCost}
                      onChange={(e) =>
                        setLine(idx, { unitCost: e.target.value })
                      }
                      placeholder="0.0000"
                      className="w-full rounded-md border border-slate-300 px-2 py-2 font-mono"
                      dir="ltr"
                    />
                  </label>

                  <label className="text-xs md:col-span-1">
                    <span className="block text-slate-700 mb-1">خصم</span>
                    <input
                      value={l.discountAmount}
                      onChange={(e) =>
                        setLine(idx, { discountAmount: e.target.value })
                      }
                      placeholder="0.0000"
                      className="w-full rounded-md border border-slate-300 px-2 py-2 font-mono"
                      dir="ltr"
                    />
                  </label>

                  <label className="text-xs md:col-span-1">
                    <span className="block text-slate-700 mb-1">ضريبة %</span>
                    <input
                      value={l.vatRate}
                      onChange={(e) =>
                        setLine(idx, { vatRate: e.target.value })
                      }
                      placeholder="15.00"
                      className="w-full rounded-md border border-slate-300 px-2 py-2 font-mono"
                      dir="ltr"
                    />
                  </label>

                  <label className="text-xs md:col-span-1">
                    <span className="block text-slate-700 mb-1">وصف</span>
                    <input
                      value={l.description}
                      onChange={(e) =>
                        setLine(idx, { description: e.target.value })
                      }
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
              className="rounded-md bg-indigo-700 hover:bg-indigo-800 text-white text-sm px-4 py-2 disabled:opacity-40"
            >
              {submitting
                ? '...جاري الحفظ'
                : editingId
                  ? 'حفظ التعديلات'
                  : 'إنشاء مسودة'}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
