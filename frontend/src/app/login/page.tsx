import { Suspense } from 'react';
import LoginForm from './login-form';

// Next.js 14 requires useSearchParams() to be wrapped in a Suspense boundary
// during build (pre-rendering pass). Pure server component entry.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-8">
          <p className="text-slate-500">...جاري التحميل</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
