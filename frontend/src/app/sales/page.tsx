'use client';

// =====================================================
// Phase 18A-B-2: Sales Invoices Workspace UX Polish
//
// - Modern Arabic / RTL-friendly SaaS interface.
// - Executive KPI cards, status tabs, cleaner search/filter bar.
// - Clean table presentation with StatusBadge and ActionMenu.
// - Slide-over DetailDrawer for inspection of invoice lines and metadata.
// - Preserves 100% of existing backend API endpoints, parameters, and responses.
// - Preserves 100% of permissions (`sales.read`, `sales.create`, `sales.issue`,
//   `sales.cancel`, `sales.delete`, `sales.update`, `ar_payments.read`, `ar_payments.write`).
// - Zero client-side arithmetic recalculations; money displayed via formatted strings.
// =====================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 10);
}

interface PaymentFormState {
  amount: string;
  paymentMethod: PaymentMethod;
  paidAt: string;
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

  // Drawer / Inspection state
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<DraftFormState>(emptyDraft());
  const [formErr, setFormErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Lookups
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);

  // Per-row action error
  const [rowActionErr, setRowActionErr] = useState<string | null>(null);

  // AR Payments state
  const [openPaymentsInvoiceId, setOpenPaymentsInvoiceId] = useState<string | null>(null);
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, ArPayment[]>>({});
  const [paymentsLoadingByInvoice, setPaymentsLoadingByInvoice] = useState<Record<string, boolean>>({});
  const [paymentsErrByInvoice, setPaymentsErrByInvoice] = useState<Record<string, string>>({});
  const [paymentFormByInvoice, setPaymentFormByInvoice] = useState<Record<string, PaymentFormState>>({});
  const [paymentSubmittingByInvoice, setPaymentSubmittingByInvoice] = useState<Record<string, boolean>>({});
  const [paymentSuccessByInvoice, setPaymentSuccessByInvoice] = useState<Record<string, boolean>>({});

  const hasSalesRead = hasPermission('sales.read');
  const canCreate = hasPermission('sales.create');
  const canUpdate = hasPermission('sales.update');
  const canDelete = hasPermission('sales.delete');
  const canIssue = hasPermission('sales.issue');
  const canCancel = hasPermission('sales.cancel');
  const canReadArPayments = hasPermission('ar_payments.read');
  const canWriteArPayments = hasPermission('ar_payments.write');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Load lookups once per mount
  useEffect(() => {
    if (!user || !hasSalesRead) return;
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
  }, [user, hasSalesRead]);

  const reload = () => {
    if (!user || !hasSalesRead) return;
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
  }, [page, search, statusFilter, typeFilter, user, hasSalesRead]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const customerLabel = (id: string | null | undefined) => {
    if (!id) return '—';
    const c = partners.find((p) => p.id === id);
    return c ? `${c.code ? `[${c.code}] ` : ''}${c.name}` : id;
  };

