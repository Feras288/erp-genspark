import React from 'react';
import { cn } from '@/lib/ui';

export interface FilterSectionProps {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function FilterSection({
  title,
  children,
  actions,
  className,
}: FilterSectionProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs mb-6 space-y-3',
        className,
      )}
    >
      {title && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            {title}
          </span>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
