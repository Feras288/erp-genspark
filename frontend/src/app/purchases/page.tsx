'use client';

// =====================================================
// Phase 18A-B-3: Purchases and Payments UX Polish
//
// - Modern Arabic / RTL-friendly SaaS interface.
// - Executive KPI cards, status tabs, cleaner search/filter bar.
// - Clean table presentation with StatusBadge and ActionMenu.
// - Slide-over DetailDrawer for read-only inspection of purchase invoice lines & summary.
// - Polished AP payments expandable workspace and payment registration form.
// - Preserves 100% of existing backend API endpoints, parameters, and responses.
// - Preserves 100% of permissions (`purchases.read`, `purchases.create`, `purchases.update`,
//   `purchases.delete`, `purchases.receive`, `purchases.cancel`, `ap_payments.read`, `ap_payments.write`).
// - Decimal columns serialize as strings end to end (no Float coercion).
// - Zero changes to business logic, payment semantics, or accounting behavior.
// =====================================================

import React, { useEffect, useMemo, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type {
  Product,
  Partner,
  Warehouse,
  PurchaseInvoice,
  PurchaseInvoiceStatus,
  CreatePurchaseInvoiceLineInput,
  ApPayment,
  CreateApPaymentInput,
  PaymentMethod,
} from '@/lib/api';
import {
  PageHeader,
  KpiCard,
  StatusBadge,
  StatusTabs,
  EmptyState,
  LoadingState,
  ErrorBanner,
  AccessDeniedState,
  SectionCard,
  FilterSection,
  ActionMenu,
  DetailDrawer,
} from '@/components/ui';
import { fmtDisplayMoney, fmtDisplayDate } from '@/lib/ui';

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

interface ApPaymentFormState {
  paymentMethod: PaymentMethod;
  amount: string; // Decimal-as-string (e.g. "100.0000")
  paidAt: string; // ISO date input (yyyy-mm-dd)
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

const apPaymentMethods: PaymentMethod[] = [
  'CASH',
  'CARD',
  'TRANSFER',
  'OTHER',
];

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

  // Drawer / Inspection state
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<DraftFormState>(emptyDraft());
  const [formErr, setFormErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // AP Payments expander state
  const [openApPaymentsInvoiceId, setOpenApPaymentsInvoiceId] = useState<string | null>(null);
  const [apPaymentsByInvoice, setApPaymentsByInvoice] = useState<Record<string, ApPayment[]>>({});
  const [apPaymentsLoadingByInvoice, setApPaymentsLoadingByInvoice] = useState<Record<string, boolean>>({});
  const [apPaymentsErrByInvoice, setApPaymentsErrByInvoice] = useState<Record<string, string>>({});
  const [apPaymentFormByInvoice, setApPaymentFormByInvoice] = useState<Record<string, ApPaymentFormState>>({});
  const [apPaymentSubmittingByInvoice, setApPaymentSubmittingByInvoice] = useState<Record<string, boolean>>({});
  const [apPaymentSuccessByInvoice, setApPaymentSuccessByInvoice] = useState<Record<string, boolean>>({});

  // Lookups
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Partner[]>([]);

  const hasPurchasesRead = hasPermission('purchases.read');
  const canCreate = hasPermission('purchases.create');
  const canUpdate = hasPermission('purchases.update');
  const canDelete = hasPermission('purchases.delete');
  const canReceive = hasPermission('purchases.receive');
  const canCancel = hasPermission('purchases.cancel');
  const canReadApPayments = hasPermission('ap_payments.read');
  const canWriteApPayments = hasPermission('ap_payments.write');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Load lookups once
  useEffect(() => {
    if (!user || !hasPurchasesRead) return;
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
  }, [user, hasPurchasesRead]);

  const reload = () => {
    if (!user || !hasPurchasesRead) return;
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
  }, [page, search, statusFilter, supplierFilter, user, hasPurchasesRead]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const supplierLabel = (id: string | null | undefined) => {
    if (!id) return '—';
    const s = suppliers.find((p) => p.id === id);
    return s ? `${s.code ? `[${s.code}] ` : ''}${s.name}` : id;
  };

  // --- KPI summary aggregations based on loaded items ---
  const kpiData = useMemo(() => {
    const draftCount = items.filter((i) => i.status === 'DRAFT').length;
    const receivedCount = items.filter((i) => i.status === 'RECEIVED').length;
    const cancelledCount = items.filter((i) => i.status === 'CANCELLED').length;
    const sumActiveTotal = items
      .filter((i) => i.status !== 'CANCELLED')
      .reduce((acc, i) => acc + (Number(i.total) || 0), 0);

    return {
      draftCount,
      receivedCount,
      cancelledCount,
      sumActiveTotal,
    };
  }, [items]);

  // --- Form helpers ---
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
    setIsFormOpen(true);
    if (selectedInvoice?.id === inv.id) {
      setSelectedInvoice(null);
    }
  };

  const onCancelEdit = () => {
    setEditingId(null);
    setForm(emptyDraft());
    setFormErr(null);
    setIsFormOpen(false);
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
      else setFormErr('فشلت العملية');
    } finally {
      setSubmitting(false);
    }
  };

  // --- AP Payments handling ---
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
  ) => {
    e.preventDefault();
    if (!canWriteApPayments) {
      setApPaymentsErrByInvoice((m) => ({
        ...m,
        [invoiceId]: 'لا تملك صلاحية تسجيل المدفوعات.',
      }));
      return;
    }
    const payForm = apPaymentFormByInvoice[invoiceId] ?? emptyApPaymentForm();

    const amountStr = (payForm.amount || '').trim();
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
        paymentMethod: payForm.paymentMethod,
        amount: Number.isInteger(reqAmt)
          ? `${reqAmt}.0000`
          : reqAmt.toFixed(4),
        paidAt: payForm.paidAt ? new Date(payForm.paidAt).toISOString() : undefined,
        reference: payForm.reference.trim() || undefined,
        notes: payForm.notes.trim() || undefined,
        idempotencyKey:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `ap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      };
      await api.createApPayment(invoiceId, payload);
      loadApPayments(invoiceId);
      setApPaymentFormByInvoice((m) => ({
        ...m,
        [invoiceId]: emptyApPaymentForm(),
      }));
      setApPaymentSuccessByInvoice((m) => ({ ...m, [invoiceId]: true }));
      reload();
    } catch (err) {
      let msg: string | null = null;
      if (err instanceof ApiError) msg = err.message;
      else if (err instanceof Error) msg = err.message;
      if (!msg) msg = 'failed';
      if (
        (err instanceof ApiError && (err.status === 401 || err.status === 403)) ||
        /permission|forbidden|unauthor/i.test(msg)
      ) {
        msg = 'لا تملك صلاحية تسجيل المدفوعات.';
      }
      setApPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: msg ?? 'failed' }));
    } finally {
      setApPaymentSubmittingByInvoice((m) => ({ ...m, [invoiceId]: false }));
    }
  };

  // --- Row actions ---
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
      if (selectedInvoice?.id === id) {
        setSelectedInvoice(null);
      }
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
      await api.cancelPurchaseInvoice(id, reason ? { reason } : {});
      if (editingId === id) onCancelEdit();
      if (selectedInvoice?.id === id) {
        setSelectedInvoice(null);
      }
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
      if (selectedInvoice?.id === id) {
        setSelectedInvoice(null);
      }
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

  if (loading) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <LoadingState message="جاري تحميل نظام المشتريات..." />
      </main>
    );
  }

  if (!user || !hasPurchasesRead) {
    return (
      <main className="min-h-screen p-8">
        <AccessDeniedState
          title="غير مصرح بعرض المشتريات"
          description="لا يملك حسابك الحالي صلاحية purchases.read المطلوبة للوصول إلى فواتير الموردين."
          requiredPermission="purchases.read"
        />
      </main>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const statusTabItems = [
    { label: 'الكل', value: 'ALL', count: total },
    { label: 'مسودة', value: 'DRAFT', count: kpiData.draftCount },
    { label: 'مستلمة', value: 'RECEIVED', count: kpiData.receivedCount },
    { label: 'ملغاة', value: 'CANCELLED', count: kpiData.cancelledCount },
  ];

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Modern Page Header */}
      <PageHeader
        title="فواتير الموردين"
        subtitle="إدارة فواتير الشراء، الاعتماد، السداد، ومتابعة الالتزامات المستحقة."
        eyebrow="المشتريات"
        actions={
          <>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium transition-colors shadow-xs"
            >
              ← لوحة التحكم
            </Link>
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  if (isFormOpen && !editingId) {
                    onCancelEdit();
                  } else {
                    setEditingId(null);
                    setForm(emptyDraft());
                    setIsFormOpen(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold transition-colors shadow-sm cursor-pointer"
              >
                {isFormOpen && !editingId ? 'إخفاء النموذج' : '+ إنشاء فاتورة شراء جديدة'}
              </button>
            )}
          </>
        }
      />

      {/* 2. Top Executive KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          label="إجمالي الفواتير"
          value={total}
          helperText="العدد الكلي في النظام"
          tone="neutral"
        />
        <KpiCard
          label="مسودات"
          value={kpiData.draftCount}
          helperText="مسودات قيد الإعداد"
          tone="warning"
        />
        <KpiCard
          label="فواتير معتمدة / مستلمة"
          value={kpiData.receivedCount}
          helperText="مستلمة في المخزون"
          tone="success"
        />
        <KpiCard
          label="ملغاة"
          value={kpiData.cancelledCount}
          helperText="فواتير تم إلغاؤها"
          tone="danger"
        />
        <KpiCard
          label="إجمالي المشتريات النشطة"
          value={fmtDisplayMoney(kpiData.sumActiveTotal, 'ر.س')}
          helperText="حسب القائمة المعروضة"
          tone="info"
        />
      </div>

      {/* Error Banners */}
      {err && <ErrorBanner message={err} onRetry={reload} />}
      {rowActionErr && (
        <ErrorBanner
          title="خطأ في تنفيذ الإجراء"
          message={rowActionErr}
          tone="danger"
        />
      )}

      {/* 3. Status Tabs Filter Bar */}
      <StatusTabs
        tabs={statusTabItems}
        activeValue={statusFilter === '' ? 'ALL' : statusFilter}
        onChange={(val) => {
          setStatusFilter(val === 'ALL' ? '' : (val as PurchaseInvoiceStatus));
          setPage(1);
        }}
      />

      {/* 4. Filter and Search Section */}
      <FilterSection>
        <div className="flex-1 min-w-[240px]">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="ابحث برقم الفاتورة أو الملاحظات..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            dir="rtl"
          />
        </div>

        <div className="w-56">
          <select
            value={supplierFilter}
            onChange={(e) => {
              setSupplierFilter(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            dir="rtl"
          >
            <option value="">كل الموردين</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code ? `[${s.code}] ` : ''}{s.name} ({s.type === 'BOTH' ? 'عميل/مورد' : 'مورد'})
              </option>
            ))}
          </select>
        </div>

        {(search || statusFilter || supplierFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setSupplierFilter('');
              setPage(1);
            }}
            className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            إعادة تعيين الفلاتر
          </button>
        )}
      </FilterSection>

      {/* 5. Modern Purchases Table Presentation */}
      <SectionCard noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">رقم الفاتورة</th>
                <th className="px-5 py-3.5">الحالة</th>
                <th className="px-5 py-3.5">المورّد</th>
                <th className="px-5 py-3.5">تاريخ الشراء</th>
                <th className="px-5 py-3.5">المجموع الفرعي</th>
                <th className="px-5 py-3.5">الضريبة</th>
                <th className="px-5 py-3.5">الإجمالي</th>
                <th className="px-5 py-3.5">أُنشئت في</th>
                <th className="px-5 py-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingData ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12">
                    <LoadingState message="جاري تحميل فواتير الشراء..." />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12">
                    <EmptyState
                      title="لا توجد فواتير مشتريات"
                      description="لم يتم العثور على فواتير مطابقة للشروط الحالية."
                      action={
                        canCreate ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setForm(emptyDraft());
                              setIsFormOpen(true);
                            }}
                            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                          >
                            إنشاء مسودة أولى
                          </button>
                        ) : undefined
                      }
                    />
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

                  const badgeStatus =
                    inv.status === 'RECEIVED'
                      ? 'success'
                      : inv.status === 'CANCELLED'
                        ? 'neutral'
                        : 'warning';

                  const badgeLabel =
                    inv.status === 'RECEIVED'
                      ? 'مستلمة'
                      : inv.status === 'CANCELLED'
                        ? 'ملغاة'
                        : 'مسودة';

                  const rowActions = [
                    {
                      label: 'عرض التفاصيل',
                      onClick: () => setSelectedInvoice(inv),
                    },
                    ...(isDraft && canReceive
                      ? [
                          {
                            label: 'استلام الفاتورة',
                            onClick: () => onReceive(inv.id),
                          },
                        ]
                      : []),
                    ...(isDraft && canUpdate
                      ? [
                          {
                            label: 'تعديل المسودة',
                            onClick: () => onEdit(inv),
                          },
                        ]
                      : []),
                    ...(isDraft && canCancel
                      ? [
                          {
                            label: 'إلغاء الفاتورة',
                            onClick: () => onCancel(inv.id),
                            tone: 'danger' as const,
                          },
                        ]
                      : []),
                    ...(isDraft && canDelete
                      ? [
                          {
                            label: 'حذف المسودة',
                            onClick: () => onDelete(inv.id),
                            tone: 'danger' as const,
                          },
                        ]
                      : []),
                    ...(inv.status === 'RECEIVED' && canReadApPayments
                      ? [
                          {
                            label: apOpen ? 'إخفاء المدفوعات' : 'إدارة المدفوعات (AP)',
                            onClick: () => onToggleApPayments(inv.id),
                          },
                        ]
                      : []),
                  ];

                  return (
                    <Fragment key={inv.id}>
                      <tr className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-900" dir="ltr">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={badgeStatus} label={badgeLabel} />
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-800">
                          {supplierLabel(inv.supplierId)}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500 font-mono" dir="ltr">
                          {fmtDisplayDate(inv.purchaseDate)}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-700" dir="ltr">
                          {fmtDisplayMoney(inv.subtotal, 'ر.س')}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-700" dir="ltr">
                          {fmtDisplayMoney(inv.vatTotal, 'ر.س')}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm font-bold text-slate-900" dir="ltr">
                          {fmtDisplayMoney(inv.total, 'ر.س')}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-400 font-mono" dir="ltr">
                          {fmtDisplayDate(inv.createdAt)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-center gap-1.5">
                            {inv.status === 'RECEIVED' && canReadApPayments && (
                              <button
                                type="button"
                                onClick={() => onToggleApPayments(inv.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                                  apOpen
                                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                                title={apRows.length ? `المدفوعات (${apRows.length})` : 'المدفوعات'}
                              >
                                💳 {apRows.length ? `المدفوعات (${apRows.length})` : 'المدفوعات'}
                              </button>
                            )}

                            <ActionMenu actions={rowActions} />
                          </div>
                        </td>
                      </tr>

                      {/* Expandable AP Payments Drawer Row */}
                      {apOpen && inv.status === 'RECEIVED' && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={9} className="px-6 py-5 border-t border-slate-100">
                            <div className="max-w-4xl mx-auto space-y-4">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                  <span>💳</span> سجل مدفوعات فاتورة المورد {inv.invoiceNumber}
                                </h4>
                                <span className="text-xs text-slate-500 font-mono">
                                  إجمالي الفاتورة: {fmtDisplayMoney(inv.total, 'ر.س')}
                                </span>
                              </div>

                              {apErr && (
                                <ErrorBanner
                                  title="خطأ في عملية السداد"
                                  message={apErr}
                                  tone="danger"
                                />
                              )}
                              {apSuccess && !apErr && (
                                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2 font-medium">
                                  <span>✓</span> تم تسجيل دفعة المورد بنجاح وتحديث السجلات.
                                </div>
                              )}

                              {/* Payments History List */}
                              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-700">
                                  المدفوعات المسجلة
                                </div>
                                {apLoading ? (
                                  <div className="p-4 text-center">
                                    <LoadingState message="جاري تحميل المدفوعات..." />
                                  </div>
                                ) : apRows.length === 0 ? (
                                  <div className="p-6 text-center text-xs text-slate-500">
                                    لا توجد مدفوعات مسجلة لهذه الفاتورة حتى الآن.
                                  </div>
                                ) : (
                                  <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-600">
                                      <tr>
                                        <th className="px-4 py-2.5 font-medium">المبلغ</th>
                                        <th className="px-4 py-2.5 font-medium">طريقة الدفع</th>
                                        <th className="px-4 py-2.5 font-medium">تاريخ السداد</th>
                                        <th className="px-4 py-2.5 font-medium">المرجع</th>
                                        <th className="px-4 py-2.5 font-medium">الحالة</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {apRows.map((p) => (
                                        <tr key={p.id} className="hover:bg-slate-50/50">
                                          <td className="px-4 py-2.5 font-mono font-bold text-slate-900" dir="ltr">
                                            {fmtDisplayMoney(p.amount, 'ر.س')}
                                          </td>
                                          <td className="px-4 py-2.5 text-slate-700">
                                            {p.paymentMethod === 'CASH'
                                              ? 'نقداً'
                                              : p.paymentMethod === 'CARD'
                                                ? 'بطاقة'
                                                : p.paymentMethod === 'TRANSFER'
                                                  ? 'تحويل بنكي'
                                                  : 'أخرى'}
                                          </td>
                                          <td className="px-4 py-2.5 text-slate-500 font-mono" dir="ltr">
                                            {fmtDisplayDate(p.paidAt)}
                                          </td>
                                          <td className="px-4 py-2.5 text-slate-600 font-mono" dir="ltr">
                                            {p.reference ?? '—'}
                                          </td>
                                          <td className="px-4 py-2.5">
                                            <StatusBadge
                                              status={p.status === 'POSTED' ? 'success' : 'neutral'}
                                              label={p.status === 'POSTED' ? 'مُرحّلة' : p.status}
                                            />
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>

                              {/* Register New Payment Form */}
                              {canWriteApPayments && (
                                <form
                                  onSubmit={(e) => onSubmitApPayment(e, inv.id)}
                                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
                                >
                                  <div className="text-xs font-bold text-slate-800">
                                    تسجيل دفعة سداد جديدة
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                    <label className="text-xs">
                                      <span className="block text-slate-700 mb-1 font-medium">
                                        المبلغ (ر.س) *
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
                                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        dir="ltr"
                                      />
                                    </label>
                                    <label className="text-xs">
                                      <span className="block text-slate-700 mb-1 font-medium">
                                        طريقة الدفع *
                                      </span>
                                      <select
                                        value={apForm.paymentMethod}
                                        onChange={(e) =>
                                          setApPaymentForm(inv.id, {
                                            paymentMethod: e.target.value as PaymentMethod,
                                          })
                                        }
                                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                      >
                                        {apPaymentMethods.map((m) => (
                                          <option key={m} value={m}>
                                            {m === 'CASH'
                                              ? 'نقداً (CASH)'
                                              : m === 'CARD'
                                                ? 'بطاقة (CARD)'
                                                : m === 'TRANSFER'
                                                  ? 'تحويل بنكي (TRANSFER)'
                                                  : 'أخرى (OTHER)'}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="text-xs">
                                      <span className="block text-slate-700 mb-1 font-medium">
                                        تاريخ السداد
                                      </span>
                                      <input
                                        type="date"
                                        value={apForm.paidAt}
                                        onChange={(e) =>
                                          setApPaymentForm(inv.id, {
                                            paidAt: e.target.value,
                                          })
                                        }
                                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        dir="ltr"
                                      />
                                    </label>
                                    <label className="text-xs">
                                      <span className="block text-slate-700 mb-1 font-medium">
                                        المرجع الإشاري
                                      </span>
                                      <input
                                        value={apForm.reference}
                                        onChange={(e) =>
                                          setApPaymentForm(inv.id, {
                                            reference: e.target.value,
                                          })
                                        }
                                        placeholder="INV-REF-..."
                                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        dir="ltr"
                                      />
                                    </label>
                                    <label className="text-xs">
                                      <span className="block text-slate-700 mb-1 font-medium">
                                        ملاحظات السداد
                                      </span>
                                      <input
                                        value={apForm.notes}
                                        onChange={(e) =>
                                          setApPaymentForm(inv.id, {
                                            notes: e.target.value,
                                          })
                                        }
                                        placeholder="اختياري"
                                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                      />
                                    </label>
                                  </div>
                                  <div className="flex justify-end pt-1">
                                    <button
                                      type="submit"
                                      disabled={apSubmitting}
                                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-40 cursor-pointer"
                                    >
                                      {apSubmitting ? 'جاري التسجيل...' : 'تسجيل الدفعة الآن'}
                                    </button>
                                  </div>
                                </form>
                              )}
                            </div>
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
      </SectionCard>

      {/* Pagination Strip */}
      <div className="flex items-center justify-between text-xs sm:text-sm text-slate-500">
        <div>
          إجمالي النتائج: <span className="font-semibold text-slate-700">{total}</span> فاتورة • صفحة{' '}
          <span className="font-semibold text-slate-700">{page}</span> من{' '}
          <span className="font-semibold text-slate-700">{totalPages}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs"
          >
            السابق
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs"
          >
            التالي
          </button>
        </div>
      </div>

      {/* 6. Detail Drawer: Slide-over inspection */}
      <DetailDrawer
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        title={`تفاصيل فاتورة الشراء: ${selectedInvoice?.invoiceNumber ?? ''}`}
        subtitle={`المورّد: ${supplierLabel(selectedInvoice?.supplierId)} • تاريخ الشراء: ${fmtDisplayDate(selectedInvoice?.purchaseDate)}`}
        width="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={() => setSelectedInvoice(null)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-medium"
            >
              إغلاق النافذة
            </button>
            <div className="flex gap-2">
              {selectedInvoice?.status === 'DRAFT' && canReceive && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedInvoice) onReceive(selectedInvoice.id);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  استلام الفاتورة
                </button>
              )}
              {selectedInvoice?.status === 'DRAFT' && canUpdate && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedInvoice) onEdit(selectedInvoice);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  تعديل المسودة
                </button>
              )}
              {selectedInvoice?.status === 'RECEIVED' && canReadApPayments && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedInvoice) {
                      onToggleApPayments(selectedInvoice.id);
                      setSelectedInvoice(null);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  إدارة المدفوعات
                </button>
              )}
            </div>
          </div>
        }
      >
        {selectedInvoice && (
          <div className="space-y-6">
            {/* Header Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs">
              <div>
                <span className="block text-slate-400 mb-0.5">الحالة الحالية</span>
                <StatusBadge
                  status={
                    selectedInvoice.status === 'RECEIVED'
                      ? 'success'
                      : selectedInvoice.status === 'CANCELLED'
                        ? 'neutral'
                        : 'warning'
                  }
                  label={
                    selectedInvoice.status === 'RECEIVED'
                      ? 'مستلمة'
                      : selectedInvoice.status === 'CANCELLED'
                        ? 'ملغاة'
                        : 'مسودة'
                  }
                />
              </div>
              <div>
                <span className="block text-slate-400 mb-0.5">المورّد</span>
                <span className="font-semibold text-slate-800">
                  {supplierLabel(selectedInvoice.supplierId)}
                </span>
              </div>
              <div>
                <span className="block text-slate-400 mb-0.5">تاريخ الاستحقاق</span>
                <span className="font-mono text-slate-700" dir="ltr">
                  {fmtDisplayDate(selectedInvoice.dueDate)}
                </span>
              </div>
              <div>
                <span className="block text-slate-400 mb-0.5">تاريخ الإنشاء</span>
                <span className="font-mono text-slate-700" dir="ltr">
                  {fmtDisplayDate(selectedInvoice.createdAt)}
                </span>
              </div>
              {selectedInvoice.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <span className="block text-slate-400 mb-0.5">ملاحظات الفاتورة</span>
                  <span className="text-slate-700 bg-white p-2 rounded border border-slate-200/60 block">
                    {selectedInvoice.notes}
                  </span>
                </div>
              )}
            </div>

            {/* Line Items Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2">
                بنود الفاتورة ({selectedInvoice.lines?.length ?? 0})
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 font-medium">المنتج / الصنف</th>
                      <th className="px-3 py-2 font-medium">المستودع</th>
                      <th className="px-3 py-2 font-medium">الكمية</th>
                      <th className="px-3 py-2 font-medium">التكلفة</th>
                      <th className="px-3 py-2 font-medium">الخصم</th>
                      <th className="px-3 py-2 font-medium">الضريبة</th>
                      <th className="px-3 py-2 font-medium">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.lines?.map((line, idx) => {
                      const prod = productById.get(line.productId);
                      const wh = warehouses.find((w) => w.id === line.warehouseId);
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {prod ? `${prod.sku} — ${prod.name}` : line.productId}
                            {line.description && (
                              <span className="block text-[11px] text-slate-400 font-normal">
                                {line.description}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {wh ? wh.name : '—'}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold" dir="ltr">
                            {line.quantity}
                          </td>
                          <td className="px-3 py-2 font-mono" dir="ltr">
                            {fmtDisplayMoney(line.unitCost, 'ر.س')}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500" dir="ltr">
                            {fmtDisplayMoney(line.discountAmount, 'ر.س')}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500" dir="ltr">
                            %{line.vatRate}
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-900" dir="ltr">
                            {fmtDisplayMoney(line.lineTotal, 'ر.س')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Totals Summary Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-2">
              <div className="flex justify-between text-xs text-slate-600">
                <span>المجموع الفرعي الخاضع للضريبة:</span>
                <span className="font-mono font-semibold" dir="ltr">
                  {fmtDisplayMoney(selectedInvoice.subtotal, 'ر.س')}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>ضريبة القيمة المضافة (15%):</span>
                <span className="font-mono font-semibold" dir="ltr">
                  {fmtDisplayMoney(selectedInvoice.vatTotal, 'ر.س')}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
                <span>الإجمالي الكلي المستحق:</span>
                <span className="font-mono text-blue-700" dir="ltr">
                  {fmtDisplayMoney(selectedInvoice.total, 'ر.س')}
                </span>
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* 7. Create / Edit Draft Form Section */}
      {(canCreate || editingId) && isFormOpen && (
        <SectionCard
          title={editingId ? 'تعديل مسودة فاتورة الشراء' : 'إنشاء مسودة فاتورة شراء جديدة'}
          description="أدخل تفاصيل المورد والبنود والمستودعات. الاستلام اللاحق سيزيد المخزون للبضائع وينشئ حركة PURCHASE_IN."
        >
          {formErr && <ErrorBanner message={formErr} tone="danger" />}

          <form onSubmit={onSubmit} className="space-y-6">
            {/* Header Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="text-xs font-medium text-slate-700">
                <span className="block mb-1.5">المورّد (اختياري)</span>
                <select
                  value={form.supplierId}
                  onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  dir="rtl"
                >
                  <option value="">بدون مورّد</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code ? `[${s.code}] ` : ''}{s.name} ({s.type === 'BOTH' ? 'عميل/مورد' : 'مورد'})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  يجب أن يكون مصنفاً كمورد أو كلاهما.
                </span>
              </label>

              <label className="text-xs font-medium text-slate-700">
                <span className="block mb-1.5">تاريخ الشراء</span>
                <input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  dir="ltr"
                />
              </label>

              <label className="text-xs font-medium text-slate-700">
                <span className="block mb-1.5">تاريخ الاستحقاق</span>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  dir="ltr"
                />
              </label>

              <label className="text-xs font-medium text-slate-700 md:col-span-3">
                <span className="block mb-1.5">ملاحظات الفاتورة (Header Notes)</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="ملاحظات مرجعية حول أمر الشراء أو المورد..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </label>
            </div>

            {/* Line Items List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-bold text-slate-800">بنود الفاتورة</h4>
                <button
                  type="button"
                  onClick={addLine}
                  className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  + إضافة بند جديد
                </button>
              </div>

              {form.lines.map((l, idx) => {
                const p = productById.get(l.productId);
                const needsWarehouse = isProductType(p);

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 items-end"
                  >
                    <label className="text-xs md:col-span-3">
                      <span className="block text-slate-600 mb-1 font-medium">المنتج *</span>
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
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        dir="rtl"
                      >
                        <option value="">اختر منتجاً...</option>
                        {products.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {pr.sku} — {pr.name} ({pr.type === 'PRODUCT' ? 'منتج' : 'خدمة'})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs md:col-span-2">
                      <span className="block text-slate-600 mb-1 font-medium">
                        المستودع {needsWarehouse && '*'}
                      </span>
                      <select
                        required={needsWarehouse}
                        value={l.warehouseId}
                        onChange={(e) => setLine(idx, { warehouseId: e.target.value })}
                        disabled={!needsWarehouse}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        dir="rtl"
                      >
                        <option value="">{needsWarehouse ? 'اختر مستودعاً' : '— لا يتطلب —'}</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code} — {w.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs md:col-span-1">
                      <span className="block text-slate-600 mb-1 font-medium">الكمية *</span>
                      <input
                        required
                        value={l.quantity}
                        onChange={(e) => setLine(idx, { quantity: e.target.value })}
                        placeholder="1.0000"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        dir="ltr"
                      />
                    </label>

                    <label className="text-xs md:col-span-2">
                      <span className="block text-slate-600 mb-1 font-medium">سعر التكلفة *</span>
                      <input
                        required
                        value={l.unitCost}
                        onChange={(e) => setLine(idx, { unitCost: e.target.value })}
                        placeholder="0.0000"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        dir="ltr"
                      />
                    </label>

                    <label className="text-xs md:col-span-1">
                      <span className="block text-slate-600 mb-1 font-medium">خصم</span>
                      <input
                        value={l.discountAmount}
                        onChange={(e) => setLine(idx, { discountAmount: e.target.value })}
                        placeholder="0.0000"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        dir="ltr"
                      />
                    </label>

                    <label className="text-xs md:col-span-1">
                      <span className="block text-slate-600 mb-1 font-medium">ضريبة %</span>
                      <input
                        value={l.vatRate}
                        onChange={(e) => setLine(idx, { vatRate: e.target.value })}
                        placeholder="15.00"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        dir="ltr"
                      />
                    </label>

                    <label className="text-xs md:col-span-1">
                      <span className="block text-slate-600 mb-1 font-medium">وصف</span>
                      <input
                        value={l.description}
                        onChange={(e) => setLine(idx, { description: e.target.value })}
                        placeholder="اختياري"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </label>

                    <div className="md:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={form.lines.length <= 1}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                        title="حذف البند"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs sm:text-sm font-medium transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors disabled:opacity-40 cursor-pointer"
              >
                {submitting
                  ? 'جاري الحفظ...'
                  : editingId
                    ? 'حفظ التعديلات'
                    : 'إنشاء مسودة الفاتورة'}
              </button>
            </div>
          </form>
        </SectionCard>
      )}
    </main>
  );
}
