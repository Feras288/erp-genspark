'use client';

// =====================================================
// Phase 4 — POS page (Point-of-Sale sales).
//
// Backend creates POS sale = SalesInvoice of type POS, issued
// immediately on POST /api/pos/sales (stock is deducted at issue
// time by the SalesService.issue transaction; SALE_OUT movement
// is appended). ISSUED invoices are not editable from POS.
//
// - Loads products + warehouses for line pickers.
// - Loads recent POS sales (type=POS) from /api/pos/sales.
// - Cart: header (customerId?, paymentMethod, paidAmount) +
//   dynamic cart lines. Submit calls api.createPosSale once.
// - Permission-gated; redirects users without `pos.read`.
// - PRODUCTS lines require warehouseId; SERVICE lines skip stock.
// - Decimals are string end to end; no Float for math.
// - No mock data. No localStorage / sessionStorage. Bearer in
//   memory only.
// =====================================================

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type {
  Product,
  Partner,
  Warehouse,
  SalesInvoice,
  PaymentMethod,
  CreatePosSaleLineInput,
} from '@/lib/api';

interface CartLineState {
  productId: string;
  warehouseId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  description: string;
}

interface CheckoutState {
  customerId: string;
  paymentMethod: PaymentMethod;
  paidAmount: string;
  notes: string;
  lines: CartLineState[];
}

function emptyCartLine(): CartLineState {
  return {
    productId: '',
    warehouseId: '',
    quantity: '1',
    unitPrice: '0',
    discountAmount: '0',
    vatRate: '15.00',
    description: '',
  };
}

function emptyCheckout(): CheckoutState {
  return {
    customerId: '',
    paymentMethod: 'CASH',
    paidAmount: '',
    notes: '',
    lines: [emptyCartLine()],
  };
}

function isProductType(p: Product | undefined, t: 'PRODUCT' | 'SERVICE'): boolean {
  return !!p && p.type === t && p.isActive && !p.deletedAt;
}

// Display-only Number coercion (no arithmetic in the UI).
function toDisplayNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
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

