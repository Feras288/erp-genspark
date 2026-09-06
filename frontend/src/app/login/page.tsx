// =====================================================
// Login page — Phase 0 PLACEHOLDER only.
// Real auth is implemented in Phase 1.
// =====================================================
export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold mb-2 text-slate-800">تسجيل الدخول</h1>
        <p className="text-sm text-slate-500 mb-6">
          هذه صفحة دخول أولية. سيتم ربطها بـ NestJS Auth في المرحلة 1.
        </p>

        <form className="space-y-4 opacity-60 cursor-not-allowed" aria-disabled>
          <div>
            <label className="block text-sm mb-1 text-slate-700">البريد الإلكتروني</label>
            <input
              type="email"
              disabled
              placeholder="admin@example.sa"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-slate-700">كلمة المرور</label>
            <input
              type="password"
              disabled
              placeholder="••••••••"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled
            className="w-full rounded-md bg-slate-300 text-white py-2 text-sm"
          >
            تسجيل الدخول (غير مفعّل في المرحلة 0)
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-400">
          لا توجد بيانات وهمية ولا تخزين للسر في هذه الصفحة.
        </p>
      </div>
    </main>
  );
}
