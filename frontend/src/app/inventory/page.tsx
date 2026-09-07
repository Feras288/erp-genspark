'use client';

// =====================================================
// Phase 3: Inventory page.
//
// Tabs:
//   1) Stock levels  (inventory.read)
//   2) Movements     (stockMovements.read)
//
// Write actions:
//   - Manual adjustment (inventory.adjust) — IN / OUT, requires reason.
//   - Warehouse transfer (inventory.transfer) — paired movements.
//
// All queries are scoped by companyId from JWT only.
// No mock data. No localStorage / sessionStorage.
// No Sales/POS/Purchases/Accounting/Reports/ZATCA UI in Phase 3.
// =====================================================
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type {
  Product,
  StockLevel,
  StockMovement,
  Warehouse,
} from '@/lib/api';

type Tab = 'levels' | 'movements';

interface AdjustForm {
  productId: string;
  warehouseId: string;
  adjustmentType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
  quantity: string;
  reason: string;
  notes: string;
}

interface TransferForm {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: string;
  notes: string;
}

function emptyAdjust(): AdjustForm {
  return {
    productId: '',
    warehouseId: '',
    adjustmentType: 'ADJUSTMENT_IN',
    quantity: '',
    reason: '',
    notes: '',
  };
}

function emptyTransfer(): TransferForm {
  return {
    productId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: '',
    notes: '',
  };
}

