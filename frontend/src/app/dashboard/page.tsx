// =====================================================
// Dashboard placeholder — Phase 0.
// Real numbers from /api/dashboard in Phase 4+.
// Uses the live /api/health endpoint to PROVE the wiring works.
// =====================================================
'use client';

import { useEffect, useState } from 'react';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; data: unknown }
  | { status: 'error'; message: string };

export default function DashboardPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    let mounted = true;
    fetch(`${apiUrl}/health`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => mounted && setHealth({ status: 'ok', data }))
      .catch((e) => mounted && setHealth({ status: 'error', message: (e as Error).message }));
    return () => {
      mounted = false;
    };
  }, [apiUrl]);

  return (
    <main className="min-h-screen p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800">لوحة المعلومات</h1>
        <p className="text-sm text-slate-500">
          نظام إدارة الموارد (ERP) — النسخة الأولية (المرحلة 0).
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">حالة الـ Backend</h2>
        <p className="text-sm text-slate-600 mb-2">
          الرابط: <code className="text-xs">{apiUrl}/health</code>
        </p>
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          {health.status === 'loading' && '...جاري التحقق'}
          {health.status === 'ok' && (
            <pre dir="ltr" className="whitespace-pre-wrap break-all">
              {JSON.stringify(health.data, null, 2)}
            </pre>
          )}
          {health.status === 'error' && (
            <span className="text-rose-600">تعذّر الوصول للـ Backend: {health.message}</span>
          )}
        </div>
        <p className="mt-4 text-xs text-slate-400">
          ملاحظة: لا توجد أي بيانات ERP وهمية في هذه اللوحة.
        </p>
      </section>
    </main>
  );
}
