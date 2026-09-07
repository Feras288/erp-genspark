'use client';

// =====================================================
// Phase 2: Products master-data page.
// - Loads list from /api/products (companyId from JWT only).
// - Search by name/sku/barcode, filter by type, filter by isActive.
// - Create / edit / soft-delete via API.
// - Permission-gated; redirects users without `products.read`.
// =====================================================
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type { Product } from '@/lib/api';

interface CreateForm {
  sku: string;
  name: string;
  nameAr: string;
  description: string;
  type: 'PRODUCT' | 'SERVICE';
  barcode: string;
  unit: string;
  priceBeforeVat: string;
  vatRate: string;
  isActive: boolean;
}

function emptyCreate(): CreateForm {
  return {
    sku: '',
    name: '',
    nameAr: '',
    description: '',
    type: 'PRODUCT',
    barcode: '',
    unit: 'pcs',
    priceBeforeVat: '',
    vatRate: '15.00',
    isActive: true,
  };
}

export default function ProductsPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'PRODUCT' | 'SERVICE'>('');
  const [err, setErr] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const pageSize = 20;

  const [form, setForm] = useState<CreateForm>(emptyCreate());
  const [formErr, setFormErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !hasPermission('products.read')) {
      router.replace('/dashboard');
    }
  }, [loading, user, hasPermission, router]);

  const reload = () => {
    if (!user || !hasPermission('products.read')) return;
    let cancelled = false;
    setLoadingData(true);
    api
      .listProducts({
        page,
        pageSize,
        search: search || undefined,
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
  }, [page, search, typeFilter, user]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-slate-500">...جاري التحميل</p>
      </main>
    );
  }
  if (!user) return null;

  const canCreate = hasPermission('products.create');
  const canUpdate = hasPermission('products.update');
  const canDelete = hasPermission('products.delete');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const onEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      sku: p.sku,
      name: p.name,
      nameAr: p.nameAr ?? '',
      description: p.description ?? '',
      type: p.type,
      barcode: p.barcode ?? '',
      unit: p.unit ?? '',
      priceBeforeVat: p.priceBeforeVat ?? '',
      vatRate: p.vatRate,
      isActive: p.isActive,
    });
  };

  const onCancelEdit = () => {
    setEditingId(null);
    setForm(emptyCreate());
    setFormErr(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setSubmitting(true);
    try {
      const payload: Partial<Product> = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || undefined,
        description: form.description.trim() || undefined,
        type: form.type,
        barcode: form.barcode.trim() || undefined,
        unit: form.unit.trim() || undefined,
        priceBeforeVat: form.priceBeforeVat.trim() || undefined,
        vatRate: form.vatRate.trim() || undefined,
        isActive: form.isActive,
      };
      if (editingId) {
        await api.updateProduct(editingId, payload);
      } else {
        await api.createProduct(payload);
      }
      onCancelEdit();
      reload();
    } catch (err) {
      if (err instanceof ApiError) setFormErr(err.message);
      else setFormErr(err instanceof Error ? err.message : 'failed');
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المنتج؟ (حذف ناعم)')) return;
    try {
      await api.deleteProduct(id);
      if (editingId === id) onCancelEdit();
      reload();
    } catch (err) {
      setErr(err instanceof Error ? err.message : 'failed');
    }
  };

  return (
    <main className="min-h-screen p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">المنتجات والخدمات</h1>
          <p className="text-sm text-slate-500">
            يعرض كل المنتجات داخل شركتك فقط ({user.companyId}).
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm px-4 py-2"
        >
          لوحة المعلومات
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="ابحث بالاسم / SKU / الباركود"
          className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          dir="ltr"
        />
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as typeof typeFilter);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل الأنواع</option>
          <option value="PRODUCT">منتج</option>
          <option value="SERVICE">خدمة</option>
        </select>
      </div>

      {err && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700 mb-4">
          {err}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-right px-4 py-3 font-medium">SKU</th>
              <th className="text-right px-4 py-3 font-medium">الاسم</th>
              <th className="text-right px-4 py-3 font-medium">النوع</th>
              <th className="text-right px-4 py-3 font-medium">السعر قبل الضريبة</th>
              <th className="text-right px-4 py-3 font-medium">نسبة الضريبة</th>
              <th className="text-right px-4 py-3 font-medium">الحالة</th>
              <th className="text-right px-4 py-3 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loadingData ? (
              <tr>
                <td colSpan={7} className="text-center px-4 py-6 text-slate-400">
                  ...جاري التحميل
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center px-4 py-6 text-slate-400">
                  لا توجد منتجات.
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-800 font-mono" dir="ltr">{p.sku}</td>
                  <td className="px-4 py-3 text-slate-800">
                    {p.name}
                    {p.nameAr ? <div className="text-xs text-slate-500">{p.nameAr}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.type === 'PRODUCT' ? 'منتج' : 'خدمة'}
                  </td>
                  <td className="px-4 py-3 text-slate-600" dir="ltr">
                    {p.priceBeforeVat ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600" dir="ltr">
                    {p.vatRate}%
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'inline-flex items-center rounded-md px-2 py-0.5 text-xs ' +
                        (p.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600')
                      }
                    >
                      {p.isActive ? 'نشط' : 'موقوف'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        disabled={!canUpdate}
                        onClick={() => onEdit(p)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 hover:bg-slate-50"
                      >
                        تعديل
                      </button>
                      <button
                        disabled={!canDelete}
                        onClick={() => onDelete(p.id)}
                        className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-40 hover:bg-rose-50"
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

      <div className="flex items-center justify-between text-sm mb-8">
        <span className="text-slate-500">
          {total} منتج • صفحة {page} من {totalPages}
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

      {(canCreate || editingId) && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            {editingId ? 'تعديل المنتج' : 'إضافة منتج جديد'}
          </h2>
          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="block text-slate-700 mb-1">SKU *</span>
              <input
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                disabled={!!editingId}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono disabled:bg-slate-100"
                dir="ltr"
              />
              <span className="text-xs text-slate-500">فريد داخل شركتك</span>
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">الاسم *</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">الاسم بالعربية</span>
              <input
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">النوع</span>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as 'PRODUCT' | 'SERVICE' })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="PRODUCT">منتج</option>
                <option value="SERVICE">خدمة</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">الباركود</span>
              <input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                dir="ltr"
              />
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">الوحدة</span>
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">السعر قبل الضريبة</span>
              <input
                value={form.priceBeforeVat}
                onChange={(e) => setForm({ ...form, priceBeforeVat: e.target.value })}
                placeholder="0.0000"
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                dir="ltr"
              />
            </label>

            <label className="text-sm">
              <span className="block text-slate-700 mb-1">نسبة الضريبة %</span>
              <input
                value={form.vatRate}
                onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
                placeholder="15.00"
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                dir="ltr"
              />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-slate-700 mb-1">الوصف</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span className="text-slate-700">نشط</span>
            </label>

            {formErr && (
              <div className="md:col-span-2 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                {formErr}
              </div>
            )}

            <div className="md:col-span-2 flex gap-2 justify-end">
              {editingId && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  إلغاء
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 disabled:opacity-40"
              >
                {submitting ? '...جاري الحفظ' : editingId ? 'حفظ التعديلات' : 'إضافة'}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