export default function InventoryPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  const [tab, setTab] = useState<Tab>('levels');

  // Stock levels tab
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [levelsTotal, setLevelsTotal] = useState(0);
  const [levelsPage, setLevelsPage] = useState(1);
  const [levelsSearch, setLevelsSearch] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tabErr, setTabErr] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(true);
  const pageSize = 20;

  // Movements tab
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [movementsPage, setMovementsPage] = useState(1);

  // Adjustment form
  const [adjustForm, setAdjustForm] = useState<AdjustForm>(emptyAdjust());
  const [adjustErr, setAdjustErr] = useState<string | null>(null);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  // Transfer form
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransfer());
  const [transferErr, setTransferErr] = useState<string | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (
      !loading &&
      user &&
      !hasPermission('inventory.read') &&
      !hasPermission('stockMovements.read')
    ) {
      router.replace('/dashboard');
    }
  }, [loading, user, hasPermission, router]);

  const canListLevels = !!user && hasPermission('inventory.read');
  const canListMovements = !!user && hasPermission('stockMovements.read');
  const canAdjust = !!user && hasPermission('inventory.adjust');
  const canTransfer = !!user && hasPermission('inventory.transfer');

  // Load warehouses + active PRODUCT products once per mount (forms depend on them).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [wRes, pRes] = await Promise.all([
          api.listWarehouses({ page: 1, pageSize: 200, isActive: true }),
          api.listProductsLiteForInventory(),
        ]);
        if (cancelled) return;
        setWarehouses(wRes.items);
        setProducts(pRes.items);
      } catch (e) {
        if (!cancelled)
          setTabErr(e instanceof Error ? e.message : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const reloadLevels = () => {
    if (!canListLevels) return;
    let cancelled = false;
    setTabLoading(true);
    api
      .listStockLevels({
        page: levelsPage,
        pageSize,
        search: levelsSearch || undefined,
      })
      .then((res) => {
        if (cancelled) return;
        setLevels(res.items);
        setLevelsTotal(res.total);
        setTabErr(null);
      })
      .catch((e) => !cancelled && setTabErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => !cancelled && setTabLoading(false));
    return () => {
      cancelled = true;
    };
  };

  const reloadMovements = () => {
    if (!canListMovements) return;
    let cancelled = false;
    setTabLoading(true);
    api
      .listStockMovements({
        page: movementsPage,
        pageSize,
      })
      .then((res) => {
        if (cancelled) return;
        setMovements(res.items);
        setMovementsTotal(res.total);
        setTabErr(null);
      })
      .catch((e) => !cancelled && setTabErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => !cancelled && setTabLoading(false));
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    if (tab === 'levels') reloadLevels();
    else reloadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, levelsPage, levelsSearch, movementsPage, user]);

  const warehouseName = useMemo(
    () => (id: string) => warehouses.find((w) => w.id === id)?.name ?? id,
    [warehouses],
  );
  const productLabel = useMemo(
    () => (id: string) => {
      const p = products.find((x) => x.id === id);
      return p ? `${p.sku} — ${p.name}` : id;
    },
    [products],
  );

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-slate-500">...جاري التحميل</p>
      </main>
    );
  }
  if (!user) return null;

  const refreshAll = () => {
    if (tab === 'levels') reloadLevels();
    else reloadMovements();
  };

  const onAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustErr(null);
    setAdjustSubmitting(true);
    try {
      const quantity = adjustForm.quantity.trim();
      if (!quantity || Number(quantity) <= 0) {
        setAdjustErr('الكمية يجب أن تكون رقماً أكبر من صفر');
        return;
      }
      if (!adjustForm.reason.trim()) {
        setAdjustErr('السبب مطلوب للتسوية');
        return;
      }
      await api.adjustStock({
        productId: adjustForm.productId,
        warehouseId: adjustForm.warehouseId,
        adjustmentType: adjustForm.adjustmentType,
        quantity,
        reason: adjustForm.reason.trim(),
        notes: adjustForm.notes.trim() || undefined,
      });
      setAdjustForm(emptyAdjust());
      refreshAll();
    } catch (err) {
      if (err instanceof ApiError) setAdjustErr(err.message);
      else setAdjustErr(err instanceof Error ? err.message : 'failed');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const onTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferErr(null);
    setTransferSubmitting(true);
    try {
      const quantity = transferForm.quantity.trim();
      if (!quantity || Number(quantity) <= 0) {
        setTransferErr('الكمية يجب أن تكون رقماً أكبر من صفر');
        return;
      }
      if (
        transferForm.fromWarehouseId &&
        transferForm.toWarehouseId &&
        transferForm.fromWarehouseId === transferForm.toWarehouseId
      ) {
        setTransferErr('لا يمكن أن يكون المصدر والوجهة نفس المستودع');
        return;
      }
      await api.transferStock({
        fromWarehouseId: transferForm.fromWarehouseId,
        toWarehouseId: transferForm.toWarehouseId,
        productId: transferForm.productId,
        quantity,
        notes: transferForm.notes.trim() || undefined,
      });
      setTransferForm(emptyTransfer());
      refreshAll();
    } catch (err) {
      if (err instanceof ApiError) setTransferErr(err.message);
      else setTransferErr(err instanceof Error ? err.message : 'failed');
    } finally {
      setTransferSubmitting(false);
    }
  };

  const levelsTotalPages = Math.max(1, Math.ceil(levelsTotal / pageSize));
  const movementsTotalPages = Math.max(1, Math.ceil(movementsTotal / pageSize));

  return (
    <main className="min-h-screen p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">المخزون</h1>
          <p className="text-sm text-slate-500">
            يعرض أرصدة وحركات المخزون داخل شركتك فقط ({user.companyId}).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshAll}
            className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm px-4 py-2"
          >
            تحديث
          </button>
          <Link
            href="/dashboard"
            className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm px-4 py-2"
          >
            لوحة المعلومات
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('levels')}
          className={
            'rounded-md px-4 py-2 text-sm ' +
            (tab === 'levels'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
          }
        >
          أرصدة المخزون
        </button>
        <button
          onClick={() => setTab('movements')}
          className={
            'rounded-md px-4 py-2 text-sm ' +
            (tab === 'movements'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
          }
        >
          سجل الحركات
        </button>
      </div>

      {tabErr && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700 mb-4">
          {tabErr}
        </div>
      )}

      {/* ===== Levels tab ===== */}
      {tab === 'levels' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              type="search"
              value={levelsSearch}
              onChange={(e) => {
                setLevelsSearch(e.target.value);
                setLevelsPage(1);
              }}
              placeholder="بحث بالـ SKU / اسم المنتج"
              className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              dir="ltr"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="text-right px-4 py-3 font-medium">المنتج</th>
                  <th className="text-right px-4 py-3 font-medium">المستودع</th>
                  <th className="text-right px-4 py-3 font-medium">الكمية</th>
                  <th className="text-right px-4 py-3 font-medium">المحجوزة</th>
                </tr>
              </thead>
              <tbody>
                {tabLoading ? (
                  <tr>
                    <td colSpan={4} className="text-center px-4 py-6 text-slate-400">
                      ...جاري التحميل
                    </td>
                  </tr>
                ) : levels.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center px-4 py-6 text-slate-400">
                      لا توجد أرصدة مخزون.
                    </td>
                  </tr>
                ) : (
                  levels.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-800" dir="ltr">
                        {l.product ? `${l.product.sku} — ${l.product.name}` : productLabel(l.productId)}
                      </td>
                      <td className="px-4 py-3 text-slate-600" dir="ltr">
                        {l.warehouse
                          ? `${l.warehouse.code} — ${l.warehouse.name}`
                          : warehouseName(l.warehouseId)}
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-mono" dir="ltr">
                        {Number(l.quantity)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono" dir="ltr">
                        {Number(l.reservedQuantity)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm mb-8">
            <span className="text-slate-500">
              {levelsTotal} رصيد • صفحة {levelsPage} من {levelsTotalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={levelsPage <= 1}
                onClick={() => setLevelsPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                السابق
              </button>
              <button
                disabled={levelsPage >= levelsTotalPages}
                onClick={() => setLevelsPage((p) => Math.min(levelsTotalPages, p + 1))}
                className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        </>
      )}

      {/* ===== Movements tab ===== */}
      {tab === 'movements' && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                  <th className="text-right px-4 py-3 font-medium">النوع</th>
                  <th className="text-right px-4 py-3 font-medium">الاتجاه</th>
                  <th className="text-right px-4 py-3 font-medium">المنتج</th>
                  <th className="text-right px-4 py-3 font-medium">المستودع</th>
                  <th className="text-right px-4 py-3 font-medium">الكمية</th>
                  <th className="text-right px-4 py-3 font-medium">السبب</th>
                </tr>
              </thead>
              <tbody>
                {tabLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center px-4 py-6 text-slate-400">
                      ...جاري التحميل
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center px-4 py-6 text-slate-400">
                      لا توجد حركات بعد.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-600" dir="ltr">
                        {m.movementDate.slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="px-4 py-3 text-slate-800" dir="ltr">
                        {m.movementType}
                      </td>
                      <td className="px-4 py-3" dir="ltr">
                        <span
                          className={
                            'inline-flex items-center rounded-md px-2 py-0.5 text-xs ' +
                            (m.direction === 'IN'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700')
                          }
                        >
                          {m.direction}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-800" dir="ltr">
                        {m.product ? `${m.product.sku} — ${m.product.name}` : productLabel(m.productId)}
                      </td>
                      <td className="px-4 py-3 text-slate-600" dir="ltr">
                        {m.warehouse
                          ? `${m.warehouse.code} — ${m.warehouse.name}`
                          : warehouseName(m.warehouseId)}
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-mono" dir="ltr">
                        {Number(m.quantity)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {m.reason ?? m.notes ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm mb-8">
            <span className="text-slate-500">
              {movementsTotal} حركة • صفحة {movementsPage} من {movementsTotalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={movementsPage <= 1}
                onClick={() => setMovementsPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                السابق
              </button>
              <button
                disabled={movementsPage >= movementsTotalPages}
                onClick={() => setMovementsPage((p) => Math.min(movementsTotalPages, p + 1))}
                className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        </>
      )}

      {/* ===== Action forms ===== */}
      {canAdjust && products.length > 0 && warehouses.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            تسوية يدوية للمخزون
          </h2>
          <form onSubmit={onAdjust} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="block text-slate-700 mb-1">المنتج (PRODUCT فقط) *</span>
              <select
                required
                value={adjustForm.productId}
                onChange={(e) => setAdjustForm({ ...adjustForm, productId: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                dir="ltr"
              >
                <option value="">اختر منتجاً</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">المستودع *</span>
              <select
                required
                value={adjustForm.warehouseId}
                onChange={(e) => setAdjustForm({ ...adjustForm, warehouseId: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                dir="ltr"
              >
                <option value="">اختر مستودعاً</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">الاتجاه</span>
              <select
                value={adjustForm.adjustmentType}
                onChange={(e) =>
                  setAdjustForm({
                    ...adjustForm,
                    adjustmentType: e.target.value as AdjustForm['adjustmentType'],
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                dir="ltr"
              >
                <option value="ADJUSTMENT_IN">إضافة (IN)</option>
                <option value="ADJUSTMENT_OUT">خصم (OUT)</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">الكمية *</span>
              <input
                required
                value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                placeholder="0.0000"
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                dir="ltr"
              />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-slate-700 mb-1">السبب *</span>
              <input
                required
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                placeholder="مثلاً: جرد فعلي / إتلاف"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-slate-700 mb-1">ملاحظات</span>
              <textarea
                value={adjustForm.notes}
                onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            {adjustErr && (
              <div className="md:col-span-2 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                {adjustErr}
              </div>
            )}

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={adjustSubmitting}
                className="rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 disabled:opacity-40"
              >
                {adjustSubmitting ? '...جاري التسوية' : 'تسوية'}
              </button>
            </div>
          </form>
        </section>
      )}

      {canTransfer && products.length > 0 && warehouses.length >= 2 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            تحويل بين المستودعات
          </h2>
          <form onSubmit={onTransfer} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="block text-slate-700 mb-1">المنتج (PRODUCT فقط) *</span>
              <select
                required
                value={transferForm.productId}
                onChange={(e) => setTransferForm({ ...transferForm, productId: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                dir="ltr"
              >
                <option value="">اختر منتجاً</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">الكمية *</span>
              <input
                required
                value={transferForm.quantity}
                onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
                placeholder="0.0000"
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                dir="ltr"
              />
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">من المستودع *</span>
              <select
                required
                value={transferForm.fromWarehouseId}
                onChange={(e) =>
                  setTransferForm({ ...transferForm, fromWarehouseId: e.target.value })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                dir="ltr"
              >
                <option value="">اختر مستودعاً</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">إلى المستودع *</span>
              <select
                required
                value={transferForm.toWarehouseId}
                onChange={(e) =>
                  setTransferForm({ ...transferForm, toWarehouseId: e.target.value })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                dir="ltr"
              >
                <option value="">اختر مستودعاً</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-slate-700 mb-1">ملاحظات</span>
              <textarea
                value={transferForm.notes}
                onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            {transferErr && (
              <div className="md:col-span-2 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                {transferErr}
              </div>
            )}

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={transferSubmitting}
                className="rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm px-4 py-2 disabled:opacity-40"
              >
                {transferSubmitting ? '...جاري التحويل' : 'تحويل'}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
