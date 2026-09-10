import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/ui';

export interface AccessDeniedStateProps {
  title?: string;
  description?: string;
  returnHref?: string;
  returnLabel?: string;
  requiredPermission?: string;
  className?: string;
}

export function AccessDeniedState({
  title = 'غير مصرح بالوصول',
  description = 'عفواً، لا يملك حسابك الحالي الصلاحيات المطلوبة للوصول إلى هذه الصفحة أو تنفيذ هذا الإجراء.',
  returnHref = '/dashboard',
  returnLabel = 'العودة إلى لوحة التحكم',
  requiredPermission,
  className,
}: AccessDeniedStateProps) {
  return (
    <div
      className={cn(
        'min-h-[50vh] flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto',
        className,
      )}
    >
      <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-500 mb-4 shadow-xs">
        <svg
          className="w-8 h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-slate-800">{title}</h2>
      <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-md">
        {description}
      </p>

      {requiredPermission && (
        <div className="mt-3 px-3 py-1 bg-slate-100 rounded-md border border-slate-200 text-xs font-mono text-slate-600">
          الصلاحية المطلوبة: {requiredPermission}
        </div>
      )}

      {returnHref && (
        <div className="mt-6">
          <Link
            href={returnHref}
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors shadow-xs"
          >
            {returnLabel}
          </Link>
        </div>
      )}
    </div>
  );
}
