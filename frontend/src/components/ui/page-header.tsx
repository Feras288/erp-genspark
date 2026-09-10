import React from 'react';
import { cn } from '@/lib/ui';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  badges,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 pb-5 border-b border-slate-200/80',
        className,
      )}
    >
      <div className="space-y-1">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {title}
          </h1>
          {badges && <div className="flex items-center gap-2">{badges}</div>}
        </div>
        {subtitle && (
          <p className="text-sm text-slate-500 leading-relaxed max-w-3xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
