'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

interface HealthState {
  status: 'loading' | 'ok' | 'error';
  data?: { status: string; info?: unknown };
  message?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    const apiUrl =
      (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
      'http://localhost:3001/api';
    let mounted = true;
    fetch(`${apiUrl}/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => mounted && setHealth({ status: 'ok', data }))
      .catch((e) => mounted && setHealth({ status: 'error', message: (e as Error).message }));
    return () => {
      mounted = false;
    };
  }, []);

  if (loading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-slate-500">...جاري التحميل</p>
      </main>
    );
  }

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  // Trigger an authenticated request just to prove Bearer works end-to-end.
  async function pingUsers() {
    try {
      await api.listUsers(1, 5);
      alert('OK: /api/users responded');
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">لوحة المعلومات</h1>
          <p className="text-sm text-slate-500">
            نظام إدارة الموارد (ERP) — المرحلة 6: المحاسبة (Accounting Core)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {user.permissions.includes('users.read') && (
            <Link
              href="/users"
              className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2"
            >
              المستخدمون
            </Link>
          )}
          {user.permissions.includes('warehouses.read') && (
            <Link
              href="/warehouses"
              className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2"
            >
              المستودعات
            </Link>
          )}
          {user.permissions.includes('inventory.read') && (
            <Link
              href="/inventory"
              className="rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm px-4 py-2"
            >
              المخزون
            </Link>
          )}
          {user.permissions.includes('sales.read') && (
            <Link
              href="/sales"
              className="rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm px-4 py-2"
            >
              المبيعات
            </Link>
          )}
          {user.permissions.includes('purchases.read') && (
            <Link
              href="/purchases"
              className="rounded-md bg-indigo-700 hover:bg-indigo-800 text-white text-sm px-4 py-2"
            >
              المشتريات
            </Link>
          )}
          {user.permissions.includes('pos.read') && (
            <Link
              href="/pos"
              className="rounded-md bg-rose-600 hover:bg-rose-700 text-white text-sm px-4 py-2"
            >
              نقطة البيع
            </Link>
          )}
          {user.permissions.includes('accounting.read') && (
            <Link
              href="/accounting"
              className="rounded-md bg-sky-600 hover:bg-sky-700 text-white text-sm px-4 py-2"
            >
              المحاسبة
            </Link>
          )}
          {user.permissions.includes('reports.read') && (
            <Link
              href="/reports"
              className="rounded-md bg-violet-600 hover:bg-violet-700 text-white text-sm px-4 py-2"
            >
              التقارير
            </Link>
          )}
          {user.permissions.includes('audit_log.read') && (
            <Link
              href="/admin/audit-logs"
              className="rounded-md bg-slate-800 hover:bg-slate-900 text-white text-sm px-4 py-2"
            >
              سجل التدقيق
            </Link>
          )}
          <button
            onClick={onLogout}
            className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm px-4 py-2"
          >
            تسجيل الخروج
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2">
          <h2 className="text-lg font-semibold mb-3">بياناتي</h2>
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-500">الاسم</dt>
            <dd className="col-span-2 text-slate-800">{user.fullName}</dd>
            <dt className="text-slate-500">البريد</dt>
            <dd className="col-span-2 text-slate-800" dir="ltr">
              {user.email}
            </dd>
            <dt className="text-slate-500">الشركة</dt>
            <dd className="col-span-2 text-slate-800" dir="ltr">
              {user.companyId}
            </dd>
            <dt className="text-slate-500">الأدوار</dt>
            <dd className="col-span-2 text-slate-800">
              {user.roles.map((r) => r.name).join('، ') || '—'}
            </dd>
            <dt className="text-slate-500">الصلاحيات</dt>
            <dd className="col-span-2 text-slate-800" dir="ltr">
              {user.permissions.length} صلاحية
            </dd>
            <dt className="text-slate-500">الحالة</dt>
            <dd className="col-span-2 text-slate-800">
              {user.isActive ? 'نشط' : 'موقوف'}
            </dd>
          </dl>
          <div className="mt-4 flex gap-2">
            <button
              onClick={pingUsers}
              className="rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5"
            >
              اختبار /api/users
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">حالة الـ Backend</h2>
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            {health.status === 'loading' && '...جاري التحقق'}
            {health.status === 'ok' && (
              <pre dir="ltr" className="whitespace-pre-wrap break-all">
                {JSON.stringify(health.data, null, 2)}
              </pre>
            )}
            {health.status === 'error' && (
              <span className="text-rose-600">تعذّر الوصول: {health.message}</span>
            )}
          </div>
        </div>
      </section>

      <p className="mt-6 text-xs text-slate-400">
        ملاحظة: لا توجد أرقام ERP وهمية في هذه اللوحة. كل ما يُعرض هنا قادم من API حقيقي.
      </p>
    </main>
  );
}
