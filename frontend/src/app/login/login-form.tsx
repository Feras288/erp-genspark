'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

export default function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user, loading, error, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  // If already authenticated, bounce to dashboard.
  useEffect(() => {
    if (!loading && user) {
      router.replace(sp.get('next') || '/dashboard');
    }
  }, [loading, user, router, sp]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (!email || !password) {
      setLocalErr('أدخل البريد وكلمة المرور');
      return;
    }
    if (password.length < 6) {
      setLocalErr('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(sp.get('next') || '/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل الدخول';
      setLocalErr(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold mb-2 text-slate-800">تسجيل الدخول</h1>
        <p className="text-sm text-slate-500 mb-6">
          نظام إدارة الموارد — النسخة الأولية
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm mb-1 text-slate-700">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={submitting}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.sa"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              dir="ltr"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm mb-1 text-slate-700">
              كلمة المرور
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={submitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              dir="ltr"
            />
          </div>

          {(localErr || error) && (
            <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
              {localErr || error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm font-medium disabled:bg-slate-300"
          >
            {submitting ? '...جاري الدخول' : 'تسجيل الدخول'}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-400">
          الرمز السري لا يُخزن في المتصفح. backend يستخدم refresh token HttpOnly cookie.
        </p>
      </div>
    </main>
  );
}