export default function PosPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  const canRead = hasPermission('pos.read');
  const canCreate = hasPermission('pos.create');

  // ===== Lookups =====
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customers, setCustomers] = useState<Partner[]>([]);
  const [lookupsErr, setLookupsErr] = useState<string | null>(null);

  // ===== Recent POS sales =====
  const [items, setItems] = useState<SalesInvoice[]>([]);
  const [recentTotal, setRecentTotal] = useState<0 | number>(0);
  const [recentErr, setRecentErr] = useState<string | null>(null);
  const [recentLoading, setRecentLoading] = useState(true);

  // ===== Checkout form =====
  const [checkout, setCheckout] = useState<CheckoutState>(emptyCheckout);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [lastIssued, setLastIssued] = useState<SalesInvoice | null>(null);

  // ===== Auth gate =====
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }
    if (!loading && user && !canRead) {
      router.replace('/dashboard');
    }
  }, [loading, user, canRead, router]);

  // ===== Lookups load =====
  useEffect(() => {
    if (loading || !user || !canRead) return;
    let alive = true;
    setLookupsErr(null);
    Promise.all([
      api.listActiveProducts(),
      api.listActiveWarehouses(),
      api.listActiveCustomers(),
    ])
      .then(([p, w, c]) => {
        if (!alive) return;
        setProducts(p.items);
        setWarehouses(w.items);
        setCustomers(c.items);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError) setLookupsErr(e.message);
        else if (e instanceof Error) setLookupsErr(e.message);
        else setLookupsErr('Failed to load lookups');
      });
    return () => {
      alive = false;
    };
  }, [loading, user, canRead]);

  // ===== Recent sales load =====
  useEffect(() => {
    if (loading || !user || !canRead) return;
    let alive = true;
    setRecentLoading(true);
    setRecentErr(null);
    api
      .listPosSales({ page: 1, pageSize: 20 })
      .then((p) => {
        if (!alive) return;
        setItems(p.items);
        setRecentTotal(p.total);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError) setRecentErr(e.message);
        else if (e instanceof Error) setRecentErr(e.message);
        else setRecentErr('Failed to load recent POS sales');
      })
      .finally(() => {
        if (alive) setRecentLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loading, user, canRead]);

  // ===== Lookup maps =====
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

  const customerById = useMemo(() => {
    const m = new Map<string, Partner>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  // ===== Cart line edits =====
  const addLine = () => {
    setCheckout((s) => ({ ...s, lines: [...s.lines, emptyCartLine()] }));
  };

  const removeLine = (idx: number) => {
    setCheckout((s) => {
      const next = s.lines.filter((_, i) => i !== idx);
      return { ...s, lines: next.length ? next : [emptyCartLine()] };
    });
  };

  const updateLine = (idx: number, patch: Partial<CartLineState>) => {
    setCheckout((s) => ({
      ...s,
      lines: s.lines.map((line, i) => (i === idx ? { ...line, ...patch } : line)),
    }));
  };

  const updateCartLineProduct = (idx: number, productId: string) => {
    const p = productById.get(productId);
    setCheckout((s) => ({
      ...s,
      lines: s.lines.map((line, i) => {
        if (i !== idx) return line;
        const next: CartLineState = { ...line, productId };
        // Auto-populate unitPrice from product default (price before VAT).
        // Compute inclusive price: priceBeforeVat * (1 + vatRate/100).
        if (p && p.priceBeforeVat !== null && p.priceBeforeVat !== undefined) {
          const base = toDisplayNum(p.priceBeforeVat);
          const rate = toDisplayNum(p.vatRate);
          if (base >= 0) {
            // Display-only computation; the backend is authoritative on totals.
            const inclusive = base * (1 + rate / 100);
            next.unitPrice = inclusive.toFixed(4);
          }
        }
        if (p && p.type === 'SERVICE') {
          next.warehouseId = '';
        }
        return next;
      }),
    }));
  };

  // ===== Totals (display only; backend is authoritative) =====
  const totals = useMemo(() => {
    let subtotal = 0; // sum of (qty * unitPrice - discount)
    let discountTotal = 0;
    let vatTotal = 0;
    let total = 0;
    for (const line of checkout.lines) {
      if (!line.productId) continue;
      const q = toDisplayNum(line.quantity);
      const p = toDisplayNum(line.unitPrice);
      const d = toDisplayNum(line.discountAmount);
      const v = toDisplayNum(line.vatRate);
      const gross = q * p;
      const lineSub = Math.max(0, gross - d);
      const vat = (lineSub * v) / 100;
      subtotal += gross;
      discountTotal += d;
      vatTotal += vat;
      total += lineSub + vat;
    }
    return { subtotal, discountTotal, vatTotal, total };
  }, [checkout.lines]);

  const lineCount = checkout.lines.filter((l) => !!l.productId).length;

  // ===== Submit =====
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitErr(null);

    if (!canCreate) {
      setSubmitErr('You do not have pos.create permission.');
      return;
    }
    if (lineCount === 0) {
      setSubmitErr('Add at least one product to the cart.');
      return;
    }

    const productLines: CreatePosSaleLineInput[] = [];
    for (const line of checkout.lines) {
      if (!line.productId) continue;
      const p = productById.get(line.productId);
      const q = toDisplayNum(line.quantity);
      const u = toDisplayNum(line.unitPrice);
      const d = toDisplayNum(line.discountAmount);
      if (q <= 0) {
        setSubmitErr(`Quantity must be > 0 for ${p?.name ?? 'line'}.`);
        return;
      }
      if (u < 0) {
        setSubmitErr(`Unit price cannot be negative for ${p?.name ?? 'line'}.`);
        return;
      }
      if (isProductType(p, 'PRODUCT') && !line.warehouseId) {
        setSubmitErr(`PRODUCT line "${p?.name ?? line.productId}" requires a warehouse.`);
        return;
      }
      const out: CreatePosSaleLineInput = {
        productId: line.productId,
        quantity: q.toFixed(4),
        unitPrice: u.toFixed(4),
      };
      if (d > 0) out.discountAmount = d.toFixed(4);
      if (line.warehouseId) out.warehouseId = line.warehouseId;
      if (line.description.trim()) out.description = line.description.trim();
      if (line.vatRate) out.vatRate = toDisplayNum(line.vatRate).toFixed(2);
      productLines.push(out);
    }

    const payload: Parameters<typeof api.createPosSale>[0] = {
      paymentMethod: checkout.paymentMethod,
      lines: productLines,
    };
    if (checkout.customerId) payload.customerId = checkout.customerId;
    const paidNum = toDisplayNum(checkout.paidAmount);
    if (paidNum >= 0 && checkout.paidAmount.trim() !== '') {
      payload.paidAmount = paidNum.toFixed(4);
    }
    if (checkout.notes.trim()) payload.notes = checkout.notes.trim();

    setSubmitting(true);
    try {
      const issued = await api.createPosSale(payload);
      setLastIssued(issued);
      setCheckout(emptyCheckout());
      // Refresh recent list
      try {
        const fresh = await api.listPosSales({ page: 1, pageSize: 20 });
        setItems(fresh.items);
        setRecentTotal(fresh.total);
      } catch {
        /* non-fatal */
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) setSubmitErr(e.message);
      else if (e instanceof Error) setSubmitErr(e.message);
      else setSubmitErr('POS sale failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading shell
  if (loading || !user || !canRead) {
    return (
      <main className="min-h-screen p-6 bg-slate-50" dir="rtl" lang="ar">
        <div className="text-slate-500">جاري التحميل…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-slate-50" dir="rtl" lang="ar">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">نقطة البيع — POS</h1>
          <p className="text-sm text-slate-500 mt-1">
            إصدار فواتير بيع فورية ({lineCount} صنف في السلة)
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link href="/dashboard" className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
            لوحة التحكم
          </Link>
          <Link href="/sales" className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
            المبيعات
          </Link>
        </nav>
      </header>

      {lookupsErr && (
        <div className="mb-4 p-3 rounded border border-red-300 bg-red-50 text-red-800">
          تعذّر تحميل البيانات المرجعية: {lookupsErr}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ===== Left: Cart ===== */}
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-800">سلّة المشتريات</h2>
            <button
              type="button"
              onClick={addLine}
              className="px-3 py-1.5 rounded border border-emerald-600 bg-emerald-600 text-white text-sm hover:bg-emerald-700"
            >
              + صنف
            </button>
          </div>

          {checkout.lines.length === 0 ? (
            <div className="text-slate-400 text-sm">لا توجد أصناف.</div>
          ) : (
            <div className="space-y-3">
              {checkout.lines.map((line, idx) => {
                const p = productById.get(line.productId);
                const isService = isProductType(p, 'SERVICE');
                return (
                  <div key={idx} className="border border-slate-200 rounded p-3 bg-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                      <label className="md:col-span-2 text-sm flex flex-col">
                        <span className="text-slate-600 mb-1">المنتج / الخدمة</span>
                        <select
                          value={line.productId}
                          onChange={(e) => updateCartLineProduct(idx, e.target.value)}
                          className="border border-slate-300 rounded px-2 py-1.5 bg-white"
                        >
                          <option value="">— اختر —</option>
                          {products.map((pp) => (
                            <option key={pp.id} value={pp.id}>
                              {pp.sku ? `${pp.sku} — ${pp.name}` : pp.name} ({pp.type})
                            </option>
                          ))}
                        </select>
                      </label>

                      {!isService && (
                        <label className="md:col-span-2 text-sm flex flex-col">
                          <span className="text-slate-600 mb-1">المخزن *</span>
                          <select
                            value={line.warehouseId}
                            onChange={(e) => updateLine(idx, { warehouseId: e.target.value })}
                            className="border border-slate-300 rounded px-2 py-1.5 bg-white"
                            required={!isService}
                          >
                            <option value="">— اختر —</option>
                            {warehouses.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.code} — {w.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <label className="text-sm flex flex-col">
                        <span className="text-slate-600 mb-1">الكمية</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                          className="border border-slate-300 rounded px-2 py-1.5"
                          dir="ltr"
                        />
                      </label>

                      <label className="text-sm flex flex-col">
                        <span className="text-slate-600 mb-1">السعر</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                          className="border border-slate-300 rounded px-2 py-1.5"
                          dir="ltr"
                        />
                      </label>

                      <label className="text-sm flex flex-col">
                        <span className="text-slate-600 mb-1">خصم</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={line.discountAmount}
                          onChange={(e) => updateLine(idx, { discountAmount: e.target.value })}
                          className="border border-slate-300 rounded px-2 py-1.5"
                          dir="ltr"
                        />
                      </label>

                      <label className="text-sm flex flex-col">
                        <span className="text-slate-600 mb-1">ضريبة %</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.vatRate}
                          onChange={(e) => updateLine(idx, { vatRate: e.target.value })}
                          className="border border-slate-300 rounded px-2 py-1.5"
                          dir="ltr"
                        />
                      </label>

                      <label className="md:col-span-2 text-sm flex flex-col">
                        <span className="text-slate-600 mb-1">وصف (اختياري)</span>
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => updateLine(idx, { description: e.target.value })}
                          className="border border-slate-300 rounded px-2 py-1.5"
                        />
                      </label>

                      <div className="md:col-span-1 flex items-end">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="px-2 py-1.5 rounded border border-red-300 text-red-700 text-sm hover:bg-red-50"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ===== Right: Totals + payment + submit ===== */}
        <aside className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
          <form onSubmit={submit} className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">الدفع والإجمالي</h2>

            <label className="text-sm flex flex-col">
              <span className="text-slate-600 mb-1">العميل (اختياري)</span>
              <select
                value={checkout.customerId}
                onChange={(e) => setCheckout((s) => ({ ...s, customerId: e.target.value }))}
                className="border border-slate-300 rounded px-2 py-1.5 bg-white"
              >
                <option value="">— بيع نقدي بدون عميل مسجّل —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} — ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm flex flex-col">
              <span className="text-slate-600 mb-1">وسيلة الدفع</span>
              <select
                value={checkout.paymentMethod}
                onChange={(e) =>
                  setCheckout((s) => ({ ...s, paymentMethod: e.target.value as PaymentMethod }))
                }
                className="border border-slate-300 rounded px-2 py-1.5 bg-white"
              >
                <option value="CASH">نقدي</option>
                <option value="CARD">بطاقة</option>
                <option value="TRANSFER">تحويل بنكي</option>
                <option value="OTHER">أخرى</option>
              </select>
            </label>

            <label className="text-sm flex flex-col">
              <span className="text-slate-600 mb-1">المبلغ المدفوع (اختياري)</span>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={checkout.paidAmount}
                onChange={(e) => setCheckout((s) => ({ ...s, paidAmount: e.target.value }))}
                className="border border-slate-300 rounded px-2 py-1.5"
                dir="ltr"
                placeholder="0"
              />
            </label>

            <label className="text-sm flex flex-col">
              <span className="text-slate-600 mb-1">ملاحظات</span>
              <textarea
                rows={2}
                value={checkout.notes}
                onChange={(e) => setCheckout((s) => ({ ...s, notes: e.target.value }))}
                className="border border-slate-300 rounded px-2 py-1.5"
              />
            </label>

            <div className="border-t border-slate-200 pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">الإجمالي قبل الخصم</span>
                <span className="font-mono">{fmtMoney(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">إجمالي الخصم</span>
                <span className="font-mono">{fmtMoney(totals.discountTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ضريبة القيمة المضافة</span>
                <span className="font-mono">{fmtMoney(totals.vatTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                <span className="text-slate-800 font-semibold">الإجمالي</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {fmtMoney(totals.total)}
                </span>
              </div>
            </div>

            {submitErr && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-300 p-2 rounded">
                {submitErr}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || lineCount === 0 || !canCreate}
              className="w-full px-4 py-2 rounded bg-emerald-600 text-white font-semibold disabled:bg-slate-400 hover:bg-emerald-700"
            >
              {submitting ? 'جاري الإصدار…' : 'إصدار فاتورة POS'}
            </button>
            {!canCreate && (
              <p className="text-xs text-slate-500">لا تملك صلاحية pos.create. المعاينة فقط.</p>
            )}
          </form>

          {lastIssued && (
            <div className="mt-4 border-t border-slate-200 pt-3 text-sm">
              <div className="text-emerald-800 font-semibold mb-1">أُصدرت الفاتورة</div>
              <div>رقم الفاتورة: <span className="font-mono">{lastIssued.invoiceNumber}</span></div>
              <div>الحالة: <span className="font-mono">{lastIssued.status}</span></div>
              <div>الإجمالي: <span className="font-mono">{fmtMoney(lastIssued.total)}</span></div>
              <div>عدد الأصناف: <span className="font-mono">{lastIssued._count?.lines ?? '—'}</span></div>
            </div>
          )}
        </aside>
      </div>

      {/* ===== Recent POS sales list ===== */}
      <section className="mt-8 bg-white border border-slate-200 rounded-lg shadow-sm p-4">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">آخر فواتير POS</h2>
          <span className="text-xs text-slate-500">{recentTotal} إجمالي</span>
        </header>

        {recentErr && (
          <div className="text-red-700 bg-red-50 border border-red-300 p-2 rounded text-sm mb-2">
            {recentErr}
          </div>
        )}

        {recentLoading ? (
          <div className="text-slate-500 text-sm">جاري التحميل…</div>
        ) : items.length === 0 ? (
          <div className="text-slate-400 text-sm">لا توجد فواتير POS بعد.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-right p-2">رقم الفاتورة</th>
                  <th className="text-right p-2">العميل</th>
                  <th className="text-right p-2">تاريخ الإصدار</th>
                  <th className="text-right p-2">الدفع</th>
                  <th className="text-right p-2">المدفوع</th>
                  <th className="text-right p-2">الإجمالي</th>
                  <th className="text-right p-2">الحالة</th>
                  <th className="text-right p-2">عدد الأصناف</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => {
                  const cust = inv.customerId ? customerById.get(inv.customerId) : undefined;
                  const paidAmt =
                    inv.paidAmount !== null && inv.paidAmount !== undefined
                      ? toDisplayNum(inv.paidAmount)
                      : 0;
                  return (
                    <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-2 font-mono">{inv.invoiceNumber}</td>
                      <td className="p-2">{inv.customer?.name ?? cust?.name ?? '—'}</td>
                      <td className="p-2 text-slate-600">{fmtDate(inv.issueDate ?? inv.issuedAt)}</td>
                      <td className="p-2 text-slate-600">
                        {inv.paymentMethod === 'CASH'
                          ? 'نقدي'
                          : inv.paymentMethod === 'CARD'
                            ? 'بطاقة'
                            : inv.paymentMethod === 'TRANSFER'
                              ? 'تحويل'
                              : inv.paymentMethod === 'OTHER'
                                ? 'أخرى'
                                : '—'}
                      </td>
                      <td className="p-2 font-mono">{fmtMoney(paidAmt)}</td>
                      <td className="p-2 font-mono">{fmtMoney(inv.total)}</td>
                      <td className="p-2">
                        <span
                          className={
                            inv.status === 'ISSUED'
                              ? 'inline-block px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800'
                              : inv.status === 'DRAFT'
                                ? 'inline-block px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800'
                                : 'inline-block px-2 py-0.5 rounded text-xs bg-red-100 text-red-800'
                          }
                        >
                          {inv.status === 'ISSUED'
                            ? 'صادرة'
                            : inv.status === 'DRAFT'
                              ? 'مسودة'
                              : 'ملغاة'}
                        </span>
                      </td>
                      <td className="p-2 font-mono">{inv._count?.lines ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
