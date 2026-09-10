import React from 'react';
import { cn } from '@/lib/ui';

export type KpiTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface KpiCardProps {
  label: string;
  value: string | number;
  helperText?: string;
  tone?: KpiTone;
  icon?: React.ReactNode;
  trendText?: string;
  className?: string;
}

const toneStyles: Record<
  KpiTone,
  {
    border: string;
    accent: string;
    badge: string;
  }
> = {
  neutral: {
    border: 'border-slate-200/80',
    accent: 'text-slate-900',
    badge: 'bg-slate-100 text-slate-700',
  },
  success: {
    border: 'border-emerald-200/70',
    accent: 'text-emerald-700',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
  },
  warning: {
    border: 'border-amber-200/70',
    accent: 'text-amber-700',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200/60',
  },
  danger: {
    border: 'border-rose-200/70',
    accent: 'text-rose-700',
    badge: 'bg-rose-50 text-rose-700 border border-rose-200/60',
  },
  info: {
    border: 'border-blue-200/70',
    accent: 'text-blue-700',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200/60',
  },
};

export function KpiCard({
  label,
  value,
  helperText,
  tone = 'neutral',
  icon,
  trendText,
  className,
}: KpiCardProps) {
  const currentTone = toneStyles[tone] || toneStyles.neutral;

  return (
    <div
      className={cn(
        'relative bg-white rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md',
        currentTone.border,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-slate-500 line-clamp-1">
          {label}
        </span>
        {icon && (
          <div className="shrink-0 p-2 rounded-xl bg-slate-50 text-slate-600">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={cn(
            'text-2xl sm:text-3xl font-bold tracking-tight',
            currentTone.accent,
          )}
        >
          {value}
        </span>
        {trendText && (
          <span
            className={cn(
              'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full',
              currentTone.badge,
            )}
          >
            {trendText}
          </span>
        )}
      </div>

      {helperText && (
        <p className="mt-1.5 text-xs text-slate-400 font-normal line-clamp-1">
          {helperText}
        </p>
      )}
    </div>
  );
}