  // --- KPI summary aggregations based on current loaded items ---
  const kpiData = useMemo(() => {
    const draftCount = items.filter((i) => i.status === 'DRAFT').length;
    const issuedCount = items.filter((i) => i.status === 'ISSUED').length;
    const cancelledCount = items.filter((i) => i.status === 'CANCELLED').length;
    const sumActiveTotal = items
      .filter((i) => i.status !== 'CANCELLED')
      .reduce((acc, i) => acc + (Number(i.total) || 0), 0);

    return {
      draftCount,
      issuedCount,
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
    const lines: CreateSalesInvoiceLineInput[] = [];
    for (const [idx, l] of form.lines.entries()) {
      const p = productById.get(l.productId);
      if (!p) throw new Error(`البند ${idx + 1}: لم يتم اختيار منتج`);
      const qty = Number(l.quantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`البند ${idx + 1}: الكمية يجب أن تكون رقماً > 0`);
      const price = Number(l.unitPrice);
      if (!Number.isFinite(price) || price < 0) throw new Error(`البند ${idx + 1}: سعر الوحدة يجب أن يكون رقماً >= 0`);
      if (isProductType(p, 'PRODUCT') && !l.warehouseId) {
        throw new Error(`البند ${idx + 1}: المنتجات المخزنية تحتاج مستودع`);
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
      else setFormErr('فشلت العملية');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Row actions ---
  const onIssue = async (id: string) => {
    if (!window.confirm('هل تريد إصدار هذه الفاتورة الآن وترحيلها محاسبياً؟')) return;
    setRowActionErr(null);
    try {
      await api.issueSalesInvoice(id, {});
      if (editingId === id) onCancelEdit();
      reload();
      if (selectedInvoice?.id === id) setSelectedInvoice(null);
    } catch (err) {
      setRowActionErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'فشل الإصدار');
    }
  };

  const onCancel = async (id: string) => {
    const reason = window.prompt('سبب الإلغاء (اختياري):') ?? undefined;
    setRowActionErr(null);
    try {
      await api.cancelSalesInvoice(id, reason ? { reason } : {});
      if (editingId === id) onCancelEdit();
      reload();
      if (selectedInvoice?.id === id) setSelectedInvoice(null);
    } catch (err) {
      setRowActionErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'فشل الإلغاء');
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('هل تريد حذف هذه الفاتورة (مسودة فقط)؟')) return;
    setRowActionErr(null);
    try {
      await api.deleteSalesInvoice(id);
      if (editingId === id) onCancelEdit();
      reload();
      if (selectedInvoice?.id === id) setSelectedInvoice(null);
    } catch (err) {
      setRowActionErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'فشل الحذف');
    }
  };

  // --- AR Payments handling ---
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
              : 'فشل تحميل المدفوعات';
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

  const onSubmitPayment = async (e: React.FormEvent, invoiceId: string, inv: SalesInvoice) => {
    e.preventDefault();
    if (!canWriteArPayments) return;
    const pForm = paymentFormByInvoice[invoiceId] ?? emptyPaymentForm();

    const amount = Number(pForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentsErrByInvoice((m) => ({
        ...m,
        [invoiceId]: 'قيمة المبلغ يجب أن تكون رقماً > 0',
      }));
      return;
    }
    if (inv.status !== 'ISSUED') {
      setPaymentsErrByInvoice((m) => ({
        ...m,
        [invoiceId]: 'لا يمكن تسجيل دفعة على فاتورة غير صادرة.',
      }));
      return;
    }

    const payload: CreateArPaymentInput = {
      paymentMethod: pForm.paymentMethod,
      amount: amount.toFixed(4),
      ...(pForm.paidAt ? { paidAt: new Date(pForm.paidAt + 'T12:00:00Z').toISOString() } : {}),
      ...(pForm.reference.trim() ? { reference: pForm.reference.trim() } : {}),
      ...(pForm.notes.trim() ? { notes: pForm.notes.trim() } : {}),
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
      loadArPayments(invoiceId);
      reload();
    } catch (err) {
      let msg: string;
      if (err instanceof ApiError) {
        if (err.status === 409) {
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
        msg = 'فشلت العملية';
      }
      setPaymentsErrByInvoice((m) => ({ ...m, [invoiceId]: msg }));
    } finally {
      setPaymentSubmittingByInvoice((m) => ({ ...m, [invoiceId]: false }));
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <LoadingState message="جاري تحميل نظام المبيعات..." />
      </main>
    );
  }

  if (!user || !hasSalesRead) {
    return (
      <main className="min-h-screen p-8">
        <AccessDeniedState
          title="غير مصرح بعرض المبيعات"
          description="لا يملك حسابك الحالي صلاحية sales.read المطلوبة للوصول إلى فواتير العملاء."
          requiredPermission="sales.read"
        />
      </main>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const statusTabItems = [
    { label: 'الكل', value: 'ALL', count: total },
    { label: 'مسودة', value: 'DRAFT', count: kpiData.draftCount },
    { label: 'صادرة', value: 'ISSUED', count: kpiData.issuedCount },
    { label: 'ملغاة', value: 'CANCELLED', count: kpiData.cancelledCount },
  ];

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Modern Page Header */}
      <PageHeader
        title="فواتير العملاء"
        subtitle="إدارة فواتير المبيعات التجارية، الإصدار، متابعة التحصيلات، والترحيل المحاسبي التلقائي."
        eyebrow="المبيعات (Sales)"
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
                {isFormOpen && !editingId ? 'إخفاء النموذج' : '+ إنشاء فاتورة جديدة'}
              </button>
            )}
          </>
        }
      />

      {/* 2. Top Executive KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="إجمالي الفواتير"
          value={total}
          helperText="العدد الكلي في النظام"
          tone="neutral"
        />
        <KpiCard
          label="فواتير صادرة"
          value={kpiData.issuedCount}
          helperText="مرحلة محاسبياً بانتظار السداد"
          tone="success"
        />
        <KpiCard
          label="مسودات المبيعات"
          value={kpiData.draftCount}
          helperText="مسودات قيد الإعداد"
          tone="warning"
        />
        <KpiCard
          label="إجمالي المبيعات النشطة"
          value={fmtDisplayMoney(kpiData.sumActiveTotal, 'ر.س')}
          helperText="حسب النتائج المعروضة"
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
          setStatusFilter(val === 'ALL' ? '' : (val as SalesInvoiceStatus));
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

        <div className="w-44">
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as typeof typeFilter);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">كل الأنواع</option>
            <option value="STANDARD">فاتورة عادية</option>
            <option value="POS">نقطة بيع (POS)</option>
          </select>
        </div>

        {(search || statusFilter || typeFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setTypeFilter('');
              setPage(1);
            }}
            className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            إعادة تعيين الفلاتر
          </button>
        )}
      </FilterSection>

      {/* 5. Modern Table Presentation */}
      <SectionCard noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">رقم الفاتورة</th>
                <th className="px-5 py-3.5">الحالة</th>
                <th className="px-5 py-3.5">العميل</th>
                <th className="px-5 py-3.5">تاريخ الإصدار</th>
                <th className="px-5 py-3.5">المجموع الفرعي</th>
                <th className="px-5 py-3.5">الضريبة 15%</th>
                <th className="px-5 py-3.5">الإجمالي</th>
                <th className="px-5 py-3.5">النوع</th>
                <th className="px-5 py-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loadingData ? (
                <tr>
                  <td colSpan={9} className="py-12">
                    <LoadingState message="جاري تحميل الفواتير..." />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12">
                    <EmptyState
                      title="لا توجد فواتير مبيعات"
                      description={
                        search || statusFilter || typeFilter
                          ? 'لم نجد أي فواتير تطابق شروط البحث الحالية.'
                          : 'لم يتم إنشاء أي فواتير مبيعات حتى الآن.'
                      }
                      action={
                        canCreate && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setForm(emptyDraft());
                              setIsFormOpen(true);
                            }}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                          >
                            + إنشاء مسودة أولى
                          </button>
                        )
                      }
                    />
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
                  const pForm = paymentFormByInvoice[inv.id];
                  const paymentSubmitting = !!paymentSubmittingByInvoice[inv.id];
                  const paymentSuccess = paymentSuccessByInvoice[inv.id];

                  // Assemble row actions for the ActionMenu
                  const rowActions = [
                    {
                      label: 'عرض التفاصيل',
                      onClick: () => setSelectedInvoice(inv),
                    },
                    ...(isDraft && canUpdate
                      ? [
                          {
                            label: 'تعديل المسودة',
                            onClick: () => onEdit(inv),
                          },
                        ]
                      : []),
                    ...(isDraft && canIssue
                      ? [
                          {
                            label: 'إصدار الفاتورة',
                            onClick: () => onIssue(inv.id),
                            tone: 'primary' as const,
                          },
                        ]
                      : []),
                    ...(isIssued && canReadArPayments
                      ? [
                          {
                            label: paymentsOpen ? 'إخفاء المدفوعات' : 'إدارة المدفوعات',
                            onClick: () => onTogglePayments(inv.id),
                          },
                        ]
                      : []),
                    ...(!inv.notes?.includes('credit note') &&
                    inv.status !== 'CANCELLED' &&
                    canCancel
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
                  ];

                  return (
                    <React.Fragment key={inv.id}>
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        {/* Invoice Number */}
                        <td className="px-5 py-3.5 font-mono text-sm font-semibold text-blue-600">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="hover:underline cursor-pointer"
                            dir="ltr"
                          >
                            {inv.invoiceNumber}
                          </button>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <StatusBadge status={inv.status} />
                        </td>

                        {/* Customer */}
                        <td className="px-5 py-3.5 text-slate-800 font-medium">
                          {customerLabel(inv.customerId)}
                        </td>

                        {/* Issue Date */}
                        <td className="px-5 py-3.5 text-slate-500 font-mono text-xs" dir="ltr">
                          {fmtDate(inv.issueDate)}
                        </td>

                        {/* Subtotal */}
                        <td className="px-5 py-3.5 text-slate-600 font-mono text-xs" dir="ltr">
                          {fmtMoney(inv.subtotal)}
                        </td>

                        {/* VAT */}
                        <td className="px-5 py-3.5 text-slate-600 font-mono text-xs" dir="ltr">
                          {fmtMoney(inv.vatTotal)}
                        </td>

                        {/* Total */}
                        <td className="px-5 py-3.5 text-slate-900 font-mono font-bold" dir="ltr">
                          {fmtMoney(inv.total)}
                        </td>

                        {/* Type */}
                        <td className="px-5 py-3.5 text-xs text-slate-500">
                          {inv.type === 'POS' ? 'نقطة بيع' : 'عادية'}
                        </td>

                        {/* Action Menu */}
                        <td className="px-5 py-3.5 text-center">
                          <ActionMenu actions={rowActions} />
                        </td>
                      </tr>

                      {/* Expanded Payments Section for ISSUED invoices */}
                      {isIssued && paymentsOpen && (
                        <tr className="bg-slate-50/80 border-t border-b border-slate-200">
                          <td colSpan={9} className="px-6 py-5">
                            <div className="space-y-4 max-w-4xl mx-auto">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="text-sm font-bold text-slate-800">
                                    مدفوعات الفاتورة ({inv.invoiceNumber})
                                  </h4>
                                  <p className="text-xs text-slate-500">
                                    سجل حركات التحصيل المسجلة على هذه الفاتورة
                                  </p>
                                </div>
                                {paymentsLoading && (
                                  <span className="text-xs text-slate-400">...جاري التحميل</span>
                                )}
                              </div>

                              {paymentsErr && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                                  {paymentsErr}
                                </div>
                              )}

                              {!paymentsLoading &&
                                !paymentsErr &&
                                (paymentsForInv || []).length === 0 && (
                                  <div className="text-xs text-slate-500 bg-white p-3 rounded-xl border border-slate-200 text-center">
                                    لا توجد مدفوعات مسجلة لهذه الفاتورة حتى الآن.
                                  </div>
                                )}

                              {!paymentsLoading && !paymentsErr && (paymentsForInv || []).length > 0 && (
                                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                                  <table className="min-w-full text-xs text-right">
                                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-100">
                                      <tr>
                                        <th className="px-4 py-2.5">المبلغ (SAR)</th>
                                        <th className="px-4 py-2.5">طريقة الدفع</th>
                                        <th className="px-4 py-2.5">تاريخ الدفع</th>
                                        <th className="px-4 py-2.5">المرجع</th>
                                        <th className="px-4 py-2.5">الحالة</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {(paymentsForInv || []).map((p) => (
                                        <tr key={p.id}>
                                          <td className="px-4 py-2.5 font-mono font-bold text-slate-800" dir="ltr">
                                            {fmtMoney(p.amount)}
                                          </td>
                                          <td className="px-4 py-2.5 text-slate-700">
                                            {p.paymentMethod === 'CASH'
                                              ? 'نقدي'
                                              : p.paymentMethod === 'CARD'
                                                ? 'بطاقة'
                                                : p.paymentMethod === 'TRANSFER'
                                                  ? 'تحويل بنكي'
                                                  : 'أخرى'}
                                          </td>
                                          <td className="px-4 py-2.5 text-slate-600 font-mono" dir="ltr">
                                            {fmtDate(p.paidAt)}
                                          </td>
                                          <td className="px-4 py-2.5 text-slate-600" dir="ltr">
                                            {p.reference || '—'}
                                          </td>
                                          <td className="px-4 py-2.5">
                                            <StatusBadge status={p.status} size="sm" />
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* AR Payment Recording Form */}
                              {canWriteArPayments && (
                                <form
                                  onSubmit={(e) => onSubmitPayment(e, inv.id, inv)}
                                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
                                >
                                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                    <h5 className="text-xs font-bold text-slate-800">
                                      تسجيل دفعة تحصيل جديدة
                                    </h5>
                                    {paymentSuccess && (
                                      <span className="text-xs font-semibold text-emerald-600">
                                        ✓ تم تسجيل الدفعة بنجاح
                                      </span>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                    <label className="text-xs text-slate-600 space-y-1">
                                      <span className="block font-medium">المبلغ *</span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        dir="ltr"
                                        value={pForm?.amount ?? ''}
                                        onChange={(e) =>
                                          setPaymentForm(inv.id, { amount: e.target.value })
                                        }
                                        placeholder="0.00"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-sm"
                                        required
                                      />
                                    </label>

                                    <label className="text-xs text-slate-600 space-y-1">
                                      <span className="block font-medium">طريقة الدفع *</span>
                                      <select
                                        value={pForm?.paymentMethod ?? 'CASH'}
                                        onChange={(e) =>
                                          setPaymentForm(inv.id, {
                                            paymentMethod: e.target.value as PaymentMethod,
                                          })
                                        }
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                                      >
                                        <option value="CASH">نقدي</option>
                                        <option value="CARD">بطاقة</option>
                                        <option value="TRANSFER">تحويل بنكي</option>
                                        <option value="OTHER">أخرى</option>
                                      </select>
                                    </label>

                                    <label className="text-xs text-slate-600 space-y-1">
                                      <span className="block font-medium">تاريخ الدفع *</span>
                                      <input
                                        type="date"
                                        dir="ltr"
                                        value={pForm?.paidAt ?? ''}
                                        onChange={(e) =>
                                          setPaymentForm(inv.id, { paidAt: e.target.value })
                                        }
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-mono"
                                        required
                                      />
                                    </label>

                                    <label className="text-xs text-slate-600 space-y-1">
                                      <span className="block font-medium">المرجع / الشيك</span>
                                      <input
                                        type="text"
                                        dir="ltr"
                                        value={pForm?.reference ?? ''}
                                        onChange={(e) =>
                                          setPaymentForm(inv.id, { reference: e.target.value })
                                        }
                                        placeholder="رقم الإيصال أو الحوالة"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                                      />
                                    </label>

                                    <label className="text-xs text-slate-600 sm:col-span-2 md:col-span-3 space-y-1">
                                      <span className="block font-medium">ملاحظات التحصيل</span>
                                      <input
                                        type="text"
                                        value={pForm?.notes ?? ''}
                                        onChange={(e) =>
                                          setPaymentForm(inv.id, { notes: e.target.value })
                                        }
                                        placeholder="ملاحظات اختيارية..."
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                                      />
                                    </label>

                                    <div className="flex items-end">
                                      <button
                                        type="submit"
                                        disabled={paymentSubmitting}
                                        className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                                      >
                                        {paymentSubmitting ? '...جاري الحفظ' : 'تسجيل التحصيل'}
                                      </button>
                                    </div>
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

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
          <span>
            إجمالي {total} فاتورة • صفحة {page} من {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium disabled:opacity-40 transition-colors"
            >
              السابق
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium disabled:opacity-40 transition-colors"
            >
              التالي
            </button>
          </div>
        </div>
      </SectionCard>

      {/* 6. Invoice Details Drawer (Slide-Over Inspection) */}
      <DetailDrawer
        isOpen={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        title={selectedInvoice ? `تفاصيل الفاتورة: ${selectedInvoice.invoiceNumber}` : ''}
        subtitle={selectedInvoice ? `العميل: ${customerLabel(selectedInvoice.customerId)}` : ''}
        width="lg"
      >
        {selectedInvoice && (
          <div className="space-y-6 text-sm">
            {/* Metadata Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={selectedInvoice.status} size="md" />
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {selectedInvoice.type === 'POS' ? 'نقطة بيع' : 'فاتورة عادية'}
              </span>
            </div>

            {/* Financial Summary Card */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <span className="text-xs text-slate-500 block">المجموع الفرعي</span>
                <span className="text-base font-bold text-slate-800 font-mono" dir="ltr">
                  {fmtDisplayMoney(selectedInvoice.subtotal, 'ر.س')}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">الضريبة 15%</span>
                <span className="text-base font-bold text-slate-800 font-mono" dir="ltr">
                  {fmtDisplayMoney(selectedInvoice.vatTotal, 'ر.س')}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">الإجمالي الكلي</span>
                <span className="text-base font-bold text-blue-700 font-mono" dir="ltr">
                  {fmtDisplayMoney(selectedInvoice.total, 'ر.س')}
                </span>
              </div>
            </div>

            {/* Dates & Terms */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 block mb-1">تاريخ الإصدار:</span>
                <span className="font-semibold text-slate-800 font-mono" dir="ltr">
                  {fmtDisplayDate(selectedInvoice.issueDate)}
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 block mb-1">تاريخ الاستحقاق:</span>
                <span className="font-semibold text-slate-800 font-mono" dir="ltr">
                  {fmtDisplayDate(selectedInvoice.dueDate)}
                </span>
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                بنود الفاتورة ({selectedInvoice.lines?.length || 0})
              </h4>
              {selectedInvoice.lines && selectedInvoice.lines.length > 0 ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-100">
                      <tr>
                        <th className="p-2.5">المنتج / البند</th>
                        <th className="p-2.5">الكمية</th>
                        <th className="p-2.5">السعر</th>
                        <th className="p-2.5">الضريبة</th>
                        <th className="p-2.5">المجموع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedInvoice.lines.map((l, idx) => {
                        const prod = productById.get(l.productId);
                        return (
                          <tr key={idx}>
                            <td className="p-2.5">
                              <span className="font-medium text-slate-800">
                                {prod?.name || l.productId}
                              </span>
                              {l.description && (
                                <span className="block text-[11px] text-slate-400">
                                  {l.description}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 font-mono" dir="ltr">
                              {l.quantity}
                            </td>
                            <td className="p-2.5 font-mono" dir="ltr">
                              {fmtMoney(l.unitPrice)}
                            </td>
                            <td className="p-2.5 font-mono text-slate-500" dir="ltr">
                              {l.vatRate}%
                            </td>
                            <td className="p-2.5 font-mono font-bold text-slate-800" dir="ltr">
                              {fmtMoney(l.lineTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">لا توجد بنود مفصلة مرفقة.</p>
              )}
            </div>

            {/* Notes */}
            {selectedInvoice.notes && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <span className="font-semibold text-slate-700 block mb-1">ملاحظات:</span>
                <p className="text-slate-600 leading-relaxed">{selectedInvoice.notes}</p>
              </div>
            )}

            {/* Action Bar in Drawer */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
              {selectedInvoice.status === 'DRAFT' && canIssue && (
                <button
                  type="button"
                  onClick={() => onIssue(selectedInvoice.id)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  إصدار الفاتورة وترحيلها
                </button>
              )}
              {selectedInvoice.status === 'DRAFT' && canUpdate && (
                <button
                  type="button"
                  onClick={() => onEdit(selectedInvoice)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  تعديل المسودة
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs hover:bg-slate-50 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* 7. Create / Edit Invoice Form Section */}
      {isFormOpen && (canCreate || editingId) && (
        <SectionCard
          title={editingId ? 'تعديل مسودة الفاتورة' : 'إنشاء مسودة فاتورة مبيعات جديدة'}
          description="أدخل بيانات العميل والبنود التفصيلية مع احتساب ضريبة القيمة المضافة 15% تلقائياً."
          actions={
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              إلغاء وإغلاق النموذج
            </button>
          }
        >
          <form onSubmit={onSubmit} className="space-y-6">
            {/* Header Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="text-xs text-slate-600 space-y-1">
                <span className="block font-medium text-slate-700">العميل (اختياري)</span>
                <select
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  dir="ltr"
                >
                  <option value="">بدون عميل (عميل نقدي عام)</option>
                  {partners
                    .filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code ? `[${p.code}] ` : ''}{p.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="text-xs text-slate-600 space-y-1">
                <span className="block font-medium text-slate-700">تاريخ الإصدار</span>
                <input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                  dir="ltr"
                />
              </label>

              <label className="text-xs text-slate-600 space-y-1">
                <span className="block font-medium text-slate-700">تاريخ الاستحقاق</span>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                  dir="ltr"
                />
              </label>

              <label className="text-xs text-slate-600 md:col-span-3 space-y-1">
                <span className="block font-medium text-slate-700">ملاحظات الفاتورة</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="ملاحظات تظهر على الفاتورة..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>

            {/* Line Items List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  بنود الفاتورة *
                </h4>
                <button
                  type="button"
                  onClick={addLine}
                  className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  + إضافة بند إضافي
                </button>
              </div>

              {form.lines.map((l, idx) => {
                const p = productById.get(l.productId);
                const needsWarehouse = isProductType(p, 'PRODUCT');
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/50 items-end"
                  >
                    <label className="text-xs md:col-span-3 space-y-1">
                      <span className="block font-medium text-slate-700">المنتج / الخدمة *</span>
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
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                        dir="ltr"
                      >
                        <option value="">اختر منتجاً...</option>
                        {products.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {pr.sku} — {pr.name} ({pr.type === 'PRODUCT' ? 'منتج' : 'خدمة'})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs md:col-span-2 space-y-1">
                      <span className="block font-medium text-slate-700">
                        المستودع {needsWarehouse && '*'}
                      </span>
                      <select
                        required={needsWarehouse}
                        value={l.warehouseId}
                        onChange={(e) => setLine(idx, { warehouseId: e.target.value })}
                        disabled={!needsWarehouse}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm disabled:bg-slate-100 disabled:opacity-50"
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

                    <label className="text-xs md:col-span-2 space-y-1">
                      <span className="block font-medium text-slate-700">الكمية *</span>
                      <input
                        required
                        value={l.quantity}
                        onChange={(e) => setLine(idx, { quantity: e.target.value })}
                        placeholder="1.00"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono"
                        dir="ltr"
                      />
                    </label>

                    <label className="text-xs md:col-span-2 space-y-1">
                      <span className="block font-medium text-slate-700">سعر الوحدة *</span>
                      <input
                        required
                        value={l.unitPrice}
                        onChange={(e) => setLine(idx, { unitPrice: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono"
                        dir="ltr"
                      />
                    </label>

                    <label className="text-xs md:col-span-1 space-y-1">
                      <span className="block font-medium text-slate-700">ضريبة %</span>
                      <input
                        value={l.vatRate}
                        onChange={(e) => setLine(idx, { vatRate: e.target.value })}
                        placeholder="15.00"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-mono"
                        dir="ltr"
                      />
                    </label>

                    <label className="text-xs md:col-span-1 space-y-1">
                      <span className="block font-medium text-slate-700">خصم</span>
                      <input
                        value={l.discountAmount}
                        onChange={(e) => setLine(idx, { discountAmount: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-mono"
                        dir="ltr"
                      />
                    </label>

                    <div className="md:col-span-1 flex items-end">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={form.lines.length <= 1}
                        className="w-full py-2 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-xs text-rose-600 disabled:opacity-30 cursor-pointer"
                        title="حذف هذا البند"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {formErr && <ErrorBanner message={formErr} />}

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {submitting ? '...جاري الحفظ' : editingId ? 'حفظ التعديلات' : 'إنشاء المسودة'}
              </button>
            </div>
          </form>
        </SectionCard>
      )}
    </main>
  );
}
